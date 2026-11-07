"use client";

import { CheckCircle2, CircleAlert, CircleDashed, ListOrdered, MessageSquareHeart, XCircle } from "lucide-react";
import { formatTarget, PRIORITY_CHOICES, TARGETS, targetStatus, type MeetingState, type TargetStatus } from "@/lib/meeting";
import type { Review } from "@/lib/types";
import { NumberInput, StepHeader } from "./parts";

const STATUS: Record<TargetStatus, { label: string; cls: string; icon: React.ElementType }> = {
  met: { label: "Met", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: CheckCircle2 },
  close: { label: "Close", cls: "bg-amber-50 text-amber-800 ring-amber-200", icon: CircleAlert },
  missed: { label: "Not met", cls: "bg-red-50 text-red-700 ring-red-200", icon: XCircle },
  unknown: { label: "No data", cls: "bg-slate-100 text-slate-600 ring-slate-200", icon: CircleDashed },
};

const METRIC_FOR: Record<string, string> = { requests_per_100_wearers: "service_requests" };

export function StepAgreement({ review, meeting, onChange, onOpenMetric }: {
  review: Review;
  meeting: MeetingState;
  onChange: (m: Partial<MeetingState>) => void;
  onOpenMetric: (id: string) => void;
}) {
  const rows = TARGETS.map((def) => {
    const target = meeting.targets[def.id] ?? def.defaultTarget;
    const actual = def.actual(review);
    return { def, target, actual, status: targetStatus(def, target, actual) };
  });
  const met = rows.filter((r) => r.status === "met").length;
  const onTimeTarget = meeting.targets.on_time_rate ?? 0.98;
  const rated = review.sites.filter((s) => s.metrics.on_time_rate != null);
  const sitesOnTarget = rated.filter((s) => s.metrics.on_time_rate! >= onTimeTarget).length;
  const score = meeting.satisfaction.score;

  return (
    <div>
      <StepHeader
        kicker="Our agreement"
        title={`${met} of ${rows.length} service KPIs on target`}
        sub="Targets are typed in by the KAM to match the customer agreement; the defaults are examples. Actuals come straight from the review."
      />
      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13.5px]">
              <thead>
                <tr className="border-b border-line bg-canvas text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5">KPI</th>
                  <th className="px-3 py-2.5">Agreed target</th>
                  <th className="px-3 py-2.5 text-right">Actual</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ def, target, actual, status }) => {
                  const s = STATUS[status];
                  const metricId = METRIC_FOR[def.id] ?? def.id;
                  const ratio = def.unit === "ratio";
                  return (
                    <tr key={def.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{def.label}</div>
                        {review.metrics.some((m) => m.id === metricId) && (
                          <button onClick={() => onOpenMetric(metricId)} className="text-[11.5px] text-navy hover:underline">
                            Show the calculation
                          </button>
                        )}
                      </td>
                      <td className="w-40 px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] text-muted">{def.dir === "min" ? "≥" : "≤"}</span>
                          <NumberInput
                            label=""
                            value={ratio ? Math.round(target * 1000) / 10 : target}
                            step={ratio ? 0.5 : def.step}
                            max={ratio ? 100 : undefined}
                            suffix={ratio ? "%" : def.unit === "hours" ? "h" : undefined}
                            onChange={(v) => onChange({ targets: { ...meeting.targets, [def.id]: ratio ? v / 100 : v } })}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-[15px] font-semibold text-ink tnum">{actual == null ? "–" : formatTarget(def.unit, actual)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset ${s.cls}`}>
                          <s.icon size={13} /> {s.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rated.length > 0 && (
            <p className="border-t border-line bg-canvas px-4 py-2.5 text-[12.5px] text-slate-600">
              <span className="font-semibold text-ink">{sitesOnTarget} of {rated.length} sites</span> met the on-time target of {formatTarget("ratio", onTimeTarget)}.
              Step 4 shows which sites lead and which need attention.
            </p>
          )}
        </section>

        <section className="card p-5">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <MessageSquareHeart size={16} className="text-brand-red" /> Customer satisfaction
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            The data pack has no satisfaction survey. Ask the customer directly and record their answer here: it is labelled as KAM input, not data.
          </p>
          <div className="mt-4 text-[12px] font-medium text-slate-700">How likely are you to recommend Lindström? (0–10)</div>
          <div className="mt-2 grid grid-cols-11 gap-1" role="group" aria-label="Satisfaction score">
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                onClick={() => onChange({ satisfaction: { ...meeting.satisfaction, score: score === i ? null : i } })}
                className={`h-8 rounded-md text-[12.5px] font-semibold tnum ring-1 ring-inset ${
                  score === i ? "bg-navy text-white ring-navy" : i >= 9 ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : i >= 7 ? "bg-slate-50 text-slate-700 ring-line" : "bg-red-50/60 text-red-700 ring-red-100"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
          <label className="mt-4 block">
            <span className="text-[12px] font-medium text-slate-700">What would make it a 10?</span>
            <textarea
              value={meeting.satisfaction.comment}
              onChange={(e) => onChange({ satisfaction: { ...meeting.satisfaction, comment: e.target.value } })}
              rows={3}
              placeholder="In the customer's own words…"
              className="mt-1 w-full rounded-lg border border-line px-2.5 py-2 text-[13px] outline-none focus:border-navy/50"
            />
          </label>
        </section>
      </div>

      <section className="card mt-4 p-5" aria-label="Customer priorities">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <ListOrdered size={16} className="text-navy" /> Your priorities for the next 6–12 months
        </h3>
        <p className="mt-1 text-[12.5px] text-muted">Ask the customer to pick and rank up to three. They shape the story, the steering-committee prep and the summary you take home.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Priorities">
          {PRIORITY_CHOICES.map((p) => {
            const rank = meeting.priorities.indexOf(p);
            const on = rank >= 0;
            const full = meeting.priorities.length >= 3 && !on;
            return (
              <button
                key={p}
                disabled={full}
                aria-pressed={on}
                onClick={() => onChange({ priorities: on ? meeting.priorities.filter((x) => x !== p) : [...meeting.priorities, p] })}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset transition disabled:opacity-40 ${
                  on ? "bg-navy text-white ring-navy" : "bg-white text-slate-700 ring-line hover:bg-navy-50"
                }`}
              >
                {on && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10.5px] font-bold text-navy">{rank + 1}</span>}
                {p}
              </button>
            );
          })}
        </div>
        <input
          value={meeting.priorityNote}
          onChange={(e) => onChange({ priorityNote: e.target.value })}
          placeholder="Anything else, in the customer's words (e.g. 'new site in Tampere opens in Q3')"
          className="mt-3 h-9 w-full rounded-lg border border-line px-2.5 text-[13px] outline-none focus:border-navy/50"
        />
      </section>
    </div>
  );
}
