"use client";

import { ArrowRight, ChevronRight, Lightbulb, Target, TrendingUp, Users } from "lucide-react";
import { INDUSTRY_RULES } from "@/lib/config";
import { formatValue, unitLabel } from "@/lib/format";
import { splitAction, splitObservation } from "@/lib/story";
import type { Metric, Observation, Priority, Review, Sensitivity } from "@/lib/types";
import { StatusBadge } from "./ui";

/**
 * Executive story for the active lens: What happened → Why it matters → Next action.
 * Built only from the review: the lead spotlight metric, the top-ranked observation (already ordered for
 * the lens) and the customer's industry rules. No sentence here is generated in the browser.
 */
export function StoryStrip({ review, priority, sensitivity, lead, onOpenMetric, onOpenObservations }: {
  review: Review;
  priority: Priority;
  sensitivity: Sensitivity;
  lead: Metric | undefined;
  onOpenMetric: (id: string) => void;
  onOpenObservations: () => void;
}) {
  const obs: Observation | undefined = review.observations[0];
  const parts = obs ? splitObservation(obs) : null;
  const action = obs ? splitAction(obs.recommended_action) : null;
  const rule = INDUSTRY_RULES[review.meta.industry]?.find((r) => r.priority === priority);

  return (
    <section aria-label="Executive summary" className="lift-in grid gap-3 lg:grid-cols-3">
      {/* 1. What happened */}
      <Column step="1" icon={TrendingUp} title="What happened" tone="navy">
        {lead ? (
          <button onClick={() => onOpenMetric(lead.id)} className="group block w-full text-left">
            <div className="text-[12.5px] text-slate-600">{lead.label}</div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold text-ink tnum">{formatValue(lead.value[sensitivity], lead.unit)}</span>
              <span className="text-[13px] text-muted">{unitLabel(lead.unit)}</span>
            </div>
            {lead.value.high > lead.value.low && (
              <div className="text-[11.5px] text-muted tnum">
                Range {formatValue(lead.value.low, lead.unit)} – {formatValue(lead.value.high, lead.unit)} · {sensitivity} case shown
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-2">
              <StatusBadge status={lead.status} small />
              <span className="text-[11.5px] font-medium text-navy group-hover:underline">Show the calculation</span>
            </div>
          </button>
        ) : (
          <p className="text-[13px] text-muted">No spotlight metric for this lens in the review.</p>
        )}
        {parts?.finding && <p className="mt-3 border-t border-line pt-2.5 text-[12.5px] leading-relaxed text-slate-700">{parts.finding}</p>}
      </Column>

      {/* 2. Why it matters */}
      <Column step="2" icon={Lightbulb} title="Why it matters" tone="amber">
        {parts?.why ? (
          <p className="text-[13.5px] leading-relaxed text-ink">{parts.why}</p>
        ) : rule ? (
          <p className="text-[13.5px] leading-relaxed text-ink">{rule.emphasis}</p>
        ) : (
          <p className="text-[13px] text-muted">No industry context recorded for this lens.</p>
        )}
        {rule && (
          <div className="mt-3 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-900 ring-1 ring-inset ring-amber-200">
            {review.meta.industry} priority #{rule.rank}: <b>{rule.theme}</b>
          </div>
        )}
        {parts?.evidence && (
          <details className="mt-2 text-[11.5px] text-muted">
            <summary className="cursor-pointer text-navy">Evidence behind this</summary>
            <p className="mt-1 leading-relaxed">{parts.evidence}</p>
          </details>
        )}
      </Column>

      {/* 3. Next action */}
      <Column step="3" icon={Target} title="Next action to consider" tone="red" last>
        {obs && action ? (
          <>
            {action.tag && <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-brand-red">{action.tag}</div>}
            <p className="line-clamp-4 text-[13.5px] leading-relaxed text-ink">{action.action}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-inset ring-line">
                <Users size={11} /> {obs.owner}
              </span>
              <button onClick={onOpenObservations} className="inline-flex items-center gap-0.5 text-[12px] font-medium text-navy hover:underline">
                Try it in the 2026 what-if · all {review.observations.length} actions <ArrowRight size={12} />
              </button>
            </div>
          </>
        ) : (
          <p className="text-[13px] text-muted">No observations in this review yet.</p>
        )}
      </Column>
    </section>
  );
}

const TONES = {
  navy: { bar: "bg-navy", icon: "bg-navy-50 text-navy" },
  amber: { bar: "bg-amber-500", icon: "bg-amber-50 text-amber-700" },
  red: { bar: "bg-brand-red", icon: "bg-brand-red-soft text-brand-red" },
};

function Column({ step, icon: Icon, title, tone, last, children }: {
  step: string;
  icon: React.ElementType;
  title: string;
  tone: keyof typeof TONES;
  last?: boolean;
  children: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <div className="card relative flex flex-col overflow-visible p-4 pt-5">
      <span className={`absolute inset-x-0 top-0 h-1 rounded-t-xl ${t.bar}`} />
      <div className="mb-2.5 flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${t.icon}`}>
          <Icon size={15} />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {step} · {title}
        </span>
      </div>
      <div className="flex-1">{children}</div>
      {!last && (
        <span className="absolute -right-3 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white text-muted shadow ring-1 ring-line lg:flex">
          <ChevronRight size={14} />
        </span>
      )}
    </div>
  );
}
