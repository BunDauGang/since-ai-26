"""FastAPI Connector Server (`backend/api/main.py`).

Connects:
- Worker A (`backend.engine.build_review`) -> Calculates statistics from Excel
- Worker B (`backend.insights.generate`, `backend.export`) -> Generates observations & PPTX/PDF
- Worker C (`frontend/`) -> Interactive web dashboard

Falls back to `contracts/sample_review.json` only when the Excel data pack is missing AND the
request is for the sample's own customer/period; such responses carry `X-Review-Source: sample`.
Every other failure is reported as an HTTP error instead of showing another customer's numbers.
"""
from __future__ import annotations

import copy
import json
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

from backend.engine.build_review import build_review
from backend.insights.generate import generate_observations
from backend.insights.priority import PRIORITY_EMPHASIS, interpret_prompt
from backend.insights.rules import annotate_site_flags

LOG = logging.getLogger(__name__)

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
    # Let the dashboard read where a review came from and why an export failed.
    expose_headers=["X-Review-Source", "X-Insights-Error", "Content-Disposition"],
)

CUSTOMER_META: dict[str, dict[str, str | int]] = {
    "CUST001": {
        "customer_id": "CUST001",
        "customer_name": "NorthStar Foods Group",
        "industry": "Food & Beverage",
        "segment": "Strategic High Value",
        "hq_country": "Finland",
        "sites_count": 24,
        "default_priority": "water",
    },
    "CUST002": {
        "customer_id": "CUST002",
        "customer_name": "Apex Industrial Systems",
        "industry": "Manufacturing",
        "segment": "High Value",
        "hq_country": "Sweden",
        "sites_count": 6,
        "default_priority": "cost",
    },
    "CUST003": {
        "customer_id": "CUST003",
        "customer_name": "Mediora Health Network",
        "industry": "Healthcare",
        "segment": "High Value",
        "hq_country": "Poland",
        "sites_count": 4,
        "default_priority": "service",
    },
}

_ACTIVE_DATA_PATH: Path = DEFAULT_DATA_PATH
_REVIEW_CACHE: dict[tuple, dict] = {}


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


def _customer_industry(customer_id: str) -> str:
    return str(CUSTOMER_META.get(customer_id, CUSTOMER_META["CUST001"])["industry"])


def _customer_default_priority(customer_id: str) -> str:
    return str(CUSTOMER_META.get(customer_id, CUSTOMER_META["CUST001"])["default_priority"])


def _load_sample_review() -> dict:
    if not SAMPLE_REVIEW_PATH.exists():
        raise HTTPException(status_code=500, detail="contracts/sample_review.json not found.")
    return json.loads(SAMPLE_REVIEW_PATH.read_text(encoding="utf-8"))


def _sample_fallback(req: ReviewRequest, resolved_priority: str) -> dict:
    """Serve the bundled sample only for its own customer and period; never relabel it."""
    review = _load_sample_review()
    meta = review["meta"]
    if req.customer_id != meta["customer_id"] or (req.period_from, req.period_to) != (meta["period"]["from"], meta["period"]["to"]):
        raise HTTPException(
            status_code=503,
            detail=(f"The Excel data pack is not available to the API, so {req.customer_id} {req.period_from}..{req.period_to} "
                    f"cannot be calculated. Only the bundled sample ({meta['customer_id']}, {meta['period']['from']}..{meta['period']['to']}) is available."),
        )
    meta.update(sensitivity=req.sensitivity, priority=resolved_priority)
    review["priority_view"]["priority"] = resolved_priority
    review["priority_view"]["emphasized_metric_ids"] = [
        m for m in PRIORITY_EMPHASIS.get(resolved_priority, []) if m in {x["id"] for x in review["metrics"]}]
    match = next((b for b in review.get("baseline_comparison", []) if b["baseline_id"] == req.baseline_id), None)
    if match and match["baseline_id"] != meta["baseline_id"]:
        # Customer-level handprint totals exist for every baseline; site/month detail stays on the sample baseline.
        meta.update(baseline_id=match["baseline_id"], baseline_name=match["name"])
        for metric in review["metrics"]:
            if metric["id"] in ("water_saving_l", "energy_saving_kwh", "co2e_saving_kg"):
                metric["value"] = match[metric["id"]]
    return review


def _pack_version() -> tuple:
    try:
        stat = _ACTIVE_DATA_PATH.stat()
        return (stat.st_mtime_ns, stat.st_size)
    except OSError:
        return ("missing",)


def _compute_full_review(req: ReviewRequest) -> tuple[dict, dict[str, str]]:
    """Returns (review, response headers)."""
    # Step 1: resolve priority with the customer's own industry
    industry = _customer_industry(req.customer_id)
    resolved_priority = req.priority
    if req.prompt and not resolved_priority:
        resolved_priority = interpret_prompt(req.prompt, industry)
    if not resolved_priority:
        resolved_priority = _customer_default_priority(req.customer_id)

    cache_key = (req.customer_id, req.period_from, req.period_to, req.baseline_id,
                 req.sensitivity, resolved_priority, req.use_llm, _pack_version())
    if cache_key in _REVIEW_CACHE:
        return copy.deepcopy(_REVIEW_CACHE[cache_key]), {"X-Review-Source": "engine"}

    # Step 2: deterministic engine (Worker A)
    source = "engine"
    try:
        review = build_review(
            customer_id=req.customer_id,
            period_from=req.period_from,
            period_to=req.period_to,
            baseline_id=req.baseline_id,
            sensitivity=req.sensitivity,
            priority=resolved_priority,
            source_path=str(_ACTIVE_DATA_PATH) if _ACTIVE_DATA_PATH.exists() else None,
        )
    except FileNotFoundError:
        review, source = _sample_fallback(req, resolved_priority), "sample"
    except ValueError as exc:  # invalid period, unknown customer, no activity in period, ...
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        LOG.exception("Engine failed for %s", req.customer_id)
        raise HTTPException(status_code=500, detail=f"Calculation engine error: {exc}") from exc

    headers = {"X-Review-Source": source}
    if source == "sample":
        return review, headers  # sample already carries its observations and flags

    # Step 3: rules -> site flags + observations (Worker B). Failure is logged and signalled, never cached.
    try:
        annotate_site_flags(review)
        review["observations"] = generate_observations(review, use_llm=req.use_llm)
    except Exception as exc:
        LOG.exception("Insights failed for %s", req.customer_id)
        headers["X-Insights-Error"] = f"{type(exc).__name__}: {exc}"[:200].replace("\n", " ")
        return review, headers

    _REVIEW_CACHE[cache_key] = copy.deepcopy(review)
    return review, headers


@app.get("/api/health")
def health_check() -> dict:
    return {
        "status": "ok",
        "excel_pack_present": _ACTIVE_DATA_PATH.exists(),
        "cached_reviews": len(_REVIEW_CACHE),
    }


@app.get("/api/customers")
def list_customers() -> dict:
    return {
        "customers": list(CUSTOMER_META.values()),
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
    priority = interpret_prompt(req.prompt, req.industry)
    return {
        "prompt": req.prompt,
        "industry": req.industry,
        "priority": priority,
        "emphasized_metric_ids": PRIORITY_EMPHASIS[priority],
    }


@app.post("/api/review")
def generate_customer_review(req: ReviewRequest) -> JSONResponse:
    review, headers = _compute_full_review(req)
    return JSONResponse(content=review, headers=headers)


@app.get("/api/review")
def get_default_customer_review(
    customer_id: str = "CUST001",
    baseline_id: Literal["B_LOCAL", "B_HOME", "B_INHOUSE"] = "B_LOCAL",
    sensitivity: Literal["low", "base", "high"] = "base",
    priority: Literal["water", "emissions", "cost", "circularity", "service", "improvement"] | None = None,
) -> JSONResponse:
    req = ReviewRequest(
        customer_id=customer_id,
        baseline_id=baseline_id,
        sensitivity=sensitivity,
        priority=priority,
    )
    review, headers = _compute_full_review(req)
    return JSONResponse(content=review, headers=headers)


EXPORT_MEDIA = {
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "pdf": "application/pdf",
}


@app.post("/api/export")
def export_customer_review(
    payload: dict,
    format: Literal["pptx", "pdf"] = Query(default="pptx"),
) -> FileResponse:
    if "meta" in payload and "metrics" in payload:
        review = payload
    else:
        review, _ = _compute_full_review(ReviewRequest(**payload))
    try:
        if format == "pptx":
            from backend.export.pptx_export import export_pptx as exporter
        else:
            from backend.export.pdf_export import export_pdf as exporter
    except ImportError as exc:  # genuinely missing dependency (python-pptx / reportlab)
        raise HTTPException(status_code=501, detail=f"{format.upper()} exporter unavailable: {exc}") from exc

    tmp_dir = Path(tempfile.mkdtemp(prefix="lindstrom_export_"))
    cid = str(review.get("meta", {}).get("customer_id", "review"))
    out_file = tmp_dir / f"Lindstrom_Value_Review_{cid}.{format}"
    try:
        exporter(review, str(out_file))
    except (KeyError, ValueError, TypeError, IndexError) as exc:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=422, detail=f"Review cannot be exported as {format.upper()}: {type(exc).__name__}: {exc}") from exc
    except Exception as exc:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        LOG.exception("%s export failed", format)
        raise HTTPException(status_code=500, detail=f"{format.upper()} export failed: {type(exc).__name__}: {exc}") from exc
    # Delete the temp folder once the file has been sent.
    return FileResponse(path=str(out_file), media_type=EXPORT_MEDIA[format], filename=out_file.name,
                        background=BackgroundTask(shutil.rmtree, tmp_dir, ignore_errors=True))
