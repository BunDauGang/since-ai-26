"""Operational calculations over normalized records (no workbook access)."""

from collections import defaultdict
from statistics import median
import math


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def total(rows, field):
    """Unknown inputs propagate as unknown, never as invented zeros."""
    values = [row.get(field) for row in rows]
    return sum(values) if all(number(value) for value in values) else None


def ratio(numerator, denominator, multiplier=1):
    return numerator / denominator * multiplier if number(numerator) and number(denominator) and denominator > 0 else None


def operational(activity, repairs, cycles, products, site_count, latest_month):
    latest = [row for row in activity if row["month"] == latest_month]
    wearers = defaultdict(list)
    for row in latest:
        wearers[row["site_id"]].append(row.get("active_wearers"))
    minimum = sum(max(values) for values in wearers.values()) if latest and all(
        number(v) for values in wearers.values() for v in values) else None
    allocated = total(latest, "allocated_pieces") if latest else None
    scanned = total(latest, "active_assets_scanned") if latest else None
    idle = allocated - scanned if allocated is not None and scanned is not None else None
    idle_values = []
    for row in latest:
        cost = products.get(row["product_id"], {}).get("synthetic_purchase_cost_eur")
        a, s = row.get("allocated_pieces"), row.get("active_assets_scanned")
        idle_values.append((a - s) * cost if all(number(v) for v in (a, s, cost)) else None)
    count = total(repairs, "repair_count")
    hours = [row.get("cycle_hours") for row in cycles]
    return {
        "delivery_sites": site_count, "wearers_min_est": minimum,
        "wearer_product_assignments": total(latest, "active_wearers") if latest else None,
        "garments_allocated": allocated, "allocation_use_rate": ratio(scanned, allocated),
        "idle_pieces": idle,
        "idle_value_eur": sum(idle_values) if latest and all(number(v) for v in idle_values) else None,
        "washed_kg": total(activity, "customer_washed_kg"),
        # Ratio of period sums = denominator-weighted monthly frequency.
        "wash_frequency": ratio(total(activity, "washed_pieces"), total(activity, "active_assets_scanned")),
        "service_requests": total(activity, "service_requests"),
        "on_time_rate": ratio(sum(row.get("performance_flag") == "ON_TIME" for row in cycles), len(cycles))
            if all(row.get("performance_flag") in {"ON_TIME", "LATE"} for row in cycles) else None,
        "median_cycle_hours": median(hours) if hours and all(number(h) for h in hours) else None,
        "repairs_total": count,
        "repair_rate_per_1000": ratio(count, total(activity, "washed_pieces"), 1000),
    }
