import { dqNotes, type DqNote } from "./dq";
import { full, pct } from "./format";
import type { Metric, Review } from "./types";

/*
 * "Safe to say": turns metrics into talking points a KAM can use with a customer, and sorts them with
 * fixed, visible rules. Wording is a template filled with the review's own values; estimates are phrased
 * with the LOW case ("at least …") so the sentence stays true across the whole sensitivity range.
 */

export type ClaimClass = "shareable" | "caveat" | "internal";

export interface Claim {
  metricId: string;
  cls: ClaimClass;
  sentence: string;
  /** Why it got this class (shown in the UI). */
  why: string;
  /** Caveat that must be said together with the sentence. */
  caveat?: string;
}

type Phrase = (m: Metric, r: Review) => string;

const t = (kg: number) => full(kg / 1000, 1); // kg -> tonnes, 1 decimal
const period = (r: Review) => (r.meta.period.from.slice(0, 4) === r.meta.period.to.slice(0, 4) && r.meta.period.from.endsWith("-01") && r.meta.period.to.endsWith("-12")
  ? r.meta.period.to.slice(0, 4)
  : `${r.meta.period.from} to ${r.meta.period.to}`);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const lastMonth = (r: Review) => {
  const [y, m] = r.meta.period.to.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
};
const vsBaseline = (r: Review) => `compared with ${r.meta.baseline_name.toLowerCase()}`;

/** Sentence templates for the metrics worth saying out loud. Order = order in the panel. */
const PHRASES: Record<string, Phrase> = {
  washed_kg: (m, r) => `In ${period(r)} we washed ${full(m.value.base, 0)} kg of workwear across your ${r.sites.length} sites.`,
  repairs_total: (m, r) => `${full(m.value.base, 0)} garment repairs were completed in ${period(r)}, keeping garments in use instead of replacing them.`,
  on_time_rate: (m, r) => `${pct(m.value.base, 1)} of service cycles were delivered on time in ${period(r)}.`,
  wearers_min_est: (m, r) => `At least ${full(m.value.low, 0)} people wore Lindström garments in ${lastMonth(r)}.`,
  allocation_use_rate: (m, r) => `${pct(m.value.base, 1)} of allocated garments were in active circulation in ${lastMonth(r)}.`,
  water_saving_l: (m, r) => `${vsBaseline(r)[0].toUpperCase()}${vsBaseline(r).slice(1)}, the circular service used at least ${full(m.value.low / 1000, 0)} m³ less fresh water in ${period(r)} (base case ${full(m.value.base / 1000, 0)} m³).`,
  co2e_saving_kg: (m, r) => `${vsBaseline(r)[0].toUpperCase()}${vsBaseline(r).slice(1)}, process and delivery emissions were at least ${t(m.value.low)} t CO₂e lower in ${period(r)} (base case ${t(m.value.base)} t).`,
  energy_saving_kwh: (m, r) => `${vsBaseline(r)[0].toUpperCase()}${vsBaseline(r).slice(1)}, laundry energy use was at least ${full(m.value.low / 1000, 0)} MWh lower in ${period(r)}.`,
  replacements_postponed: (m) => `Repairs postponed at least ${full(m.value.low, 0)} garment replacements (base case ${full(m.value.base, 0)}).`,
  circular_waste_share: (m) => `${pct(m.value.base, 0)} of the textile waste attributed to your service went to recycling or reuse.`,
  avoided_product_co2e_kg: (m) => `Repairs avoided at least ${t(m.value.low)} t CO₂e of new-garment production.`,
  idle_value_eur: (m) => `About €${full(m.value.base, 0)} of garment stock is allocated but not in active use.`,
};

export function buildClaims(review: Review): Claim[] {
  const notes = dqNotes(review).byMetric;
  const out: Claim[] = [];
  for (const [id, phrase] of Object.entries(PHRASES)) {
    const m = review.metrics.find((x) => x.id === id);
    if (!m || !Number.isFinite(m.value.base) || !Number.isFinite(m.value.low)) continue;
    out.push({ metricId: id, sentence: phrase(m, review), ...classify(m, notes.get(id) ?? []) });
  }
  return out;
}

function classify(m: Metric, notes: DqNote[]): { cls: ClaimClass; why: string; caveat?: string } {
  if (m.unit === "EUR" || m.assumptions.includes("T003")) {
    return { cls: "internal", why: "Illustrative stock value from synthetic purchase prices (T003). Cost evidence needs contract and invoice data; never present it as a saving." };
  }
  if (m.assumptions.includes("A005")) {
    return { cls: "internal", why: "Uses synthetic product footprints (A005, low confidence). Shareable only once approved product LCA data replaces them." };
  }
  if (m.confidence === "Low") {
    return { cls: "internal", why: "Confidence is Low." };
  }
  const isEstimate = m.status === "ESTIMATE" || m.status === "ALLOCATED_ESTIMATE";
  const base = isEstimate
    ? "Estimate phrased with the Low case, so it stays true across the whole sensitivity range."
    : m.status === "CALCULATED"
      ? "Calculated directly from source rows; no assumption changes it."
      : "Counted from the source data.";
  if (notes.length) {
    return {
      cls: "caveat",
      why: `${base} A data-quality finding affects it (${notes.map((n) => n.code).join(", ")}).`,
      caveat:
        notes[0].code === "DQ5"
          ? "This is a minimum: wearers are reported per product, so the true number of people is not yet known."
          : "Part of this value comes from a laundry whose reported volumes are being reconciled; treat it as provisional.",
    };
  }
  return { cls: "shareable", why: base + (isEstimate ? " Always name the comparison baseline." : "") };
}

/** Phrases a KAM should never use, with the reason (from the brief and our data findings). */
export function neverSay(review: Review): { phrase: string; why: string }[] {
  const assignments = review.metrics.find((m) => m.id === "wearer_product_assignments")?.value.base;
  const water = review.metrics.find((m) => m.id === "water_saving_l");
  return [
    assignments != null
      ? { phrase: `"You have ${full(assignments, 0)} active wearers"`, why: "That is wearer-product assignments; one person with two garments is counted twice (DQ5)." }
      : null,
    water && water.value.high > water.value.base
      ? { phrase: `"We saved you ${full(water.value.high / 1000, 0)} m³ of water"`, why: "That is the High case. Lead with Base and say the range; judges and customers distrust the top number." }
      : null,
    { phrase: `"Lindström saved you €…"`, why: "Cost savings are not evidenced; idle stock value is illustrative (T003)." },
    { phrase: `"Verified / certified / audited CO₂ reduction"`, why: "All values are synthetic or estimated; never use these words (brief requirement)." },
    { phrase: `"Site X is performing badly"`, why: "Rule flags (R1–R4) are signals to investigate together, not proof of poor performance." },
  ].filter(Boolean) as { phrase: string; why: string }[];
}
