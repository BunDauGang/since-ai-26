import { API_URL } from "./api";
import { formatCompare, trend, type Comparison } from "./comparison";
import { INDUSTRY_RULES, inScope, interpretScope, shortSiteName } from "./config";
import { full, pct } from "./format";
import { formatTarget, isOverdue, TARGETS, targetStatus, type MeetingState } from "./meeting";
import { buildObjections } from "./objections";
import { sayValue } from "./personas";
import { defaultRoughInputs, roughCalc } from "./roughcalc";
import type { Review } from "./types";
import { simulate } from "./whatif";

/*
 * Meeting Prep AI: "AI writes, the engine counts". Answers to the steering-committee questions (and free
 * requests) are built from review.json, the meeting record and the period comparison. An optional AI endpoint
 * (POST /api/prep, owned by insights/API) may rephrase them; its text must not contain digits: numbers enter
 * only through {{metric_id}} placeholders that this file fills from the review. Anything else falls back to
 * the template, so the prep never depends on the network.
 */

export interface PrepPoint {
  text: string;
  metricIds?: string[];
  siteIds?: string[];
}

export interface PrepAnswer {
  questionId: string;
  question: string;
  readiness: "ready" | "partial" | "needs_input";
  answer: string;
  points: PrepPoint[];
  /** What the data cannot answer yet, or what to ask the customer. */
  gap?: string;
}

export const STEERCO_QUESTIONS = [
  { id: "q1", text: "What outcomes has the customer achieved since the last steering committee, and how are they measured?" },
  { id: "q2", text: "What are the customer's most important business and sustainability priorities for the next 6–12 months?" },
  { id: "q3", text: "Which delivery issues, risks or unresolved commitments need steering-level intervention?" },
  { id: "q4", text: "Which improvements or expansion opportunities offer the strongest value (cost, sustainability, operations)?" },
  { id: "q5", text: "What decisions are needed today, who owns each action, and by when?" },
];

export interface PrepContext {
  review: Review;
  meeting: MeetingState;
  comparison: Comparison;
  audience: string;
}

const m = (r: Review, id: string) => r.metrics.find((x) => x.id === id);
const site = (r: Review, id: string) => r.sites.find((s) => s.site_id === id);
const short = (r: Review, name: string) => shortSiteName(name, r.meta.customer_name);
const names = (r: Review, sites: { site_name: string }[], max = 3) =>
  sites.length > max ? `${sites.slice(0, max).map((s) => short(r, s.site_name)).join(", ")} and ${sites.length - max} more` : sites.map((s) => short(r, s.site_name)).join(", ");

const PRIORITY_EVIDENCE: Record<string, { metricIds: string[]; watch: string }> = {
  Cost: { metricIds: ["allocation_use_rate", "idle_pieces", "replacements_postponed"], watch: "garments in circulation and repairs that postpone purchases" },
  Water: { metricIds: ["water_saving_l", "customer_water_l"], watch: "water saving against the chosen alternative" },
  Emissions: { metricIds: ["co2e_saving_kg", "customer_co2e_kg"], watch: "CO₂e saving and the service footprint" },
  Circularity: { metricIds: ["circular_waste_share", "repairs_total"], watch: "repairs and the recycled share of textile waste" },
  "Service reliability": { metricIds: ["on_time_rate", "median_cycle_hours"], watch: "on-time delivery and cycle time" },
  "Garment availability": { metricIds: ["allocation_use_rate", "service_requests"], watch: "garments in circulation and service requests" },
};

function q1(c: PrepContext): PrepAnswer {
  const { review: r, comparison: cmp } = c;
  const q = STEERCO_QUESTIONS[0];
  if (!cmp.split || !cmp.items.length) {
    return {
      questionId: q.id,
      question: q.text,
      readiness: "partial",
      answer: `For ${r.meta.period.from} to ${r.meta.period.to} the headline outcomes are below; a before/after split needs at least two months and the date of the last meeting.`,
      points: ["on_time_rate", "water_saving_l", "repairs_total"].filter((id) => m(r, id)).map((id) => ({ text: `${m(r, id)!.label}: ${sayValue(m(r, id)!)}`, metricIds: [id] })),
      gap: "Set the month of the last steering committee in step 2.",
    };
  }
  const better = cmp.items.filter((i) => trend(i) === "better").length;
  const worse = cmp.items.filter((i) => trend(i) === "worse").length;
  const s = cmp.split;
  return {
    questionId: q.id,
    question: q.text,
    readiness: cmp.source === "engine" ? "ready" : "partial",
    answer: `Since the last steering committee (${s.after.from} to ${s.after.to} compared with ${s.before.from} to ${s.before.to}), ${better} indicator${better === 1 ? "" : "s"} improved and ${worse} got worse. Every figure is calculated from the data pack and shows its formula, source and range.`,
    points: [
      ...cmp.items.map((i) => {
        const t = trend(i);
        return {
          text: `${i.label}: ${formatCompare(i, i.before!)} → ${formatCompare(i, i.after!)}${t === "better" ? " (better)" : t === "worse" ? " (worse)" : t === "same" ? " (stable)" : ""}`,
          metricIds: m(r, i.id) ? [i.id] : [],
        };
      }),
      { text: "How it is measured: open any figure's calculation for its formula, data source, evidence status and Low/Base/High range.", metricIds: [] },
    ],
    gap: cmp.source === "engine" ? undefined : "Offline only the monthly totals can be split; connect the engine to compare every KPI.",
  };
}

function q2(c: PrepContext): PrepAnswer {
  const { review: r, meeting } = c;
  const q = STEERCO_QUESTIONS[1];
  const rules = INDUSTRY_RULES[r.meta.industry] ?? [];
  if (!meeting.priorities.length) {
    return {
      questionId: q.id,
      question: q.text,
      readiness: "needs_input",
      answer: `Not recorded yet: ask the customer to rank their top three priorities for the next 6–12 months (step 3). Typical ${r.meta.industry} priorities to propose:`,
      points: rules.slice(0, 3).map((x) => ({ text: `${x.theme}: ${x.emphasis}` })),
      gap: "Record the customer's own ranking in step 3; it then drives the story and the deck.",
    };
  }
  return {
    questionId: q.id,
    question: q.text,
    readiness: "ready",
    answer: `${r.meta.customer_name} ranked ${meeting.priorities.map((p, i) => `${i + 1}. ${p}`).join(", ")}${meeting.priorityNote.trim() ? ` (${meeting.priorityNote.trim()})` : ""}. For each, the review shows what to track:`,
    points: meeting.priorities.map((p) => {
      const ev = PRIORITY_EVIDENCE[p];
      if (!ev) return { text: `${p}: not measured in this data pack yet; agree how to measure it.` };
      const ids = ev.metricIds.filter((id) => m(r, id));
      const first = ids[0] ? m(r, ids[0])! : null;
      return { text: `${p}: track ${ev.watch}${first ? ` (now ${sayValue(first)})` : ""}.`, metricIds: ids };
    }),
  };
}

function q3(c: PrepContext): PrepAnswer {
  const { review: r, meeting } = c;
  const q = STEERCO_QUESTIONS[2];
  const points: PrepPoint[] = [];
  const overdue = meeting.previousActions.filter((a) => isOverdue(a));
  const inProgress = meeting.previousActions.filter((a) => a.status === "in_progress" && !isOverdue(a));
  for (const a of overdue) points.push({ text: `Overdue commitment from the last meeting: ${a.text}${a.owner ? ` (owner: ${a.owner}` : ""}${a.due ? `${a.owner ? ", " : " ("}due ${a.due})` : a.owner ? ")" : ""}.` });
  for (const a of inProgress) points.push({ text: `Still in progress: ${a.text}${a.due ? ` (due ${a.due})` : ""}.` });
  const missed = TARGETS.map((t) => ({ t, target: meeting.targets[t.id] ?? t.defaultTarget, actual: t.actual(r) }))
    .map((x) => ({ ...x, status: targetStatus(x.t, x.target, x.actual) }))
    .filter((x) => x.status === "missed" || x.status === "close");
  for (const x of missed) points.push({ text: `${x.t.label} ${x.status === "missed" ? "below" : "close to"} the agreed target: ${formatTarget(x.t.unit, x.actual!)} against ${formatTarget(x.t.unit, x.target)}.`, metricIds: m(r, x.t.id) ? [x.t.id] : [] });
  const late = r.sites.filter((s) => s.flags.some((f) => f.startsWith("R3_"))).sort((a, b) => (a.metrics.on_time_rate ?? 1) - (b.metrics.on_time_rate ?? 1));
  if (late.length) points.push({ text: `Late cycles at ${late.length} site${late.length === 1 ? "" : "s"} (${names(r, late)}): a route or schedule review.`, metricIds: ["on_time_rate"], siteIds: late.map((s) => s.site_id) });
  const req = r.sites.filter((s) => s.flags.some((f) => f.startsWith("R4_")));
  if (req.length) points.push({ text: `Unusually many service requests at ${names(r, req)}; the causes are not in the data.`, metricIds: ["service_requests"], siteIds: req.map((s) => s.site_id) });
  const dq = r.sites.filter((s) => s.flags.includes("DQ4"));
  if (dq.length) points.push({ text: `Data risk: laundry volumes for ${dq.length} site${dq.length === 1 ? "" : "s"} (${names(r, dq)}) do not reconcile, so their footprints need checking before external use.`, siteIds: dq.map((s) => s.site_id) });
  return {
    questionId: q.id,
    question: q.text,
    readiness: points.length ? "ready" : "partial",
    answer: points.length ? `${points.length} item${points.length === 1 ? " needs" : "s need"} steering attention:` : "No overdue commitments, missed targets or flagged sites in this review.",
    points,
    gap: meeting.previousActions.length ? undefined : "No actions from a previous meeting are recorded, so unresolved commitments cannot be checked (step 6).",
  };
}

function q4(c: PrepContext): PrepAnswer {
  const { review: r, meeting } = c;
  const q = STEERCO_QUESTIONS[3];
  const points: PrepPoint[] = [];
  const w = simulate(r, { reclaimShare: 0.5, repairGapClosed: 0.5 });
  if (w.available.reclaim && w.useRateBefore != null && w.useRateAfter != null) {
    points.push({ text: `Operations: reclaiming half of the idle garments at ${w.r1Sites.length} low-use sites frees ${full(w.reclaimed, 0)} garments and lifts circulation from ${pct(w.useRateBefore)} to ${pct(w.useRateAfter)} (what-if, illustrative).`, metricIds: ["allocation_use_rate"] });
  }
  if (w.available.repair) {
    points.push({ text: `Operations: closing half the gap to the median repair rate at ${w.repairSites.length} sites avoids about ${full(w.avoidedRepairs, 0)} repairs a year (what-if, illustrative).`, metricIds: ["repair_rate_per_1000"] });
  }
  const rough = roughCalc(r, meeting.rough ?? defaultRoughInputs(r));
  points.push({ text: `Cost: at the prices agreed in step 5, the service is worth roughly €${full(rough.total.base, 0)} a year against ${rough.baselineName.toLowerCase()} (rough calculation, not a quote).`, metricIds: ["water_saving_l"] });
  const co2 = m(r, "co2e_saving_kg");
  const circ = m(r, "circular_waste_share");
  if (co2) points.push({ text: `Sustainability: about ${sayValue(co2)} less than ${r.meta.baseline_name.toLowerCase()} (range ${sayValue(co2, co2.value.low)} to ${sayValue(co2, co2.value.high)})${circ ? `, and ${sayValue(circ)} of textile waste recycled or reused` : ""}.`, metricIds: ["co2e_saving_kg", ...(circ ? ["circular_waste_share"] : [])] });
  for (const o of r.observations.slice(0, 2)) points.push({ text: `Proposed: ${o.title} (owner: ${o.owner}).`, metricIds: o.metric_ids.slice(0, 1) });
  return {
    questionId: q.id,
    question: q.text,
    readiness: "partial",
    answer: "Strongest improvement opportunities, by type of value:",
    points,
    gap: "Expansion (new sites, garment types or service lines) is not in the data: ask which sites or teams the customer plans to add in the next 12 months.",
  };
}

function q5(c: PrepContext): PrepAnswer {
  const { review: r, meeting } = c;
  const q = STEERCO_QUESTIONS[4];
  const agreed = meeting.actions.filter((a) => a.agreed);
  const points: PrepPoint[] = [
    ...agreed.map((a) => ({ text: `Agreed: ${a.text}. Owner: ${a.owner || "to confirm"}. Due: ${a.due || "to confirm"}.` })),
    ...r.observations
      .filter((o) => !agreed.some((a) => a.text === o.title))
      .slice(0, 4)
      .map((o) => ({ text: `To decide: ${o.steering_question.split("?")[0]}? Proposed owner: ${o.owner}.`, metricIds: o.metric_ids.slice(0, 1), siteIds: o.site_ids.slice(0, 3) })),
  ];
  const overdue = meeting.previousActions.filter((a) => isOverdue(a));
  if (overdue.length) points.unshift({ text: `Re-plan ${overdue.length} overdue commitment${overdue.length === 1 ? "" : "s"} from the last meeting: new owner or new date?` });
  return {
    questionId: q.id,
    question: q.text,
    readiness: agreed.length ? "ready" : "partial",
    answer: `${points.length} decision${points.length === 1 ? "" : "s"} for today${meeting.nextMeeting ? `; next meeting ${meeting.nextMeeting}` : ""}:`,
    points,
    gap: agreed.length ? undefined : "Nothing is agreed yet: tick actions and add owners and dates in step 6 during the meeting.",
  };
}

export function steercoTemplate(c: PrepContext): PrepAnswer[] {
  return [q1(c), q2(c), q3(c), q4(c), q5(c)];
}

/** Free request → the closest steering answer (offline routing by keywords). */
export function freeRequestTemplate(whole: PrepContext, request: string): PrepAnswer {
  const t = request.toLowerCase();
  // "the Swedish sites", "production plants": answer from those sites only (customer-level KPIs stay totals).
  const scope = interpretScope(request, whole.review.sites);
  const scoped = scope ? whole.review.sites.filter((s) => inScope(s, scope)) : whole.review.sites;
  const c: PrepContext = scope && scoped.length ? { ...whole, review: { ...whole.review, sites: scoped } } : whole;
  const scopeNote = scope && scoped.length ? `Scoped to ${scope.label} (${scoped.length} site${scoped.length === 1 ? "" : "s"}); customer-level KPIs are totals. ` : "";
  const all = steercoTemplate(c);
  const route: [RegExp, number][] = [
    [/(since|last meeting|achiev|outcome|result|progress|improv(ed|ement) so far|trend)/, 0],
    [/(priorit|focus|next year|goal|strategy|6.?12)/, 1],
    [/(risk|issue|problem|late|delay|complain|unresolved|overdue|escalat)/, 2],
    [/(opportunit|saving|cost|money|value|expan|grow|improve|sustainab|water|co2|emission)/, 3],
    [/(decision|decide|action|owner|deadline|next step|who|when)/, 4],
  ];
  const hit = route.find(([re]) => re.test(t));
  const objection = buildObjections(c.review).find((o) => o.question.toLowerCase().split(/\W+/).filter((w) => w.length > 4).some((w) => t.includes(w)));
  if (!hit && objection) {
    return {
      questionId: "free",
      question: request,
      readiness: objection.readiness === "evidence" ? "ready" : objection.readiness === "caveat" ? "partial" : "needs_input",
      answer: objection.answer,
      points: objection.points.map((p) => ({ text: p, metricIds: objection.metricIds })),
      gap: objection.needs,
    };
  }
  const base = all[hit ? hit[1] : 0];
  return { ...base, questionId: "free", question: request, answer: scopeNote + base.answer };
}

/* ---------------- optional AI endpoint (POST /api/prep) ---------------- */

const PLACEHOLDER = /\{\{([a-z0-9_]+)\}\}/g;

/** AI text may not contain digits of its own; {{metric_id}} placeholders are filled from the review. */
export function fillPlaceholders(text: string, r: Review): string | null {
  if (/\d/.test(text.replace(PLACEHOLDER, ""))) return null;
  let ok = true;
  const out = text.replace(PLACEHOLDER, (_, id: string) => {
    const metric = m(r, id);
    if (!metric) ok = false;
    return metric ? sayValue(metric) : "";
  });
  return ok ? out : null;
}

interface ApiAnswer {
  question_id: string;
  answer: string;
  points?: { text: string; metric_ids?: string[] }[];
  gap?: string;
}

/**
 * Ask the AI endpoint to rephrase the template for this audience. Each answer is accepted only if every
 * sentence passes fillPlaceholders; otherwise the template answer is kept. Returns null when the endpoint
 * is missing or fails (the UI then shows the template only).
 */
export interface AiPrepResult {
  answers: PrepAnswer[];
  replaced: number;
  /** "gemini" when the AI answered; "template" when the server fell back (see reason). */
  source: string;
  reason: string | null;
}

const REASONS: Record<string, string> = {
  missing_key: "no Gemini key is configured on the server",
  disabled: "AI wording is switched off",
  timeout: "the AI service timed out",
  provider_error: "the AI service returned an error",
  invalid_model_output: "the AI answer failed the evidence and number checks",
  no_evidence: "there is no evidence to word",
};

export function reasonText(reason: string | null): string {
  return (reason && REASONS[reason]) || "the AI service did not return usable wording";
}

export async function aiPrep(c: PrepContext, questions: { id: string; text: string }[], template: PrepAnswer[]): Promise<AiPrepResult | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(`${API_URL}/api/prep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        review: c.review,
        audience: c.audience,
        questions,
        template: template.map((a) => ({ question_id: a.questionId, answer: a.answer, points: a.points.map((p) => ({ text: p.text, metric_ids: p.metricIds ?? [] })), gap: a.gap })),
        context: {
          priorities: c.meeting.priorities,
          previous_actions: c.meeting.previousActions,
          comparison: c.comparison.items,
        },
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { answers?: ApiAnswer[]; source?: string; fallback_reason?: string | null };
    let replaced = 0;
    const answers = template.map((t) => {
      const a = data.answers?.find((x) => x.question_id === t.questionId);
      if (!a) return t;
      const answer = fillPlaceholders(a.answer, c.review);
      const points = (a.points ?? []).map((p) => ({ text: fillPlaceholders(p.text, c.review), metricIds: (p.metric_ids ?? []).filter((id) => m(c.review, id)) }));
      if (answer == null || points.some((p) => p.text == null)) return t;
      replaced++;
      return { ...t, answer, points: points.length ? (points as PrepPoint[]) : t.points, gap: a.gap ? fillPlaceholders(a.gap, c.review) ?? t.gap : t.gap };
    });
    return { answers, replaced, source: data.source ?? "template", reason: data.fallback_reason ?? null };
  } catch {
    return null;
  }
}

export function siteName(r: Review, id: string): string {
  const s = site(r, id);
  return s ? short(r, s.site_name) : id;
}
