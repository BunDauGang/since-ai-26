import { shortSiteName } from "./config";
import { full, pct } from "./format";
import type { Metric, Priority, Review, Site } from "./types";

/*
 * Persona-driven story for the customer meeting (mentor feedback: "the story part supersedes
 * everything"; a CEO hears a different story than a CFO). Every number comes from review.json;
 * the persona only decides which numbers lead and how they are framed.
 */

export type Persona = "ceo" | "cfo" | "operations" | "sustainability";

export interface PersonaDef {
  id: Persona;
  label: string;
  role: string;
  /** What this person cares about, in one line (shown under the picker). */
  cares: string;
  /** Dashboard lens that fits this persona (the deep-dive tabs and the export follow it). */
  priority: Priority | "industry";
  /** Headline KPI ids for the executive summary, in order. */
  stats: string[];
}

export const PERSONAS: PersonaDef[] = [
  {
    id: "ceo",
    label: "CEO",
    role: "Chief Executive",
    cares: "The big picture: is this a reliable partner that supports our strategy?",
    priority: "improvement",
    stats: ["on_time_rate", "co2e_saving_kg", "repairs_total", "allocation_use_rate"],
  },
  {
    id: "cfo",
    label: "CFO",
    role: "Chief Financial Officer",
    cares: "Value for money: what we get, what is tied up, what we could save.",
    priority: "cost",
    stats: ["replacements_postponed", "allocation_use_rate", "idle_pieces", "on_time_rate"],
  },
  {
    id: "operations",
    label: "Operations",
    role: "Operations / site manager",
    cares: "Day-to-day service: deliveries on time, fast cycles, few issues.",
    priority: "service",
    stats: ["on_time_rate", "median_cycle_hours", "service_requests", "repairs_total"],
  },
  {
    id: "sustainability",
    label: "Sustainability",
    role: "Sustainability manager",
    cares: "Credible environmental value with clear evidence limits.",
    priority: "industry",
    stats: ["water_saving_l", "co2e_saving_kg", "energy_saving_kwh", "circular_waste_share"],
  },
];

export const personaDef = (p: Persona): PersonaDef => PERSONAS.find((x) => x.id === p) ?? PERSONAS[0];

/** Lens for a persona; sustainability keeps the customer's own water/emissions focus. */
export function personaPriority(p: Persona, customerDefault: Priority): Priority {
  const d = personaDef(p).priority;
  if (d !== "industry") return d;
  return customerDefault === "water" || customerDefault === "emissions" ? customerDefault : "emissions";
}

const get = (r: Review, id: string): Metric | undefined => r.metrics.find((m) => m.id === id);

/** Human value for a metric: 98.3%, 1.4 million L, 255 t CO₂e, 82 h, 15,233. */
export function sayValue(m: Metric, v = m.value.base): string {
  if (m.unit === "ratio") return pct(v, 1);
  if (m.unit === "EUR") return `€${full(v, 0)}`;
  if (m.unit === "kgCO2e") return v >= 1000 ? `${full(v / 1000, 0)} t CO₂e` : `${full(v, 0)} kg CO₂e`;
  if (m.unit === "L") return v >= 1e6 ? `${full(v / 1e6, 1)} million L` : `${full(v, 0)} L`;
  if (m.unit === "kWh") return v >= 1e6 ? `${full(v / 1e6, 1)} GWh` : v >= 1e4 ? `${full(v / 1000, 0)} MWh` : `${full(v, 0)} kWh`;
  if (m.unit === "kg") return v >= 1e4 ? `${full(v / 1000, 0)} t` : `${full(v, 0)} kg`;
  if (m.unit === "hours") return `${full(v, 0)} h`;
  if (m.unit.startsWith("repairs/1000")) return `${full(v, 1)} / 1,000 washes`;
  return full(v, 0);
}

/** Plain-language meaning under a headline number (customer-safe). */
export function meaning(id: string, r: Review): string {
  const alt = r.meta.baseline_name.toLowerCase();
  const map: Record<string, string> = {
    on_time_rate: "of laundry cycles delivered back on time",
    co2e_saving_kg: `less CO₂e than ${alt} (estimate)`,
    water_saving_l: `less fresh water than ${alt} (estimate)`,
    energy_saving_kwh: `less energy than ${alt} (estimate)`,
    repairs_total: "garments repaired and kept in use",
    replacements_postponed: "replacement purchases postponed by repairs (estimate)",
    allocation_use_rate: "of allocated garments in active circulation",
    idle_pieces: "garments not seen in circulation in the latest month: room to right-size",
    median_cycle_hours: "typical time from pickup to delivery back",
    service_requests: "service requests raised during the period",
    circular_waste_share: "of textile waste recycled, reused or recovered",
    washed_kg: "of workwear washed for you",
    wearers_min_est: "people wear Lindström workwear (at least)",
  };
  return map[id] ?? get(r, id)?.label ?? id;
}

export interface StoryPoint {
  text: string;
  metricIds: string[];
}

export interface PersonaStory {
  headline: string;
  opening: string;
  points: StoryPoint[];
  ask: string;
}

const sites = (n: number) => `${n} site${n === 1 ? "" : "s"}`;
const sitesWith = (r: Review, rule: string) => r.sites.filter((s) => s.flags.some((f) => f.startsWith(rule)));

function names(r: Review, sites: { site_name: string }[], max = 2): string {
  const n = sites.slice(0, max).map((s) => shortSiteName(s.site_name, r.meta.customer_name));
  return sites.length > max ? `${n.join(", ")} and ${sites.length - max} more` : n.join(" and ");
}

/** Three-point talk track for a persona, built only from the review's own numbers. */
export function personaStory(r: Review, p: Persona): PersonaStory {
  const m = (id: string) => get(r, id);
  const countries = Array.from(new Set(r.sites.map((s) => s.country)));
  const scale = `${r.sites.length} sites in ${countries.length} ${countries.length === 1 ? "country" : "countries"}`;
  const alt = r.meta.baseline_name.toLowerCase();
  const onTime = m("on_time_rate");
  const co2 = m("co2e_saving_kg");
  const water = m("water_saving_l");
  const repairs = m("repairs_total");
  const postponed = m("replacements_postponed");
  const use = m("allocation_use_rate");
  const idle = m("idle_pieces");
  const cycle = m("median_cycle_hours");
  const requests = m("service_requests");
  const waste = m("circular_waste_share");
  // Weakest first, so the names said out loud are the most relevant ones.
  const by = (key: "allocation_use_rate" | "on_time_rate" | "service_requests", dir: 1 | -1) => (a: Site, b: Site) =>
    ((a.metrics[key] ?? 0) - (b.metrics[key] ?? 0)) * dir;
  const r1 = sitesWith(r, "R1_").sort(by("allocation_use_rate", 1));
  const r3 = sitesWith(r, "R3_").sort(by("on_time_rate", 1));
  const r4 = sitesWith(r, "R4_").sort(by("service_requests", -1));
  const points: StoryPoint[] = [];
  const push = (cond: unknown, text: string, metricIds: string[]) => {
    if (cond) points.push({ text, metricIds });
  };

  if (p === "ceo") {
    push(onTime, `Reliable service at scale: ${onTime && sayValue(onTime)} of laundry cycles came back on time across ${scale}.`, ["on_time_rate"]);
    push(co2, `Measurable sustainability value: about ${co2 && sayValue(co2)} less than ${alt}, with a stated range.`, ["co2e_saving_kg"]);
    push(use && r1.length, `One clear opportunity: ${use && sayValue(use)} of garments are in circulation; ${sites(r1.length)} (${names(r, r1)}) ${r1.length === 1 ? "is" : "are"} the place to start.`, ["allocation_use_rate"]);
    return {
      headline: `A reliable partner across ${scale}`,
      opening: `Thank you for the year. In two minutes: how the service performed, the value it created, and one thing we can improve together.`,
      points,
      ask: "Agree one improvement pilot for 2026 and a joint check-in in six months.",
    };
  }
  if (p === "cfo") {
    push(repairs && postponed, `Repairs protect your budget: ${repairs && full(repairs.value.base, 0)} repairs postponed an estimated ${postponed && full(postponed.value.low, 0)}–${postponed && full(postponed.value.base, 0)} garment replacements.`, ["repairs_total", "replacements_postponed"]);
    push(idle && use, `Stock we can right-size together: ${idle && full(idle.value.base, 0)} garments were not seen in circulation (${use && sayValue(use)} in use); some are a deliberate buffer, so we review before we remove.`, ["idle_pieces", "allocation_use_rate"]);
    push(onTime, `No hidden cost of downtime: ${onTime && sayValue(onTime)} on-time delivery keeps production running.`, ["on_time_rate"]);
    return {
      headline: "Value you can see, and stock we can right-size together",
      opening: "Let's look at what the service gives you for the money, and where there is room to be more efficient.",
      points,
      ask: "Share contract and invoice data, so next year's review shows cost in euros instead of estimates.",
    };
  }
  if (p === "operations") {
    push(onTime && cycle, `Service you can plan around: ${onTime && sayValue(onTime)} on time, with a typical cycle of ${cycle && sayValue(cycle)} from pickup to delivery.`, ["on_time_rate", "median_cycle_hours"]);
    push(r3.length, `Where cycles run late: ${sites(r3.length)} (${names(r, r3)}) ${r3.length === 1 ? "has" : "have"} more late cycles than the rest; worth a route review.`, ["on_time_rate"]);
    push(requests, `Service requests: ${requests && full(requests.value.base, 0)} in the period${r4.length ? `, clustered at ${names(r, r4)}` : ""}. Knowing the causes would help us fix them at the source.`, ["service_requests"]);
    return {
      headline: "Service you can plan around",
      opening: "Let's go through how the service ran on the ground, site by site, and where we can make it smoother.",
      points,
      ask: "Nominate a contact at each flagged site for a joint service review.",
    };
  }
  push(water, `Water: about ${water && sayValue(water)} less fresh water than ${alt}, range ${water && sayValue(water, water.value.low)} to ${water && sayValue(water, water.value.high)}.`, ["water_saving_l"]);
  push(co2, `Climate: about ${co2 && sayValue(co2)} less than ${alt}, range ${co2 && sayValue(co2, co2.value.low)} to ${co2 && sayValue(co2, co2.value.high)}.`, ["co2e_saving_kg"]);
  push(waste, `Circularity: ${waste && sayValue(waste)} of textile waste was recycled, reused or recovered, and repairs kept garments in use.`, ["circular_waste_share", "repairs_total"]);
  return {
    headline: "Environmental value with honest ranges",
    opening: "These are estimates with stated ranges, not audited figures. Let's agree which of them you can use and what we still need to verify.",
    points,
    ask: "Agree which figures go into your sustainability report once Lindström's factors are approved.",
  };
}
