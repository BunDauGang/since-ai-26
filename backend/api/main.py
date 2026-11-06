"""FastAPI Connector Server (`backend/api/main.py`).

Connects:
- Worker A (`backend.engine.build_review`) -> Calculates statistics from Excel
- Worker B (`backend.insights.generate`, `backend.export`) -> Generates observations & PPTX/PDF
- Worker C (`frontend/`) -> Interactive web dashboard

Includes automatic fallbacks to `contracts/sample_review.json` so the API works
standalone even before Worker A or Worker B merge their branches.
"""
from __future__ import annotations

import copy
import json
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

ROOT_DIR = Path(__file__).resolve().parents[2]
SAMPLE_REVIEW_PATH = ROOT_DIR / "contracts" / "sample_review.json"
DEFAULT_DATA_PATH = ROOT_DIR / "data" / "Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx"

app = FastAPI(
    title="Lindström Customer Value & Sustainability Review API",
    version="0.1.0",
    description="Connector API between the calculation/insights engines and the interactive dashboard.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PRIORITY_EMPHASIS: dict[str, list[str]] = {
    "water": ["water_saving_l", "customer_water_l", "washed_kg", "co2e_saving_kg", "on_time_rate"],
    "emissions": ["co2e_saving_kg", "avoided_product_co2e_kg", "customer_co2e_kg", "energy_saving_kwh"],
    "cost": ["allocation_use_rate", "idle_pieces", "idle_value_eur", "garments_allocated", "replacements_postponed"],
    "circularity": ["repairs_total", "replacements_postponed", "avoided_product_co2e_kg", "circular_waste_share", "textile_waste_kg"],
    "service": ["on_time_rate", "median_cycle_hours", "service_requests", "allocation_use_rate", "wash_frequency"],
    "improvement": ["allocation_use_rate", "idle_pieces", "repair_rate_per_1000", "water_saving_l", "service_requests"],
}

KEYWORD_PRIORITY_MAP: list[tuple[list[str], str]] = [
    (["water", "litre", "liter", "fresh water", "moisture"], "water"),
    (["co2", "carbon", "emission", "ghg", "scope 3", "climate", "energy", "kwh"], "emissions"),
    (["cost", "price", "budget", "idle", "unused", "allocation", "utilization", "euro", "eur", "tco"], "cost"),
    (["circular", "repair", "waste", "recycl", "reuse", "lifetime", "replacement"], "circularity"),
    (["service", "delivery", "on-time", "late", "turnaround", "cycle", "hygiene", "request"], "service"),
    (["improve", "next year", "optimize", "action", "recommend", "potential", "outlier"], "improvement"),
]


class ReviewRequest(BaseModel):
    customer_id: str = "CUST001"
    period_from: str = "2025-01"
    period_to: str = "2025-12"
    baseline_id: Literal["B_LOCAL", "B_HOME", "B_INHOUSE"] = "B_LOCAL"
    sensitivity: Literal["low", "base", "high"] = "base"
    priority: Literal["water", "emissions", "cost", "circularity", "service", "improvement"] | None = None
    prompt: str | None = None
    use_llm: bool = True


class InterpretRequest(BaseModel):
    prompt: str
    industry: str = "Food & Beverage"


def _load_sample_review() -> dict:
    if not SAMPLE_REVIEW_PATH.exists():
        raise HTTPException(status_code=500, detail="contracts/sample_review.json not found.")
    return json.loads(SAMPLE_REVIEW_PATH.read_text(encoding="utf-8"))


def _fallback_interpret_prompt(prompt: str, industry: str = "Food & Beverage") -> str:
    text = (prompt or "").lower()
    for keywords, prio in KEYWORD_PRIORITY_MAP:
        if any(k in text for k in keywords):
            return prio
    if "manufacturing" in industry.lower():
        return "cost"
    if "health" in industry.lower():
        return "service"
    return "water"


def _apply_dynamic_overrides(review: dict, req: ReviewRequest, resolved_priority: str) -> dict:
    """Adjust priority, baseline, and sensitivity on the fallback sample so UI switches work immediately."""
    out = copy.deepcopy(review)
    out["meta"]["customer_id"] = req.customer_id
    out["meta"]["period"] = {"from": req.period_from, "to": req.period_to}
    out["meta"]["baseline_id"] = req.baseline_id
    out["meta"]["sensitivity"] = req.sensitivity
    out["meta"]["priority"] = resolved_priority

    # Update priority_view emphasis
    out["priority_view"]["priority"] = resolved_priority
    out["priority_view"]["emphasized_metric_ids"] = PRIORITY_EMPHASIS.get(
        resolved_priority, PRIORITY_EMPHASIS["water"]
    )

    # Update handprint metrics if user switches baseline_id
    matching_baseline = next(
        (b for b in out.get("baseline_comparison", []) if b["baseline_id"] == req.baseline_id),
        None,
    )
    if matching_baseline:
        out["meta"]["baseline_name"] = matching_baseline["name"]
        for m in out.get("metrics", []):
            if m["id"] in ("water_saving_l", "energy_saving_kwh", "co2e_saving_kg"):
                m["value"] = matching_baseline[m["id"]]
                m["label"] = f"{m['id'].replace('_saving_l', ' saving').replace('_saving_kwh', ' saving').replace('_saving_kg', ' saving').replace('_', ' ').capitalize()} vs {matching_baseline['name'].lower()}"

    return out


def _compute_full_review(req: ReviewRequest) -> dict:
    # Step 1: Resolve priority (from explicit priority, free-text prompt, or default)
    resolved_priority = req.priority
    if req.prompt and not resolved_priority:
        try:
            from backend.insights.generate import interpret_prompt  # type: ignore

            resolved_priority = interpret_prompt(req.prompt, "Food & Beverage")
        except Exception:
            resolved_priority = _fallback_interpret_prompt(req.prompt)
    if not resolved_priority:
        resolved_priority = "water"

    # Step 2: Run Worker A's calculation engine if available; else use sample_review.json
    review: dict | None = None
    try:
        from backend.engine.build_review import build_review  # type: ignore

        source = str(DEFAULT_DATA_PATH) if DEFAULT_DATA_PATH.exists() else None
        review = build_review(
            customer_id=req.customer_id,
            period_from=req.period_from,
            period_to=req.period_to,
            baseline_id=req.baseline_id,
            sensitivity=req.sensitivity,
            priority=resolved_priority,
            source_path=source,
        )
    except Exception:
        review = _apply_dynamic_overrides(_load_sample_review(), req, resolved_priority)

    # Step 3: Run Worker B's rules & observations generator if available
    try:
        from backend.insights.generate import generate_observations  # type: ignore
        from backend.insights.rules import evaluate_rules  # type: ignore

        rule_flag_map = {
            "R1": "R1_LOW_ALLOCATION_USE",
            "R2": "R2_HIGH_REPAIR_RATE",
            "R3": "R3_LATE_CYCLES",
            "R4": "R4_SERVICE_REQUESTS",
        }
        facts = evaluate_rules(review)
        site_map = {s["site_id"]: s for s in review.get("sites", [])}
        for fact in facts:
            flag_code = rule_flag_map.get(fact.get("rule_id", ""))
            if flag_code:
                for sid in fact.get("site_ids", []):
                    if sid in site_map and flag_code not in site_map[sid]["flags"]:
                        site_map[sid]["flags"].append(flag_code)

        obs = generate_observations(review, use_llm=req.use_llm)
        if obs:
            review["observations"] = obs
    except Exception:
        pass

    return review


@app.get("/api/health")
def health_check() -> dict:
    return {"status": "ok", "excel_pack_present": DEFAULT_DATA_PATH.exists()}


@app.get("/api/customers")
def list_customers() -> dict:
    return {
        "customers": [
            {
                "customer_id": "CUST001",
                "customer_name": "NorthStar Foods Group",
                "industry": "Food & Beverage",
                "segment": "Strategic High Value",
                "hq_country": "Finland",
                "sites_count": 24,
                "default_priority": "water",
            },
            {
                "customer_id": "CUST002",
                "customer_name": "Apex Industrial Systems",
                "industry": "Manufacturing",
                "segment": "High Value",
                "hq_country": "Sweden",
                "sites_count": 6,
                "default_priority": "cost",
            },
            {
                "customer_id": "CUST003",
                "customer_name": "Mediora Health Network",
                "industry": "Healthcare",
                "segment": "High Value",
                "hq_country": "Poland",
                "sites_count": 4,
                "default_priority": "service",
            },
        ],
        "baselines": [
            {"baseline_id": "B_LOCAL", "name": "Outsourced local laundry", "is_default": True},
            {"baseline_id": "B_HOME", "name": "Home washing", "is_default": False},
            {"baseline_id": "B_INHOUSE", "name": "In-house customer laundry", "is_default": False},
        ],
        "priorities": [
            {"id": "water", "label": "Water efficiency"},
            {"id": "emissions", "label": "Scope 3 & emissions"},
            {"id": "cost", "label": "Cost & allocation efficiency"},
            {"id": "circularity", "label": "Repairs & circularity"},
            {"id": "service", "label": "Service reliability & hygiene"},
            {"id": "improvement", "label": "Next-year improvement"},
        ],
        "sensitivities": ["low", "base", "high"],
    }


@app.post("/api/interpret")
def interpret_user_prompt(req: InterpretRequest) -> dict:
    try:
        from backend.insights.generate import interpret_prompt  # type: ignore

        priority = interpret_prompt(req.prompt, req.industry)
    except Exception:
        priority = _fallback_interpret_prompt(req.prompt, req.industry)
    return {
        "prompt": req.prompt,
        "industry": req.industry,
        "priority": priority,
        "emphasized_metric_ids": PRIORITY_EMPHASIS.get(priority, PRIORITY_EMPHASIS["water"]),
    }


@app.post("/api/review")
def generate_customer_review(req: ReviewRequest) -> JSONResponse:
    review = _compute_full_review(req)
    return JSONResponse(content=review)


@app.get("/api/review")
def get_default_customer_review(
    customer_id: str = "CUST001",
    baseline_id: Literal["B_LOCAL", "B_HOME", "B_INHOUSE"] = "B_LOCAL",
    sensitivity: Literal["low", "base", "high"] = "base",
    priority: Literal["water", "emissions", "cost", "circularity", "service", "improvement"] = "water",
) -> JSONResponse:
    req = ReviewRequest(
        customer_id=customer_id,
        baseline_id=baseline_id,
        sensitivity=sensitivity,
        priority=priority,
    )
    return JSONResponse(content=_compute_full_review(req))


@app.post("/api/export")
def export_customer_review(
    payload: dict,
    format: Literal["pptx", "pdf"] = Query(default="pptx"),
) -> FileResponse:
    if "meta" in payload and "metrics" in payload:
        review = payload
    else:
        req = ReviewRequest(**payload)
        review = _compute_full_review(req)
    tmp_dir = Path(tempfile.mkdtemp(prefix="lindstrom_export_"))
    cid = review.get("meta", {}).get("customer_id", "CUST001")

    if format == "pptx":
        out_file = tmp_dir / f"Lindstrom_Value_Review_{cid}.pptx"
        try:
            from backend.export.pptx_export import export_pptx  # type: ignore

            export_pptx(review, str(out_file))
        except Exception as exc:
            raise HTTPException(
                status_code=501,
                detail=f"PPTX exporter module (backend/export/pptx_export.py) not merged yet: {exc}",
            ) from exc
        return FileResponse(
            path=str(out_file),
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            filename=out_file.name,
        )

    out_file = tmp_dir / f"Lindstrom_Value_Review_{cid}.pdf"
    try:
        from backend.export.pdf_export import export_pdf  # type: ignore

        export_pdf(review, str(out_file))
    except Exception as exc:
        raise HTTPException(
            status_code=501,
            detail=f"PDF exporter module (backend/export/pdf_export.py) not merged yet: {exc}",
        ) from exc
    return FileResponse(
        path=str(out_file),
        media_type="application/pdf",
        filename=out_file.name,
    )
