"""Known distributions prove ranking, aggregation, period selection and privacy."""

from copy import deepcopy
from datetime import datetime
import json

import pytest

from backend.engine.peer_benchmark import percentile, build_peer_benchmark, KPI_DIRECTIONS


def test_percentile_endpoints_ties_singleton_and_missing():
    assert [percentile(v, [1, 2, 3]) for v in [1, 2, 3]] == [0, 0.5, 1]
    assert percentile(2, [1, 2, 2, 3]) == 0.5
    assert percentile(2, [2, 2, 2]) == 0.5
    assert percentile(2, [2]) == 0.5
    assert percentile(None, [1]) is None
    assert percentile(1, [None, float("nan"), 1]) == 0.5


def test_network_is_customer_weighted_anonymised_and_period_scoped():
    tables = dict(Customers=[], Sites=[], Products=[dict(product_id="P")], Laundries=[dict(laundry_id="L")],
                  Service_Activity=[], Repairs=[], Service_Cycles=[])
    for cid, rate, scanned, hours in [("CURRENT", 0.5, 50, 20), ("SECRET_A", 1, 90, 10), ("SECRET_B", 0, 10, 30)]:
        tables["Customers"].append(dict(customer_id=cid, customer_name="Private name " + cid))
        tables["Sites"].append(dict(customer_id=cid, site_id=cid + "_SITE"))
        keys = dict(customer_id=cid, site_id=cid + "_SITE", product_id="P", laundry_id="L")
        tables["Service_Activity"].append(dict(**keys, month="2025-01", allocated_pieces=100, active_assets_scanned=scanned,
                                               active_wearers=10, washed_pieces=1000, customer_washed_kg=100, service_requests=5))
        tables["Repairs"].append(dict(**keys, month="2025-01", repair_count=10))
        # Very different cycle counts must not turn the network into a pooled
        # or volume-weighted operational metric.
        n = 20 if cid == "SECRET_A" else 2
        for i in range(n):
            tables["Service_Cycles"].append(dict(**keys, pickup_timestamp=datetime(2025, 1, 1), cycle_hours=hours,
                                                  performance_flag="ON_TIME" if i < rate * n else "LATE"))
        # Out-of-period extreme values must never affect this benchmark.
        tables["Service_Activity"].append(dict(**keys, month="2024-12", active_wearers=99999, allocated_pieces=1, active_assets_scanned=0))
    current = dict(on_time_rate=0.5, allocation_use_rate=0.5, repair_rate_per_1000=10, median_cycle_hours=20,
                   service_requests=5, wearers_min_est=10)
    site_rows = [dict(site_id="SELECTED_1", metrics=current), dict(site_id="SELECTED_2", metrics={**current, "on_time_rate": 1})]
    before = deepcopy(tables)
    r = build_peer_benchmark(tables, "CURRENT", "2025-01", "2025-01", current, site_rows)
    assert set(r["customer"]) == set(KPI_DIRECTIONS)
    assert r["customer"]["on_time_rate"] == dict(network_median=0.5, percentile=0.5, sample_size=3)
    assert r["customer"]["median_cycle_hours"]["network_median"] == 20
    assert r["customer"]["service_requests_per_wearer"]["network_median"] == 0.5
    assert r["sites"]["SELECTED_1"]["on_time_rate"] == 0
    assert r["sites"]["SELECTED_2"]["on_time_rate"] == 1
    assert "SECRET" not in json.dumps(r) and "Private name" not in json.dumps(r)
    assert tables == before


def test_empty_cohort_and_invalid_current_kpis_are_not_ranked():
    tables = dict(Customers=[dict(customer_id="C")])
    r = build_peer_benchmark(tables, "C", "2025-01", "2025-01", {}, [dict(site_id="S", metrics={})])
    assert r["customer"] == {}
    assert r["sites"] == {"S": {}}
    json.dumps(r, allow_nan=False)
