"use client";

import { BookOpen, CheckCircle2, Database, FunctionSquare, Info, MapPin, MessageSquareQuote, Scale, Sparkles } from "lucide-react";
import { equivalents, parseTrace, rangeReason, walkthrough } from "@/lib/calc";
import { dqNotes } from "@/lib/dq";
import { shortSiteName, SITE_METRIC_META } from "@/lib/config";
import { formatValue, full, unitLabel } from "@/lib/format";
import type { Metric, Review, Sensitivity, SiteMetricKey } from "@/lib/types";
import { ConfidenceDots, Drawer, RangeBar, StatusBadge } from "./ui";

/** What each source sheet of the data pack contains (README / Data_Dictionary). */
const SHEETS: Record<string, string> = {
  Customers: "Customer master data · industry, segment, priority topics",
  Sites: "Site master data · customer → site hierarchy",
  Products: "Product master · weight, synthetic footprint & purchase cost",
  Laundries: "Laundry master data",
  Service_Activity: "Site × product × month · wearers, allocation, scans, washes, requests",
  Service_Cycles: "Asset × cycle · pickup → delivery timestamps, on-time flag",
  Repairs: "Site × product × month × repair type",
  Laundry_Resources: "Laundry × month · water, energy, process & delivery emissions",
  Waste_Circularity: "Laundry × month · recycling, reuse, energy recovery, incineration",
  Baselines: "Comparison factors per kg for local / home / in-house washing",
  Customer_Impacts: "Allocated footprint & savings (used to check our numbers)",
  Assumptions: "Assumption registry",
};

const STATUS_EXPLAIN: Record<string, string> = {
  MEASURED: "Read directly from a measurement.",
  CALCULATED: "Computed deterministically from source rows — reproducible.",
  ALLOCATED_ESTIMATE: "Laundry-level resource use allocated to this customer by its share of washed kg. Not directly metered per customer.",
  ESTIMATE: "Depends on a stated assumption. Read together with the low–high range.",
  SYNTHETIC: "Taken as-is from the synthetic data pack.",
  PUBLIC_REFERENCE: "Publicly stated context — not used as a calculation input.",
};

export function CalcDrawer({ metric, review, sensitivity, onClose, onOpenSite, onOpenMetric, siteBaselineNote }: {
  metric: Metric | null;
  onOpenMetric?: (id: string) => void;
  siteBaselineNote?: string;
  review: Review;
  sensitivity: Sensitivity;
  onClose: () => void;
  onOpenSite: (id: string) => void;
}) {
  if (!metric) return null;
  const { low, base, high } = metric.value;
  const hasRange = high > low;
  const assumptions = metric.assumptions.map((id) => ({ id, a: review.assumptions.find((x) => x.id === id) }));
  const siteKey = (metric.id in SITE_METRIC_META ? metric.id : null) as SiteMetricKey | null;
  const siteRows = siteKey
    ? review.sites
        .map((s) => ({ s, val: s.metrics[siteKey] }))
        .filter((r): r is { s: (typeof r)["s"]; val: number } => typeof r.val === "number")
        .sort((a, b) => b.val - a.val)
    : [];
  const siteMax = Math.max(...siteRows.map((r) => r.val), 0);
  const referencing = review.observations.filter((o) => o.metric_ids.includes(metric.id));
  const trace = parseTrace(metric.formula);
  const traceMismatch =
    trace.terms.length > 0 && ((trace.scenario && trace.scenario !== sensitivity) || (trace.baseline && trace.baseline !== review.meta.baseline_id));
  // Re-play the formula from the review's own inputs; only shown if it reproduces the engine's value.
  const walk = walkthrough(metric, review, sensitivity);
  const verified = walk && walk.gap < 0.001 ? walk : null;
  const reason = rangeReason(metric);
  const everyday = equivalents(metric.value[sensitivity], metric.unit);
  const notes = dqNotes(review).byMetric.get(metric.id) ?? [];

  return (
    <Drawer
      open
      onClose={onClose}
      title={metric.label}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge status={metric.status} /> <ConfidenceDots confidence={metric.confidence} />
          <span className="font-mono text-[11px] text-slate-400">{metric.id}</span>
        </span>
      }
    >
      {/* Value + range */}
      <div className="rounded-xl bg-canvas p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{sensitivity} case shown</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-3xl font-semibold text-ink tnum">{formatValue(metric.value[sensitivity], metric.unit, "full")}</span>
          <span className="text-muted">{unitLabel(metric.unit)}</span>
        </div>
        {hasRange && (
          <div className="mt-4">
            <RangeBar low={low} base={base} high={high} active={sensitivity} />
          </div>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {(["low", "base", "high"] as const).map((k) => (
            <div key={k} className={`rounded-lg px-2 py-2 ${k === sensitivity ? "bg-white ring-1 ring-navy/30" : ""}`}>
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">{k}</div>
              <div className="text-[13.5px] font-semibold text-ink tnum">{formatValue(metric.value[k], metric.unit, "full")}</div>
            </div>
          ))}
        </div>
        {!hasRange && <p className="mt-2 text-[12px] text-muted">Low, base and high are identical: this value does not depend on a sensitivity assumption.</p>}
      </div>

      {notes.map((n) => (
        <div key={n.code} className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">Data-quality note · {n.short}</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-amber-950">{n.detail}</p>
        </div>
      ))}

      {everyday.length > 0 && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
            <Sparkles size={13} /> In everyday terms ({sensitivity} case)
          </div>
          {everyday.map((e) => (
            <div key={e.text} className="mt-1">
              <div className="text-[14px] font-medium text-ink">{e.text}</div>
              <div className="text-[11px] text-muted">
                Basis: {e.basis}. Illustrative public reference, not from the data pack and not a Lindström claim.
              </div>
            </div>
          ))}
        </div>
      )}

      <Section icon={FunctionSquare} title="Step by step, with this review's numbers">
        {verified ? (
          <>
            <ol className="space-y-1.5">
              {verified.steps.map((st, i) => (
                <li
                  key={i}
                  className={`rounded-lg px-3 py-2 ${st.kind === "result" ? "bg-navy text-white" : "bg-canvas"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={`text-[12.5px] ${st.kind === "result" ? "font-semibold" : "text-slate-700"}`}>
                      <span className={`mr-1.5 font-mono text-[11px] ${st.kind === "result" ? "text-blue-200" : "text-muted"}`}>{i + 1}</span>
                      {st.metricId && onOpenMetric ? (
                        <button onClick={() => onOpenMetric(st.metricId!)} className="text-left underline decoration-dotted underline-offset-2 hover:text-navy">
                          {st.label}
                        </button>
                      ) : (
                        st.label
                      )}
                    </span>
                    <span className="whitespace-nowrap font-semibold tnum">{st.value}</span>
                  </div>
                  {st.expr && st.kind !== "input" && (
                    <div className={`mt-0.5 pl-5 font-mono text-[11.5px] ${st.kind === "result" ? "text-blue-100" : "text-muted"}`}>{st.expr}</div>
                  )}
                </li>
              ))}
            </ol>
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-emerald-700">
              <CheckCircle2 size={13} /> Re-played in your browser from this review&apos;s inputs: matches the engine&apos;s result
              {verified.gap > 0 ? ` (difference ${(verified.gap * 100).toFixed(3)}%)` : " exactly"}.
            </p>
          </>
        ) : trace.terms.length > 0 ? (
          <div className="rounded-lg border border-navy/20 bg-navy-50 px-3.5 py-2.5">
            <div className="font-mono text-[12.5px] leading-relaxed text-ink">
              {(trace.terms.length > 8 ? trace.terms.slice(0, 6) : trace.terms).map((t, i) => (
                <div key={i}>
                  <span className="inline-block w-4 text-navy">{t.op}</span>
                  {t.text}
                </div>
              ))}
              {trace.terms.length > 8 && <div className="pl-4 text-muted">… {trace.terms.length - 6} more terms</div>}
              {trace.result && (
                <div className="mt-1 border-t border-navy/20 pt-1 font-semibold">
                  <span className="inline-block w-4 text-navy">=</span>
                  {trace.result}
                </div>
              )}
            </div>
            <div className="mt-1.5 text-[11.5px] text-muted">
              Arithmetic trace written by the engine
              {trace.scenario ? ` for the ${trace.scenario} case` : ""}
              {trace.baseline ? ` · ${trace.baseline}` : ""}
              {traceMismatch && <span className="font-medium text-amber-700"> (differs from the case or baseline currently shown)</span>}
            </div>
          </div>
        ) : (
          <p className="text-[12.5px] text-muted">The engine did not attach a worked example to this metric; the general formula is below.</p>
        )}
        <div className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">General formula</div>
        <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-navy-900 px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-blue-50">{trace.rule}</pre>
        <p className="mt-2 text-[12.5px] text-slate-600">
          <Info size={12} className="mr-1 inline -translate-y-px text-navy" />
          {STATUS_EXPLAIN[metric.status] ?? metric.status}
        </p>
      </Section>

      <Section icon={Scale} title={reason.title}>
        <p className="text-[13px] leading-relaxed text-slate-700">{reason.body}</p>
        {reason.cases && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {reason.cases.map((c) => (
              <div key={c.case} className={`rounded-lg border px-2.5 py-2 ${c.case === sensitivity ? "border-navy/40 bg-navy-50" : "border-line"}`}>
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">{c.case}</div>
                <div className="text-[11.5px] text-slate-600">{c.factor}</div>
                <div className="mt-0.5 text-[13px] font-semibold text-ink tnum">
                  {formatValue(metric.value[c.case], metric.unit)} <span className="text-[11px] font-normal text-muted">{unitLabel(metric.unit)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section icon={Database} title="Source sheets">
        <ul className="space-y-1.5">
          {metric.sources.map((s) => (
            <li key={s} className="flex gap-2 text-[13px]">
              <span className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[11.5px] text-navy">{s}</span>
              <span className="text-slate-600">{SHEETS[s] ?? ""}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section icon={BookOpen} title="Assumptions">
        {assumptions.length === 0 && <p className="text-[13px] text-muted">No assumptions recorded.</p>}
        <ul className="space-y-2">
          {assumptions.map(({ id, a }) => (
            <li key={id} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink">
                  <span className="mr-1.5 font-mono text-[11.5px] text-navy">{id}</span>
                  {a?.assumption ?? "Not found in assumption registry"}
                </span>
                {a && <ConfidenceDots confidence={a.confidence} />}
              </div>
              {a && (
                <>
                  <div className="mt-1 text-[12.5px] text-slate-700">{a.value_or_rule}</div>
                  <div className="mt-0.5 text-[12px] text-muted">{a.rationale}</div>
                </>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {siteRows.length > 0 && (
        <Section icon={MapPin} title={`Breakdown by site (${siteRows.length})`}>
          <ul className="space-y-1">
            {siteRows.map(({ s, val }) => (
              <li key={s.site_id}>
                <button onClick={() => onOpenSite(s.site_id)} className="group flex w-full items-center gap-2 text-left text-[12.5px]">
                  <span className="w-40 truncate text-slate-700 group-hover:text-navy group-hover:underline">{shortSiteName(s.site_name, review.meta.customer_name)}</span>
                  <span className="relative h-2 flex-1 rounded-full bg-canvas">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-navy/70" style={{ width: `${siteMax ? (val / siteMax) * 100 : 0}%` }} />
                  </span>
                  <span className="w-20 text-right text-slate-600 tnum">{formatValue(val, SITE_METRIC_META[siteKey!].unit)}</span>
                </button>
              </li>
            ))}
          </ul>
          {metric.unit !== "ratio" && !["repair_rate_per_1000", "median_cycle_hours"].includes(metric.id) && (
            <p className="mt-2 text-[11.5px] text-muted">
              Sum of site values: {full(siteRows.reduce((a, r) => a + r.val, 0))} {unitLabel(metric.unit)}
              {metric.category === "handprint" && siteBaselineNote ? ` · ${siteBaselineNote}` : ""}
            </p>
          )}
        </Section>
      )}

      {referencing.length > 0 && (
        <Section icon={MessageSquareQuote} title="Cited by observations">
          <ul className="space-y-1.5">
            {referencing.map((o, i) => (
              <li key={o.id ?? i} className="text-[13px] text-slate-700">• {o.title}</li>
            ))}
          </ul>
        </Section>
      )}
    </Drawer>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted">
        <Icon size={14} /> {title}
      </h3>
      {children}
    </section>
  );
}
