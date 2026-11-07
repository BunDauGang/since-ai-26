import type { Review } from "./types";

/*
 * Lindström vs competing providers (mentor feedback: "compare with competitors"). Competitors are
 * anonymised ARCHETYPES, never real companies. Each cell says where its number comes from:
 *   review: this customer's review (synthetic data pack, Lindström side)
 *   pack:   Baselines sheet of the data pack (B_LOCAL / B_INHOUSE: illustrative factors, no repair, mixed waste)
 *   mock:   invented for this prototype to make the comparison readable; replace with market data
 */

export type Source = "review" | "pack" | "mock";

export interface Provider {
  id: "lindstrom" | "rental" | "nordic" | "local" | "inhouse";
  name: string;
  kind: string;
}

export const PROVIDERS: Provider[] = [
  { id: "lindstrom", name: "Lindström", kind: "Textile service: rental, laundry, repair, RFID tracking" },
  { id: "rental", name: "Pan-European rental group", kind: "Multi-country workwear and linen rental provider" },
  { id: "nordic", name: "Nordic regional textile service", kind: "Regional workwear rental and laundry provider" },
  { id: "local", name: "Local commercial laundry", kind: "Wash-only laundry serving nearby businesses" },
  { id: "inhouse", name: "In-house laundry", kind: "Customer washes its own garments" },
];

export interface Cell {
  value: number | null;
  text: string;
  source: Source;
}

export interface CompareRow {
  id: string;
  label: string;
  better: "higher" | "lower" | null;
  cells: Record<Provider["id"], Cell>;
  /** Metric to open for the Lindström evidence. */
  metricId?: string;
}

const base = (r: Review, id: string) => r.metrics.find((m) => m.id === id)?.value.base;
const n = (v: number, d: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
const num = (value: number | null | undefined, text: (v: number) => string, source: Source): Cell =>
  value == null || !Number.isFinite(value) ? { value: null, text: "n/a", source } : { value, text: text(value), source };
const txt = (text: string, source: Source): Cell => ({ value: null, text, source });

// Data pack Baselines sheet (also mirrored in config.BASELINES). process + delivery CO₂e.
const PACK = {
  local: { water: 9.5, energy: 1.05, co2e: 0.62 + 0.035 },
  inhouse: { water: 12.5, energy: 1.12, co2e: 0.68 + 0.015 },
};

// Illustrative mock values: plausible archetypes, not real companies or market data.
const MOCK = {
  rental: { onTime: 0.955, cycle: 96, water: 8.0, energy: 0.85, co2e: 0.32, circular: 0.45 },
  nordic: { onTime: 0.962, cycle: 90, water: 7.4, energy: 0.79, co2e: 0.27, circular: 0.55 },
  local: { onTime: 0.93, cycle: 120 },
};

export function compareRows(r: Review): CompareRow[] {
  const kg = base(r, "washed_kg");
  const per = (id: string) => {
    const v = base(r, id);
    return v != null && kg ? v / kg : null;
  };
  const pctT = (v: number) => `${n(v * 100, 1)}%`;
  const hT = (v: number) => `${n(v, 0)} h`;
  const lT = (v: number) => `${n(v, 1)} L/kg`;
  const kwhT = (v: number) => `${n(v, 2)} kWh/kg`;
  const co2T = (v: number) => `${n(v, 2)} kg/kg`;
  const repairs = base(r, "repairs_total");
  const use = base(r, "allocation_use_rate");

  return [
    {
      id: "on_time",
      label: "On-time delivery",
      better: "higher",
      metricId: "on_time_rate",
      cells: {
        lindstrom: num(base(r, "on_time_rate"), pctT, "review"),
        rental: num(MOCK.rental.onTime, pctT, "mock"),
        nordic: num(MOCK.nordic.onTime, pctT, "mock"),
        local: num(MOCK.local.onTime, pctT, "mock"),
        inhouse: txt("Own staff", "pack"),
      },
    },
    {
      id: "cycle",
      label: "Typical cycle, pickup to delivery",
      better: "lower",
      metricId: "median_cycle_hours",
      cells: {
        lindstrom: num(base(r, "median_cycle_hours"), hT, "review"),
        rental: num(MOCK.rental.cycle, hT, "mock"),
        nordic: num(MOCK.nordic.cycle, hT, "mock"),
        local: num(MOCK.local.cycle, hT, "mock"),
        inhouse: txt("Own staff", "pack"),
      },
    },
    {
      id: "repair",
      label: "Garment repair",
      better: null,
      metricId: "repairs_total",
      cells: {
        lindstrom: txt(repairs != null ? `Included: ${n(repairs, 0)} repairs` : "Included", "review"),
        rental: txt("On request, charged per item", "mock"),
        nordic: txt("Basic repairs, selected garments", "mock"),
        local: txt("None (worn garments replaced)", "pack"),
        inhouse: txt("None (worn garments replaced)", "pack"),
      },
    },
    {
      id: "tracking",
      label: "Garment tracking",
      better: null,
      metricId: "allocation_use_rate",
      cells: {
        lindstrom: txt(use != null ? `Per garment (RFID): ${n(use * 100, 1)}% in circulation visible` : "Per garment (RFID)", "review"),
        rental: txt("Barcode, per batch", "mock"),
        nordic: txt("RFID on selected garments", "mock"),
        local: txt("None", "mock"),
        inhouse: txt("Manual counts", "mock"),
      },
    },
    {
      id: "water",
      label: "Fresh water per kg washed",
      better: "lower",
      metricId: "customer_water_l",
      cells: {
        lindstrom: num(per("customer_water_l"), lT, "review"),
        rental: num(MOCK.rental.water, lT, "mock"),
        nordic: num(MOCK.nordic.water, lT, "mock"),
        local: num(PACK.local.water, lT, "pack"),
        inhouse: num(PACK.inhouse.water, lT, "pack"),
      },
    },
    {
      id: "energy",
      label: "Energy per kg washed",
      better: "lower",
      metricId: "customer_energy_kwh",
      cells: {
        lindstrom: num(per("customer_energy_kwh"), kwhT, "review"),
        rental: num(MOCK.rental.energy, kwhT, "mock"),
        nordic: num(MOCK.nordic.energy, kwhT, "mock"),
        local: num(PACK.local.energy, kwhT, "pack"),
        inhouse: num(PACK.inhouse.energy, kwhT, "pack"),
      },
    },
    {
      id: "co2e",
      label: "CO₂e per kg washed (process + delivery)",
      better: "lower",
      metricId: "customer_co2e_kg",
      cells: {
        lindstrom: num(per("customer_co2e_kg"), co2T, "review"),
        rental: num(MOCK.rental.co2e, co2T, "mock"),
        nordic: num(MOCK.nordic.co2e, co2T, "mock"),
        local: num(PACK.local.co2e, co2T, "pack"),
        inhouse: num(PACK.inhouse.co2e, co2T, "pack"),
      },
    },
    {
      id: "circular",
      label: "Textile waste recycled, reused or recovered",
      better: "higher",
      metricId: "circular_waste_share",
      cells: {
        lindstrom: num(base(r, "circular_waste_share"), pctT, "review"),
        rental: num(MOCK.rental.circular, pctT, "mock"),
        nordic: num(MOCK.nordic.circular, pctT, "mock"),
        local: num(0, pctT, "pack"),
        inhouse: num(0, pctT, "pack"),
      },
    },
  ];
}

/** Is Lindström's value the best of the providers that have a number for this row? */
export function lindstromLeads(row: CompareRow): boolean {
  if (!row.better) return false;
  const own = row.cells.lindstrom.value;
  if (own == null) return false;
  const others = (Object.keys(row.cells) as Provider["id"][]).filter((k) => k !== "lindstrom").map((k) => row.cells[k].value).filter((v): v is number => v != null);
  if (!others.length) return false;
  return row.better === "higher" ? others.every((v) => own > v) : others.every((v) => own < v);
}

export interface Reason {
  title: string;
  text: string;
  metricId?: string;
}

/** Why Lindström stands out: only claims the comparison table actually supports. */
export function whyLindstrom(r: Review): Reason[] {
  const rows = Object.fromEntries(compareRows(r).map((x) => [x.id, x]));
  const out: Reason[] = [];
  const c = (id: string, p: Provider["id"]) => rows[id]?.cells[p];
  if (rows.on_time && lindstromLeads(rows.on_time)) {
    out.push({
      title: "Reliable enough to plan production around",
      text: `${c("on_time", "lindstrom")!.text} of cycles back on time, against ${c("on_time", "rental")!.text} and ${c("on_time", "nordic")!.text} for the competing rental providers and ${c("on_time", "local")!.text} for a local laundry.`,
      metricId: "on_time_rate",
    });
  }
  const repairs = base(r, "repairs_total");
  if (repairs != null && repairs > 0) {
    out.push({
      title: "Repairs are part of the service",
      text: `${new Intl.NumberFormat("en-US").format(Math.round(repairs))} garments were repaired and kept in use as part of the service. The rental competitors repair on request or only selected garments; a wash-only or in-house laundry replaces them.`,
      metricId: "repairs_total",
    });
  }
  if (rows.water && lindstromLeads(rows.water)) {
    out.push({
      title: "Less water and energy for every kilo",
      text: `${c("water", "lindstrom")!.text} of fresh water against ${c("water", "local")!.text} at a local laundry and ${c("water", "inhouse")!.text} in-house; ${c("energy", "lindstrom")!.text} of energy against ${c("energy", "local")!.text}.`,
      metricId: "water_saving_l",
    });
  }
  const use = base(r, "allocation_use_rate");
  if (use != null) {
    out.push({
      title: "You can see every garment",
      text: `Per-garment tracking shows ${(use * 100).toFixed(1)}% of allocated garments in circulation, so idle stock can be found and right-sized. Without tracking it stays invisible.`,
      metricId: "allocation_use_rate",
    });
  }
  if (rows.circular && lindstromLeads(rows.circular)) {
    out.push({
      title: "Worn textiles get a second life",
      text: `${c("circular", "lindstrom")!.text} of textile waste is recycled, reused or recovered, against ${c("circular", "nordic")!.text} and ${c("circular", "rental")!.text} for the rental competitors; local and in-house laundries treat it as mixed waste.`,
      metricId: "circular_waste_share",
    });
  }
  return out.slice(0, 5);
}
