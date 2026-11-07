"use client";

import { AlertTriangle, ArrowRight, Database, Info, Layers, ShieldCheck } from "lucide-react";
import { formatValue, unitLabel } from "@/lib/format";
import type { DataQualityItem, Review, Sensitivity } from "@/lib/types";
import { ConfidenceDots, SectionTitle, StatusBadge } from "../ui";

export function Methodology({ review, sensitivity, onOpenMetric }: { review: Review; sensitivity: Sensitivity; onOpenMetric: (id: string) => void }) {
  return (
    <div className="space-y-6">
      {/* Boundary summary */}
      <div className="card grid gap-4 p-5 md:grid-cols-4">
        <Fact label="Customer & scope" value={`${review.meta.customer_name} · ${review.sites.length} delivery sites`} />
        <Fact label="Reporting period" value={`${review.meta.period.from} → ${review.meta.period.to}`} />
        <Fact label="Comparison baseline" value={`${review.meta.baseline_name} (${review.meta.baseline_id})`} />
        <Fact label="Sensitivity case shown" value={`${sensitivity[0].toUpperCase()}${sensitivity.slice(1)} — ranges always visible`} />
        <div className="md:col-span-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-[12.5px] text-amber-900 ring-1 ring-inset ring-amber-200">
          <ShieldCheck size={15} className="mt-0.5 shrink-0" />
          <span>
            <b>Data status:</b> {review.meta.data_notice} Footprint = laundry resource intensity × customer washed kg (allocated). Handprint = the same washed kg under the
            selected baseline's per-kg factors minus the allocated footprint. Low/high cases vary baseline factors ±20% and the repair factor 0.5–1.0.
          </span>
        </div>
      </div>

      {/* Data quality */}
      <div>
        <SectionTitle sub="Checks run on every load: blank cells (DQ1), unmapped keys (DQ2), site ↔ customer (DQ3), laundry share sum ≤ 100% (DQ4).">Data-quality findings</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-2">
          {groupFindings(review.data_quality).map((g) => {
            const warn = g.items.some((d) => d.severity === "warning" || d.severity === "error");
            const [first, ...more] = g.items;
            return (
              <div key={g.checkId} className={`card p-4 ${warn ? "border-amber-300" : ""}`}>
                <div className="flex items-center gap-2">
                  {warn ? <AlertTriangle size={16} className="text-amber-600" /> : <Info size={16} className="text-navy" />}
                  <span className="font-mono text-[12px] font-semibold text-ink">{g.checkId}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase ${warn ? "bg-amber-100 text-amber-800" : "bg-navy-50 text-navy"}`}>
                    {warn ? "warning" : "info"}
                  </span>
                  <span className="ml-auto text-[11.5px] text-muted">
                    {g.items.length > 1 ? `${g.items.length} findings · ` : ""}
                    {g.rows} rows
                  </span>
                </div>
                <div className="mt-1 text-[11.5px] text-muted">{Array.from(new Set(g.items.map((d) => d.dataset))).join(", ")}</div>
                <p className="mt-2 text-[13px] text-slate-700">{first.message}</p>
                {more.length > 0 && (
                  <details className="mt-1.5 text-[12.5px] text-slate-600">
                    <summary className="cursor-pointer text-navy">{more.length} more</summary>
                    <ul className="mt-1.5 space-y-1">
                      {more.map((d, i) => (
                        <li key={i}>
                          <span className="text-muted">{d.dataset}:</span> {d.message}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {first.treatment && (
                  <p className="mt-2 rounded-md bg-canvas p-2.5 text-[12.5px] text-slate-700">
                    <b className="text-navy">Treatment:</b> {first.treatment}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Metric registry */}
      <div className="card overflow-hidden">
        <div className="px-4 pt-4">
          <SectionTitle sub="Every number on the dashboard and in the exported deck comes from this registry. Click a row for the full calculation.">Metric registry</SectionTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[12.5px]">
            <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-2">Metric</th>
                <th className="px-3 py-2 text-right">Value ({sensitivity})</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Formula</th>
                <th className="px-3 py-2">Sources</th>
                <th className="px-3 py-2">Assumptions</th>
                <th className="px-3 py-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {review.metrics.map((m) => (
                <tr key={m.id} onClick={() => onOpenMetric(m.id)} className="cursor-pointer border-t border-line align-top hover:bg-navy-50/40">
                  <td className="px-4 py-2">
                    <div className="font-medium text-ink">{m.label}</div>
                    <div className="font-mono text-[10.5px] text-muted">{m.id}</div>
                  </td>
                  <td className="px-3 py-2 text-right tnum whitespace-nowrap">
                    {formatValue(m.value[sensitivity], m.unit)} <span className="text-muted">{unitLabel(m.unit)}</span>
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={m.status} small /></td>
                  <td className="max-w-xs px-3 py-2 font-mono text-[11px] text-slate-600">{m.formula}</td>
                  <td className="px-3 py-2 text-[11.5px] text-slate-600">{m.sources.join(", ")}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-navy">{m.assumptions.join(" ")}</td>
                  <td className="px-3 py-2"><ConfidenceDots confidence={m.confidence} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Assumptions */}
        <div className="card p-4">
          <SectionTitle sub="Pack assumptions (A###) and team assumptions (T###) to confirm with the challenge owner.">Assumption registry</SectionTitle>
          <ul className="divide-y divide-line">
            {review.assumptions.map((a) => (
              <li key={a.id} className="py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11.5px] font-semibold text-navy">{a.id}</span>
                  <span className="text-[13px] font-medium text-ink">{a.assumption}</span>
                  <span className="ml-auto"><ConfidenceDots confidence={a.confidence} /></span>
                </div>
                <div className="mt-0.5 text-[12.5px] text-slate-700">{a.value_or_rule}</div>
                <div className="text-[12px] text-muted">
                  {a.rationale} {a.source && <span className="rounded bg-canvas px-1 text-[10.5px] uppercase">{a.source === "TEAM" ? "team assumption" : a.source}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Data gaps + production path */}
        <div className="space-y-6">
          <div className="card p-4">
            <SectionTitle sub="What the prototype cannot show yet, and which Lindström source would close the gap.">Production data gaps</SectionTitle>
            <ul className="space-y-2">
              {review.data_gaps.map((g, i) => (
                <li key={`${g.gap}-${i}`} className="rounded-lg border border-line p-3">
                  <div className="text-[13px] font-semibold text-ink">{g.gap}</div>
                  <div className="text-[12px] text-muted">{g.impact}</div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-navy">
                    <ArrowRight size={12} /> <Database size={12} /> {g.future_source}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-4">
            <SectionTitle>
              <span className="inline-flex items-center gap-1.5">
                <Layers size={15} className="text-navy" /> Path to production
              </span>
            </SectionTitle>
            <ol className="relative space-y-3 border-l-2 border-line pl-4 text-[12.5px]">
              <Step n="1" title="Hackathon prototype (now)" body="Excel adapter → deterministic engine → review.json → dashboard + PPTX/PDF. Synthetic data only." active />
              <Step n="2" title="Pilot on approved sources" body="Swap only the adapter: Tableau / Power BI exports (Allocated pieces, Washing %, End-to-end delivery, Repairs, WWS Washed Kg) + approved LCA factors. Dashboard and export stay unchanged." />
              <Step n="3" title="eLindström module" body="Self-service customer decision-maker view across countries and service lines (Workwear, Mats, Cleanroom, Industrial wipers)." />
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The engine emits one finding per sheet / laundry-month; show one card per check. Warnings first. */
function groupFindings(items: DataQualityItem[]) {
  const groups = new Map<string, DataQualityItem[]>();
  for (const d of items) groups.set(d.check_id, [...(groups.get(d.check_id) ?? []), d]);
  return Array.from(groups, ([checkId, list]) => ({
    checkId,
    items: list,
    rows: list.reduce((a, d) => a + (d.affected_rows ?? 0), 0),
  })).sort((a, b) => Number(b.items.some((d) => d.severity === "warning")) - Number(a.items.some((d) => d.severity === "warning")));
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 text-[13.5px] font-medium text-ink">{value}</div>
    </div>
  );
}

function Step({ n, title, body, active }: { n: string; title: string; body: string; active?: boolean }) {
  return (
    <li className="relative">
      <span className={`absolute -left-[25px] flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${active ? "bg-brand-red text-white" : "bg-line text-muted"}`}>{n}</span>
      <div className="font-semibold text-ink">{title}</div>
      <div className="text-slate-600">{body}</div>
    </li>
  );
}
