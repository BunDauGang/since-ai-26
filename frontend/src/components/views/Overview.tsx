"use client";

import { ChevronDown, Search, Target } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { INDUSTRY_RULES, inScope, isOutlier, priorityDef, shortSiteName, SITE_METRIC_META, type SiteScope, type ViewId } from "@/lib/config";
import { metricMap } from "@/lib/derive";
import { dqNotes, type DqNote } from "@/lib/dq";
import { compact, formatValue, monthLabel } from "@/lib/format";
import type { Metric, Priority, Review, Sensitivity } from "@/lib/types";
import { KpiCard } from "../KpiCard";
import { StoryStrip } from "../StoryStrip";
import { WhatIfSimulator } from "../WhatIfSimulator";
import { SectionTitle } from "../ui";

const CATEGORY_LABEL: Record<string, string> = {
  scale: "Scale of service",
  allocation: "Allocation & utilisation",
  service: "Service performance",
  repair: "Repair & lifetime",
  footprint: "Footprint (allocated to customer)",
  handprint: "Handprint vs selected baseline",
};

export function Overview({ review, priority, sensitivity, emphasized, onOpenMetric, onOpenSite, onView, siteBaselineNote, scope = null }: {
  scope?: SiteScope | null;
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
  const industryRule = INDUSTRY_RULES[review.meta.industry]?.find((r) => r.priority === priority);
  const dq = dqNotes(review);

  // Spotlight chart: sites ranked by the priority's site metric.
  const sm = SITE_METRIC_META[p.siteMetric];
  const siteData = review.sites
    .filter((s) => s.metrics[p.siteMetric] != null && inScope(s, scope)) // missing data is not a zero
    .map((s) => ({ id: s.site_id, name: shortSiteName(s.site_name, review.meta.customer_name), value: s.metrics[p.siteMetric]!, flagged: isOutlier(s) }))
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
            <KpiCard key={`${priority}-${m.id}`} metric={m} sensitivity={sensitivity} emphasized onOpen={onOpenMetric} size="lg" notes={dq.byMetric.get(m.id)} />
          ))}
        </div>
      </div>

      <StoryStrip
        key={`story-${priority}`}
        review={review}
        priority={priority}
        sensitivity={sensitivity}
        lead={spotlight[0]}
        onOpenMetric={onOpenMetric}
        onOpenObservations={() => onView("observations")}
      />

      {/* Forward-looking lenses get the decision tool right here, not two clicks away. */}
      {(priority === "cost" || priority === "improvement") && <WhatIfSimulator review={review} onOpenSite={onOpenSite} />}

      {/* Charts */}
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="card p-4 xl:col-span-3">
          <SectionTitle sub={`${scope ? `${scope.label} · ` : ""}Top 10 · click a bar to drill down${p.siteMetric.includes("saving") && siteBaselineNote ? ` · ${siteBaselineNote}` : ""}`}>{p.siteMetricLabel}</SectionTitle>
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

      <MoreIndicators metrics={rest} sensitivity={sensitivity} lensLabel={p.label} onOpenMetric={onOpenMetric} notes={dq.byMetric} />
    </div>
  );
}

/** Progressive disclosure: everything outside the lens stays one click away, never in the way. */
function MoreIndicators({ metrics, sensitivity, lensLabel, onOpenMetric, notes }: {
  notes: Map<string, DqNote[]>;
  metrics: Metric[];
  sensitivity: Sensitivity;
  lensLabel: string;
  onOpenMetric: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
  const categories = Array.from(new Set(metrics.map((m) => m.category)));
  const q = query.trim().toLowerCase();
  const shown = metrics.filter(
    (m) => (category === "all" || m.category === category) && (!q || m.label.toLowerCase().includes(q) || m.id.includes(q)),
  );

  return (
    <div className="card">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span>
          <span className="text-[14px] font-semibold text-ink">{open ? "Other indicators" : `Show ${metrics.length} more indicators`}</span>
          <span className="ml-2 text-[12.5px] text-muted">
            Outside the {lensLabel} lens · every value keeps its status, confidence and range
          </span>
        </span>
        <ChevronDown size={18} className={`shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-line px-4 pb-4 pt-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <FilterChip active={category === "all"} onClick={() => setCategory("all")} label="All" count={metrics.length} />
            {categories.map((c) => (
              <FilterChip
                key={c}
                active={category === c}
                onClick={() => setCategory(c)}
                label={CATEGORY_LABEL[c] ?? c}
                count={metrics.filter((m) => m.category === c).length}
              />
            ))}
            <label className="ml-auto flex items-center gap-1.5 rounded-lg bg-canvas px-2.5 py-1.5 ring-1 ring-inset ring-line focus-within:ring-navy/50">
              <Search size={13} className="text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find an indicator"
                aria-label="Find an indicator"
                className="w-40 bg-transparent text-[12.5px] outline-none placeholder:text-slate-400"
              />
            </label>
          </div>
          {shown.length ? (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              {shown.map((m) => (
                <KpiCard key={m.id} metric={m} sensitivity={sensitivity} onOpen={onOpenMetric} size="sm" notes={notes.get(m.id)} />
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-[13px] text-muted">No indicator matches “{query}”.</p>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset transition ${
        active ? "bg-navy text-white ring-navy" : "bg-white text-slate-700 ring-line hover:ring-navy/40"
      }`}
    >
      {label} <span className={active ? "text-blue-200" : "text-muted"}>{count}</span>
    </button>
  );
}
