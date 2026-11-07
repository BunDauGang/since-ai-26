"use client";

import { ArrowRight, Lightbulb, Target } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { INDUSTRY_RULES, isOutlier, priorityDef, shortSiteName, SITE_METRIC_META, type ViewId } from "@/lib/config";
import { metricMap } from "@/lib/derive";
import { compact, formatValue, monthLabel } from "@/lib/format";
import type { Metric, Priority, Review, Sensitivity } from "@/lib/types";
import { KpiCard } from "../KpiCard";
import { SectionTitle } from "../ui";

const CATEGORY_LABEL: Record<string, string> = {
  scale: "Scale of service",
  allocation: "Allocation & utilisation",
  service: "Service performance",
  repair: "Repair & lifetime",
  footprint: "Footprint (allocated to customer)",
  handprint: "Handprint vs selected baseline",
};

export function Overview({ review, priority, sensitivity, emphasized, onOpenMetric, onOpenSite, onView, siteBaselineNote }: {
  review: Review;
  priority: Priority;
  sensitivity: Sensitivity;
  emphasized: string[];
  onOpenMetric: (id: string) => void;
  onOpenSite: (id: string) => void;
  onView: (v: ViewId) => void;
  siteBaselineNote?: string;
}) {
  const p = priorityDef(priority);
  const byId = metricMap(review);
  const spotlight = emphasized.map((id) => byId.get(id)).filter(Boolean) as Metric[];
  const rest = review.metrics.filter((m) => !emphasized.includes(m.id));
  const categories = Array.from(new Set(rest.map((m) => m.category)));
  const industryRule = INDUSTRY_RULES[review.meta.industry]?.find((r) => r.priority === priority);
  const topObs = review.observations[0];

  // Spotlight chart: sites ranked by the priority's site metric.
  const sm = SITE_METRIC_META[p.siteMetric];
  const siteData = review.sites
    .map((s) => ({ id: s.site_id, name: shortSiteName(s.site_name, review.meta.customer_name), value: s.metrics[p.siteMetric] ?? 0, flagged: isOutlier(s) }))
    .sort((a, b) => (p.siteSort === "desc" ? b.value - a.value : a.value - b.value))
    .slice(0, 10);
  const ts = p.timeseries ? review.timeseries[p.timeseries] : undefined;
  const tsMetric = p.timeseries ? byId.get(p.timeseries) : undefined;

  return (
    <div className="space-y-6">
      {/* Spotlight banner */}
      <div key={priority} className="lift-in card overflow-hidden">
        <div className="flex flex-wrap items-start gap-4 bg-gradient-to-r from-navy to-navy-900 px-5 py-4 text-white">
          <div className="rounded-lg bg-white/10 p-2">
            <Target size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-200">Priority spotlight · {p.label}</div>
            <div className="mt-0.5 text-[17px] font-semibold">{p.headline}</div>
            <div className="mt-1.5 text-[12.5px] text-blue-100">
              {industryRule ? (
                <>
                  <span className="font-semibold text-white">Why this view:</span> {review.meta.industry} priority #{industryRule.rank} — {industryRule.theme}. {industryRule.emphasis}
                </>
              ) : (
                <>Not a ranked {review.meta.industry} theme — shown because it was selected. Industry rules only change the display, not the numbers.</>
              )}
            </div>
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {spotlight.map((m) => (
            <KpiCard key={`${priority}-${m.id}`} metric={m} sensitivity={sensitivity} emphasized onOpen={onOpenMetric} size="lg" />
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="card p-4 xl:col-span-3">
          <SectionTitle sub={`Top 10 · click a bar to drill down${p.siteMetric.includes("saving") && siteBaselineNote ? ` · ${siteBaselineNote}` : ""}`}>{p.siteMetricLabel}</SectionTitle>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={siteData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} stroke="#eef1f5" />
                <XAxis type="number" tickFormatter={(v) => formatValue(v, sm.unit)} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11.5, fill: "#334155" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#f3f5f8" }} formatter={(v: number) => [formatValue(v, sm.unit, "full"), sm.label]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} onClick={(d: { id?: string }) => d.id && onOpenSite(d.id)} className="cursor-pointer">
                  {siteData.map((d) => (
                    <Cell key={d.id} fill={d.flagged ? "#e30613" : "#003f72"} fillOpacity={d.flagged ? 0.85 : 0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex gap-4 text-[11px] text-muted">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-navy" /> Site</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-brand-red" /> Outlier site (R1 low use · R2 high repairs · R4 many requests)</span>
          </div>
        </div>
        <div className="card p-4 xl:col-span-2">
          {ts && tsMetric ? (
            <>
              <SectionTitle sub={`Monthly, ${review.meta.period.from} → ${review.meta.period.to}${tsMetric.category === "handprint" && siteBaselineNote ? ` · ${siteBaselineNote}` : ""}`}>
                {tsMetric.label}
              </SectionTitle>
              <div className="h-72">
                <ResponsiveContainer>
                  <AreaChart data={ts} margin={{ left: 0, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="ts" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#003f72" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#003f72" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#eef1f5" />
                    <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} interval={1} />
                    <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip labelFormatter={(m: string) => monthLabel(m)} formatter={(v: number) => [formatValue(v, tsMetric.unit, "full"), tsMetric.unit]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Area type="monotone" dataKey="value" stroke="#003f72" strokeWidth={2} fill="url(#ts)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col">
              <SectionTitle sub="Rules flagged these sites for follow-up">Sites to discuss</SectionTitle>
              <ul className="space-y-1.5">
                {review.sites
                  .filter(isOutlier)
                  .slice(0, 8)
                  .map((s) => (
                    <li key={s.site_id}>
                      <button onClick={() => onOpenSite(s.site_id)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-canvas">
                        <span>{s.site_name}</span>
                        <span className="text-[11px] text-muted">{s.flags.map((f) => f.split("_")[0]).join(" · ")}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Top observation */}
      {topObs && (
        <button onClick={() => onView("observations")} className="card flex w-full items-start gap-3 p-4 text-left transition hover:shadow-md">
          <div className="rounded-lg bg-brand-red-soft p-2 text-brand-red">
            <Lightbulb size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Top observation for this lens</div>
            <div className="mt-0.5 font-semibold text-ink">{topObs.title}</div>
            <div className="mt-1 line-clamp-2 text-[13px] text-slate-600">{topObs.recommended_action}</div>
          </div>
          <span className="flex items-center gap-1 self-center text-[13px] font-medium text-navy">
            All {review.observations.length} <ArrowRight size={14} />
          </span>
        </button>
      )}

      {/* All other indicators */}
      <div>
        <SectionTitle sub="Every value keeps its evidence status, confidence and low–high range. Click any card to see the calculation.">All indicators</SectionTitle>
        <div className="space-y-5">
          {categories.map((c) => (
            <div key={c}>
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">{CATEGORY_LABEL[c] ?? c}</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                {rest
                  .filter((m) => m.category === c)
                  .map((m) => (
                    <KpiCard key={m.id} metric={m} sensitivity={sensitivity} onOpen={onOpenMetric} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
