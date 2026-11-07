import { full } from "./format";
import type { Review } from "./types";

/** Laundries sheet of the data pack. */
export const LAUNDRY_NAMES: Record<string, string> = {
  L001: "Aurora Helsinki WWS",
  L002: "Aurora Turku WWS",
  L003: "Nordic Malmö WWS",
  L004: "Vistula Warsaw WWS",
};

export interface DqNote {
  code: "DQ4" | "DQ5";
  /** Pill text. */
  short: string;
  /** One-paragraph explanation with the engine's own numbers. */
  detail: string;
}

/** Metrics whose value depends on laundry-level resource or waste data (affected by DQ4). */
const LAUNDRY_DEPENDENT = [
  "customer_water_l",
  "customer_energy_kwh",
  "customer_co2e_kg",
  "textile_waste_kg",
  "circular_waste_share",
  "water_saving_l",
  "energy_saving_kwh",
  "co2e_saving_kg",
];
/** Metrics built from per-product wearer counts (affected by DQ5). */
const WEARER_METRICS = ["wearers_min_est", "wearer_product_assignments"];

type Num = number | undefined;
const num = (x: unknown): Num => (typeof x === "number" && Number.isFinite(x) ? x : undefined);

/**
 * Places the data-quality findings where they matter: on the affected sites and metrics.
 * Uses only data_quality[] records and site flags from the review.
 */
export function dqNotes(review: Review): { bySite: Map<string, DqNote[]>; byMetric: Map<string, DqNote[]> } {
  const bySite = new Map<string, DqNote[]>();
  const byMetric = new Map<string, DqNote[]>();
  const push = (m: Map<string, DqNote[]>, k: string, n: DqNote) => m.set(k, [...(m.get(k) ?? []), n]);

  // ---- DQ4: customer kg exceeds the laundry's own washed kg (the L003 Malmö finding)
  const dq4 = review.data_quality.filter((d) => d.check_id === "DQ4");
  const laundries = new Map<string, { months: number; excess: number; maxShare: number }>();
  for (const d of dq4) {
    const qi = (d as unknown as { quantitative_impact?: Record<string, unknown>; laundry_id?: string }).quantitative_impact ?? {};
    const id = (qi.laundry_id as string) ?? (d as unknown as { laundry_id?: string }).laundry_id ?? d.message.match(/Laundry (L\d+)/)?.[1];
    if (!id) continue;
    const cur = laundries.get(id) ?? { months: 0, excess: 0, maxShare: 0 };
    cur.months += 1;
    cur.excess += num(qi.excess_kg) ?? 0;
    cur.maxShare = Math.max(cur.maxShare, num(qi.share) ?? 0);
    laundries.set(id, cur);
  }
  const dq4Sites = review.sites.filter((s) => s.flags.includes("DQ4") || laundries.has(s.laundry_id));
  for (const s of dq4Sites) {
    const l = laundries.get(s.laundry_id);
    const name = LAUNDRY_NAMES[s.laundry_id] ?? s.laundry_id;
    push(bySite, s.site_id, {
      code: "DQ4",
      short: `DQ4 · ${name.replace(/ WWS$/, "")} volume`,
      detail:
        `Served by ${name} (${s.laundry_id}). ` +
        (l
          ? `In ${l.months} months, customer rows at this laundry report ${full(l.excess, 0)} kg more than the laundry itself washed (shares up to ${full(l.maxShare * 100, 0)}%). `
          : "Customer kg at this laundry exceeds the laundry's reported washed kg. ") +
        "This site's footprint uses the laundry's intensity per kg × the customer's kg; reconcile with the WWS Washed Kg report before external use.",
    });
  }
  if (dq4Sites.length) {
    const kgAll = review.sites.reduce((a, s) => a + (s.metrics.washed_kg ?? 0), 0);
    const kgDq4 = dq4Sites.reduce((a, s) => a + (s.metrics.washed_kg ?? 0), 0);
    const names = Array.from(new Set(dq4Sites.map((s) => LAUNDRY_NAMES[s.laundry_id] ?? s.laundry_id))).join(", ");
    const note: DqNote = {
      code: "DQ4",
      short: `DQ4 · ${dq4Sites.length} sites`,
      detail:
        `${dq4Sites.length} of ${review.sites.length} sites (${kgAll ? full((kgDq4 / kgAll) * 100, 0) : "?"}% of washed kg) are served by ${names}, ` +
        "where customer kg exceeds the laundry's own washed kg. Their share of this value uses laundry intensity × customer kg and needs reconciliation.",
    };
    for (const id of LAUNDRY_DEPENDENT) push(byMetric, id, note);
  }

  // ---- DQ5: wearers are counted per product, so summing double-counts people
  const dq5 = review.data_quality.find((d) => d.check_id.startsWith("DQ5"));
  if (dq5) {
    const qi = (dq5 as unknown as { quantitative_impact?: Record<string, unknown> }).quantitative_impact ?? {};
    const a = num(qi.assignments), m = num(qi.minimum_estimate);
    const note: DqNote = {
      code: "DQ5",
      short: "DQ5 · wearer double count",
      detail:
        (a != null && m != null
          ? `${full(a, 0)} wearer-product assignments vs a minimum of ${full(m, 0)} people. `
          : "Wearers are reported per product row. ") +
        "One person with a jacket and trousers is counted twice in the sum, so we show the minimum estimate (largest product count per site) until eLindström unique wearer IDs are linked.",
    };
    for (const id of WEARER_METRICS) push(byMetric, id, note);
  }
  return { bySite, byMetric };
}
