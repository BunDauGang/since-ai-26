"""Integration tests for the FastAPI connector server (`backend/api/main.py`)."""
from fastapi.testclient import TestClient

from backend.api.main import app

client = TestClient(app)


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

