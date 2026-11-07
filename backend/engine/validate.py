"""Non-destructive data quality reporting for the normalized workbook tables."""

from collections import Counter, defaultdict
import logging

from .kpis import number, display_number, total


LOGGER = logging.getLogger(__name__)
MASTERS = {"customer_id": "Customers", "site_id": "Sites", "product_id": "Products", "laundry_id": "Laundries"}


def row_impact(rows):
    """Known affected kg, never an invented estimate for missing quantities.

    Findings can overlap and reference sheets repeat activity. These quantities
    are per finding/dataset and MUST NOT be added across checks or sheets.
    """
    kg_rows = [r for r in rows if "customer_washed_kg" in r]
    return dict(known_washed_kg=sum(r["customer_washed_kg"] for r in kg_rows if number(r["customer_washed_kg"])) if kg_rows else None,
                unknown_washed_kg_rows=sum(not number(r["customer_washed_kg"]) for r in kg_rows),
                kg_field_present=bool(kg_rows))


def wearer_finding(activity, values, customer_id, month):
    """DQ5 is scoped to the selected customer and final reporting month."""
    rows = [r for r in activity if r["month"] == month]
    assignments, minimum = values["wearer_product_assignments"], values["wearers_min_est"]
    difference = assignments - minimum if number(assignments) and number(minimum) else None
    f = display_number
    return dict(check_id="DQ5_WEARER_MULTI_PRODUCT_SUM", dataset="Service_Activity", severity="info",
                affected_rows=len(rows), scope=f"customer={customer_id}; month={month}",
                quantitative_impact=dict(assignments=assignments, minimum_estimate=minimum, difference=difference),
                message=f"{customer_id} {month}: {f(assignments)} wearer-product assignments versus {f(minimum)} sum of site maxima; difference {f(difference)}. This difference is NOT a count of duplicate people.",
                treatment="Data engineering: join a stable, pseudonymous wearer ID to site/product/month; count distinct active wearer IDs. Until available, retain both estimates and never label product assignments as unique people.")


def unavailable_gap(metric_id, activity, repairs, cycles, allocated, latest_month, products, baseline):
    """Quantify missing inputs without guessing the missing metric's magnitude."""
    latest = [r for r in activity if r["month"] == latest_month]
    fields = {
        "washed_kg": (activity, "customer_washed_kg"),
        "wearers_min_est": (latest, "active_wearers"),
        "wearer_product_assignments": (latest, "active_wearers"),
        "garments_allocated": (latest, "allocated_pieces"),
        "service_requests": (activity, "service_requests"),
        "repairs_total": (repairs, "repair_count"),
        "replacements_postponed": (repairs, "repair_count"),
        "median_cycle_hours": (cycles, "cycle_hours"),
        "allocation_use_rate": (latest, "allocated_pieces"),
        "idle_pieces": (latest, "allocated_pieces"),
        "idle_value_eur": (latest, "allocated_pieces"),
        "avoided_product_co2e_kg": (repairs, "repair_count"),
        "wash_frequency": (activity, "active_assets_scanned"),
        "repair_rate_per_1000": (activity, "washed_pieces"),
    }
    if metric_id in {"customer_water_l", "water_saving_l"}:
        rows, field = allocated, "customer_water_l"
    elif metric_id in {"customer_energy_kwh", "energy_saving_kwh"}:
        rows, field = allocated, "customer_energy_kwh"
    elif metric_id in {"customer_co2e_kg", "co2e_saving_kg"}:
        rows, field = allocated, "customer_co2e_kg"
    elif metric_id in {"textile_waste_kg", "circular_waste_share"}:
        rows, field = allocated, "textile_waste_kg"
    else:
        rows, field = fields.get(metric_id, (activity, "customer_washed_kg"))
    missing = sum(not number(r.get(field)) for r in rows)
    aggregate = total(rows, field)
    details = f"{len(rows)} selected input rows; {missing} unavailable/non-finite {field} values; SUM({field})={display_number(aggregate)}."
    if metric_id == "on_time_rate":
        invalid = sum(r.get("performance_flag") not in {"ON_TIME", "LATE"} for r in cycles)
        details = f"{len(cycles)} selected cycles; {invalid} missing/unrecognized performance_flag values."
    if metric_id in {"allocation_use_rate", "idle_pieces", "idle_value_eur", "wash_frequency", "repair_rate_per_1000", "circular_waste_share"}:
        secondary = {"allocation_use_rate": (latest, "active_assets_scanned"),
                     "idle_pieces": (latest, "active_assets_scanned"), "idle_value_eur": (latest, "active_assets_scanned"),
                     "wash_frequency": (activity, "washed_pieces"), "repair_rate_per_1000": (repairs, "repair_count"),
                     "circular_waste_share": (allocated, "recycling_kg")}
        extra_rows, extra_field = secondary[metric_id]
        details += f" {sum(not number(r.get(extra_field)) for r in extra_rows)} unavailable {extra_field} inputs."
        if metric_id == "circular_waste_share":
            details += f" {sum(not number(r.get('reuse_kg')) for r in allocated)} unavailable reuse_kg inputs."
    if metric_id in {"idle_value_eur", "avoided_product_co2e_kg"}:
        product_field = "synthetic_purchase_cost_eur" if metric_id == "idle_value_eur" else "synthetic_product_footprint_kgco2e"
        product_rows = latest if metric_id == "idle_value_eur" else repairs
        missing_factors = sum(not number(products.get(r.get("product_id"), {}).get(product_field)) for r in product_rows)
        details += f" {missing_factors} selected rows lack a finite Products.{product_field}."
    if metric_id in {"water_saving_l", "energy_saving_kwh", "co2e_saving_kg"}:
        baseline_fields = {"water_saving_l": ("water_l_per_kg",), "energy_saving_kwh": ("energy_kwh_per_kg",),
                           "co2e_saving_kg": ("process_kgco2e_per_kg", "delivery_kgco2e_per_kg")}
        missing_factors = [field for field in baseline_fields[metric_id] if not number(baseline.get(field))]
        details += f" Unavailable selected baseline factors: {missing_factors}."
    return dict(gap=f"Unavailable metric: {metric_id}",
                impact=details + " A missing input, zero denominator or missing factor prevents this metric; its magnitude is unknown, not zero.",
                future_source="Data engineering: reconcile the selected source rows, product/baseline factors and laundry-month joins; restore finite numeric inputs and positive denominators, then rerun the review.")


def validate_tables(tables: dict[str, list[dict]]) -> list[dict]:
    """Report DQ1–DQ4 without dropping records or correcting source data.

    DQ4 deliberately sums every customer's activity, not just the selected
    customer. A site's laundry supplies the join when activity lacks laundry_id.
    """
    findings = []

    def report(check, dataset, count, message, treatment, impact=None, **target):
        finding = dict(check_id=check, dataset=dataset, severity="warning",
                       message=message, affected_rows=count, treatment=treatment,
                       scope="whole workbook; all customers", quantitative_impact=impact or {}, **target)
        findings.append(finding)
        LOGGER.warning("%s %s: %s", check, dataset, message)

    known = {key: {row.get(key) for row in tables.get(sheet, []) if row.get(key) is not None}
             for key, sheet in MASTERS.items()}
    sites = {row["site_id"]: row for row in tables.get("Sites", []) if row.get("site_id") is not None}
    for sheet, rows in tables.items():
        def missing(value):
            return value is None or value == "" or (isinstance(value, (int, float)) and not number(value))

        blanks = [row for row in rows if any(missing(value) for value in row.values())]
        if blanks:
            columns = Counter(k for row in blanks for k, value in row.items() if missing(value))
            impact = {**row_impact(blanks), "missing_cells_by_column": dict(sorted(columns.items()))}
            report("DQ1", sheet, len(blanks), f"{len(blanks)}/{len(rows)} rows contain {sum(columns.values())} blank/non-finite cells: {dict(sorted(columns.items()))}. Known affected washed kg: {display_number(impact['known_washed_kg'])}; unknown-kg rows: {impact['unknown_washed_kg_rows']}. Kg is unavailable where that field is absent.",
                   "Data engineering: restore the listed fields from their source export and check Excel formula caches. Retain source rows; omit dependent metrics when required inputs are unavailable. Documentation/reference blanks are informational to calculations, not lost operational volume.", impact)
        for key, master in MASTERS.items():
            if sheet == master:
                continue
            unmapped = [row for row in rows if row.get(key) is not None and row[key] not in known[key]]
            if unmapped:
                ids = sorted({str(r[key]) for r in unmapped})
                impact = {**row_impact(unmapped), "key": key, "unmapped_ids": ids}
                report("DQ2", sheet, len(unmapped), f"Unmapped {key}: {ids}; {len(unmapped)}/{len(rows)} rows; known affected washed kg {display_number(impact['known_washed_kg'])} (not additive across flags).",
                       f"Data engineering: reconcile {key} with {master}, publish a versioned mapping and rerun joins. Retain raw rows; exclude unassignable operational records from aggregates, without creating placeholder customers/sites.", impact)
        primary_unmapped = [row for row in rows if row.get("primary_laundry_id") is not None
                            and row["primary_laundry_id"] not in known["laundry_id"]]
        if primary_unmapped:
            report("DQ2", sheet, len(primary_unmapped), f"Unmapped primary_laundry_id in {len(primary_unmapped)} site rows.",
                   "Data engineering: map these primary_laundry_id values to Laundries before site allocation; retain source rows.",
                   dict(unmapped_ids=sorted({str(r['primary_laundry_id']) for r in primary_unmapped})))
        mismatches = [row for row in rows if row.get("site_id") in sites
                      and row.get("customer_id") is not None
                      and row["customer_id"] != sites[row["site_id"]].get("customer_id")]
        if mismatches:
            impact = {**row_impact(mismatches), "site_ids": sorted({str(r['site_id']) for r in mismatches})}
            report("DQ3", sheet, len(mismatches), f"Site/customer ownership mismatch in {len(mismatches)} rows; sites {impact['site_ids']}; known affected washed kg {display_number(impact['known_washed_kg'])}.",
                   "Data engineering: reconcile Sites.customer_id with the account hierarchy effective for the transaction date. Retain raw rows; exclude conflicting customer assignments until resolved.", impact)

    volumes = defaultdict(float)
    counts = defaultdict(int)
    unknown = defaultdict(int)
    for row in tables.get("Service_Activity", []):
        site = sites.get(row.get("site_id"), {})
        laundry = row.get("laundry_id") or site.get("primary_laundry_id") or site.get("laundry_id")
        kg = row.get("customer_washed_kg")
        if laundry is not None and row.get("month") is not None:
            key = laundry, row["month"]
            counts[key] += 1
            if number(kg):
                volumes[key] += kg
            else:
                unknown[key] += 1
    for row in tables.get("Laundry_Resources", []):
        key = row.get("laundry_id"), row.get("month")
        total = row.get("washed_kg")
        if number(total) and total >= 0 and volumes[key] > total * (1 + 1e-9):
            share = volumes[key] / total if total > 0 else None
            share_text = f"{share:.1%}" if share is not None else "undefined (zero laundry kg)"
            report("DQ4", "Laundry_Resources", counts[key],
                   f"Laundry {key[0]} {key[1]}: known customer kg {display_number(volumes[key])} vs laundry kg {display_number(total)}; excess {display_number(volumes[key] - total)} kg; customer shares {share_text}. Unknown customer-kg rows: {unknown[key]}. Footprints from this laundry-month require reconciliation.",
                   "Data engineering: reconcile WWS Washed Kg and customer activity at the same laundry/month, unit and service boundary; correct the source volume, not the output. Use laundry resource intensity per kg × customer washed kg without capping or rescaling; omit allocation when laundry kg is zero. Do not sum overlapping quality findings.",
                   dict(laundry_id=key[0], month=key[1], customer_washed_kg=volumes[key], laundry_washed_kg=total,
                        excess_kg=volumes[key] - total, share=share, unknown_washed_kg_rows=unknown[key]), laundry_id=key[0], month=key[1])
    return findings
