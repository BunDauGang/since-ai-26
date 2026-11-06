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
