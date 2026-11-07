"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight, History, Loader2, Minus } from "lucide-react";
import { addMonths, formatCompare, monthsBetween, trend, type Comparison } from "@/lib/comparison";
import { monthLabel } from "@/lib/format";
import type { Review } from "@/lib/types";

/** Steering question 1: what changed since the last steering committee. */
export function SinceLastMeeting({ review, comparison, onLastSteerCo, onOpenMetric }: {
  review: Review;
  comparison: Comparison;
  onLastSteerCo: (month: string) => void;
  onOpenMetric: (id: string) => void;
}) {
  const { from, to } = review.meta.period;
  const n = monthsBetween(from, to);
  if (n < 2 || !comparison.split) return null;
  const months = Array.from({ length: n - 1 }, (_, i) => addMonths(from, i));
  const s = comparison.split;
  const better = comparison.items.filter((i) => trend(i) === "better").length;

  return (
    <section className="card mt-5 p-5" aria-label="Since the last steering committee">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <History size={16} className="text-navy" /> Since the last steering committee
          {comparison.items.length > 0 && (
            <span className="text-[12.5px] font-normal text-muted">
              · {better} of {comparison.items.filter((i) => i.better).length} improved
            </span>
          )}
        </h3>
        <label className="flex items-center gap-2 text-[12.5px] text-slate-700">
          Last meeting was in
          <select value={s.before.to} onChange={(e) => onLastSteerCo(e.target.value)} className="select h-8">
            {months.map((mo) => (
              <option key={mo} value={mo}>
                {monthLabel(mo)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-1 text-[12px] text-muted">
        {monthLabel(s.before.from)}–{monthLabel(s.before.to)} compared with {monthLabel(s.after.from)}–{monthLabel(s.after.to)}
        {comparison.source === "engine" ? " · both parts recalculated by the engine" : " · offline: monthly totals only"}
        {comparison.items.some((i) => i.perMonth) ? " · totals per month" : ""}
      </p>
      {comparison.loading ? (
        <p className="mt-4 flex items-center gap-2 text-[13px] text-navy">
          <Loader2 size={14} className="animate-spin" /> Recalculating both periods…
        </p>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {comparison.items.map((i) => {
            const t = trend(i);
            const Icon = t === "same" || t === "neutral" ? (t === "same" ? Minus : ArrowRight) : i.after! > i.before! ? ArrowUpRight : ArrowDownRight;
            const tone = t === "better" ? "text-emerald-700 bg-emerald-50" : t === "worse" ? "text-red-700 bg-red-50" : "text-slate-600 bg-slate-100";
            const hasMetric = review.metrics.some((m) => m.id === i.id);
            return (
              <button
                key={i.id}
                onClick={() => hasMetric && onOpenMetric(i.id)}
                className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 text-left hover:border-navy/40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-medium text-slate-700">{i.label}</span>
                  <span className="block text-[13px] text-ink tnum">
                    {formatCompare(i, i.before!)} → <span className="font-semibold">{formatCompare(i, i.after!)}</span>
                  </span>
                </span>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone}`} aria-label={t}>
                  <Icon size={15} />
                </span>
              </button>
            );
          })}
        </div>
      )}
      {comparison.error && <p className="mt-2 text-[11.5px] text-muted">The engine could not split this period ({comparison.error}); showing monthly totals.</p>}
    </section>
  );
}
