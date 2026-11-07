"""Workbook boundary: preserve sheet columns and normalize Excel dates here."""

from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.utils.datetime import from_excel


DEFAULT_SOURCE = Path(__file__).resolve().parents[3] / "data" / "Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx"
REQUIRED_SHEETS = (
    "Customers", "Sites", "Products", "Laundries", "Service_Activity",
    "Service_Cycles", "Repairs", "Laundry_Resources", "Waste_Circularity",
    "Baselines", "Assumptions", "Data_Quality",
)


class WorkbookTables(dict):
    """Tables plus nonfatal adapter findings, separate from data sheet records."""

    def __init__(self):
        super().__init__()
        self.diagnostics = []


_CACHE: dict[tuple, "WorkbookTables"] = {}


def load_tables(source_path: str | Path | None = None) -> dict[str, list[dict]]:
    """Cached front door: parse the workbook once per (path, modification time, size).

    Parsing takes ~0.8 s; the API calls this on every recalculation. Callers must treat the
    returned tables as read-only (the engine copies rows before deriving values).
    """
    path = Path(source_path) if source_path is not None else DEFAULT_SOURCE
    if not path.is_file():
        raise FileNotFoundError(f"Excel data pack not found: {path}")
    stat = path.stat()
    key = (str(path.resolve()), stat.st_mtime_ns, stat.st_size)
    if key not in _CACHE:
        _CACHE.clear()  # keep only the current version of the pack
        _CACHE[key] = _read_tables(path)
    return _CACHE[key]


def _read_tables(source_path: str | Path | None = None) -> dict[str, list[dict]]:
    """Read records without silently dropping incomplete or unmapped rows.

    Formula cells use the workbook's cached values. Missing caches remain None
    so the quality checks can report them rather than fabricating a result.
    Customer_Impacts is optional: it is reference output, never a calculation
    input. All additional sheets are retained for later consumers.
    """
    path = Path(source_path) if source_path is not None else DEFAULT_SOURCE
    if not path.is_file():
        raise FileNotFoundError(f"Excel data pack not found: {path}")
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        missing = sorted(set(REQUIRED_SHEETS) - set(workbook.sheetnames))
        if missing:
            raise ValueError(f"Missing workbook sheets: {', '.join(missing)}")
        tables = WorkbookTables()
        for sheet in workbook:
            if sheet.title == "README":
                continue  # Cover page, not a rectangular data table.
            rows = sheet.iter_rows(values_only=True)
            header = next(rows, ())
            columns = [str(value).strip() if value is not None else "" for value in header]
            error = None
            if not columns or any(not column for column in columns):
                error = "missing column header"
            elif len(columns) != len(set(columns)):
                error = "duplicate column header"
            if error:
                if sheet.title in REQUIRED_SHEETS:
                    # Guessing a key in a calculation table could silently misattribute data.
                    raise ValueError(f"{sheet.title}: {error}")
                tables.diagnostics.append(dict(
                    check_id="DQ_HEADER", dataset=sheet.title, severity="warning",
                    message=f"{sheet.title}: {error} in optional/reference sheet.",
                    affected_rows=max(0, (sheet.max_row or 1) - 1),
                    treatment="Optional sheet excluded; repair its headers to restore reference context. Calculation inputs are unchanged.",
                ))
                continue
            records = []
            for values in rows:
                if all(value is None for value in values):
                    continue
                record = dict(zip(columns, values))
                for key, value in record.items():
                    if isinstance(value, str):
                        record[key] = value.strip() or None
                    if sheet.title == "Service_Cycles" and (
                        "timestamp" in key.lower() or key.lower().endswith(("_date", "_at"))
                    ) and isinstance(value, (int, float)):
                        record[key] = from_excel(value, workbook.epoch)
                    if key == "month" and isinstance(record[key], (date, datetime)):
                        record[key] = record[key].strftime("%Y-%m")
                records.append(record)
            tables[sheet.title] = records
        return tables
    finally:
        workbook.close()
