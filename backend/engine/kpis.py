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


def display_number(value):
    """Round only explanatory text; stored calculation values remain untouched."""
    return f"{value:,.6f}".rstrip("0").rstrip(".") if number(value) else "unavailable"


def operational_traces(activity, repairs, cycles, products, site_count, latest_month, *, values=None):
    """Arithmetic for this selection, using the same rows as operational()."""
    f = display_number
    if values is None:
        values = operational(activity, repairs, cycles, products, site_count, latest_month)
    latest = [r for r in activity if r["month"] == latest_month]
    allocated, scanned = total(latest, "allocated_pieces"), total(latest, "active_assets_scanned")
    traces = {
        "delivery_sites": f"COUNT selected customer sites = {f(site_count)}",
        "allocation_use_rate": f"{f(scanned)} scanned / {f(allocated)} allocated",
        "idle_pieces": f"{f(allocated)} allocated - {f(scanned)} scanned",
        "wash_frequency": f"{f(total(activity, 'washed_pieces'))} washed pieces / {f(total(activity, 'active_assets_scanned'))} active-asset observations across months",
        "on_time_rate": f"{sum(r.get('performance_flag') == 'ON_TIME' for r in cycles)} on-time cycles / {len(cycles)} cycles (pickup month)",
        "repair_rate_per_1000": f"{f(total(repairs, 'repair_count'))} repairs / {f(total(activity, 'washed_pieces'))} washed pieces * 1,000",
    }
    maxima = defaultdict(list)
    for row in latest:
        maxima[row["site_id"]].append(row.get("active_wearers"))
    traces["wearers_min_est"] = "site maxima: " + " + ".join(
        f"{site}({f(max(v)) if all(number(x) for x in v) else 'unavailable'})" for site, v in sorted(maxima.items()))
    for key, field, rows in (("wearer_product_assignments", "active_wearers", latest),
                              ("garments_allocated", "allocated_pieces", latest),
                              ("washed_kg", "customer_washed_kg", activity),
                              ("service_requests", "service_requests", activity),
                              ("repairs_total", "repair_count", repairs)):
        traces[key] = f"SUM({field}) over {len(rows)} selected rows"
    cost_terms = []
    for pid in sorted({r["product_id"] for r in latest}):
        rows = [r for r in latest if r["product_id"] == pid]
        a, s = total(rows, "allocated_pieces"), total(rows, "active_assets_scanned")
        cost = products.get(pid, {}).get("synthetic_purchase_cost_eur")
        cost_terms.append(f"{pid}: ({f(a)} - {f(s)}) * {f(cost)} EUR/piece")
    traces["idle_value_eur"] = " + ".join(cost_terms) + "; illustrative stock value, not savings"
    hours = sorted(r["cycle_hours"] for r in cycles if number(r.get("cycle_hours")))
    if hours and len(hours) == len(cycles):
        n = len(hours)
        middle = f(hours[n // 2]) if n % 2 else f"({f(hours[n // 2 - 1])} + {f(hours[n // 2])}) / 2"
        traces["median_cycle_hours"] = f"{n} sorted cycle-hour observations; middle value(s): {middle}"
    return {key: f"{expression} = {f(values[key])}" +
            (f"; stock month {latest_month}" if key in {"wearers_min_est", "wearer_product_assignments", "garments_allocated", "allocation_use_rate", "idle_pieces", "idle_value_eur"} else "")
            for key, expression in traces.items() if values[key] is not None}
