import type { Range, Review } from "./types";

/*
 * "Rough calculation in mind" (mentor feedback): a KAM-side calculator that puts a euro figure on the
 * value of the service versus the customer's alternative. Quantities come from review.json; every
 * price is a KAM assumption typed in at the table. The result is a ROUGH CALCULATION, never a quote,
 * an invoice saving or an audited figure.
 */

export interface RoughInputs {
  baselineId: string;
  /** €/m³ of fresh water (incl. wastewater) the alternative would pay. */
  waterEurPerM3: number;
  /** €/kWh of energy. */
  energyEurPerKwh: number;
  /** Internal carbon price €/t CO₂e; 0 = not counted. */
  carbonEurPerT: number;
  /** € per replacement garment. Default: average synthetic purchase cost of the customer's garments. */
  garmentEur: number;
  /** Share of repairs that really postpone a purchase (data pack A002 assumes 100%, T001 low case 50%). */
  repairShare: number;
}

export interface RoughLine {
  id: "water" | "energy" | "carbon" | "repairs";
  label: string;
  quantity: string;
  price: string;
  eur: Range;
  note: string;
}

export interface RoughResult {
  baselineName: string;
  lines: RoughLine[];
  total: Range;
  perWearer: number | null;
  perSite: number | null;
}

const base = (r: Review, id: string) => r.metrics.find((m) => m.id === id)?.value.base;
const nf = (n: number, d = 0) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(n);
const scale = (x: Range, k: number): Range => ({ low: x.low * k, base: x.base * k, high: x.high * k });

/** Average purchase value of one garment: idle stock value ÷ idle pieces (both from the review). */
export function defaultGarmentEur(r: Review): number {
  const value = base(r, "idle_value_eur");
  const pieces = base(r, "idle_pieces");
  if (value != null && pieces) return Math.round((value / pieces) * 100) / 100;
  // Customer view hides idle stock value: fall back to the per-product split.
  let v = 0;
  let n = 0;
  for (const p of r.products) {
    if (p.metrics.idle_value_eur != null && p.metrics.idle_pieces) {
      v += p.metrics.idle_value_eur;
      n += p.metrics.idle_pieces;
    }
  }
  return n ? Math.round((v / n) * 100) / 100 : 40;
}

export function defaultRoughInputs(r: Review): RoughInputs {
  return {
    baselineId: r.meta.baseline_id,
    waterEurPerM3: 4,
    energyEurPerKwh: 0.15,
    carbonEurPerT: 0,
    garmentEur: defaultGarmentEur(r),
    repairShare: 0.5,
  };
}

export function roughCalc(r: Review, inp: RoughInputs): RoughResult {
  const cmp = r.baseline_comparison.find((b) => b.baseline_id === inp.baselineId) ?? r.baseline_comparison[0];
  const lines: RoughLine[] = [];
  if (cmp) {
    lines.push({
      id: "water",
      label: "Fresh water not used",
      quantity: `${nf(cmp.water_saving_l.base / 1000)} m³`,
      price: `€${nf(inp.waterEurPerM3, 2)}/m³`,
      eur: scale(cmp.water_saving_l, inp.waterEurPerM3 / 1000),
      note: "Water saving vs the alternative × your water and wastewater tariff.",
    });
    lines.push({
      id: "energy",
      label: "Energy not used",
      quantity: `${nf(cmp.energy_saving_kwh.base)} kWh`,
      price: `€${nf(inp.energyEurPerKwh, 3)}/kWh`,
      eur: scale(cmp.energy_saving_kwh, inp.energyEurPerKwh),
      note: "Energy saving vs the alternative × your energy price.",
    });
    if (inp.carbonEurPerT > 0) {
      lines.push({
        id: "carbon",
        label: "CO₂e avoided (internal carbon price)",
        quantity: `${nf(cmp.co2e_saving_kg.base / 1000)} t CO₂e`,
        price: `€${nf(inp.carbonEurPerT)}/t`,
        eur: scale(cmp.co2e_saving_kg, inp.carbonEurPerT / 1000),
        note: "Only if your company uses an internal carbon price.",
      });
    }
  }
  const repairs = base(r, "repairs_total");
  if (repairs != null) {
    const v = repairs * inp.repairShare * inp.garmentEur;
    lines.push({
      id: "repairs",
      label: "Garment purchases avoided by repairs",
      quantity: `${nf(repairs)} repairs × ${nf(inp.repairShare * 100)}%`,
      price: `€${nf(inp.garmentEur, 2)}/garment`,
      eur: { low: v, base: v, high: v },
      note: "Assumes the alternative does not repair, so worn garments are replaced. Edit the share if it does.",
    });
  }
  const total = lines.reduce<Range>((a, l) => ({ low: a.low + l.eur.low, base: a.base + l.eur.base, high: a.high + l.eur.high }), { low: 0, base: 0, high: 0 });
  const wearers = base(r, "wearers_min_est");
  return {
    baselineName: cmp?.name ?? r.meta.baseline_name,
    lines,
    total,
    perWearer: wearers ? total.base / wearers : null,
    perSite: r.sites.length ? total.base / r.sites.length : null,
  };
}
