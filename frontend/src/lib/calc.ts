import { BASELINES } from "./config";
import { full } from "./format";
import type { Metric, Review, Sensitivity } from "./types";

/* ------------------------------------------------------------------------------------------------
 * "Show the calculation" helpers. The browser never produces a reported number: it re-plays the
 * engine's formula with the review's own inputs and only shows that walk-through when it reproduces
 * the engine's value (otherwise it falls back to the engine's own arithmetic trace).
 * ---------------------------------------------------------------------------------------------- */

export interface Step {
  label: string;
  /** Arithmetic shown to the user, e.g. "502,074.7 kg × 9.5 L/kg × 1.0". */
  expr?: string;
  value: string;
  /** Metric the step's input comes from, so the user can open it. */
  metricId?: string;
  kind?: "input" | "op" | "result";
}

export interface Walkthrough {
  steps: Step[];
  /** Relative gap between the re-played result and the engine's value. */
  gap: number;
}

/** Sensitivity multipliers (team assumptions, see sensitivity.py). */
export const BASELINE_MULTIPLIER: Record<Sensitivity, number> = { low: 0.8, base: 1.0, high: 1.2 }; // T002
export const REPAIR_FACTOR: Record<Sensitivity, number> = { low: 0.5, base: 1.0, high: 1.0 }; // T001 / A002

const HANDPRINT: Record<string, { factor: "waterLPerKg" | "energyKwhPerKg" | "co2ePerKg"; footprint: string; unit: string; noun: string }> = {
  water_saving_l: { factor: "waterLPerKg", footprint: "customer_water_l", unit: "L", noun: "water" },
  energy_saving_kwh: { factor: "energyKwhPerKg", footprint: "customer_energy_kwh", unit: "kWh", noun: "energy" },
  co2e_saving_kg: { factor: "co2ePerKg", footprint: "customer_co2e_kg", unit: "kgCO2e", noun: "process + delivery CO₂e" },
};

const n = (x: number, d = 1) => full(x, d);

export function walkthrough(metric: Metric, review: Review, s: Sensitivity): Walkthrough | null {
  const byId = new Map(review.metrics.map((m) => [m.id, m]));
  const target = metric.value[s];

  const hp = HANDPRINT[metric.id];
  if (hp) {
    const kg = byId.get("washed_kg")?.value.base;
    const footprint = byId.get(hp.footprint)?.value.base;
    const baseline = BASELINES.find((b) => b.id === review.meta.baseline_id);
    if (kg == null || footprint == null || !baseline) return null;
    const factor = baseline[hp.factor];
    const mult = BASELINE_MULTIPLIER[s];
    const without = kg * factor * mult;
    const result = without - footprint;
    return {
      gap: Math.abs(result - target) / Math.max(1, Math.abs(target)),
      steps: [
        { kind: "input", label: "Textiles washed for the customer", value: `${n(kg)} kg`, metricId: "washed_kg" },
        {
          kind: "op",
          label: `${hp.noun[0].toUpperCase()}${hp.noun.slice(1)} the same kg would need with ${baseline.name.toLowerCase()}`,
          expr: `${n(kg)} kg × ${factor} ${hp.unit}/kg${mult !== 1 ? ` × ${mult} (${s} case)` : ""}`,
          value: `${n(without)} ${hp.unit}`,
        },
        {
          kind: "op",
          label: `Minus what Lindström's laundries actually used for this customer (allocated)`,
          expr: `− ${n(footprint)} ${hp.unit}`,
          value: `${n(footprint)} ${hp.unit}`,
          metricId: hp.footprint,
        },
        { kind: "result", label: "Saving", expr: `${n(without)} − ${n(footprint)}`, value: `${n(result)} ${hp.unit}` },
      ],
    };
  }

  if (metric.id === "replacements_postponed") {
    const repairs = byId.get("repairs_total")?.value.base;
    if (repairs == null) return null;
    const f = REPAIR_FACTOR[s];
    const result = repairs * f;
    return {
      gap: Math.abs(result - target) / Math.max(1, Math.abs(target)),
      steps: [
        { kind: "input", label: "Repairs completed in the period", value: `${n(repairs, 0)} repairs`, metricId: "repairs_total" },
        { kind: "op", label: `Replacements each repair postpones (${s} case, A002/T001)`, expr: `× ${f}`, value: `${f}` },
        { kind: "result", label: "Garment replacements postponed", expr: `${n(repairs, 0)} × ${f}`, value: `${n(result, 0)}` },
      ],
    };
  }

  if (metric.id === "allocation_use_rate") {
    const allocated = byId.get("garments_allocated")?.value.base;
    const idle = byId.get("idle_pieces")?.value.base;
    if (allocated == null || idle == null || allocated <= 0) return null;
    const scanned = allocated - idle;
    const result = scanned / allocated;
    return {
      gap: Math.abs(result - target) / Math.max(1e-9, Math.abs(target)),
      steps: [
        { kind: "input", label: "Garments allocated (latest month)", value: `${n(allocated, 0)} pieces`, metricId: "garments_allocated" },
        { kind: "op", label: "Minus garments not scanned in circulation", expr: `− ${n(idle, 0)}`, value: `${n(idle, 0)} pieces`, metricId: "idle_pieces" },
        { kind: "op", label: "Garments actually in use", expr: `${n(allocated, 0)} − ${n(idle, 0)}`, value: `${n(scanned, 0)} pieces` },
        { kind: "result", label: "Share in active use", expr: `${n(scanned, 0)} ÷ ${n(allocated, 0)}`, value: `${(result * 100).toFixed(1)}%` },
      ],
    };
  }
  return null;
}

/* ---------- engine trace ("RULE | Live arithmetic (…): a * b - c = d; scenario=base; baseline=B_LOCAL") ---------- */

export interface Trace {
  rule: string;
  terms: { op: string; text: string }[];
  result: string | null;
  scenario?: string;
  baseline?: string;
}

const OPS: Record<string, string> = { "*": "×", "/": "÷", "+": "+", "-": "−", "=": "=" };
/** Trim engine display precision (6 decimals) to 2 for reading. */
const tidy = (t: string) => t.replace(/(\d[\d,]*\.\d{2})\d+/g, "$1");

export function parseTrace(formula: string): Trace {
  const i = formula.indexOf(" | Live arithmetic");
  if (i < 0) return { rule: formula, terms: [], result: null };
  let rest = formula.slice(i + 3);
  const colon = rest.indexOf("): ");
  rest = colon >= 0 ? rest.slice(colon + 3) : rest.replace(/^Live arithmetic:?\s*/, "");
  const parts = rest.split(";").map((x) => x.trim());
  const kv = (k: string) => parts.find((x) => x.startsWith(`${k}=`))?.slice(k.length + 1);
  const expr = parts.filter((x) => !/^(scenario|baseline)=/.test(x)).join("; ");
  // Operators are surrounded by spaces in the engine output, so hyphenated words stay intact.
  const tokens = expr.split(/\s([*/+\-=])\s/);
  const terms: { op: string; text: string }[] = [{ op: "", text: tidy(tokens[0]) }];
  let result: string | null = null;
  for (let k = 1; k < tokens.length; k += 2) {
    const op = tokens[k];
    const text = tidy(tokens[k + 1] ?? "");
    if (op === "=") result = text;
    else terms.push({ op: OPS[op] ?? op, text });
  }
  return { rule: formula.slice(0, i), terms, result, scenario: kv("scenario"), baseline: kv("baseline") };
}

/* ---------- why a range exists ---------- */

export function rangeReason(metric: Metric): { title: string; body: string; cases?: { case: Sensitivity; factor: string }[] } {
  const { low, high } = metric.value;
  if (!(high > low)) {
    return {
      title: "Why is there no range?",
      body: "This value is counted or calculated directly from the source rows. No assumption changes it, so Low, Base and High are identical.",
    };
  }
  if (metric.assumptions.includes("T002")) {
    return {
      title: "Why is there a Low / Base / High range?",
      body:
        "The data pack gives one water, energy and CO₂e factor per comparison baseline, and real alternatives vary. " +
        "We therefore test the baseline factors at −20% and +20% (team assumption T002). Lindström's own allocated use stays fixed, " +
        "so only the 'without Lindström' side moves. Present the Base case and always mention the range.",
      cases: [
        { case: "low", factor: "baseline × 0.8" },
        { case: "base", factor: "baseline × 1.0" },
        { case: "high", factor: "baseline × 1.2" },
      ],
    };
  }
  if (metric.assumptions.includes("T001") || metric.assumptions.includes("A002")) {
    return {
      title: "Why is there a Low / Base / High range?",
      body:
        "The pack assumes each completed repair postpones one garment replacement (A002). That is plausible but unproven, " +
        "so the Low case assumes only half of repairs postpone a purchase (team assumption T001).",
      cases: [
        { case: "low", factor: "repair factor 0.5" },
        { case: "base", factor: "repair factor 1.0" },
        { case: "high", factor: "repair factor 1.0" },
      ],
    };
  }
  return {
    title: "Why is there a Low / Base / High range?",
    body: `The value depends on assumptions ${metric.assumptions.join(", ")}; the range shows how far the result moves when they vary. See the assumptions below.`,
  };
}

/* ---------- everyday equivalents (display-only context, never used in a calculation) ---------- */

export interface Equivalent {
  text: string;
  basis: string;
}

/**
 * Illustrative public reference factors. They are NOT from the data pack and NOT Lindström claims;
 * confirm with the challenge owner before external use (brief: public references are context only).
 */
export const REFERENCE_FACTORS = {
  householdWaterLPerPersonDay: { value: 120, source: "≈120 L per person per day, typical Finnish household water use (FIWA/VVY figure)" },
  carKgCo2ePerKm: { value: 0.17, source: "≈0.17 kg CO₂e per km, average passenger car (UK DESNZ GHG conversion factors)" },
  apartmentKwhPerYear: { value: 2000, source: "≈2,000 kWh per year, Finnish apartment household electricity without electric heating (Motiva typical value)" },
};

export function equivalents(value: number, unit: string): Equivalent[] {
  if (!(value > 0)) return [];
  const R = REFERENCE_FACTORS;
  if (unit === "L") {
    const personYears = value / (R.householdWaterLPerPersonDay.value * 365);
    return [{ text: `≈ ${n(personYears, 0)} people's household water use for a whole year`, basis: R.householdWaterLPerPersonDay.source }];
  }
  if (unit === "kgCO2e") {
    const km = value / R.carKgCo2ePerKm.value;
    return [{ text: `≈ ${n(km, 0)} km driven by an average car (≈ ${n(km / 40075, 1)} times around the Earth)`, basis: R.carKgCo2ePerKm.source }];
  }
  if (unit === "kWh") {
    return [{ text: `≈ ${n(value / R.apartmentKwhPerYear.value, 0)} apartments' household electricity for a year`, basis: R.apartmentKwhPerYear.source }];
  }
  return [];
}
