import { BASELINES, priorityDef } from "./config";
import type { Metric, Observation, Priority, Review, Sensitivity } from "./types";

const HANDPRINT_IDS = ["water_saving_l", "energy_saving_kwh", "co2e_saving_kg"] as const;

/**
 * Offline mode only: the bundled review is computed vs one baseline, but `baseline_comparison`
 * carries the engine's handprint totals for every baseline. Swap those in so the customer-level
 * savings follow the selected baseline without recomputing anything in the browser.
 * Site- and month-level savings stay on the review's original baseline (flagged in the UI).
 */
export function rebaseReview(review: Review, baselineId: string): { review: Review; siteLevelBaselineId: string } {
  const siteLevelBaselineId = review.meta.baseline_id;
  if (baselineId === review.meta.baseline_id) return { review, siteLevelBaselineId };
  const cmp = review.baseline_comparison.find((b) => b.baseline_id === baselineId);
  if (!cmp) return { review, siteLevelBaselineId };
  const name = cmp.name;
  const metrics: Metric[] = review.metrics.map((m) => {
    if (!(HANDPRINT_IDS as readonly string[]).includes(m.id)) return m;
    const key = m.id as (typeof HANDPRINT_IDS)[number];
    return {
      ...m,
      value: cmp[key],
      label: m.label.replace(/vs .*$/i, `vs ${name.toLowerCase()}`),
    };
  });
  return {
    review: { ...review, metrics, meta: { ...review.meta, baseline_id: baselineId, baseline_name: name } },
    siteLevelBaselineId,
  };
}

export function v(metric: Metric | undefined, s: Sensitivity): number {
  return metric ? metric.value[s] : NaN;
}

export function metricMap(review: Review): Map<string, Metric> {
  return new Map(review.metrics.map((m) => [m.id, m]));
}

/** Metric ids emphasized for the active priority: backend's priority_view wins when it matches. */
export function emphasizedIds(review: Review, priority: Priority): string[] {
  if (review.priority_view?.priority === priority && review.priority_view.emphasized_metric_ids.length) {
    return review.priority_view.emphasized_metric_ids;
  }
  return priorityDef(priority).emphasized;
}

/** Observations touching emphasized metrics float to the top (stable otherwise). */
export function rankObservations(obs: Observation[], emphasized: string[]): Observation[] {
  const score = (o: Observation) => {
    const idx = o.metric_ids.map((id) => emphasized.indexOf(id)).filter((i) => i >= 0);
    return idx.length ? Math.min(...idx) : 99;
  };
  return obs
    .map((o, i) => ({ o, i, s: score(o) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.o);
}

export function baselineName(id: string): string {
  return BASELINES.find((b) => b.id === id)?.name ?? id;
}

export function median(xs: number[]): number {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
