"""Anonymised, equal-customer-weight synthetic operational comparisons."""

from datetime import datetime
from collections import defaultdict
from statistics import median
import re

from .kpis import number, operational, ratio


KPI_DIRECTIONS = {
    "on_time_rate": "higher", "allocation_use_rate": "higher",
    "repair_rate_per_1000": "lower", "median_cycle_hours": "lower",
    "service_requests_per_wearer": "lower",
}
MIN_NETWORK_CUSTOMERS = 5


def percentile(value, cohort):
    """Zero-based midrank / (n-1): endpoints 0/1, ties share rank.

    A singleton is neutral 0.5, not evidence of superiority. Non-finite or
    unavailable observations never enter the distribution.
    """
    cohort = [v for v in cohort if number(v)]
    if not number(value) or not cohort:
        return None
    if len(cohort) == 1:
        return 0.5
    below = sum(v < value for v in cohort)
    equal = sum(v == value for v in cohort)
    return (below + (equal - 1) / 2) / (len(cohort) - 1)


def comparison_values(values):
    return {**{key: values.get(key) for key in KPI_DIRECTIONS},
            "service_requests_per_wearer": ratio(values.get("service_requests"), values.get("wearers_min_est"))}


def _customer_values(tables, customer_id, period_from, period_to):
    sites = {r["site_id"] for r in tables["Sites"] if r.get("customer_id") == customer_id}
    products = {r["product_id"]: r for r in tables["Products"]}
    laundries = {r["laundry_id"] for r in tables["Laundries"]}

    def selected(sheet):
        result = []
        for row in tables[sheet]:
            if row.get("customer_id") != customer_id or row.get("site_id") not in sites:
                continue
            if row.get("product_id") not in products or row.get("laundry_id") not in laundries:
                continue
            stamp = row.get("pickup_timestamp") if sheet == "Service_Cycles" else row.get("month")
            month = stamp.strftime("%Y-%m") if isinstance(stamp, datetime) else stamp
            if isinstance(month, str) and re.fullmatch(r"\d{4}-\d{2}", month) and period_from <= month <= period_to:
                result.append(row)
        return result

    activity = selected("Service_Activity")
    if not activity:
        return {}
    return comparison_values(operational(activity, selected("Repairs"), selected("Service_Cycles"),
                                         products, len(sites), period_to))


def build_peer_benchmark(tables, customer_id, period_from, period_to, customer_values, site_output):
    current = comparison_values(customer_values)
    network = []
    customer_ids = {c["customer_id"] for c in tables["Customers"]}
    # Count distinct customers, never rows. A three-customer demo cannot
    # disclose a network KPI and need not scan any other customer's records.
    if len(customer_ids) >= MIN_NETWORK_CUSTOMERS:
        grouped = {}
        for sheet in ("Sites", "Service_Activity", "Repairs", "Service_Cycles"):
            grouped[sheet] = defaultdict(list)
            for row in tables.get(sheet, []):
                grouped[sheet][row.get("customer_id")].append(row)
        for cid in sorted(customer_ids):
            customer_tables = {**tables, **{sheet: groups[cid] for sheet, groups in grouped.items()}}
            network.append(current if cid == customer_id else _customer_values(customer_tables, cid, period_from, period_to))
    customer_result = {}
    suppressed = {}
    for key in KPI_DIRECTIONS:
        cohort = [v[key] for v in network if number(v.get(key))]
        if len(cohort) < MIN_NETWORK_CUSTOMERS:
            suppressed[key] = "Insufficient eligible customers; network median and percentile withheld."
            continue
        rank = percentile(current.get(key), cohort)
        if rank is not None:
            customer_result[key] = dict(network_median=median(cohort), percentile=rank, sample_size=len(cohort))
    site_values = {s["site_id"]: comparison_values(s["metrics"]) for s in site_output}
    site_result = {sid: {} for sid in site_values}
    for key in KPI_DIRECTIONS:
        cohort = [v[key] for v in site_values.values() if number(v.get(key))]
        for sid, values in site_values.items():
            rank = percentile(values.get(key), cohort)
            if rank is not None:
                site_result[sid][key] = rank
    return dict(scope="Lindström network (synthetic; small cohorts suppressed)", customer=customer_result, sites=site_result,
                methodology=dict(period={"from": period_from, "to": period_to},
                                 minimum_group_size=MIN_NETWORK_CUSTOMERS, suppressed_metrics=suppressed,
                                 privacy="Network statistics require at least five distinct eligible customers per KPI, including the selected customer. No small-cohort median, percentile or individual values are returned. This is a disclosure safeguard, not a formal anonymity guarantee.",
                                 weighting="One operational aggregate per eligible customer, including the selected customer; no volume weighting.",
                                 percentile="Ascending zero-based midrank / (n-1); ties share rank; singleton = 0.5. High rank means a larger value, not always better performance.",
                                 preferred_direction=KPI_DIRECTIONS.copy(),
                                 service_requests_per_wearer="Period requests / final-month estimated minimum wearers; not unique people or a monthly-normalised rate.",
                                 limitations="Synthetic small cohort, not an industry standard or statistically representative benchmark. Missing/invalid KPI values are excluded per KPI."))
