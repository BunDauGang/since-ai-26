"""Self-contained Q&A regression cases; no private workbook or skipped tests."""

from copy import deepcopy
from datetime import datetime
import importlib
import json
from pathlib import Path

import jsonschema
import pytest

from backend.engine.build_review import build_review


@pytest.fixture
def tiny_tables():
    tables = {
        "Customers": [dict(customer_id="CUST002", customer_name="Synthetic test customer", industry="Manufacturing",
                           segment="Test", hq_country="Finland", priority_topics="Cost")],
        "Sites": [dict(site_id="S2", customer_id="CUST002", site_name="Test site", country="Finland", city="Test",
                       site_type="Production", primary_laundry_id="L2")],
        "Laundries": [dict(laundry_id="L2")],
        "Products": [dict(product_id=p, product_name=p, product_group="Test", synthetic_product_footprint_kgco2e=fp,
                          synthetic_purchase_cost_eur=cost) for p, fp, cost in (("P1", 3, 10), ("P2", 5, 20))],
        "Baselines": [dict(baseline_id=b, baseline_name=b, water_l_per_kg=w, energy_kwh_per_kg=1.2,
                           process_kgco2e_per_kg=0.7, delivery_kgco2e_per_kg=0.1)
                      for b, w in (("B_LOCAL", 9), ("B_HOME", 20), ("B_INHOUSE", 12))],
        "Assumptions": [], "Data_Quality": [], "Industry_Priorities": [],
        "Service_Activity": [], "Repairs": [], "Service_Cycles": [],
        "Laundry_Resources": [], "Waste_Circularity": [],
    }
    for month in ("2025-01", "2025-02"):
        for p, kg, wearers in (("P1", 20, 10), ("P2", 10, 8)):
            keys = dict(customer_id="CUST002", site_id="S2", laundry_id="L2", product_id=p, month=month)
            tables["Service_Activity"].append(dict(**keys, active_wearers=wearers, allocated_pieces=20,
                                                   active_assets_scanned=15, washed_pieces=30, customer_washed_kg=kg, service_requests=1))
            tables["Repairs"].append(dict(**keys, repair_count=2 if p == "P1" else 1, repair_type="BUTTON"))
            tables["Service_Cycles"].append(dict(**keys, pickup_timestamp=datetime.fromisoformat(month + "-01"),
                                                cycle_hours=4 if p == "P1" else 6,
                                                performance_flag="ON_TIME" if p == "P1" else "LATE"))
        tables["Laundry_Resources"].append(dict(laundry_id="L2", month=month, washed_kg=100, fresh_water_l=500,
                                                process_energy_kwh=80, process_emissions_kgco2e=20, delivery_emissions_kgco2e=5))
        tables["Waste_Circularity"].append(dict(laundry_id="L2", month=month, textile_waste_total_kg=10,
                                                waste_kg_per_washed_kg=0.1, recycling_kg=6, reuse_kg=1,
                                                energy_recovery_kg=2, incineration_kg=1))
    return tables


@pytest.fixture
def tiny_builder(tiny_tables, monkeypatch):
    module = importlib.import_module("backend.engine.build_review")
    monkeypatch.setattr(module, "load_tables", lambda _: tiny_tables)

    def run(**kwargs):
        selection = dict(customer_id="CUST002", period_from="2025-01", period_to="2025-02")
        selection.update(kwargs)
        r = build_review(**selection)
        # Every successful edge case must remain serializable and schema-valid.
        json.dumps(r, allow_nan=False)
        schema = json.loads((Path(__file__).resolve().parents[2] / "contracts/review.schema.json").read_text())
        jsonschema.validate(r, schema)
        return r

    return run


def metric_map(review, case="base"):
    return {m["id"]: m["value"][case] for m in review["metrics"]}


@pytest.mark.parametrize("baseline,water", [("B_LOCAL", 9), ("B_HOME", 20), ("B_INHOUSE", 12)])
@pytest.mark.parametrize("case,multiplier,repair_factor", [("low", 0.8, 0.5), ("base", 1, 1), ("high", 1.2, 1)])
def test_small_customer_baseline_scenarios(tiny_builder, baseline, water, case, multiplier, repair_factor):
    r = tiny_builder(baseline_id=baseline, sensitivity=case)
    m = metric_map(r, case)
    assert m["washed_kg"] == 60
    assert m["customer_water_l"] == 300
    assert m["customer_energy_kwh"] == 48
    assert m["customer_co2e_kg"] == 15
    assert m["water_saving_l"] == pytest.approx(60 * water * multiplier - 300)
    assert m["co2e_saving_kg"] == pytest.approx(60 * 0.8 * multiplier - 15)
    assert m["avoided_product_co2e_kg"] == 22 * repair_factor
    assert m["replacements_postponed"] == 6 * repair_factor
    assert m["circular_waste_share"] == pytest.approx(0.7)
    assert m["wearers_min_est"] == 10 and m["wearer_product_assignments"] == 18
    assert m["on_time_rate"] == 0.5 and m["median_cycle_hours"] == 5
    assert r["sites"][0]["metrics"]["water_saving_l"] == pytest.approx(m["water_saving_l"])
    assert sum(p["metrics"]["co2e_saving_kg"] for p in r["products"]) == pytest.approx(m["co2e_saving_kg"])


def test_custom_baseline_factors_and_negative_savings(tiny_builder, tiny_tables):
    # Baseline IDs remain the shared enum; customize factors in the source.
    b = tiny_tables["Baselines"][0]
    b.update(water_l_per_kg=2.5, process_kgco2e_per_kg=0, delivery_kgco2e_per_kg=0)
    r = tiny_builder()
    m = metric_map(r)
    assert m["water_saving_l"] == -150
    assert m["co2e_saving_kg"] == -15
    assert "2.5 baseline/kg" in next(m["formula"] for m in r["metrics"] if m["id"] == "water_saving_l")


def test_single_month_does_not_use_other_months(tiny_builder, tiny_tables):
    r = tiny_builder(period_from="2025-02", period_to="2025-02")
    assert metric_map(r)["washed_kg"] == 30
    assert metric_map(r)["repairs_total"] == 3
    assert r["timeseries"]["washed_kg"] == [dict(month="2025-02", value=30)]


def test_absent_final_month_never_substitutes_stale_stock(tiny_builder, tiny_tables):
    tiny_tables["Service_Activity"] = [r for r in tiny_tables["Service_Activity"] if r["month"] == "2025-01"]
    r = tiny_builder()
    assert "garments_allocated" not in metric_map(r)
    assert "wearers_min_est" not in metric_map(r)
    assert metric_map(r)["washed_kg"] == 30
    assert any(g["gap"] == "Unavailable metric: garments_allocated" for g in r["data_gaps"])


def test_zero_denominators_do_not_become_zero_rates(tiny_builder, tiny_tables):
    for row in tiny_tables["Service_Activity"]:
        row.update(allocated_pieces=0, active_assets_scanned=0, washed_pieces=0)
    m = metric_map(tiny_builder())
    assert "allocation_use_rate" not in m
    assert "wash_frequency" not in m
    assert "repair_rate_per_1000" not in m
    assert m["idle_pieces"] == 0


def test_zero_washed_kg_keeps_zero_footprint_without_trace_crash(tiny_builder, tiny_tables):
    for row in tiny_tables["Service_Activity"]:
        row["customer_washed_kg"] = 0
    m = metric_map(tiny_builder())
    assert m["customer_water_l"] == m["water_saving_l"] == 0
    assert "circular_waste_share" not in m


def test_no_repairs_and_no_cycles_are_distinct_from_zero_service_rate(tiny_builder, tiny_tables):
    tiny_tables["Repairs"] = []
    tiny_tables["Service_Cycles"] = []
    r = tiny_builder()
    m = metric_map(r)
    assert m["repairs_total"] == m["avoided_product_co2e_kg"] == 0
    assert "on_time_rate" not in m and "median_cycle_hours" not in m
    assert "no selected repairs" in next(v["formula"] for v in r["metrics"] if v["id"] == "avoided_product_co2e_kg")


@pytest.mark.parametrize("sheet", ["Laundry_Resources", "Waste_Circularity"])
def test_missing_laundry_month_omits_only_affected_outputs(tiny_builder, tiny_tables, sheet):
    tiny_tables[sheet].pop()
    r = tiny_builder()
    m = metric_map(r)
    assert m["washed_kg"] == 60
    missing = "customer_water_l" if sheet == "Laundry_Resources" else "textile_waste_kg"
    assert missing not in m
    assert any(g["gap"] == f"Unavailable metric: {missing}" for g in r["data_gaps"])


def test_zero_laundry_volume_is_flagged_not_divided_by_zero(tiny_builder, tiny_tables):
    tiny_tables["Laundry_Resources"][0]["washed_kg"] = 0
    r = tiny_builder()
    assert "customer_water_l" not in metric_map(r)
    assert any(q["check_id"] == "DQ4" and q["quantitative_impact"]["share"] is None for q in r["data_quality"])


@pytest.mark.parametrize("value", [None, float("nan"), float("inf")])
def test_missing_or_nonfinite_quantities_never_enter_json(tiny_builder, tiny_tables, value):
    tiny_tables["Service_Activity"][0]["customer_washed_kg"] = value
    r = tiny_builder()
    assert "washed_kg" not in metric_map(r)
    assert any(q["check_id"] == "DQ1" for q in r["data_quality"])


def test_unmapped_and_wrong_customer_rows_are_excluded_with_kg_counts(tiny_builder, tiny_tables):
    row = deepcopy(tiny_tables["Service_Activity"][0])
    row["site_id"] = "UNKNOWN"
    tiny_tables["Service_Activity"].append(row)
    tiny_tables["Sites"].append(dict(site_id="OTHER", customer_id="CUST001", primary_laundry_id="L2"))
    row = deepcopy(row)
    row["site_id"] = "OTHER"
    tiny_tables["Service_Activity"].append(row)
    r = tiny_builder()
    assert metric_map(r)["washed_kg"] == 60
    q = next(q for q in r["data_quality"] if q["check_id"] == "DQ_SELECTION")
    assert q["affected_rows"] == 2
    assert q["quantitative_impact"]["known_washed_kg"] == 40


@pytest.mark.parametrize("sheet", ["Laundry_Resources", "Waste_Circularity"])
def test_duplicate_laundry_month_fails_explicitly_instead_of_double_counting(tiny_builder, tiny_tables, sheet):
    tiny_tables[sheet].append(deepcopy(tiny_tables[sheet][0]))
    with pytest.raises(ValueError, match="Duplicate lookup key"):
        tiny_builder()


def test_builder_does_not_mutate_input_tables(tiny_builder, tiny_tables):
    before = deepcopy(tiny_tables)
    tiny_builder()
    assert tiny_tables == before


def test_repeated_requests_use_current_baseline_and_activity(tiny_builder, tiny_tables):
    first = metric_map(tiny_builder())["water_saving_l"]
    tiny_tables["Baselines"][0]["water_l_per_kg"] += 1
    assert metric_map(tiny_builder())["water_saving_l"] == first + 60
    tiny_tables["Service_Activity"][0]["customer_washed_kg"] += 10
    assert metric_map(tiny_builder())["washed_kg"] == 70


def test_indexed_and_scan_based_rollups_are_identical(tiny_builder, monkeypatch):
    from collections import defaultdict
    module = importlib.import_module("backend.engine.build_review")
    indexed = tiny_builder()

    def scan_groups(rows, *fields):
        return {field: defaultdict(list, {key: [r for r in rows if r.get(field) == key]
                                         for key in {r.get(field) for r in rows}}) for field in fields}

    monkeypatch.setattr(module, "_group_by", scan_groups)
    scanned = tiny_builder()
    indexed["meta"].pop("generated_at")
    scanned["meta"].pop("generated_at")
    assert indexed == scanned


@pytest.mark.parametrize("target", ["baseline", "product", "cycle"])
def test_unavailable_metric_gaps_name_the_actual_missing_input(tiny_builder, tiny_tables, target):
    if target == "baseline":
        tiny_tables["Baselines"][0]["water_l_per_kg"] = None
        metric, field = "water_saving_l", "water_l_per_kg"
    elif target == "product":
        tiny_tables["Products"][0]["synthetic_product_footprint_kgco2e"] = None
        metric, field = "avoided_product_co2e_kg", "Products.synthetic_product_footprint_kgco2e"
    else:
        tiny_tables["Service_Cycles"][0]["performance_flag"] = "UNKNOWN"
        metric, field = "on_time_rate", "performance_flag"
    r = tiny_builder()
    assert metric not in metric_map(r)
    gap = next(g for g in r["data_gaps"] if g["gap"] == f"Unavailable metric: {metric}")
    assert field in gap["impact"]


def test_master_data_findings_never_claim_zero_affected_kg():
    from backend.engine.validate import validate_tables
    q = validate_tables({"Customers": [{"customer_id": "C1", "customer_name": None}]})[0]
    assert q["quantitative_impact"]["known_washed_kg"] is None
    assert q["quantitative_impact"]["kg_field_present"] is False


def test_sample_builder_uses_current_engine_and_offline_observations(tiny_builder, monkeypatch):
    module = importlib.import_module("backend.engine.sample_review")
    monkeypatch.setattr(module, "build_review", lambda source_path=None: tiny_builder())
    # It must not attempt LLM calls even if a user's API key happens to exist.
    from backend.insights import llm
    monkeypatch.setenv("GEMINI_API_KEY", "test-placeholder")
    calls = []
    def forbid_network(*args, **kwargs):
        calls.append((args, kwargs))
        raise AssertionError("Sample generation must work offline")
    monkeypatch.setattr(llm, "_request", forbid_network)
    r = module.build_sample()
    assert r["observations"]
    assert metric_map(r)["water_saving_l"] == 240
    assert r["meta"]["customer_id"] == "CUST002"
    assert calls == []
