"""Worker A tests. Small workbooks exercise the real Excel boundary."""

from datetime import datetime

import pytest
from openpyxl import Workbook

from backend.engine.adapters.excel_adapter import REQUIRED_SHEETS, load_tables
from backend.engine.sensitivity import baseline_range, repair_range
from backend.engine.validate import validate_tables
from backend.engine.build_review import build_review, DEFINITIONS
from backend.engine.impacts import allocate_rows, savings


def test_baseline_uncertainty_applies_to_factors_not_net_savings():
    assert baseline_range(100, 10, 300) == {"low": 500, "base": 700, "high": 900}
    assert baseline_range(100, 2, 300)["base"] == -100


def test_repair_scenarios():
    assert repair_range(10, 12) == {"low": 60, "base": 120, "high": 120}
    with pytest.raises(ValueError):
        repair_range(float("nan"))


def test_excel_adapter_preserves_missing_cells_and_converts_dates(tmp_path):
    book = Workbook()
    book.remove(book.active)
    for name in REQUIRED_SHEETS:
        sheet = book.create_sheet(name)
        if name == "Service_Cycles":
            sheet.append(["asset_id", "start_timestamp", "end_timestamp"])
            sheet.append([" A001 ", 45658, 45659])
        else:
            sheet.append(["site_id", "month", "value"])
            sheet.append(["UNKNOWN", datetime(2025, 1, 1), None])
    path = tmp_path / "pack.xlsx"
    book.save(path)
    tables = load_tables(path)
    assert tables["Service_Activity"][0] == {"site_id": "UNKNOWN", "month": "2025-01", "value": None}
    cycle = tables["Service_Cycles"][0]
    assert cycle["asset_id"] == "A001"
    assert cycle["start_timestamp"] == datetime(2025, 1, 1)
    assert (cycle["end_timestamp"] - cycle["start_timestamp"]).days == 1


def test_missing_workbook_is_explicit(tmp_path):
    with pytest.raises(FileNotFoundError, match="Excel data pack not found"):
        load_tables(tmp_path / "missing.xlsx")


def test_missing_required_sheets_are_reported(tmp_path):
    book = Workbook()
    path = tmp_path / "missing_sheets.xlsx"
    book.save(path)
    with pytest.raises(ValueError, match="Missing workbook sheets"):
        load_tables(path)


def test_quality_flags_bad_rows_and_global_laundry_share_without_mutation(caplog):
    from copy import deepcopy

    tables = {
        "Customers": [{"customer_id": "C1"}, {"customer_id": "C2"}],
        "Laundries": [{"laundry_id": "L003"}],
        "Sites": [{"site_id": "S1", "customer_id": "C1", "laundry_id": "L003"}],
        "Service_Activity": [
            {"customer_id": "C1", "site_id": "S1", "month": "2025-01", "customer_washed_kg": 28000, "active_wearers": None},
            {"customer_id": "C2", "site_id": "S1", "month": "2025-01", "customer_washed_kg": 100},
            {"customer_id": "C1", "site_id": "UNKNOWN", "month": "2025-01", "customer_washed_kg": 200},
        ],
        "Laundry_Resources": [{"laundry_id": "L003", "month": "2025-01", "washed_kg": 2500}],
    }
    before = deepcopy(tables)
    findings = validate_tables(tables)
    assert {f["check_id"] for f in findings} == {"DQ1", "DQ2", "DQ3", "DQ4"}
    assert "L003" in next(f["message"] for f in findings if f["check_id"] == "DQ4")
    assert "DQ1" in caplog.text and "DQ2" in caplog.text
    assert tables == before


@pytest.fixture(scope="module")
def pack_tables():
    import os
    from pathlib import Path
    from backend.engine.adapters.excel_adapter import DEFAULT_SOURCE
    path = Path(os.environ.get("ENGINE_TEST_WORKBOOK", DEFAULT_SOURCE))
    if not path.is_file():
        pytest.skip("Set ENGINE_TEST_WORKBOOK to run challenge-pack integration tests")
    return load_tables(path)


@pytest.fixture
def pack_builder(pack_tables, monkeypatch):
    import importlib
    module = importlib.import_module("backend.engine.build_review")
    monkeypatch.setattr(module, "load_tables", lambda source_path: pack_tables)
    return build_review


def metrics(review):
    return {m["id"]: m["value"]["base"] for m in review["metrics"]}


def test_all_reference_rows_within_one_percent(pack_tables):
    keys = ("customer_id", "site_id", "product_id", "laundry_id", "month")
    computed = allocate_rows(pack_tables["Service_Activity"], pack_tables["Laundry_Resources"], pack_tables["Waste_Circularity"])
    lookup = {tuple(r[k] for k in keys): r for r in computed}
    baseline = next(b for b in pack_tables["Baselines"] if b["baseline_id"] == "B_LOCAL")
    assert len(lookup) == len(pack_tables["Customer_Impacts"]) == 1248
    for expected in pack_tables["Customer_Impacts"]:
        calculated = savings([lookup[tuple(expected[k] for k in keys)]], baseline)
        for target, source in (("water_saving_l", "water_saving_vs_local_l"),
                               ("energy_saving_kwh", "energy_saving_vs_local_kwh"),
                               ("co2e_saving_kg", "emissions_saving_vs_local_kgco2e")):
            assert calculated[target]["base"] == pytest.approx(expected[source], rel=0.01)


def test_challenge_totals_and_contract(pack_builder):
    import json
    from pathlib import Path
    import jsonschema
    review = pack_builder()
    schema = json.loads((Path(__file__).resolve().parents[2] / "contracts/review.schema.json").read_text())
    jsonschema.validate(review, schema)
    json.dumps(review, allow_nan=False)
    m = metrics(review)
    assert set(m) == {d[0] for d in DEFINITIONS}
    assert m["washed_kg"] == pytest.approx(502074.7)
    assert m["repairs_total"] == 15233
    assert m["water_saving_l"] == pytest.approx(1406482.6, rel=0.01)
    assert m["co2e_saving_kg"] == pytest.approx(255073.1, rel=0.01)
    assert m["wearer_product_assignments"] == 28367
    assert m["wearers_min_est"] == 9607
    assert len(review["sites"]) == 24
    assert review["observations"] == []
    assert {a["id"] for a in review["assumptions"]} >= {"T001", "T002", "A002"}
    assert any(q["check_id"] == "DQ4" and "L003" in q["message"] for q in review["data_quality"])
    assert sum(s["metrics"]["washed_kg"] for s in review["sites"]) == pytest.approx(m["washed_kg"])
    assert sum(t["value"] for t in review["timeseries"]["water_saving_l"]) == pytest.approx(m["water_saving_l"])
    waste = next(v for v in review["metrics"] if v["id"] == "textile_waste_kg")
    # Route totals in the source workbook are rounded independently.
    assert sum(p["value"] for p in waste["breakdown"]["by_route"]) == pytest.approx(m["textile_waste_kg"], rel=0.001)
    repairs = next(v for v in review["metrics"] if v["id"] == "repairs_total")
    assert sum(p["value"] for p in repairs["breakdown"]["by_repair_type"]) == m["repairs_total"]


@pytest.mark.parametrize("customer_id", ["CUST001", "CUST002", "CUST003"])
@pytest.mark.parametrize("baseline_id", ["B_LOCAL", "B_HOME", "B_INHOUSE"])
def test_baselines_and_customers(pack_builder, customer_id, baseline_id):
    r = pack_builder(customer_id=customer_id, baseline_id=baseline_id, sensitivity="low", priority="cost")
    m = {m["id"]: m for m in r["metrics"]}
    comparison = next(b for b in r["baseline_comparison"] if b["baseline_id"] == baseline_id)
    assert m["water_saving_l"]["value"] == comparison["water_saving_l"]
    assert r["priority_view"]["priority"] == "cost"
    assert sum(s["metrics"]["water_saving_l"] for s in r["sites"]) == pytest.approx(m["water_saving_l"]["value"]["low"])


def test_period_filter_and_reference_independence(pack_builder, pack_tables):
    from copy import deepcopy
    original = deepcopy(pack_tables["Customer_Impacts"])
    try:
        pack_tables["Customer_Impacts"] = []
        r = pack_builder(period_from="2025-03", period_to="2025-03")
    finally:
        pack_tables["Customer_Impacts"] = original
    expected = sum(row["customer_washed_kg"] for row in pack_tables["Service_Activity"] if row["customer_id"] == "CUST001" and row["month"] == "2025-03")
    assert metrics(r)["washed_kg"] == pytest.approx(expected)
    assert [p["month"] for p in r["timeseries"]["washed_kg"]] == ["2025-03"]


def test_bad_data_review_reports_missing_and_unmapped(pack_builder, pack_tables):
    from copy import deepcopy
    original = pack_tables["Service_Activity"]
    rows = deepcopy(original)
    rows[0]["customer_washed_kg"] = None
    rows[1]["site_id"] = "UNMAPPED"
    try:
        pack_tables["Service_Activity"] = rows
        r = pack_builder()
    finally:
        pack_tables["Service_Activity"] = original
    assert {q["check_id"] for q in r["data_quality"]} >= {"DQ1", "DQ2", "DQ_SELECTION"}
    assert "washed_kg" not in metrics(r)
    assert any(g["gap"] == "Unavailable metric: washed_kg" for g in r["data_gaps"])


@pytest.mark.parametrize("kwargs", [{"period_from": "2025-13"}, {"period_from": "2026-01", "period_to": "2025-01"},
                                    {"priority": "unknown"}, {"sensitivity": "extreme"}, {"customer_id": "UNKNOWN"},
                                    {"baseline_id": "UNKNOWN"}, {"period_from": "2024-01", "period_to": "2024-12"}])
def test_invalid_selections(pack_builder, kwargs):
    with pytest.raises(ValueError):
        pack_builder(**kwargs)


@pytest.mark.parametrize("customer,month,baseline,case", [
    ("CUST001", "2025-12", "B_LOCAL", "base"),
    ("CUST002", "2025-03", "B_HOME", "low"),
    ("CUST002", "2025-06", "B_INHOUSE", "high"),
])
def test_live_formula_operands_follow_selection(pack_builder, pack_tables, customer, month, baseline, case):
    from backend.engine.kpis import display_number
    r = pack_builder(customer_id=customer, period_from=month, period_to=month, baseline_id=baseline, sensitivity=case)
    m = {v["id"]: v for v in r["metrics"]}
    for metric in m.values():
        assert " | Live arithmetic" in metric["formula"]
        assert display_number(metric["value"][case]) in metric["formula"]
    b = next(v for v in pack_tables["Baselines"] if v["baseline_id"] == baseline)
    formula = m["water_saving_l"]["formula"]
    assert f"{display_number(m['washed_kg']['value']['base'])} kg" in formula
    assert f"{display_number(b['water_l_per_kg'])} baseline/kg" in formula
    assert display_number(m["customer_water_l"]["value"]["base"]) in formula
    assert f"scenario={case}; baseline={baseline}" in formula
    assert f"stock month {month}" in m["allocation_use_rate"]["formula"]


def test_trace_does_not_make_missing_data_zero(pack_builder, pack_tables):
    rows = pack_tables["Service_Activity"]
    value = rows[0]["customer_washed_kg"]
    try:
        rows[0]["customer_washed_kg"] = None
        review = pack_builder()
    finally:
        rows[0]["customer_washed_kg"] = value
    assert "water_saving_l" not in metrics(review)
    assert "washed_kg" not in metrics(review)


def test_bundled_sample_contains_live_traces_and_valid_contract():
    import json
    from pathlib import Path
    import jsonschema
    from backend.engine.kpis import display_number
    root = Path(__file__).resolve().parents[2]
    review = json.loads((root / "contracts/sample_review.json").read_text())
    jsonschema.validate(review, json.loads((root / "contracts/review.schema.json").read_text()))
    assert len(review["metrics"]) == len(DEFINITIONS)
    for metric in review["metrics"]:
        assert " | Live arithmetic" in metric["formula"]
        assert display_number(metric["value"][review["meta"]["sensitivity"]]) in metric["formula"]
