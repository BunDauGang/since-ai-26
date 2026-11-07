import type { Priority, SiteMetricKey } from "./types";

// Reference/master data mirrored from the synthetic data pack (Customers, Baselines,
// Industry_Priorities, Suggested_Prompts). Used for the controls and the offline lens.

export const CUSTOMERS = [
  { id: "CUST001", name: "NorthStar Foods Group", industry: "Food & Beverage", hq: "Finland", defaultPriority: "water" as Priority },
  { id: "CUST002", name: "Apex Industrial Systems", industry: "Manufacturing", hq: "Sweden", defaultPriority: "cost" as Priority },
  { id: "CUST003", name: "Mediora Health Network", industry: "Healthcare", hq: "Poland", defaultPriority: "service" as Priority },
];

export const BASELINES = [
  { id: "B_LOCAL", name: "Outsourced local laundry", short: "Local laundry", waterLPerKg: 9.5, energyKwhPerKg: 1.05, co2ePerKg: 0.655 },
  { id: "B_HOME", name: "Home washing", short: "Home washing", waterLPerKg: 20, energyKwhPerKg: 1.18, co2ePerKg: 0.78 },
  { id: "B_INHOUSE", name: "In-house customer laundry", short: "In-house laundry", waterLPerKg: 12.5, energyKwhPerKg: 1.12, co2ePerKg: 0.695 },
];

export interface PriorityDef {
  id: Priority;
  label: string;
  short: string;
  /** KPI ids emphasized offline. Mirrors PRIORITY_EMPHASIS in backend/insights/priority.py — keep in sync. */
  emphasized: string[];
  /** Site metric used for the spotlight chart. */
  siteMetric: SiteMetricKey;
  siteMetricLabel: string;
  /** "desc" = higher is better/more relevant; "asc" = show the weakest first. */
  siteSort: "desc" | "asc";
  timeseries?: string;
  headline: string;
  keywords: string[];
}

export const PRIORITIES: PriorityDef[] = [
  {
    id: "water",
    label: "Water",
    short: "Water",
    emphasized: ["water_saving_l", "customer_water_l", "washed_kg", "co2e_saving_kg"],
    siteMetric: "water_saving_l",
    siteMetricLabel: "Water saving by site (L)",
    siteSort: "desc",
    timeseries: "water_saving_l",
    headline: "Where the circular service saved fresh water — and which sites drive it.",
    keywords: ["water", "litre", "liter", "fresh water", "h2o"],
  },
  {
    id: "emissions",
    label: "Emissions",
    short: "CO₂e",
    emphasized: ["co2e_saving_kg", "customer_co2e_kg", "avoided_product_co2e_kg"],
    siteMetric: "co2e_saving_kg",
    siteMetricLabel: "CO₂e saving by site (kg)",
    siteSort: "desc",
    timeseries: "co2e_saving_kg",
    headline: "Process, delivery and product emissions avoided — with Scope 3 evidence boundaries.",
    keywords: ["emission", "co2", "carbon", "climate", "scope 3", "ghg", "energy"],
  },
  {
    id: "cost",
    label: "Cost",
    short: "Cost",
    emphasized: ["idle_value_eur", "idle_pieces", "allocation_use_rate", "replacements_postponed"],
    siteMetric: "idle_pieces",
    siteMetricLabel: "Idle allocated garments by site",
    siteSort: "desc",
    headline: "Allocation efficiency and illustrative capital tied in idle garments.",
    keywords: ["cost", "money", "eur", "budget", "spend", "allocation", "idle", "optimi", "saving money"],
  },
  {
    id: "circularity",
    label: "Circularity",
    short: "Circularity",
    emphasized: ["repairs_total", "replacements_postponed", "circular_waste_share", "textile_waste_kg"],
    siteMetric: "repairs_total",
    siteMetricLabel: "Repairs by site",
    siteSort: "desc",
    timeseries: "repairs_total",
    headline: "Repairs that extended garment life, and where textile waste ends up.",
    keywords: ["circular", "repair", "reuse", "recycl", "waste", "lifetime", "textile"],
  },
  {
    id: "service",
    label: "Service performance",
    short: "Service",
    emphasized: ["on_time_rate", "median_cycle_hours", "service_requests", "allocation_use_rate"],
    siteMetric: "on_time_rate",
    siteMetricLabel: "On-time cycle rate by site (weakest first)",
    siteSort: "asc",
    headline: "Delivery reliability, turnaround time and service requests across sites.",
    keywords: ["service", "delivery", "on-time", "on time", "late", "reliab", "turnaround", "hygiene", "continuity"],
  },
  {
    id: "improvement",
    label: "Next-year improvement",
    short: "Improve",
    emphasized: ["allocation_use_rate", "water_saving_l", "repairs_total", "on_time_rate"],
    siteMetric: "allocation_use_rate",
    siteMetricLabel: "Allocation use rate by site (weakest first)",
    siteSort: "asc",
    headline: "Where the biggest improvement opportunities sit for next year.",
    keywords: ["improve", "next year", "2026", "opportunit", "better", "recommend", "action"],
  },
];

export const priorityDef = (p: string): PriorityDef =>
  PRIORITIES.find((x) => x.id === p) ?? PRIORITIES[0];

/** Industry_Priorities sheet. */
export const INDUSTRY_RULES: Record<string, { rank: number; theme: string; emphasis: string; priority: Priority }[]> = {
  "Food & Beverage": [
    { rank: 1, theme: "Hygiene and compliance", emphasis: "Show service continuity, food-industry garment control and hygiene-related performance.", priority: "service" },
    { rank: 2, theme: "Water efficiency", emphasis: "Prioritize water use/savings and washed-kg efficiency.", priority: "water" },
    { rank: 3, theme: "Service reliability", emphasis: "Highlight turnaround, service-request-free days and delivery performance.", priority: "service" },
  ],
  Manufacturing: [
    { rank: 1, theme: "Cost and allocation efficiency", emphasis: "Highlight unused allocation, garments per wearer and optimization potential.", priority: "cost" },
    { rank: 2, theme: "Repair and lifetime", emphasis: "Highlight repairs, postponed replacements and circularity value.", priority: "circularity" },
    { rank: 3, theme: "Safety and availability", emphasis: "Highlight product/service reliability and exception signals.", priority: "service" },
  ],
  Healthcare: [
    { rank: 1, theme: "Hygiene and traceability", emphasis: "Prioritize garment flow, service-cycle completion and traceability.", priority: "service" },
    { rank: 2, theme: "Service continuity", emphasis: "Highlight turnaround and reliable availability.", priority: "service" },
    { rank: 3, theme: "Compliance-ready evidence", emphasis: "Highlight transparent sources, data quality and reporting boundaries.", priority: "improvement" },
  ],
};

/** Suggested_Prompts sheet — clickable demo chips. */
export const SUGGESTED_PROMPTS: { prompt: string; who: string; priority: Priority; view: ViewId }[] = [
  { who: "KAM", prompt: "Focus on water and emissions for the food-industry sites.", priority: "water", view: "overview" },
  { who: "KAM", prompt: "Which sites have the greatest textile-allocation optimization potential?", priority: "cost", view: "sites" },
  { who: "Customer", prompt: "Compare our circular service with local laundry.", priority: "circularity", view: "baselines" },
  { who: "Customer", prompt: "How can we improve our performance next year?", priority: "improvement", view: "observations" },
];

export type ViewId = "overview" | "sites" | "baselines" | "observations" | "methodology";

export const FLAG_LABELS: Record<string, { label: string; tone: "red" | "amber" | "blue" }> = {
  R1_LOW_ALLOCATION_USE: { label: "R1 Low allocation use", tone: "amber" },
  R2_HIGH_REPAIR_RATE: { label: "R2 High repair rate", tone: "red" },
  R3_LATE_CYCLES: { label: "R3 Late cycles", tone: "red" },
  R4_SERVICE_REQUESTS: { label: "R4 Service requests", tone: "amber" },
  R5_WATER_PRIORITY: { label: "R5 Water priority", tone: "blue" },
  R6_DATA_GAP: { label: "R6 Data gap", tone: "blue" },
  DQ4: { label: "DQ4 Laundry volume check", tone: "blue" },
};

export const SITE_METRIC_META: Record<SiteMetricKey, { label: string; unit: string }> = {
  wearers_min_est: { label: "Wearers (min est.)", unit: "wearers" },
  garments_allocated: { label: "Garments allocated", unit: "pieces" },
  allocation_use_rate: { label: "Allocation use", unit: "ratio" },
  idle_pieces: { label: "Idle pieces", unit: "pieces" },
  washed_kg: { label: "Washed kg", unit: "kg" },
  repairs_total: { label: "Repairs", unit: "repairs" },
  repair_rate_per_1000: { label: "Repairs / 1,000 washes", unit: "per 1,000" },
  on_time_rate: { label: "On-time rate", unit: "ratio" },
  median_cycle_hours: { label: "Median cycle", unit: "hours" },
  service_requests: { label: "Service requests", unit: "requests" },
  water_saving_l: { label: "Water saving", unit: "L" },
  co2e_saving_kg: { label: "CO₂e saving", unit: "kgCO2e" },
};

/** Offline fallback for /api/interpret: keyword scoring, first match wins on ties by list order. */
export function interpretPromptOffline(text: string, industry: string): { priority: Priority; secondary: Priority[]; matched: boolean } {
  const t = text.toLowerCase();
  const scores = PRIORITIES.map((p) => ({ id: p.id, score: p.keywords.reduce((s, k) => s + (t.includes(k) ? 1 : 0), 0) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scores.length === 0) {
    const rank1 = INDUSTRY_RULES[industry]?.[0]?.priority ?? "water";
    return { priority: rank1, secondary: [], matched: false };
  }
  return { priority: scores[0].id, secondary: scores.slice(1).map((s) => s.id), matched: true };
}

/** Readable labels used when the engine sends id-style labels ("Water saving l"). */
export const METRIC_LABELS: Record<string, string> = {
  delivery_sites: "Delivery sites",
  wearers_min_est: "Active wearers (min. deduplicated est.)",
  wearer_product_assignments: "Wearer-product assignments",
  garments_allocated: "Garments allocated",
  washed_kg: "Washed textile volume",
  allocation_use_rate: "Allocation use rate",
  idle_pieces: "Unscanned / idle allocated garments",
  idle_value_eur: "Illustrative capital tied in idle stock",
  wash_frequency: "Wash frequency",
  service_requests: "Service requests",
  on_time_rate: "On-time service cycles",
  median_cycle_hours: "Median service-cycle time",
  repairs_total: "Repairs completed",
  repair_rate_per_1000: "Repair rate per 1,000 washes",
  replacements_postponed: "Replacements postponed (est.)",
  avoided_product_co2e_kg: "Avoided new-product CO₂e",
  customer_water_l: "Allocated fresh-water use",
  customer_energy_kwh: "Allocated laundry energy use",
  customer_co2e_kg: "Allocated process + delivery CO₂e",
  textile_waste_kg: "Allocated textile waste",
  circular_waste_share: "Circular share of textile waste",
  water_saving_l: "Water saving",
  energy_saving_kwh: "Energy saving",
  co2e_saving_kg: "CO₂e saving",
};

export const HANDPRINT_IDS = ["water_saving_l", "energy_saving_kwh", "co2e_saving_kg"];

/** "NorthStar Helsinki" → "Helsinki" for compact chart labels (any customer, not just NorthStar). */
export function shortSiteName(siteName: string, customerName: string): string {
  const brand = customerName.split(" ")[0];
  return brand && siteName.startsWith(`${brand} `) ? siteName.slice(brand.length + 1) : siteName;
}

/**
 * Outlier rules worth highlighting in red. R3 ("below the customer average") is true for roughly
 * half the sites by construction and DQ* flags are data issues, so they show as chips only.
 */
const OUTLIER_RULES = ["R1_", "R2_", "R4_"];
export const isOutlier = (s: { flags: string[] }) => s.flags.some((f) => OUTLIER_RULES.some((r) => f.startsWith(r)));
