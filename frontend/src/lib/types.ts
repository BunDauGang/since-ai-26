// Types mirroring contracts/review.schema.json + contracts/sample_review.json.
// Do not invent field names here — update the contract (Lead) first.

export type Sensitivity = "low" | "base" | "high";

export type Priority =
  | "water"
  | "emissions"
  | "cost"
  | "circularity"
  | "service"
  | "improvement";

export type EvidenceStatus =
  | "MEASURED"
  | "CALCULATED"
  | "ALLOCATED_ESTIMATE"
  | "ESTIMATE"
  | "SYNTHETIC"
  | "PUBLIC_REFERENCE";

export type Range = { low: number; base: number; high: number };

export type MetricCategory =
  | "scale"
  | "allocation"
  | "service"
  | "repair"
  | "footprint"
  | "handprint";

export interface Metric {
  id: string;
  label: string;
  category: MetricCategory | string;
  value: Range;
  unit: string;
  status: EvidenceStatus | string;
  formula: string;
  sources: string[];
  assumptions: string[];
  confidence: string;
  /** Optional engine detail (Worker A). Absent in the hand-made sample. */
  breakdown?: {
    by_site?: { site_id: string; value: number }[];
    by_product?: { product_id: string; value: number }[];
    by_month?: TimePoint[];
    by_route?: { route: string; value: number | null }[];
    by_repair_type?: { repair_type: string; value: number | null }[];
  };
}

export type SiteMetricKey =
  | "wearers_min_est"
  | "garments_allocated"
  | "allocation_use_rate"
  | "idle_pieces"
  | "washed_kg"
  | "repairs_total"
  | "repair_rate_per_1000"
  | "on_time_rate"
  | "median_cycle_hours"
  | "service_requests"
  | "water_saving_l"
  | "co2e_saving_kg";

export interface Site {
  site_id: string;
  site_name: string;
  country: string;
  city: string;
  site_type: string;
  laundry_id: string;
  metrics: Partial<Record<SiteMetricKey, number>>;
  flags: string[];
}

export interface Product {
  product_id: string;
  product_name: string;
  product_group: string;
  metrics: Record<string, number>;
}

export interface TimePoint {
  month: string;
  value: number;
}

export interface BaselineComparison {
  baseline_id: string;
  name: string;
  water_saving_l: Range;
  energy_saving_kwh: Range;
  co2e_saving_kg: Range;
}

export interface Observation {
  id?: string;
  title: string;
  observation: string;
  recommended_action: string;
  owner: string;
  steering_question: string;
  metric_ids: string[];
  site_ids: string[];
  status: string;
  confidence: string;
}

export interface DataQualityItem {
  check_id: string;
  dataset: string;
  severity: "info" | "warning" | "error" | string;
  message: string;
  affected_rows?: number;
  treatment?: string;
}

export interface Assumption {
  id: string;
  assumption: string;
  value_or_rule: string;
  rationale: string;
  category: string;
  confidence: string;
  source?: string;
}

export interface DataGap {
  gap: string;
  impact: string;
  future_source: string;
}

export interface Review {
  meta: {
    customer_id: string;
    customer_name: string;
    industry: string;
    segment: string;
    hq_country: string;
    period: { from: string; to: string };
    baseline_id: string;
    baseline_name: string;
    sensitivity: Sensitivity;
    priority: Priority | string;
    generated_at: string;
    data_notice: string;
  };
  metrics: Metric[];
  sites: Site[];
  products: Product[];
  timeseries: Record<string, TimePoint[]>;
  baseline_comparison: BaselineComparison[];
  priority_view: {
    priority: Priority | string;
    emphasized_metric_ids: string[];
    industry_rules: string[];
  };
  observations: Observation[];
  data_quality: DataQualityItem[];
  assumptions: Assumption[];
  data_gaps: DataGap[];
}

export interface ReviewRequest {
  customer_id: string;
  period_from: string;
  period_to: string;
  baseline_id: string;
  sensitivity: Sensitivity;
  priority: Priority;
  prompt?: string;
}
