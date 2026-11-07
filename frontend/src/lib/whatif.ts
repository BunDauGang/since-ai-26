import { median } from "./derive";
import type { Review, Site } from "./types";

/*
 * 2026 what-if scenarios. These are explorations, not forecasts: every input comes from review.json
 * (site metrics + customer KPIs), the levers are explicit, and everything else is held constant.
 * Results are labelled ESTIMATE in the UI and are never written back into the review or the export.
 */

export interface WhatIfInputs {
  /** Share of idle (unscanned) garments reclaimed at R1 low-use sites, 0..1. */
  reclaimShare: number;
  /** How far high-repair sites move toward the customer median repair rate, 0..1. */
  repairGapClosed: number;
}

export interface WhatIfSiteRow {
  site: Site;
  idle?: number;
  reclaimed?: number;
  rate?: number;
  target?: number;
  avoided?: number;
}

export interface WhatIfResult {
  available: { reclaim: boolean; repair: boolean };
  // Allocation lever
  r1Sites: WhatIfSiteRow[];
  idleAtR1: number;
  reclaimed: number;
  useRateBefore: number | null;
  useRateAfter: number | null;
  /** Illustrative: reclaimed pieces × average synthetic purchase value of an idle piece. Not a saving. */
  capitalReleasedEur: number | null;
  // Repair lever
  repairSites: WhatIfSiteRow[];
  medianRate: number;
  avoidedRepairs: number;
  repairsTotal: number | null;
}

const metric = (r: Review, id: string) => r.metrics.find((m) => m.id === id)?.value.base;

export function simulate(review: Review, inp: WhatIfInputs): WhatIfResult {
  // ---- Lever 1: reclaim idle garments at R1 low-allocation-use sites
  const r1 = review.sites.filter((s) => s.flags.some((f) => f.startsWith("R1_")) && (s.metrics.idle_pieces ?? 0) > 0);
  const r1Sites: WhatIfSiteRow[] = r1.map((site) => {
    const idle = site.metrics.idle_pieces ?? 0;
    return { site, idle, reclaimed: Math.round(idle * inp.reclaimShare) };
  });
  const idleAtR1 = r1Sites.reduce((a, r) => a + (r.idle ?? 0), 0);
  const reclaimed = r1Sites.reduce((a, r) => a + (r.reclaimed ?? 0), 0);
  const allocated = metric(review, "garments_allocated");
  const idleTotal = metric(review, "idle_pieces");
  const idleValue = metric(review, "idle_value_eur");
  const canUse = allocated != null && idleTotal != null && allocated > 0;
  // Reclaimed pieces leave the customer's allocation (returned to Lindström's pool); scanned pieces are unchanged.
  const useRateBefore = canUse ? (allocated - idleTotal) / allocated : null;
  const useRateAfter = canUse && allocated - reclaimed > 0 ? (allocated - idleTotal) / (allocated - reclaimed) : null;
  const eurPerIdle = idleValue != null && idleTotal ? idleValue / idleTotal : null;

  // ---- Lever 2: bring sites above the customer median repair rate closer to it
  const rated = review.sites.filter((s) => s.metrics.repair_rate_per_1000 != null && s.metrics.repairs_total != null);
  const medianRate = median(rated.map((s) => s.metrics.repair_rate_per_1000!));
  const repairSites: WhatIfSiteRow[] = rated
    .filter((s) => s.metrics.repair_rate_per_1000! > medianRate)
    .map((site) => {
      const rate = site.metrics.repair_rate_per_1000!;
      const target = rate - inp.repairGapClosed * (rate - medianRate);
      // repairs scale with the rate at constant washed volume: avoided = repairs × (1 − target / rate)
      const avoided = rate > 0 ? site.metrics.repairs_total! * (1 - target / rate) : 0;
      return { site, rate, target, avoided };
    })
    .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
  const avoidedRepairs = repairSites.reduce((a, r) => a + (r.avoided ?? 0), 0);

  return {
    available: { reclaim: r1Sites.length > 0 && canUse, repair: repairSites.length > 0 },
    r1Sites,
    idleAtR1,
    reclaimed,
    useRateBefore,
    useRateAfter,
    capitalReleasedEur: eurPerIdle != null ? reclaimed * eurPerIdle : null,
    repairSites,
    medianRate,
    avoidedRepairs,
    repairsTotal: metric(review, "repairs_total") ?? null,
  };
}
