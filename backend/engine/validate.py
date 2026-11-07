"""Non-destructive data quality reporting for the normalized workbook tables."""
from collections import defaultdict
import logging

LOGGER = logging.getLogger(__name__)
MASTERS = {"customer_id": "Customers", "site_id": "Sites", "product_id": "Products", "laundry_id": "Laundries"}

def validate_tables(tables: dict[str, list[dict]]) -> list[dict]:
    """Report DQ1–DQ4 without dropping records or correcting source data.
    DQ4 deliberately sums every customer's activity, not just the selected
    customer. A site's laundry supplies the join when activity lacks laundry_id.
    """
    findings = []
    def report(check, dataset, count, message, treatment):
        finding = dict(check_id=check, dataset=dataset, severity="warning",
                       message=message, affected_rows=count, treatment=treatment)
        findings.append(finding)
        LOGGER.warning("%s %s: %s", check, dataset, message)

    known = {key: {row.get(key) for row in tables.get(sheet, []) if row.get(key) is not None}
             for key, sheet in MASTERS.items()}
    sites = {row["site_id"]: row for row in tables.get("Sites", []) if row.get("site_id") is not None}

    for sheet, rows in tables.items():
        total_rows = len(rows) or 1
        blanks = [row for row in rows if any(value is None or value == "" for value in row.values())]
        if blanks:
            pct = (len(blanks) / total_rows) * 100
            report("DQ1", sheet, len(blanks),
                   f"Blank cells in {len(blanks)}/{total_rows} ({pct:.1f}%) source rows in '{sheet}'.",
                   f"Action for Lindström Data Eng: Enforce NOT NULL schema constraints in ETL for '{sheet}' and flag upstream data drops; engine retains rows and reports missing inputs explicitly before calculating affected metrics.")

        for key, master in MASTERS.items():
            if sheet == master:
                continue
            unmapped = [row for row in rows if row.get(key) is not None and row[key] not in known[key]]
            if unmapped:
                pct = (len(unmapped) / total_rows) * 100
                report("DQ2", sheet, len(unmapped),
                       f"Unmapped {key} in {len(unmapped)}/{total_rows} ({pct:.1f}%) rows in '{sheet}' not present in master table '{master}'.",
                       f"Action for Lindström Data Eng: Implement foreign key referential integrity between '{sheet}.{key}' and '{master}.{key}'; engine retains source rows without inventing master-data mappings.")

        primary_unmapped = [row for row in rows if row.get("primary_laundry_id") is not None
                            and row["primary_laundry_id"] not in known["laundry_id"]]
        if primary_unmapped:
            pct = (len(primary_unmapped) / total_rows) * 100
            report("DQ2", sheet, len(primary_unmapped),
                   f"Unmapped primary_laundry_id in {len(primary_unmapped)}/{total_rows} ({pct:.1f}%) rows in '{sheet}'.",
                   f"Action for Lindström Data Eng: Reconcile site operating laundries with Laundries master registry; engine retains source rows without inventing laundry mappings.")

        mismatches = [row for row in rows if row.get("site_id") in sites
                      and row.get("customer_id") is not None
                      and row["customer_id"] != sites[row["site_id"]].get("customer_id")]
        if mismatches:
            pct = (len(mismatches) / total_rows) * 100
            report("DQ3", sheet, len(mismatches),
                   f"Site/customer ownership mismatch in {len(mismatches)}/{total_rows} ({pct:.1f}%) rows in '{sheet}' differing from master Sites registry.",
                   f"Action for Lindström Data Eng: Enforce multi-site customer hierarchy validation in CRM/ERP; engine retains source rows and requires explicit ownership resolution before customer allocation.")

    volumes = defaultdict(float)
    counts = defaultdict(int)
    for row in tables.get("Service_Activity", []):
        site = sites.get(row.get("site_id"), {})
        laundry = row.get("laundry_id") or site.get("primary_laundry_id") or site.get("laundry_id")
        kg = row.get("customer_washed_kg")
        if laundry is not None and row.get("month") is not None and isinstance(kg, (int, float)):
            key = laundry, row["month"]
            volumes[key] += kg
            counts[key] += 1

    for row in tables.get("Laundry_Resources", []):
        key = row.get("laundry_id"), row.get("month")
        total = row.get("washed_kg")
        if isinstance(total, (int, float)) and total > 0 and volumes[key] > total * (1 + 1e-9):
            share = volumes[key] / total
            over_kg = volumes[key] - total
            report("DQ4", "Laundry_Resources", counts[key],
                   f"Laundry {key[0]} {key[1]}: customer volume ({volumes[key]:,.1f} kg) exceeds reported plant capacity ({total:,.1f} kg) by {share:.1%} (>100%, +{over_kg:,.1f} kg discrepancy).",
                   f"Action for Lindström Data Eng: Recalibrate plant sub-metering and audit WWS washhouse workflow telemetry for facility {key[0]}; engine computes customer footprint using verified laundry per-kg resource intensity multiplied by customer washed kg, retaining audit discrepancy flag.")

    return findings
