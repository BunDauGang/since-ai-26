import { median } from "./derive";
import type { Review, Site } from "./types";

/*
 * Peer review (mentor feedback): put the customer's sites side by side so the conversation starts
 * from "your best sites already do this". Peers are the customer's own sites; an anonymised
 * Lindström network median is shown only when the engine provides review.peer_benchmark.
 */

export interface PeerKpi {
  id: string;
  label: string;
  /** "higher" = higher is better. */
  better: "higher" | "lower";
  unit: "ratio" | "hours" | "rate" | "per100";
  value: (s: Site) => number | undefined;
  /** Customer-level metric id to read the network benchmark from (if any). */
  metricId?: string;
}

export const PEER_KPIS: PeerKpi[] = [
  { id: "on_time_rate", label: "On-time delivery", better: "higher", unit: "ratio", value: (s) => s.metrics.on_time_rate, metricId: "on_time_rate" },
  { id: "allocation_use_rate", label: "Garments in circulation", better: "higher", unit: "ratio", value: (s) => s.metrics.allocation_use_rate, metricId: "allocation_use_rate" },
  { id: "median_cycle_hours", label: "Typical cycle time", better: "lower", unit: "hours", value: (s) => s.metrics.median_cycle_hours, metricId: "median_cycle_hours" },
  { id: "repair_rate_per_1000", label: "Repairs per 1,000 washes", better: "lower", unit: "rate", value: (s) => s.metrics.repair_rate_per_1000, metricId: "repair_rate_per_1000" },
  {
    id: "requests_per_100_wearers",
    label: "Service requests per 100 wearers",
    better: "lower",
    unit: "per100",
    value: (s) => (s.metrics.service_requests != null && s.metrics.wearers_min_est ? (s.metrics.service_requests / s.metrics.wearers_min_est) * 100 : undefined),
  },
];

export function formatPeer(unit: PeerKpi["unit"], v: number): string {
  if (unit === "ratio") return `${(v * 100).toFixed(1)}%`;
  if (unit === "hours") return `${v.toFixed(0)} h`;
  return v.toFixed(1);
}

export interface PeerRow {
  site: Site;
  value: number;
}

export interface PeerSummary {
  kpi: PeerKpi;
  rows: PeerRow[]; // best first
  median: number;
  /** Value at the top-quartile boundary (the "best 25%" of sites reach at least this). */
  topQuartile: number;
  best: PeerRow;
  weakest: PeerRow;
  byCountry: { country: string; median: number; n: number }[];
  missing: number;
  network?: { median: number; percentile?: number };
}

function quantile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

type NetworkBlock = Record<string, { network_median?: number; percentile?: number }>;

export function peerSummary(review: Review, kpi: PeerKpi): PeerSummary | null {
  const rows = review.sites
    .map((site) => ({ site, value: kpi.value(site) }))
    .filter((r): r is PeerRow => r.value != null && Number.isFinite(r.value));
  if (rows.length < 2) return null;
  const sign = kpi.better === "higher" ? -1 : 1;
  rows.sort((a, b) => (a.value - b.value) * sign);
  const asc = rows.map((r) => r.value).sort((a, b) => a - b);
  const topQuartile = kpi.better === "higher" ? quantile(asc, 0.75) : quantile(asc, 0.25);
  const countries = Array.from(new Set(rows.map((r) => r.site.country)));
  const byCountry = countries
    .map((country) => {
      const vs = rows.filter((r) => r.site.country === country).map((r) => r.value);
      return { country, median: median(vs), n: vs.length };
    })
    .sort((a, b) => (a.median - b.median) * sign);
  const net = kpi.metricId ? (review.peer_benchmark?.customer as NetworkBlock | undefined)?.[kpi.metricId] : undefined;
  return {
    kpi,
    rows,
    median: median(rows.map((r) => r.value)),
    topQuartile,
    best: rows[0],
    weakest: rows[rows.length - 1],
    byCountry,
    missing: review.sites.length - rows.length,
    network: net?.network_median != null ? { median: net.network_median, percentile: net.percentile } : undefined,
  };
}
