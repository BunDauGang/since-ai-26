const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** Compact number for KPI tiles: 1.41M, 502.1k, 9,607. */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${nf1.format(n / 1e6)}M`;
  if (a >= 1e5) return `${nf0.format(n / 1e3)}k`;
  if (a >= 1e4) return `${nf1.format(n / 1e3)}k`;
  return nf1.format(n);
}

export function full(n: number, digits = 1): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);
}

export function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

/** Format a metric value according to its unit. */
export function formatValue(value: number, unit: string, mode: "compact" | "full" = "compact"): string {
  if (unit === "ratio") return pct(value);
  if (unit === "EUR") return `€${mode === "compact" ? compact(value) : full(value, 0)}`;
  return mode === "compact" ? compact(value) : full(value);
}

/** Unit label shown next to a value (ratios already render as %). */
export function unitLabel(unit: string): string {
  if (unit === "ratio" || unit === "EUR") return "";
  return unit;
}

/** Tonnes are easier to read for big kg values in CO2e contexts. */
export function monthLabel(m: string): string {
  const [y, mm] = m.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(mm) - 1] ?? mm} ${y.slice(2)}`;
}
