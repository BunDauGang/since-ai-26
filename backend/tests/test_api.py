"""Integration tests for the FastAPI connector server (`backend/api/main.py`)."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import backend.api.main as api
from backend.api.main import app

client = TestClient(app)
needs_pack = pytest.mark.skipif(not api.DEFAULT_DATA_PATH.exists(), reason="Excel data pack not in data/")


def test_health_and_customers():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

    c = client.get("/api/customers")
    assert c.status_code == 200
    data = c.json()
    assert len(data["customers"]) == 3
    assert len(data["baselines"]) == 3


def test_review_end_to_end():
    r = client.post(
        "/api/review",
        json={
            "customer_id": "CUST001",
            "period_from": "2025-01",
            "period_to": "2025-12",
            "baseline_id": "B_LOCAL",
            "sensitivity": "base",
            "priority": "water",
            "use_llm": False,
        },
    )
    assert r.status_code == 200
    review = r.json()
    assert review["meta"]["customer_id"] == "CUST001"
    assert review["meta"]["priority"] == "water"
    assert len(review["sites"]) == 24
    assert len(review["observations"]) >= 3


def test_export_pptx_and_pdf():
    for fmt in ("pptx", "pdf"):
        r = client.post(
            f"/api/export?format={fmt}",
            json={
                "customer_id": "CUST001",
                "period_from": "2025-01",
                "period_to": "2025-12",
                "baseline_id": "B_LOCAL",
                "sensitivity": "base",
                "priority": "water",
                "use_llm": False,
            },
        )
        assert r.status_code == 200
        assert len(r.content) > 1000


@needs_pack
def test_multi_customer_and_prompt_interpretation():
    """Verify multi-customer / multi-industry scaling (CUST002 Manufacturing, CUST003 Healthcare) and /api/interpret."""
    for cid, expected_industry, expected_default_prio, expected_sites in (
        ("CUST002", "Manufacturing", "cost", 6),
        ("CUST003", "Healthcare", "service", 4),
    ):
        r = client.post(
            "/api/review",
            json={
                "customer_id": cid,
                "period_from": "2025-01",
                "period_to": "2025-12",
                "baseline_id": "B_LOCAL",
                "sensitivity": "base",
                "use_llm": False,
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["meta"]["customer_id"] == cid
        assert data["meta"]["industry"] == expected_industry
        assert data["meta"]["priority"] == expected_default_prio
        assert len(data["sites"]) == expected_sites

    interp = client.post(
        "/api/interpret",
        json={"prompt": "Which sites have the highest repair rate and textile waste?", "industry": "Manufacturing"},
    )
    assert interp.status_code == 200
    assert interp.json()["priority"] == "circularity"



@needs_pack
def test_invalid_input_is_a_client_error_not_a_sample():
    bad_period = client.post("/api/review", json={"customer_id": "CUST002", "period_from": "2025-12", "period_to": "2025-01", "use_llm": False})
    assert bad_period.status_code == 400
    unknown = client.post("/api/review", json={"customer_id": "CUST999", "use_llm": False})
    assert unknown.status_code == 400


@needs_pack
def test_get_review_uses_customer_default_priority():
    r = client.get("/api/review", params={"customer_id": "CUST002"})
    assert r.status_code == 200
    assert r.json()["meta"]["priority"] == "cost"
    assert r.headers["X-Review-Source"] == "engine"


def test_sample_fallback_is_never_relabelled_as_another_customer(monkeypatch):
    monkeypatch.setattr(api, "_ACTIVE_DATA_PATH", Path("/nonexistent/pack.xlsx"))
    monkeypatch.setattr("backend.engine.adapters.excel_adapter.DEFAULT_SOURCE", Path("/nonexistent/pack.xlsx"))
    api._REVIEW_CACHE.clear()
    other = client.post("/api/review", json={"customer_id": "CUST002", "use_llm": False})
    assert other.status_code == 503
    own = client.post("/api/review", json={"customer_id": "CUST001", "baseline_id": "B_HOME", "use_llm": False})
    assert own.status_code == 200
    assert own.headers["X-Review-Source"] == "sample"
    assert own.json()["meta"]["customer_name"] == "NorthStar Foods Group"
    assert own.json()["meta"]["baseline_id"] == "B_HOME"


def test_export_reports_bad_payload_and_cleans_temp_files(monkeypatch, tmp_path):
    monkeypatch.setattr(api.tempfile, "tempdir", str(tmp_path))
    review = client.post("/api/review", json={"customer_id": "CUST001", "use_llm": False}).json()
    ok = client.post("/api/export?format=pptx", json=review)
    assert ok.status_code == 200
    assert not list(tmp_path.glob("lindstrom_export_*"))  # removed after sending
    broken = dict(review, meta={k: v for k, v in review["meta"].items() if k != "priority"})
    bad = client.post("/api/export?format=pdf", json=broken)
    assert bad.status_code == 422
    assert "priority" in bad.json()["detail"]
    assert not list(tmp_path.glob("lindstrom_export_*"))


def test_export_follows_reordered_dashboard_observations():
    from backend.export.content import build_pages

    review = client.post("/api/review", json={"customer_id": "CUST001", "priority": "water", "use_llm": False}).json()
    obs = review["observations"]
    assert len(obs) >= 2
    review["observations"] = [dict(o, title="KAM " + "ABCDEFGH"[i] + " " + o["title"]) for i, o in enumerate(obs)][::-1]
    text = str(next(p for p in build_pages(review) if p[0] == "Observations & recommended next actions"))
    assert all(f"KAM {'ABCDEFGH'[i]} " in text for i in range(len(obs)))
    assert text.index("KAM " + "ABCDEFGH"[len(obs) - 1]) < text.index("KAM A")


def test_story_endpoint_personas():
    for persona, expected_snippet in (
        ("ceo", "98.3%"),
        ("cfo", "15,233"),
        ("operations", "82"),
        ("sustainability", "255 t"),
    ):
        r = client.post(
            "/api/story",
            json={
                "customer_id": "CUST001",
                "persona": persona,
                "goal": "Prepare for 15-min review",
                "minutes": 15,
                "use_llm": False,
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["persona"] == persona
        assert data["minutes"] == 15
        assert len(data["points"]) == 3
        assert all("metric_ids" in pt and len(pt["metric_ids"]) >= 1 for pt in data["points"])
        assert len(data["likely_objections"]) >= 2
        assert data["ask"]
        combined_text = data["opening"] + " " + " ".join(pt["text"] for pt in data["points"])
        assert expected_snippet in combined_text


def test_export_accepts_optional_meeting_block():
    meeting = {
        "persona": "cfo",
        "targets": {"on_time_rate": 0.98},
        "satisfaction": {"score": 8, "scale": 10, "source": "KAM input"},
        "rough_calc": {"inputs": {"garment_cost_eur": 42}, "result_eur": 30700, "label": "ROUGH CALCULATION"},
        "agreed_actions": ["Review allocation at Kotka and Helsinki"],
        "open_topics": ["Repair causes at high-rate sites"],
    }
    for fmt in ("pptx", "pdf"):
        r = client.post(
            f"/api/export?format={fmt}",
            json={
                "customer_id": "CUST001",
                "use_llm": False,
                "meeting": meeting,
            },
        )
        assert r.status_code == 200
        assert len(r.content) > 1000



def test_story_follows_baseline_and_case_without_forbidden_claims():
    import json as _json
    sample = _json.loads(api.SAMPLE_REVIEW_PATH.read_text(encoding="utf-8"))
    home = {**sample, "meta": {**sample["meta"], "baseline_name": "Home washing"}}
    cfo = client.post("/api/story", json={"persona": "cfo", "use_llm": False, "review": home}).json()
    text = _json.dumps(cfo, ensure_ascii=False)
    assert "Compared with home washing" in cfo["points"][0]["text"]
    assert "typical local laundry" not in text and "Home washing is modelled without a repair service" in text
    low = {**sample, "meta": {**sample["meta"], "sensitivity": "low"}}
    low_cfo = client.post("/api/story", json={"persona": "cfo", "use_llm": False, "review": low}).json()
    postponed = next(m for m in sample["metrics"] if m["id"] == "replacements_postponed")["value"]
    assert f"{round(postponed['low']):,}" in low_cfo["points"][0]["text"]
    for persona in ("ceo", "cfo", "operations", "sustainability"):
        r = client.post("/api/story", json={"persona": persona, "use_llm": False, "review": sample}).json()
        body = _json.dumps({k: r[k] for k in ("opening", "points", "ask")}, ensure_ascii=False).lower()
        assert not any(w in body for w in ("audited", "audit-ready", "verified", "certified", "measured")), persona
        assert "top q1" not in _json.dumps(r).lower()
        assert all(o["readiness"] != "evidence" for o in r["likely_objections"] if o["id"] == "obj_idle_garments")
    missing = {**sample, "metrics": [m for m in sample["metrics"] if m["id"] not in ("co2e_saving_kg", "water_saving_l")]}
    r = client.post("/api/story", json={"persona": "ceo", "use_llm": False, "review": missing}).json()
    assert "~unavailable" not in _json.dumps(r, ensure_ascii=False)
