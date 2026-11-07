import { personaDef, type Persona } from "./personas";
import { roughCalc, type RoughInputs } from "./roughcalc";
import type { MeetingBlock, Review } from "./types";

/*
 * State of one customer meeting: agreed targets, satisfaction (KAM input), the rough calculation,
 * agreed actions and open topics. Kept in the viewer's browser only (a convenience, not a record)
 * and sent with the review to /api/export so the customer deck can carry the agreed next steps.
 */

export interface TargetDef {
  id: string;
  label: string;
  /** "min" = actual should be at least the target; "max" = at most. */
  dir: "min" | "max";
  unit: "ratio" | "hours" | "rate" | "per100";
  defaultTarget: number;
  step: number;
  actual: (r: Review) => number | null;
}

const base = (r: Review, id: string) => r.metrics.find((m) => m.id === id)?.value.base ?? null;

export const TARGETS: TargetDef[] = [
  { id: "on_time_rate", label: "On-time delivery", dir: "min", unit: "ratio", defaultTarget: 0.98, step: 0.005, actual: (r) => base(r, "on_time_rate") },
  { id: "median_cycle_hours", label: "Typical cycle time (median)", dir: "max", unit: "hours", defaultTarget: 96, step: 1, actual: (r) => base(r, "median_cycle_hours") },
  { id: "allocation_use_rate", label: "Garments in circulation", dir: "min", unit: "ratio", defaultTarget: 0.85, step: 0.005, actual: (r) => base(r, "allocation_use_rate") },
  { id: "repair_rate_per_1000", label: "Repairs per 1,000 washes", dir: "max", unit: "rate", defaultTarget: 20, step: 0.5, actual: (r) => base(r, "repair_rate_per_1000") },
  {
    id: "requests_per_100_wearers",
    label: "Service requests per 100 wearers",
    dir: "max",
    unit: "per100",
    defaultTarget: 6,
    step: 0.5,
    actual: (r) => {
      const q = base(r, "service_requests");
      const w = base(r, "wearers_min_est");
      return q != null && w ? (q / w) * 100 : null;
    },
  },
];

export type TargetStatus = "met" | "close" | "missed" | "unknown";

/** Met, close (within 3% of the target) or missed. */
export function targetStatus(def: TargetDef, target: number, actual: number | null): TargetStatus {
  if (actual == null || !Number.isFinite(actual)) return "unknown";
  const ok = def.dir === "min" ? actual >= target : actual <= target;
  if (ok) return "met";
  const gap = Math.abs(actual - target) / Math.max(Math.abs(target), 1e-9);
  return gap <= 0.03 ? "close" : "missed";
}

export function formatTarget(unit: TargetDef["unit"], v: number): string {
  if (unit === "ratio") return `${(v * 100).toFixed(1)}%`;
  if (unit === "hours") return `${v.toFixed(0)} h`;
  return v.toFixed(1);
}

export interface MeetingAction {
  id: string;
  text: string;
  owner: string;
  due: string;
  agreed: boolean;
  source: "observation" | "kam";
}

export interface MeetingState {
  persona: Persona;
  targets: Record<string, number>;
  satisfaction: { score: number | null; comment: string };
  rough: RoughInputs | null;
  actions: MeetingAction[];
  openTopics: string[];
  nextMeeting: string;
  notes: string;
}

export function emptyMeeting(persona: Persona = "ceo"): MeetingState {
  return {
    persona,
    targets: Object.fromEntries(TARGETS.map((t) => [t.id, t.defaultTarget])),
    satisfaction: { score: null, comment: "" },
    rough: null,
    actions: [],
    openTopics: [],
    nextMeeting: "",
    notes: "",
  };
}

const KEY = (customerId: string) => `lindstrom-meeting-v1:${customerId}`;

export function loadMeeting(customerId: string): MeetingState | null {
  try {
    const raw = window.localStorage.getItem(KEY(customerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MeetingState>;
    const fresh = emptyMeeting(parsed.persona);
    return { ...fresh, ...parsed, targets: { ...fresh.targets, ...(parsed.targets ?? {}) }, satisfaction: { ...fresh.satisfaction, ...(parsed.satisfaction ?? {}) } };
  } catch {
    return null;
  }
}

export function saveMeeting(customerId: string, m: MeetingState) {
  try {
    window.localStorage.setItem(KEY(customerId), JSON.stringify(m));
  } catch {
    /* private window or blocked storage: the meeting still works, it just is not remembered */
  }
}

/** The block sent to /api/export (contract: optional review.meeting). */
export function meetingBlock(r: Review, m: MeetingState): MeetingBlock {
  const rough = m.rough ? roughCalc(r, m.rough) : null;
  return {
    persona: m.persona,
    persona_label: personaDef(m.persona).role,
    targets: TARGETS.map((t) => {
      const target = m.targets[t.id] ?? t.defaultTarget;
      const actual = t.actual(r);
      return { metric_id: t.id, label: t.label, target, actual, status: targetStatus(t, target, actual), unit: t.unit };
    }),
    satisfaction: { score: m.satisfaction.score, scale: 10, comment: m.satisfaction.comment, source: "KAM input" },
    rough_calc:
      m.rough && rough
        ? {
            label: "ROUGH CALCULATION",
            baseline_id: m.rough.baselineId,
            inputs: {
              water_eur_per_m3: m.rough.waterEurPerM3,
              energy_eur_per_kwh: m.rough.energyEurPerKwh,
              carbon_eur_per_t: m.rough.carbonEurPerT,
              garment_eur: m.rough.garmentEur,
              repair_share: m.rough.repairShare,
            },
            lines: rough.lines.map((l) => ({ label: l.label, eur_base: Math.round(l.eur.base) })),
            total_eur: { low: Math.round(rough.total.low), base: Math.round(rough.total.base), high: Math.round(rough.total.high) },
          }
        : null,
    agreed_actions: m.actions.filter((a) => a.agreed).map((a) => ({ text: a.text, owner: a.owner, due: a.due })),
    open_topics: m.openTopics,
    next_meeting: m.nextMeeting,
    notes: m.notes,
  };
}

const eur = (n: number) => `€${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)}`;

/** Plain-text meeting summary for the customer (download as .md or paste into an email). */
export function meetingMarkdown(r: Review, m: MeetingState): string {
  const b = meetingBlock(r, m);
  const lines: string[] = [];
  lines.push(`# ${r.meta.customer_name}: customer review summary`);
  lines.push("");
  lines.push(`Period ${r.meta.period.from} to ${r.meta.period.to} · compared with ${r.meta.baseline_name.toLowerCase()} · prepared for: ${b.persona_label}`);
  lines.push("");
  lines.push("> Synthetic prototype data. Estimates are not audited and are not approved Lindström or customer claims.");
  lines.push("");
  lines.push("## Agreed KPIs");
  for (const t of b.targets) {
    const def = TARGETS.find((d) => d.id === t.metric_id)!;
    lines.push(`- ${t.label}: target ${def.dir === "min" ? "≥" : "≤"} ${formatTarget(def.unit, t.target)}, actual ${t.actual == null ? "n/a" : formatTarget(def.unit, t.actual)} (${t.status})`);
  }
  if (b.satisfaction.score != null || b.satisfaction.comment) {
    lines.push(`- Customer satisfaction (KAM input): ${b.satisfaction.score ?? "–"}/10${b.satisfaction.comment ? `. ${b.satisfaction.comment}` : ""}`);
  }
  if (b.rough_calc) {
    lines.push("");
    lines.push("## Rough calculation (KAM assumptions, not a quote)");
    for (const l of b.rough_calc.lines) lines.push(`- ${l.label}: ${eur(l.eur_base)}`);
    lines.push(`- Total: about ${eur(b.rough_calc.total_eur.base)} (range ${eur(b.rough_calc.total_eur.low)} to ${eur(b.rough_calc.total_eur.high)})`);
  }
  lines.push("");
  lines.push("## Agreed next steps");
  if (b.agreed_actions.length) for (const a of b.agreed_actions) lines.push(`- ${a.text}${a.owner ? ` (owner: ${a.owner}` : ""}${a.owner && a.due ? `, by ${a.due})` : a.owner ? ")" : a.due ? ` (by ${a.due})` : ""}`);
  else lines.push("- None recorded yet.");
  lines.push("");
  lines.push("## Open topics for the next meeting");
  if (b.open_topics.length) for (const t of b.open_topics) lines.push(`- ${t}`);
  else lines.push("- None recorded.");
  if (b.next_meeting) lines.push("", `Next meeting: ${b.next_meeting}`);
  if (b.notes.trim()) lines.push("", "## Notes", b.notes.trim());
  return lines.join("\n") + "\n";
}
