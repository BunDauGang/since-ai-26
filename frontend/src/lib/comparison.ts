"use client";

import { useEffect, useState } from "react";
import { fetchReview } from "./api";
import type { Priority, Review, Sensitivity } from "./types";

/*
 * "What changed since the last steering committee?" (steering question 1). The selected period is split at
 * the month of the last meeting. Live, the engine calculates both parts, so every KPI is a real recalculation;
 * offline, only the monthly series in the bundled review can be split. Totals are compared per month,
 * because the two parts can have different lengths.
 */

export interface CompareItem {
  id: string;
  label: string;
  before: number | null;
  after: number | null;
  unit: "ratio" | "hours" | "rate" | "kg" | "L" | "kgCO2e" | "count";
  better: "higher" | "lower" | null;
  perMonth: boolean;
}

export interface Split {
  before: { from: string; to: string; months: number };
  after: { from: string; to: string; months: number };
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthsBetween(from: string, to: string): number {
  const [a, b] = [from, to].map((x) => x.split("-").map(Number));
  return (b[0] - a[0]) * 12 + (b[1] - a[1]) + 1;
}

/** Middle month of the period: the default "last steering committee" for a semi-annual rhythm. */
export function defaultSplit(from: string, to: string): string {
  return addMonths(from, Math.floor(monthsBetween(from, to) / 2) - 1);
}

export function splitPeriod(from: string, to: string, lastSteerCo: string): Split | null {
  const split = lastSteerCo && lastSteerCo >= from && lastSteerCo < to ? lastSteerCo : defaultSplit(from, to);
  if (monthsBetween(from, to) < 2 || split < from || split >= to) return null;
  const afterFrom = addMonths(split, 1);
  return {
    before: { from, to: split, months: monthsBetween(from, split) },
    after: { from: afterFrom, to, months: monthsBetween(afterFrom, to) },
  };
}

const DEFS: { id: string; label: string; unit: CompareItem["unit"]; better: CompareItem["better"]; perMonth: boolean }[] = [
  { id: "on_time_rate", label: "On-time delivery", unit: "ratio", better: "higher", perMonth: false },
  { id: "allocation_use_rate", label: "Garments in circulation", unit: "ratio", better: "higher", perMonth: false },
  { id: "median_cycle_hours", label: "Typical cycle time", unit: "hours", better: "lower", perMonth: false },
  { id: "repair_rate_per_1000", label: "Repairs per 1,000 washes", unit: "rate", better: "lower", perMonth: false },
  { id: "service_requests", label: "Service requests", unit: "count", better: "lower", perMonth: true },
  { id: "water_saving_l", label: "Water saving", unit: "L", better: "higher", perMonth: true },
  { id: "co2e_saving_kg", label: "CO₂e saving", unit: "kgCO2e", better: "higher", perMonth: true },
  { id: "washed_kg", label: "Workwear washed", unit: "kg", better: null, perMonth: true },
];

const base = (r: Review, id: string) => r.metrics.find((m) => m.id === id)?.value.base ?? null;

export function compareReviews(a: Review, b: Review, split: Split): CompareItem[] {
  return DEFS.map((d) => {
    let before = base(a, d.id);
    let after = base(b, d.id);
    if (d.perMonth) {
      before = before != null ? before / split.before.months : null;
      after = after != null ? after / split.after.months : null;
    }
    return { ...d, before, after };
  }).filter((x) => x.before != null && x.after != null);
}

/** Offline: only the monthly series of the bundled review can be split. */
export function compareTimeseries(r: Review, split: Split): CompareItem[] {
  const avg = (id: string, from: string, to: string) => {
    const pts = (r.timeseries[id] ?? []).filter((p) => p.month >= from && p.month <= to);
    return pts.length ? pts.reduce((s, p) => s + p.value, 0) / pts.length : null;
  };
  return DEFS.filter((d) => d.perMonth && r.timeseries[d.id]?.length)
    .map((d) => ({ ...d, before: avg(d.id, split.before.from, split.before.to), after: avg(d.id, split.after.from, split.after.to) }))
    .filter((x) => x.before != null && x.after != null);
}

export type Trend = "better" | "worse" | "same" | "neutral";

export function trend(item: CompareItem): Trend {
  if (item.before == null || item.after == null) return "neutral";
  const rel = Math.abs(item.after - item.before) / Math.max(Math.abs(item.before), 1e-9);
  if (rel < 0.005) return "same";
  if (!item.better) return "neutral";
  const up = item.after > item.before;
  return (item.better === "higher") === up ? "better" : "worse";
}

export function formatCompare(item: CompareItem, v: number): string {
  const nf = (x: number, d = 0) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(x);
  const suffix = item.perMonth ? "/month" : "";
  if (item.unit === "ratio") return `${(v * 100).toFixed(1)}%`;
  if (item.unit === "hours") return `${nf(v)} h`;
  if (item.unit === "rate") return nf(v, 1);
  if (item.unit === "kgCO2e") return v >= 1000 ? `${nf(v / 1000, 1)} t${suffix}` : `${nf(v)} kg${suffix}`;
  if (item.unit === "L") return v >= 1e6 ? `${nf(v / 1e6, 2)}M L${suffix}` : `${nf(v / 1000, 0)} m³${suffix}`;
  if (item.unit === "kg") return `${nf(v / 1000, 1)} t${suffix}`;
  return `${nf(v, 1)}${suffix}`;
}

export interface Comparison {
  split: Split | null;
  items: CompareItem[];
  source: "engine" | "monthly series" | null;
  loading: boolean;
  error: string | null;
}

/** Live: two engine recalculations (before / after the last meeting). Offline: monthly series. */
export function useComparison(args: {
  review: Review;
  live: boolean;
  customerId: string;
  baselineId: string;
  sensitivity: Sensitivity;
  priority: Priority;
  lastSteerCo: string;
}): Comparison {
  const { review, live, customerId, baselineId, sensitivity, priority, lastSteerCo } = args;
  const { from, to } = review.meta.period;
  const split = splitPeriod(from, to, lastSteerCo);
  const key = split ? [live, customerId, baselineId, sensitivity, split.before.from, split.before.to, split.after.to].join("|") : "";
  const [state, setState] = useState<{ key: string; items: CompareItem[]; error: string | null } | null>(null);

  useEffect(() => {
    if (!split || !live) return;
    let cancelled = false;
    const req = (p: { from: string; to: string }) =>
      fetchReview({ customer_id: customerId, period_from: p.from, period_to: p.to, baseline_id: baselineId, sensitivity, priority });
    const t = setTimeout(async () => {
      try {
        const [a, b] = await Promise.all([req(split.before), req(split.after)]);
        if (!cancelled) setState({ key, items: compareReviews(a.review, b.review, split), error: null });
      } catch (e) {
        if (!cancelled) setState({ key, items: [], error: e instanceof Error ? e.message : String(e) });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // `key` captures every input of the two requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!split) return { split: null, items: [], source: null, loading: false, error: null };
  if (!live) return { split, items: compareTimeseries(review, split), source: "monthly series", loading: false, error: null };
  const fresh = state?.key === key ? state : null;
  if (fresh?.error) return { split, items: compareTimeseries(review, split), source: "monthly series", loading: false, error: fresh.error };
  return { split, items: fresh?.items ?? [], source: "engine", loading: !fresh, error: null };
}
