"""Build the shared review contract using deterministic workbook calculations."""

from datetime import datetime, timezone
import re

from .adapters.excel_adapter import load_tables
from .impacts import allocate_rows, environmental, savings, ROUTES
from .kpis import operational, total, number
from .sensitivity import TEAM_ASSUMPTIONS
from .validate import validate_tables


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
        ("Enterprise customer & site hierarchy", "Parent-child account roll-up across 24 sites uses synthetic taxonomy. Production deployment requires validated ERP master customer hierarchy.", "Action for Data Eng: Ingest SAP / Salesforce customer master data with verified parent-child entity trees."),
        ("Deduplicated unique wearer IDs", "Multi-product assignment sum (28,367) exceeds site-level wearer maximums (9,607) due to multi-garment workers.", "Action for Data Eng: Deploy eLindström wearer RFID chip tracking to deduplicate active wearers across garments."),
        ("Service-request root-cause categories & resolution SLA", "515 total requests logged without root-cause codes (sizing vs damage vs delivery frequency); prevents automated downtime modeling.", "Action for Data Eng: Connect ServiceNow / Zendesk ticket taxonomy with root cause categorization."),
        ("Verified contract pricing & total cost of ownership (TCO)", "Idle garment capital value (€223,315 at €42.70 avg replacement) is illustrative; actual customer invoice savings depend on tier-specific contracts.", "Action for Data Eng: Integrate billing API / contract rate cards to reflect actual monthly rental and replacement pricing."),
        ("Approved product LCA footprints", "Embodied emissions (14.72 kgCO2e avg per garment) use synthetic benchmarks instead of verified ISO 14040/44 EPDs.", "Action for Data Eng: Ingest supplier Environmental Product Declarations (EPDs) and Lindström textile LCA database."),
        ("Baseline counterfactual sensitivity ranges", "±20% sensitivity on baseline laundry/home washing factors is a team heuristic; requires customer-specific steering committee confirmation.", "Action for Data Eng: Deploy Lindström verified customer survey calculator to capture customer-specific pre-contract baselines."),
        ("Laundry L003 total washed-kg reconciliation", "Customer washed kg at L003 exceeds laundry total in starter pack by +1,020% across all customer accounts in Service_Activity.", "Action for Data Eng: Audit WWS (Washhouse Workflow System) sensor logs and rectify multi-tenant batch allocation."),
        ("Sector benchmark trends and regulatory disclosures", "CSRD / ESRS E1 and E5 compliance requires EU-aligned sector benchmarks not included in raw operational workbook.", "Action for Data Eng: Subscribe to textile industry sustainability benchmarks (ETSA, TexMESP) for peer comparisons."),
    )
]


def _range(value):
    return value if isinstance(value, dict) else dict(low=value, base=value, high=value)


def _month(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", value):
        raise ValueError("Reporting months must use YYYY-MM")
    return value


def format_traceable_formula(metric_id: str, symbolic: str, values: dict, sites_count: int, baseline: dict, sensitivity: str) -> str:
    """Format formula with both symbolic representation and live plugged-in arithmetic breakdown."""
    base_val = values.get(metric_id)
    if isinstance(base_val, dict):
        base_num = base_val.get(sensitivity, base_val.get("base"))
    else:
        base_num = base_val

    if base_num is None:
        return symbolic

    if metric_id == "delivery_sites":
        return f"{symbolic} = {sites_count} operating sites"

    elif metric_id == "wearers_min_est":
        return f"{symbolic} = {int(base_num):,} wearers (conservative lower bound)"

    elif metric_id == "wearer_product_assignments":
        return f"{symbolic} = {int(base_num):,} assignments (counts multi-garment wearers)"

    elif metric_id == "garments_allocated":
        return f"{symbolic} = {int(base_num):,} pieces in circulation"

    elif metric_id == "washed_kg":
        return f"{symbolic} = {base_num:,.1f} kg textile processed"

    elif metric_id == "allocation_use_rate":
        scanned = values.get("garments_allocated", 0) - values.get("idle_pieces", 0) if values.get("garments_allocated") is not None and values.get("idle_pieces") is not None else None
        if scanned is not None and values.get("garments_allocated"):
            return f"{symbolic} = {int(scanned):,} / {int(values['garments_allocated']):,} = {base_num:.2%}"
        return f"{symbolic} = {base_num:.2%}"

    elif metric_id == "idle_pieces":
        allocated = values.get("garments_allocated")
        scanned = allocated - base_num if allocated is not None else None
        if allocated is not None and scanned is not None:
            return f"{symbolic} = {int(allocated):,} - {int(scanned):,} = {int(base_num):,} unutilized pieces"
        return f"{symbolic} = {int(base_num):,} pieces"

    elif metric_id == "idle_value_eur":
        idle = values.get("idle_pieces") or 1
        avg_cost = base_num / idle
        return f"{symbolic} = {int(idle):,} pieces * €{avg_cost:,.2f} avg cost = €{base_num:,.2f} illustrative stock value"

    elif metric_id == "wash_frequency":
        return f"{symbolic} = {base_num:.2f} washes/active asset/month"

    elif metric_id == "service_requests":
        return f"{symbolic} = {int(base_num):,} requests logged"

    elif metric_id == "on_time_rate":
        return f"{symbolic} = {base_num:.2%}"

    elif metric_id == "median_cycle_hours":
        return f"{symbolic} = {base_num:.1f} hours ({base_num/24:.1f} days turnaround)"

    elif metric_id == "repairs_total":
        return f"{symbolic} = {int(base_num):,} garments mended"

    elif metric_id == "repair_rate_per_1000":
        return f"{symbolic} = {base_num:.2f} repairs/1000 washes"

    elif metric_id == "replacements_postponed":
        repairs = values.get("repairs_total") or base_num
        return f"{symbolic} = {int(repairs):,} * 1.0 = {int(base_num):,} postponed replacements"

    elif metric_id == "avoided_product_co2e_kg":
        repairs = values.get("repairs_total") or 1
        avg_co2 = base_num / repairs
        return f"{symbolic} = {int(repairs):,} * {avg_co2:.2f} kgCO2e avg = {base_num:,.1f} kgCO2e avoided"

    elif metric_id == "customer_water_l":
        kg = values.get("washed_kg") or 1
        avg_int = base_num / kg
        return f"{symbolic} = {kg:,.1f} kg * {avg_int:.2f} L/kg avg = {base_num:,.1f} L allocated footprint"

    elif metric_id == "customer_energy_kwh":
        kg = values.get("washed_kg") or 1
        avg_int = base_num / kg
        return f"{symbolic} = {kg:,.1f} kg * {avg_int:.3f} kWh/kg avg = {base_num:,.1f} kWh allocated process energy"

    elif metric_id == "customer_co2e_kg":
        kg = values.get("washed_kg") or 1
        avg_int = base_num / kg
        return f"{symbolic} = {kg:,.1f} kg * {avg_int:.3f} kgCO2e/kg avg = {base_num:,.1f} kgCO2e allocated footprint"

    elif metric_id == "textile_waste_kg":
        kg = values.get("washed_kg") or 1
        avg_int = base_num / kg
        return f"{symbolic} = {kg:,.1f} kg * {avg_int:.4f} kg/kg avg = {base_num:,.2f} kg attributed textile waste"

    elif metric_id == "circular_waste_share":
        return f"{symbolic} = {base_num:.2%} circular recovery"

    elif metric_id == "water_saving_l":
        kg = values.get("washed_kg") or 0
        factor = baseline.get("water_l_per_kg") or 0
        fp = values.get("customer_water_l") or 0
        counterfactual = kg * factor
        return f"{symbolic} = ({kg:,.1f} kg * {factor:.2f} L/kg) - {fp:,.1f} L = {counterfactual:,.1f} L - {fp:,.1f} L = {base_num:,.1f} L saved"

    elif metric_id == "energy_saving_kwh":
        kg = values.get("washed_kg") or 0
        factor = baseline.get("energy_kwh_per_kg") or 0
        fp = values.get("customer_energy_kwh") or 0
        counterfactual = kg * factor
        return f"{symbolic} = ({kg:,.1f} kg * {factor:.2f} kWh/kg) - {fp:,.1f} kWh = {counterfactual:,.1f} kWh - {fp:,.1f} kWh = {base_num:,.1f} kWh saved"

    elif metric_id == "co2e_saving_kg":
        kg = values.get("washed_kg") or 0
        factor = (baseline.get("process_kgco2e_per_kg") or 0) + (baseline.get("delivery_kgco2e_per_kg") or 0)
        fp = values.get("customer_co2e_kg") or 0
        counterfactual = kg * factor
        return f"{symbolic} = ({kg:,.1f} kg * {factor:.3f} kgCO2e/kg) - {fp:,.1f} kg = {counterfactual:,.1f} kg - {fp:,.1f} kg = {base_num:,.1f} kgCO2e saved"

    return f"{symbolic} = {base_num}"


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
        topic = (customer.get("priority_topics") or "").lower()
        priority = next((p for word, p in (("water", "water"), ("emission", "emissions"), ("cost", "cost"),
                                         ("circular", "circularity"), ("service", "service")) if word in topic), "improvement")

    products = {r["product_id"]: r for r in tables["Products"]}
    sites = {r["site_id"]: r for r in tables["Sites"] if r["customer_id"] == customer_id}
    laundry_ids = {r["laundry_id"] for r in tables["Laundries"]}

    def select(sheet):
        result, invalid = [], 0
        for row in tables[sheet]:
            if row.get("customer_id") != customer_id:
                continue
            stamp = row.get("pickup_timestamp") if sheet == "Service_Cycles" else row.get("month")
            month = stamp.strftime("%Y-%m") if isinstance(stamp, datetime) else stamp
            if not isinstance(month, str) or not re.fullmatch(r"\d{4}-\d{2}", month):
                invalid += 1
                continue
            if not period_from <= month <= period_to:
                continue
            if row.get("site_id") not in sites or row.get("product_id") not in products or row.get("laundry_id") not in laundry_ids:
                invalid += 1
                continue
            result.append(row)
        if invalid:
            quality.append(dict(check_id="DQ_SELECTION", dataset=sheet, severity="warning", affected_rows=invalid,
                                message="Rows cannot be assigned to customer/period/master data.",
                                treatment="Retained in source tables; excluded from this review's aggregates."))
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
    gaps = [dict(g) for g in DATA_GAPS]
    metrics = []
    for metric_id, category, unit, status, formula, sources, assumptions in DEFINITIONS:
        value = values[metric_id]
        if value is None or (isinstance(value, dict) and any(not number(v) for v in value.values())):
            gaps.append(dict(gap=f"Unavailable metric: {metric_id}", impact="Incomplete inputs or zero denominator; metric omitted rather than replaced with zero.", future_source="Complete source workbook inputs"))
            continue
        traceable_formula = format_traceable_formula(metric_id, formula, values, len(sites), baseline, sensitivity)
        metrics.append(dict(id=metric_id, label=("Illustrative idle stock value" if metric_id == "idle_value_eur" else metric_id.replace("_", " ").capitalize()),
                            category=category, value=_range(value), unit=unit, status=status, formula=traceable_formula,
                            sources=sources.split("|"), assumptions=assumptions.split("|"),
                            confidence="Low-Medium" if status in {"ESTIMATE", "ALLOCATED_ESTIMATE"} else "Medium"))

    def scalar_metrics(v):
        return {key: value[sensitivity] if isinstance(value, dict) else value for key, value in v.items() if value is not None}

    site_output = []
    for site_id, site in sites.items():
        v = calculate([r for r in allocated if r["site_id"] == site_id], [r for r in repairs if r["site_id"] == site_id],
                      [r for r in cycles if r["site_id"] == site_id], 1)
        laundry_id = site.get("primary_laundry_id") or ""
        flags = sorted({
            q["check_id"] for q in quality
            if laundry_id and re.search(rf"\b{re.escape(laundry_id)}\b", q.get("message", ""))
        })
        site_output.append({**{key: site.get(key) or "" for key in ("site_id", "site_name", "country", "city", "site_type")},
                            "laundry_id": site.get("primary_laundry_id") or "", "metrics": scalar_metrics(v), "flags": flags})

    product_output = []
    for product_id in sorted({r["product_id"] for r in activity}):
        product = products[product_id]
        v = calculate([r for r in allocated if r["product_id"] == product_id], [r for r in repairs if r["product_id"] == product_id],
                      [r for r in cycles if r["product_id"] == product_id], len({r["site_id"] for r in activity if r["product_id"] == product_id}))
        product_output.append({**{k: product[k] for k in ("product_id", "product_name", "product_group")}, "metrics": scalar_metrics(v)})

    timeseries = {key: [] for key in ("washed_kg", "water_saving_l", "co2e_saving_kg", "repairs_total")}
    for month in sorted({r["month"] for r in activity}):
        rows = [r for r in allocated if r["month"] == month]
        monthly = environmental(rows, [r for r in repairs if r["month"] == month], products, baseline)
        monthly.update(washed_kg=total(rows, "customer_washed_kg"), repairs_total=total([r for r in repairs if r["month"] == month], "repair_count"))
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
                {"repair_type": kind, "value": total([r for r in repairs if r.get("repair_type") == kind], "repair_count")}
                for kind in sorted({r["repair_type"] for r in repairs if r.get("repair_type") is not None})]

    assumptions = [{"id": row["assumption_id"], **{k: row[k] for k in ("assumption", "value_or_rule", "rationale", "category", "confidence")}, "source": "PACK"} for row in tables["Assumptions"]]
    assumptions += [dict(a) for a in TEAM_ASSUMPTIONS]
    assumptions.append(dict(id="T003", assumption="Illustrative idle stock valuation", value_or_rule="Latest-month idle pieces × synthetic product purchase cost; no extra sensitivity factor", rationale="A stock value is not a cost-saving promise.", category="Cost", confidence="Low", source="Team assumption"))

    wearer_diff = (values.get("wearer_product_assignments", 0) or 0) - (values.get("wearers_min_est", 0) or 0)
    quality.append(dict(
        check_id="DQ5_WEARER_MULTI_PRODUCT_SUM",
        dataset="Service_Activity",
        severity="info",
        affected_rows=len(activity),
        message=f"Product-level active wearer sum ({values.get('wearer_product_assignments', 0):,}) counts multi-garment wearers repeatedly across jackets/trousers vs estimated unique wearers ({values.get('wearers_min_est', 0):,} minimum estimate, Δ={wearer_diff:,} assignments).",
        treatment="Action for Lindström Data Eng: Deploy unique person identifier (wearer_rfid / employee_id) in eLindström service tracker; dashboard presents latest-month sum of site maxima as conservative lower bound."
    ))

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
