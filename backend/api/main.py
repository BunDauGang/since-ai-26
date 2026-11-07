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


class StoryRequest(BaseModel):
    customer_id: str = "CUST001"
    period_from: str = "2025-01"
    period_to: str = "2025-12"
    baseline_id: Literal["B_LOCAL", "B_HOME", "B_INHOUSE"] = "B_LOCAL"
    sensitivity: Literal["low", "base", "high"] = "base"
    persona: str = "ceo"
    goal: str = ""
    minutes: int = 15
    use_llm: bool = True
    review: dict | None = None



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


PERSONA_PRIORITY_MAP: dict[str, Literal["water", "emissions", "cost", "circularity", "service", "improvement"]] = {
    "ceo": "service",
    "cfo": "cost",
    "operations": "service",
    "sustainability": "emissions",
}


def _metric_lookup(review: dict) -> dict[str, dict]:
    return {m["id"]: m for m in review.get("metrics", []) if isinstance(m, dict) and "id" in m}


def _val(metrics: dict[str, dict], metric_id: str, case: str = "base") -> float | None:
    m = metrics.get(metric_id)
    if not m:
        return None
    v = m.get("value")
    if isinstance(v, dict):
        raw = v.get(case, v.get("base"))
        return float(raw) if isinstance(raw, (int, float)) else None
    return float(v) if isinstance(v, (int, float)) else None


def _fmt_int(value: float | None) -> str:
    return f"{round(value):,}" if isinstance(value, (int, float)) else "unavailable"


def _fmt_pct(value: float | None) -> str:
    return f"{value * 100:.1f}%" if isinstance(value, (int, float)) else "unavailable"


def _build_story_talk_track(review: dict, persona: str, goal: str, minutes: int, use_llm: bool) -> dict:
    p = persona.strip().lower() if isinstance(persona, str) else "ceo"
    if p not in ("ceo", "cfo", "operations", "sustainability"):
        p = "ceo"

    meta = review.get("meta", {})
    customer_id = str(meta.get("customer_id", "CUST001"))
    customer_name = str(meta.get("customer_name", "Customer"))
    baseline_name = str(meta.get("baseline_name") or "the typical alternative")
    metrics = _metric_lookup(review)

    sites_n = _fmt_int(_val(metrics, "delivery_sites"))
    wearers_n = _fmt_int(_val(metrics, "wearers_min_est"))
    garments_n = _fmt_int(_val(metrics, "garments_allocated"))
    on_time_s = _fmt_pct(_val(metrics, "on_time_rate"))
    cycle_h = _fmt_int(_val(metrics, "median_cycle_hours"))
    requests_n = _fmt_int(_val(metrics, "service_requests"))
    repairs_n = _fmt_int(_val(metrics, "repairs_total"))
    repair_rate_v = _val(metrics, "repair_rate_per_1000")
    repair_rate_s = f"{repair_rate_v:.1f}" if repair_rate_v is not None else "unavailable"
    postponed_n = _fmt_int(_val(metrics, "replacements_postponed"))
    use_rate_s = _fmt_pct(_val(metrics, "allocation_use_rate"))
    idle_n = _fmt_int(_val(metrics, "idle_pieces"))

    co2_base = _val(metrics, "co2e_saving_kg", "base")
    co2_low = _val(metrics, "co2e_saving_kg", "low")
    co2_high = _val(metrics, "co2e_saving_kg", "high")
    co2_t_base = f"{co2_base / 1000:,.0f} t" if co2_base is not None else "unavailable"
    co2_t_range = (
        f"{co2_low / 1000:,.0f}–{co2_high / 1000:,.0f} t"
        if co2_low is not None and co2_high is not None
        else co2_t_base
    )

    water_base = _val(metrics, "water_saving_l", "base")
    water_low = _val(metrics, "water_saving_l", "low")
    water_high = _val(metrics, "water_saving_l", "high")
    water_m_base = f"{water_base / 1_000_000:.1f} million L" if water_base is not None else "unavailable"
    water_range = (
        f"{round(water_low):,}–{round(water_high):,} L"
        if water_low is not None and water_high is not None
        else water_m_base
    )

    goal_clean = goal.strip()
    goal_clause = f" focused on {goal_clean}" if goal_clean else ""

    templates: dict[str, dict] = {
        "ceo": {
            "opening": (
                f"In our {minutes}-minute partnership review for {customer_name}{goal_clause}, "
                f"we look at the big picture across {sites_n} delivery sites, at least {wearers_n} wearers, "
                f"and {garments_n} allocated garments."
            ),
            "points": [
                {
                    "id": "ceo_scale_reliability",
                    "title": f"{on_time_s} on-time delivery across {sites_n} sites",
                    "headline": f"{on_time_s} on-time delivery across {sites_n} sites",
                    "text": (
                        f"Service continuity remained at {on_time_s} on-time across {sites_n} sites "
                        f"with a median turnaround of {cycle_h} hours, keeping daily operations running smoothly."
                    ),
                    "detail": (
                        f"Service continuity remained at {on_time_s} on-time across {sites_n} sites "
                        f"with a median turnaround of {cycle_h} hours, keeping daily operations running smoothly."
                    ),
                    "metric_ids": ["delivery_sites", "wearers_min_est", "on_time_rate"],
                    "status": "CALCULATED",
                },
                {
                    "id": "ceo_climate_handprint",
                    "title": f"~{co2_t_base} CO₂e and ~{water_m_base} water avoided vs {baseline_name}",
                    "headline": f"~{co2_t_base} CO₂e and ~{water_m_base} water avoided vs {baseline_name}",
                    "text": (
                        f"Compared with {baseline_name}, circular textile rental avoided an estimated "
                        f"{co2_t_base} CO₂e (range {co2_t_range}) and {water_m_base} of water ({water_range})."
                    ),
                    "detail": (
                        f"Compared with {baseline_name}, circular textile rental avoided an estimated "
                        f"{co2_t_base} CO₂e (range {co2_t_range}) and {water_m_base} of water ({water_range})."
                    ),
                    "metric_ids": ["co2e_saving_kg", "water_saving_l"],
                    "status": "ALLOCATED_ESTIMATE",
                },
                {
                    "id": "ceo_circularity_next_step",
                    "title": f"{repairs_n} repairs completed; {use_rate_s} active stock utilisation",
                    "headline": f"{repairs_n} repairs completed; {use_rate_s} active stock utilisation",
                    "text": (
                        f"Systematic repair extended garment life {repairs_n} times, while {idle_n} idle pieces "
                        f"out of {garments_n} offer a practical right-sizing opportunity for the next quarter."
                    ),
                    "detail": (
                        f"Systematic repair extended garment life {repairs_n} times, while {idle_n} idle pieces "
                        f"out of {garments_n} offer a practical right-sizing opportunity for the next quarter."
                    ),
                    "metric_ids": ["repairs_total", "allocation_use_rate", "idle_pieces"],
                    "status": "CALCULATED",
                },
            ],
            "ask": (
                f"Agree on the Q1 allocation review for the lowest-utilisation sites and confirm our target SLA "
                f"benchmarks for the next steering review."
            ),
        },
        "cfo": {
            "opening": (
                f"In this {minutes}-minute financial and commercial review for {customer_name}{goal_clause}, "
                f"we focus on garment lifespan extension, stock efficiency across {garments_n} allocated pieces, "
                f"and how circular service compares against {baseline_name}."
            ),
            "points": [
                {
                    "id": "cfo_repairs_postponing_purchases",
                    "title": f"{repairs_n} repairs postponing ~{postponed_n} replacement events",
                    "headline": f"{repairs_n} repairs postponing ~{postponed_n} replacement events",
                    "text": (
                        f"Unlike a typical local laundry with no systematic repair program, {repairs_n} recorded repairs "
                        f"({repair_rate_s} per 1,000 washes) postponed an estimated {postponed_n} garment replacements."
                    ),
                    "detail": (
                        f"Unlike a typical local laundry with no systematic repair program, {repairs_n} recorded repairs "
                        f"({repair_rate_s} per 1,000 washes) postponed an estimated {postponed_n} garment replacements."
                    ),
                    "metric_ids": ["repairs_total", "replacements_postponed", "repair_rate_per_1000"],
                    "status": "ESTIMATE",
                },
                {
                    "id": "cfo_stock_rightsizing",
                    "title": f"{use_rate_s} allocation use ({idle_n} garments not seen in circulation)",
                    "headline": f"{use_rate_s} allocation use ({idle_n} garments not seen in circulation)",
                    "text": (
                        f"Of {garments_n} allocated garments, {idle_n} were not scanned in the latest reporting month. "
                        f"Reclaiming even half of the excess buffer tightens active circulation without adding risk."
                    ),
                    "detail": (
                        f"Of {garments_n} allocated garments, {idle_n} were not scanned in the latest reporting month. "
                        f"Reclaiming even half of the excess buffer tightens active circulation without adding risk."
                    ),
                    "metric_ids": ["allocation_use_rate", "idle_pieces", "garments_allocated"],
                    "status": "CALCULATED",
                },
                {
                    "id": "cfo_resource_efficiency",
                    "title": f"Estimated ~{water_m_base} water & ~{co2_t_base} CO₂e avoided vs {baseline_name}",
                    "headline": f"Estimated ~{water_m_base} water & ~{co2_t_base} CO₂e avoided vs {baseline_name}",
                    "text": (
                        f"Industrial load consolidation reduced water by {water_range} and emissions by {co2_t_range} "
                        f"versus {baseline_name}—use the Rough Calculator to test your own unit-cost assumptions."
                    ),
                    "detail": (
                        f"Industrial load consolidation reduced water by {water_range} and emissions by {co2_t_range} "
                        f"versus {baseline_name}—use the Rough Calculator to test your own unit-cost assumptions."
                    ),
                    "metric_ids": ["water_saving_l", "energy_saving_kwh", "co2e_saving_kg"],
                    "status": "ALLOCATED_ESTIMATE",
                },
            ],
            "ask": (
                f"Sponsor a joint locker-stock audit at the lowest-utilisation sites to right-size idle buffer "
                f"and validate rough unit-cost assumptions with your procurement team."
            ),
        },
        "operations": {
            "opening": (
                f"In this {minutes}-minute operational review for {customer_name}{goal_clause}, "
                f"we cover delivery performance, turnaround time, and site-by-site garment wear across {sites_n} sites."
            ),
            "points": [
                {
                    "id": "ops_cycle_and_sla",
                    "title": f"{on_time_s} on-time cycles with {cycle_h} h median turnaround",
                    "headline": f"{on_time_s} on-time cycles with {cycle_h} h median turnaround",
                    "text": (
                        f"Across {sites_n} sites, on-time delivery reached {on_time_s} with a median cycle time "
                        f"of {cycle_h} hours and {requests_n} logged service requests over the period."
                    ),
                    "detail": (
                        f"Across {sites_n} sites, on-time delivery reached {on_time_s} with a median cycle time "
                        f"of {cycle_h} hours and {requests_n} logged service requests over the period."
                    ),
                    "metric_ids": ["on_time_rate", "median_cycle_hours", "service_requests"],
                    "status": "CALCULATED",
                },
                {
                    "id": "ops_repair_intensity",
                    "title": f"{repairs_n} repairs ({repair_rate_s} per 1,000 washed pieces)",
                    "headline": f"{repairs_n} repairs ({repair_rate_s} per 1,000 washed pieces)",
                    "text": (
                        f"Repair intensity averaged {repair_rate_s} repairs per 1,000 washes. "
                        f"Inspecting high-wear task zones at above-median sites reduces repeat damage."
                    ),
                    "detail": (
                        f"Repair intensity averaged {repair_rate_s} repairs per 1,000 washes. "
                        f"Inspecting high-wear task zones at above-median sites reduces repeat damage."
                    ),
                    "metric_ids": ["repairs_total", "repair_rate_per_1000"],
                    "status": "CALCULATED",
                },
                {
                    "id": "ops_locker_utilisation",
                    "title": f"{use_rate_s} active scan rate ({idle_n} idle pieces in lockers)",
                    "headline": f"{use_rate_s} active scan rate ({idle_n} idle pieces in lockers)",
                    "text": (
                        f"Scanning shows {use_rate_s} of allocated garments actively rotating, leaving {idle_n} pieces "
                        f"unscanned in the latest month that can be rebalanced across active shifts."
                    ),
                    "detail": (
                        f"Scanning shows {use_rate_s} of allocated garments actively rotating, leaving {idle_n} pieces "
                        f"unscanned in the latest month that can be rebalanced across active shifts."
                    ),
                    "metric_ids": ["allocation_use_rate", "idle_pieces"],
                    "status": "CALCULATED",
                },
            ],
            "ask": (
                f"Schedule a 30-minute walk-through with site supervisors at the lowest-utilisation and highest-repair "
                f"plants to rebalance locker stock and check abrasion points."
            ),
        },
        "sustainability": {
            "opening": (
                f"In this {minutes}-minute sustainability & circularity review for {customer_name}{goal_clause}, "
                f"we present transparent footprint and handprint ranges across {sites_n} sites with full methodology boundaries."
            ),
            "points": [
                {
                    "id": "esg_handprint_ranges",
                    "title": f"Estimated ~{co2_t_base} CO₂e ({co2_t_range}) and ~{water_m_base} water saved",
                    "headline": f"Estimated ~{co2_t_base} CO₂e ({co2_t_range}) and ~{water_m_base} water saved",
                    "text": (
                        f"Against {baseline_name}, estimated handprint savings are {co2_t_base} CO₂e "
                        f"(sensitivity range {co2_t_range}) and {water_m_base} water ({water_range}), "
                        f"always presented as model estimates with low/base/high bounds."
                    ),
                    "detail": (
                        f"Against {baseline_name}, estimated handprint savings are {co2_t_base} CO₂e "
                        f"(sensitivity range {co2_t_range}) and {water_m_base} water ({water_range}), "
                        f"always presented as model estimates with low/base/high bounds."
                    ),
                    "metric_ids": ["co2e_saving_kg", "water_saving_l", "energy_saving_kwh"],
                    "status": "ALLOCATED_ESTIMATE",
                },
                {
                    "id": "esg_circular_lifetime",
                    "title": f"{repairs_n} repairs extending garment life (~{postponed_n} replacements postponed)",
                    "headline": f"{repairs_n} repairs extending garment life (~{postponed_n} replacements postponed)",
                    "text": (
                        f"Keeping textiles in use through {repairs_n} repairs postponed an estimated {postponed_n} "
                        f"new garment replacements and improved circular material retention."
                    ),
                    "detail": (
                        f"Keeping textiles in use through {repairs_n} repairs postponed an estimated {postponed_n} "
                        f"new garment replacements and improved circular material retention."
                    ),
                    "metric_ids": ["repairs_total", "replacements_postponed", "avoided_product_co2e_kg", "circular_waste_share"],
                    "status": "ESTIMATE",
                },
                {
                    "id": "esg_governance_guardrails",
                    "title": "Audit-ready transparency: measured operations vs. allocated estimates",
                    "headline": "Audit-ready transparency: measured operations vs. allocated estimates",
                    "text": (
                        "Every figure separates measured operational records from laundry-allocated footprints "
                        "and synthetic product factors—safe for internal steering without overclaiming."
                    ),
                    "detail": (
                        "Every figure separates measured operational records from laundry-allocated footprints "
                        "and synthetic product factors—safe for internal steering without overclaiming."
                    ),
                    "metric_ids": ["customer_co2e_kg", "customer_water_l", "textile_waste_kg"],
                    "status": "ALLOCATED_ESTIMATE",
                },
            ],
            "ask": (
                "Align on the conservative (low-case) handprint range for internal sustainability steering "
                "and prioritize right-sizing + repair-reduction actions for 2026."
            ),
        },
    }

    chosen = copy.deepcopy(templates[p])
    likely_objections = [
        {
            "id": "obj_alternative_cost",
            "question": f"Why shouldn't we switch to {baseline_name} if unit wash prices look lower on paper?",
            "answer": (
                f"{baseline_name.capitalize()} has 0 systematic repairs in the baseline model, whereas Lindström completed "
                f"{repairs_n} repairs (postponing ~{postponed_n} replacement purchases), delivered {on_time_s} on time, "
                f"and avoided an estimated {water_m_base} of water and {co2_t_base} CO₂e."
            ),
            "readiness": "caveat",
            "metric_ids": ["repairs_total", "replacements_postponed", "on_time_rate", "water_saving_l", "co2e_saving_kg"],
            "needs": "Contract invoice pricing and customer replacement purchase prices (use Rough Calculator for KAM assumptions).",
        },
        {
            "id": "obj_idle_garments",
            "question": f"Why are {idle_n} of our {garments_n} allocated garments not showing up in active scans ({use_rate_s} use rate)?",
            "answer": (
                f"In the latest month, {use_rate_s} of allocated stock rotated through scanning, leaving {idle_n} pieces "
                f"in site lockers or seasonal buffer. Reclaiming 50% of the gap to target is our top Q1 right-sizing action."
            ),
            "readiness": "evidence",
            "metric_ids": ["allocation_use_rate", "idle_pieces", "garments_allocated"],
            "needs": None,
        },
        {
            "id": "obj_csrd_verified",
            "question": "Can we publish the water and CO₂e savings directly in our audited external sustainability report?",
            "answer": (
                f"Not as audited claims. The ~{co2_t_base} CO₂e ({co2_t_range}) and ~{water_m_base} water ({water_range}) "
                f"savings are model estimates based on laundry-level mass allocation and synthetic baseline factors. "
                f"Use the conservative low-case range for internal steering."
            ),
            "readiness": "caveat",
            "metric_ids": ["co2e_saving_kg", "water_saving_l", "customer_co2e_kg"],
            "needs": "Approved Lindström LCA product footprints and verified site-level utility metering.",
        },
    ]

    result = {
        "customer_id": customer_id,
        "customer_name": customer_name,
        "persona": p,
        "goal": goal_clean,
        "minutes": minutes,
        "opening": chosen["opening"],
        "points": chosen["points"],
        "likely_objections": likely_objections,
        "objections": likely_objections,
        "ask": chosen["ask"],
        "source": "template",
    }

    if use_llm:
        try:
            from backend.insights import llm as llm_module
            for fn_name in ("story_talk_track", "polish_story", "generate_story"):
                fn = getattr(llm_module, fn_name, None)
                if callable(fn):
                    polished = fn(review=review, persona=p, goal=goal_clean, minutes=minutes, fallback=result)
                    if isinstance(polished, dict) and "opening" in polished and "points" in polished:
                        return polished
        except Exception:
            LOG.warning("Story LLM wording unavailable; falling back to deterministic template")

    return result


@app.post("/api/story")
def generate_story_talk_track(req: StoryRequest) -> dict:
    p = req.persona.strip().lower() if isinstance(req.persona, str) else "ceo"
    default_prio = PERSONA_PRIORITY_MAP.get(p, "service")
    if isinstance(req.review, dict) and "meta" in req.review and "metrics" in req.review:
        review = req.review
    else:
        review, _ = _compute_full_review(
            ReviewRequest(
                customer_id=req.customer_id,
                period_from=req.period_from,
                period_to=req.period_to,
                baseline_id=req.baseline_id,
                sensitivity=req.sensitivity,
                priority=default_prio,
                use_llm=False,
            )
        )
    return _build_story_talk_track(
        review=review,
        persona=p,
        goal=req.goal,
        minutes=req.minutes,
        use_llm=req.use_llm,
    )


EXPORT_MEDIA = {
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "pdf": "application/pdf",
}


@app.post("/api/export")
def export_customer_review(
    payload: dict,
    format: Literal["pptx", "pdf"] = Query(default="pptx"),
) -> FileResponse:
    meeting_block = payload.get("meeting") if isinstance(payload.get("meeting"), dict) else None
    if "meta" in payload and "metrics" in payload:
        review = copy.deepcopy(payload)
    elif isinstance(payload.get("review"), dict) and "meta" in payload["review"] and "metrics" in payload["review"]:
        review = copy.deepcopy(payload["review"])
    else:
        valid_keys = set(ReviewRequest.model_fields.keys())
        req_kwargs = {k: v for k, v in payload.items() if k in valid_keys}
        review, _ = _compute_full_review(ReviewRequest(**req_kwargs))
    if meeting_block is not None:
        review["meeting"] = copy.deepcopy(meeting_block)
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
