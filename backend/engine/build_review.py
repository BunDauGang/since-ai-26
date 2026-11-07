"""Build the shared review contract using deterministic workbook calculations."""

from datetime import datetime, timezone
from collections import defaultdict
import re

from .adapters.excel_adapter import load_tables
from .impacts import allocate_rows, environmental, savings, ROUTES, environmental_traces
from .kpis import operational, total, number, operational_traces
from .sensitivity import TEAM_ASSUMPTIONS
from .validate import validate_tables, row_impact, wearer_finding, unavailable_gap
from backend.insights.priority import interpret_prompt


# id, category, unit, status, formula, sources, assumptions
DEFINITIONS = [
    ("delivery_sites", "scale", "sites", "SYNTHETIC", "COUNT(customer sites)", "Sites", "A006"),
    ("wearers_min_est", "scale", "wearers", "ESTIMATE", "SUM(site MAX(active_wearers across products) in latest reporting month)", "Service_Activity", "A008"),
    ("wearer_product_assignments", "scale", "assignments", "SYNTHETIC", "SUM(active_wearers in latest reporting month)", "Service_Activity", "A008"),
    ("garments_allocated", "scale", "pieces", "SYNTHETIC", "SUM(allocated_pieces in latest reporting month)", "Service_Activity", "A008"),
    ("washed_kg", "scale", "kg", "SYNTHETIC", "SUM(customer_washed_kg)", "Service_Activity", "A008"),
    ("allocation_use_rate", "allocation", "ratio", "CALCULATED", "SUM(active_assets_scanned) / SUM(allocated_pieces), latest reporting month", "Service_Activity", "A008"),
    ("idle_pieces", "allocation", "pieces", "CALCULATED", "SUM(allocated_pieces - active_assets_scanned), latest reporting month", "Service_Activity", "A008"),
    ("idle_value_eur", "allocation", "EUR", "ESTIMATE", "SUM((allocated_pieces - active_assets_scanned) * synthetic_purchase_cost_eur), latest month; illustrative stock value", "Service_Activity|Products", "A008|T003"),
    ("wash_frequency", "service", "washes/active asset/month", "CALCULATED", "SUM(washed_pieces) / SUM(active_assets_scanned), weighted across reporting months", "Service_Activity", "A008"),
    ("service_requests", "service", "requests", "SYNTHETIC", "SUM(service_requests)", "Service_Activity", "A008"),
    ("on_time_rate", "service", "ratio", "CALCULATED", "COUNT(ON_TIME) / COUNT(cycles); period selected by pickup_timestamp", "Service_Cycles", "A008"),
    ("median_cycle_hours", "service", "hours", "CALCULATED", "MEDIAN(cycle_hours); period selected by pickup_timestamp", "Service_Cycles", "A008"),
    ("repairs_total", "repair", "repairs", "SYNTHETIC", "SUM(repair_count)", "Repairs", "A008"),
    ("repair_rate_per_1000", "repair", "repairs/1000 washed pieces", "CALCULATED", "SUM(repair_count) / SUM(washed_pieces) * 1000", "Repairs|Service_Activity", "A008"),
    ("replacements_postponed", "repair", "events", "ESTIMATE", "SUM(repair_count) * repair_factor", "Repairs", "A002|T001"),
    ("avoided_product_co2e_kg", "repair", "kgCO2e", "ESTIMATE", "SUM(repair_count * synthetic_product_footprint_kgco2e) * repair_factor", "Repairs|Products", "A002|A005|T001"),
    ("customer_water_l", "footprint", "L", "ALLOCATED_ESTIMATE", "SUM(customer_washed_kg * fresh_water_l / laundry washed_kg)", "Service_Activity|Laundry_Resources", "A003"),
    ("customer_energy_kwh", "footprint", "kWh", "ALLOCATED_ESTIMATE", "SUM(customer_washed_kg * process_energy_kwh / laundry washed_kg)", "Service_Activity|Laundry_Resources", "A003"),
    ("customer_co2e_kg", "footprint", "kgCO2e", "ALLOCATED_ESTIMATE", "SUM(customer_washed_kg * (process_emissions_kgco2e + delivery_emissions_kgco2e) / laundry washed_kg)", "Service_Activity|Laundry_Resources", "A003"),
    ("textile_waste_kg", "footprint", "kg", "ALLOCATED_ESTIMATE", "SUM(customer_washed_kg * waste_kg_per_washed_kg)", "Service_Activity|Waste_Circularity", "A003"),
    ("circular_waste_share", "footprint", "ratio", "ALLOCATED_ESTIMATE", "SUM(allocated recycling_kg + allocated reuse_kg) / SUM(allocated textile_waste_kg)", "Service_Activity|Waste_Circularity", "A003|A004"),
    ("water_saving_l", "handprint", "L", "ALLOCATED_ESTIMATE", "SUM(customer_washed_kg) * B.water_l_per_kg * baseline_factor - customer_water_l", "Service_Activity|Laundry_Resources|Baselines", "A001|A003|T002"),
    ("energy_saving_kwh", "handprint", "kWh", "ALLOCATED_ESTIMATE", "SUM(customer_washed_kg) * B.energy_kwh_per_kg * baseline_factor - customer_energy_kwh", "Service_Activity|Laundry_Resources|Baselines", "A001|A003|T002"),
    ("co2e_saving_kg", "handprint", "kgCO2e", "ALLOCATED_ESTIMATE", "SUM(customer_washed_kg) * (B.process_kgco2e_per_kg + B.delivery_kgco2e_per_kg) * baseline_factor - customer_co2e_kg", "Service_Activity|Laundry_Resources|Baselines", "A001|A003|T002"),
]

PRIORITIES = {
    "water": ["water_saving_l", "customer_water_l", "washed_kg", "co2e_saving_kg"],
    "emissions": ["co2e_saving_kg", "customer_co2e_kg", "avoided_product_co2e_kg"],
    "cost": ["idle_value_eur", "idle_pieces", "allocation_use_rate", "replacements_postponed"],
    "circularity": ["repairs_total", "replacements_postponed", "circular_waste_share", "textile_waste_kg"],
    "service": ["on_time_rate", "median_cycle_hours", "service_requests", "allocation_use_rate"],
    "improvement": ["allocation_use_rate", "water_saving_l", "repairs_total", "on_time_rate"],
}

DATA_GAPS = [
    {"gap": gap, "impact": impact, "future_source": source} for gap, impact, source in (
        ("Customer hierarchy is synthetic", "Parent/site roll-up needs production master data", "Lindström customer master data"),
        ("Unique wearer count", "Per-product wearer counts cannot identify unique people", "eLindström wearer data"),
        ("Service-request details", "Cannot calculate causes or request-free days", "Service-request system export"),
        ("Cost and time evidence", "Idle stock values are illustrative, not savings promises", "Contract and invoice data"),
        ("Product footprints", "Synthetic factors require replacement", "Approved product LCA data"),
        ("Baseline ranges", "Team sensitivity assumptions require confirmation", "Approved Lindström calculator"),
        ("Laundry volume for L003", "Customer volume exceeds laundry volume", "WWS Washed Kg report"),
        ("Industry trends and regulations", "No public-reference sheet in supplied workbook", "Curated public references"),
    )
]


def _range(value):
    return value if isinstance(value, dict) else dict(low=value, base=value, high=value)


def _month(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", value):
        raise ValueError("Reporting months must use YYYY-MM")
    return value


def _group_by(rows, *fields):
    """Index once per request, preserving row order and floating-point sums.

    Request-local lists refer to the unchanged input records. No process cache
    is used, so an edited workbook or baseline cannot reuse stale aggregates.
    """
    groups = {field: defaultdict(list) for field in fields}
    for row in rows:
        for field in fields:
            groups[field][row.get(field)].append(row)
    return groups


def build_review(customer_id="CUST001", period_from="2025-01", period_to="2025-12",
                 baseline_id="B_LOCAL", sensitivity="base", priority=None, source_path=None) -> dict:
    _month(period_from), _month(period_to)
    if period_from > period_to:
        raise ValueError("period_from must not exceed period_to")
    if sensitivity not in {"low", "base", "high"}:
        raise ValueError("Unknown sensitivity")
    if priority is not None and priority not in PRIORITIES:
        raise ValueError("Unknown priority")
    tables = load_tables(source_path)
    quality = validate_tables(tables)
    quality.extend(getattr(tables, 'diagnostics', []))
    quality.extend(dict(check_id="PACK_DATA_STATUS", dataset=r["dataset"], severity="info", affected_rows=0,
                        message=f"{r['status']}: {r['note']}", treatment=f"Retain source evidence labels; confidence: {r['confidence']}")
                   for r in tables["Data_Quality"])
    customers = {r["customer_id"]: r for r in tables["Customers"]}
    if customer_id not in customers:
        raise ValueError(f"Unknown customer: {customer_id}")
    baselines = {r["baseline_id"]: r for r in tables["Baselines"]}
    if baseline_id not in {"B_LOCAL", "B_HOME", "B_INHOUSE"} or baseline_id not in baselines:
        raise ValueError(f"Unknown baseline: {baseline_id}")
    customer, baseline = customers[customer_id], baselines[baseline_id]
    if priority is None:
        priority = interpret_prompt(customer.get("priority_topics") or "", customer["industry"])
    products = {r["product_id"]: r for r in tables["Products"]}
    sites = {r["site_id"]: r for r in tables["Sites"] if r["customer_id"] == customer_id}
    laundry_ids = {r["laundry_id"] for r in tables["Laundries"]}

    def select(sheet):
        result, invalid = [], []
        for row in tables[sheet]:
            if row.get("customer_id") != customer_id:
                continue
            stamp = row.get("pickup_timestamp") if sheet == "Service_Cycles" else row.get("month")
            month = stamp.strftime("%Y-%m") if isinstance(stamp, datetime) else stamp
            if not isinstance(month, str) or not re.fullmatch(r"\d{4}-\d{2}", month):
                invalid.append(row)
                continue
            if not period_from <= month <= period_to:
                continue
            if row.get("site_id") not in sites or row.get("product_id") not in products or row.get("laundry_id") not in laundry_ids:
                invalid.append(row)
                continue
            result.append(row)
        if invalid:
            impact = row_impact(invalid)
            quality.append(dict(check_id="DQ_SELECTION", dataset=sheet, severity="warning", affected_rows=len(invalid),
                                scope=f"customer={customer_id}; period={period_from}..{period_to}; includes undated rows",
                                quantitative_impact=impact,
                                message=f"{len(invalid)} rows cannot be assigned to customer/period/master data; known affected kg={impact['known_washed_kg']}; unknown-kg rows={impact['unknown_washed_kg_rows']}. These rows are excluded, not repaired.",
                                treatment="Data engineering: restore missing dates and reconcile site/customer/product/laundry keys against the master data; retain raw rows and rerun after correction."))
        return result

    activity, repairs, cycles = (select(s) for s in ("Service_Activity", "Repairs", "Service_Cycles"))
    if not activity:
        raise ValueError("No usable service activity for selected customer and period")
    allocated = allocate_rows(activity, tables["Laundry_Resources"], tables["Waste_Circularity"])

    def calculate(a, r, c, count):
        values = operational(a, r, c, products, count, period_to)
        values.update(environmental(a, r, products, baseline))
        return values

    values = calculate(allocated, repairs, cycles, len(sites))
    traces = operational_traces(allocated, repairs, cycles, products, len(sites), period_to, values=values)
    traces.update(environmental_traces(allocated, repairs, products, baseline, sensitivity, values=values))
    gaps = [dict(g) for g in DATA_GAPS]
    dq5 = wearer_finding(activity, values, customer_id, period_to)
    quality.append(dq5)
    for gap in gaps:
        if gap["gap"] == "Unique wearer count":
            gap["impact"] = dq5["message"]
            gap["future_source"] += "; " + dq5["treatment"]
        elif gap["gap"] == "Service-request details":
            gap["impact"] = f"{values['service_requests']} requests across {len(sites)} selected customer sites; timestamps and causes are absent, so request-free days and root causes cannot be calculated."
            gap["future_source"] += "; export request IDs, site IDs, opened/closed timestamps and cause codes."
        elif gap["gap"] == "Customer hierarchy is synthetic":
            gap["impact"] = f"{len(sites)} sites for {customer_id} rely on synthetic account mappings; roll-up requires effective-dated production ownership."
        elif gap["gap"] == "Laundry volume for L003":
            relevant = [q for q in quality if q["check_id"] == "DQ4" and q["quantitative_impact"].get("laundry_id") == "L003" and period_from <= q["quantitative_impact"]["month"] <= period_to]
            selected_kg = total([r for r in activity if r["laundry_id"] == "L003"], "customer_washed_kg")
            gap["impact"] = f"{len(relevant)} global L003 laundry-month discrepancies in the requested period; {selected_kg} kg of selected customer activity assigned to L003. Global excess volumes are not this customer's footprint error."
            gap["future_source"] += "; reconcile laundry/month/service-boundary totals and units before using allocated impacts externally."
    metrics = []
    for metric_id, category, unit, status, formula, sources, assumptions in DEFINITIONS:
        value = values[metric_id]
        if value is None or (isinstance(value, dict) and any(not number(v) for v in value.values())):
            gaps.append(unavailable_gap(metric_id, activity, repairs, cycles, allocated, period_to, products, baseline))
            continue
        metrics.append(dict(id=metric_id, label=("Illustrative idle stock value" if metric_id == "idle_value_eur" else metric_id.replace("_", " ").capitalize()),
                            category=category, value=_range(value), unit=unit, status=status,
                            formula=formula + f" | Live arithmetic (display rounded to 6 decimals; result in {unit}): " + traces[metric_id],
                            sources=sources.split("|"), assumptions=assumptions.split("|"),
                            confidence="Low-Medium" if status in {"ESTIMATE", "ALLOCATED_ESTIMATE"} else "Medium"))

    def scalar_metrics(v):
        return {key: value[sensitivity] if isinstance(value, dict) else value for key, value in v.items() if value is not None}

    activity_groups = _group_by(allocated, "site_id", "product_id", "month")
    repair_groups = _group_by(repairs, "site_id", "product_id", "month", "repair_type")
    cycle_groups = _group_by(cycles, "site_id", "product_id")
    site_output = []
    for site_id, site in sites.items():
        v = calculate(activity_groups["site_id"][site_id], repair_groups["site_id"][site_id],
                      cycle_groups["site_id"][site_id], 1)
        laundry_id = site.get("primary_laundry_id") or site.get("laundry_id") or ""
        def applies(finding):
            if not laundry_id:
                return False
            if finding.get("laundry_id") is not None:
                return finding["laundry_id"] == laundry_id
            # Legacy findings have no structured target; match the complete ID token.
            return bool(re.search(r"(?<![\w])" + re.escape(laundry_id) + r"(?![\w])", finding["message"]))
        flags = sorted({q["check_id"] for q in quality if applies(q)})
        site_output.append({**{key: site.get(key) or "" for key in ("site_id", "site_name", "country", "city", "site_type")},
                            "laundry_id": laundry_id, "metrics": scalar_metrics(v), "flags": flags})
    product_output = []
    for product_id in sorted(activity_groups["product_id"]):
        product = products[product_id]
        product_rows = activity_groups["product_id"][product_id]
        v = calculate(product_rows, repair_groups["product_id"][product_id],
                      cycle_groups["product_id"][product_id], len({r["site_id"] for r in product_rows}))
        product_output.append({**{k: product[k] for k in ("product_id", "product_name", "product_group")}, "metrics": scalar_metrics(v)})
    timeseries = {key: [] for key in ("washed_kg", "water_saving_l", "co2e_saving_kg", "repairs_total")}
    for month in sorted(activity_groups["month"]):
        rows, month_repairs = activity_groups["month"][month], repair_groups["month"][month]
        monthly = environmental(rows, month_repairs, products, baseline)
        monthly.update(washed_kg=total(rows, "customer_washed_kg"), repairs_total=total(month_repairs, "repair_count"))
        for key in timeseries:
            value = monthly[key]
            if value is not None:
                timeseries[key].append(dict(month=month, value=value[sensitivity] if isinstance(value, dict) else value))
    comparison = [dict(baseline_id=b["baseline_id"], name=b["baseline_name"], **savings(allocated, b)) for b in baselines.values()]
    comparison = [b for b in comparison if all(b[k] is not None for k in ("water_saving_l", "energy_saving_kwh", "co2e_saving_kg"))]
    for metric in metrics:
        key = metric["id"]
        metric["breakdown"] = {
            "by_site": [{"site_id": s["site_id"], "value": s["metrics"][key]} for s in site_output if key in s["metrics"]],
            "by_product": [{"product_id": p["product_id"], "value": p["metrics"][key]} for p in product_output if key in p["metrics"]],
            "by_month": timeseries.get(key, []),
        }
        if key == "textile_waste_kg":
            metric["breakdown"]["by_route"] = [{"route": route, "value": total(allocated, route)} for route in ROUTES]
        if key == "repairs_total":
            metric["breakdown"]["by_repair_type"] = [
                {"repair_type": kind, "value": total(repair_groups["repair_type"][kind], "repair_count")}
                for kind in sorted(k for k in repair_groups["repair_type"] if k is not None)]
    assumptions = [{"id": row["assumption_id"], **{k: row[k] for k in ("assumption", "value_or_rule", "rationale", "category", "confidence")}, "source": "PACK"} for row in tables["Assumptions"]]
    assumptions += [dict(a) for a in TEAM_ASSUMPTIONS]
    assumptions.append(dict(id="T003", assumption="Illustrative idle stock valuation", value_or_rule="Latest-month idle pieces × synthetic product purchase cost; no extra sensitivity factor", rationale="A stock value is not a cost-saving promise.", category="Cost", confidence="Low", source="Team assumption"))
    rules = sorted([r for r in tables.get("Industry_Priorities", []) if r["industry"] == customer["industry"]], key=lambda r: r["priority_rank"])
    return dict(
        meta={**{k: customer[k] for k in ("customer_id", "customer_name", "industry", "segment", "hq_country")},
              "period": {"from": period_from, "to": period_to}, "baseline_id": baseline_id, "baseline_name": baseline["baseline_name"],
              "sensitivity": sensitivity, "priority": priority, "generated_at": datetime.now(timezone.utc).isoformat(),
              "data_notice": "Synthetic, illustrative prototype data. Not an approved Lindström claim."},
        metrics=metrics, sites=site_output, products=product_output, timeseries=timeseries, baseline_comparison=comparison,
        priority_view=dict(priority=priority, emphasized_metric_ids=[m for m in PRIORITIES[priority] if m in {v['id'] for v in metrics}],
                           industry_rules=[f"{r['industry']} #{r['priority_rank']}: {r['priority_theme']} — {r['dashboard_emphasis']}" for r in rules]),
        observations=[], data_quality=quality, assumptions=assumptions, data_gaps=gaps)
