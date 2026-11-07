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

/** An action agreed in an earlier meeting, brought back with its status (steering question 3). */
export interface PreviousAction {
  id: string;
  text: string;
  owner: string;
  due: string;
  status: "open" | "in_progress" | "done";
}

export const PRIORITY_CHOICES = ["Cost", "Water", "Emissions", "Circularity", "Service reliability", "Garment availability", "Hygiene & safety"];

/** Overdue = not done and the due date has passed. */
export function isOverdue(a: PreviousAction, today = new Date().toISOString().slice(0, 10)): boolean {
  return a.status !== "done" && !!a.due && a.due < today;
}

export interface MeetingState {
  persona: Persona;
  /** Free-text role when the audience is not one of the four personas, e.g. "Head of Procurement". */
  audienceLabel: string;
  /** The customer's ranked priorities for the next 6–12 months (steering question 2), plus a free-text note. */
  priorities: string[];
  priorityNote: string;
  /** Month of the last steering committee (YYYY-MM): "since last meeting" compares before vs after it. */
  lastSteerCo: string;
  previousActions: PreviousAction[];
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
    audienceLabel: "",
    priorities: [],
    priorityNote: "",
    lastSteerCo: "",
    previousActions: [],
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
  const target_results = TARGETS.map((t) => {
    const target = m.targets[t.id] ?? t.defaultTarget;
    const actual = t.actual(r);
    return { metric_id: t.id, label: t.label, target, actual, status: targetStatus(t, target, actual), unit: t.unit };
  });
  return {
    persona: m.persona,
    targets: Object.fromEntries(target_results.map((t) => [t.metric_id, t.target])),
    target_results,
    satisfaction: { score: m.satisfaction.score, scale: 10, source: "KAM input", comment: m.satisfaction.comment },
    ...(m.rough && rough
      ? {
          rough_calc: {
            label: "ROUGH CALCULATION" as const,
            inputs: {
              baseline_id: m.rough.baselineId,
              water_eur_per_m3: m.rough.waterEurPerM3,
              energy_eur_per_kwh: m.rough.energyEurPerKwh,
              carbon_eur_per_t: m.rough.carbonEurPerT,
              garment_eur: m.rough.garmentEur,
              repair_share: m.rough.repairShare,
            },
            result_eur: Math.round(rough.total.base),
            range_eur: { low: Math.round(rough.total.low), base: Math.round(rough.total.base), high: Math.round(rough.total.high) },
            lines: rough.lines.map((l) => ({ label: l.label, eur: Math.round(l.eur.base) })),
          },
        }
      : {}),
    agreed_actions: [
      ...m.actions.filter((a) => a.agreed).map(actionText),
      // Commitments from the last meeting that are still open travel with the new agreement.
      ...m.previousActions
        .filter((a) => a.status !== "done")
        .map((a) => `${actionText(a)} [carried over from last meeting: ${isOverdue(a) ? "overdue" : a.status === "in_progress" ? "in progress" : "open"}]`),
    ],
    open_topics: m.openTopics,
    persona_label: m.audienceLabel.trim() || personaDef(m.persona).role,
    next_meeting: m.nextMeeting,
    notes: [
      m.priorities.length || m.priorityNote.trim()
        ? `Customer priorities for the next 6–12 months: ${m.priorities.map((p, i) => `${i + 1}. ${p}`).join("; ")}${m.priorityNote.trim() ? `${m.priorities.length ? ". " : ""}${m.priorityNote.trim()}` : ""}`
        : "",
      m.notes.trim(),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** "Review allocation (owner: Customer, by 2026-03-01)". */
export function actionText(a: { text: string; owner: string; due: string }): string {
  const extra = [a.owner && `owner: ${a.owner}`, a.due && `by ${a.due}`].filter(Boolean).join(", ");
  return extra ? `${a.text} (${extra})` : a.text;
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
  if (m.priorities.length || m.priorityNote.trim()) {
    lines.push("## Customer priorities for the next 6–12 months");
    m.priorities.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
    if (m.priorityNote.trim()) lines.push(m.priorityNote.trim());
    lines.push("");
  }
  if (m.previousActions.length) {
    lines.push("## Actions from the last meeting");
    for (const a of m.previousActions) lines.push(`- ${actionText(a)}: ${a.status === "done" ? "done" : isOverdue(a) ? "OVERDUE" : a.status === "in_progress" ? "in progress" : "open"}`);
    lines.push("");
  }
  lines.push("## Agreed KPIs");
  for (const t of b.target_results) {
    const def = TARGETS.find((d) => d.id === t.metric_id)!;
    lines.push(`- ${t.label}: target ${def.dir === "min" ? "≥" : "≤"} ${formatTarget(def.unit, t.target)}, actual ${t.actual == null ? "n/a" : formatTarget(def.unit, t.actual)} (${t.status})`);
  }
  if (b.satisfaction.score != null || b.satisfaction.comment) {
    lines.push(`- Customer satisfaction (KAM input): ${b.satisfaction.score ?? "–"}/10${b.satisfaction.comment ? `. ${b.satisfaction.comment}` : ""}`);
  }
  if (b.rough_calc) {
    lines.push("");
    lines.push("## Rough calculation (KAM assumptions, not a quote)");
    for (const l of b.rough_calc.lines) lines.push(`- ${l.label}: ${eur(l.eur)}`);
    lines.push(`- Total: about ${eur(b.rough_calc.result_eur)} (range ${eur(b.rough_calc.range_eur.low)} to ${eur(b.rough_calc.range_eur.high)})`);
  }
  lines.push("");
  lines.push("## Agreed next steps");
  if (b.agreed_actions.length) for (const a of b.agreed_actions) lines.push(`- ${a}`);
  else lines.push("- None recorded yet.");
  lines.push("");
  lines.push("## Open topics for the next meeting");
  if (b.open_topics.length) for (const t of b.open_topics) lines.push(`- ${t}`);
  else lines.push("- None recorded.");
  if (b.next_meeting) lines.push("", `Next meeting: ${b.next_meeting}`);
  if (m.notes.trim()) lines.push("", "## Notes", m.notes.trim());
  return lines.join("\n") + "\n";
}
