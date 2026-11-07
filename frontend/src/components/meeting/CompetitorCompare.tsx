"use client";

import { Check, Trophy } from "lucide-react";
import { compareRows, lindstromLeads, PROVIDERS, whyLindstrom, type Source } from "@/lib/competitors";
import type { Review } from "@/lib/types";

const SOURCE: Record<Source, { label: string; dot: string; hint: string }> = {
  review: { label: "This review", dot: "bg-navy", hint: "From this customer's review (synthetic data pack)" },
  pack: { label: "Data pack baseline", dot: "bg-emerald-500", hint: "Baselines sheet of the data pack (illustrative factors)" },
  mock: { label: "Mock", dot: "bg-amber-500", hint: "Invented for the prototype; replace with market data" },
};

export function CompetitorCompare({ review, onOpenMetric }: { review: Review; onOpenMetric: (id: string) => void }) {
  const rows = compareRows(review);
  const reasons = whyLindstrom(review);
  const leads = rows.filter(lindstromLeads).length;
  const ranked = rows.filter((r) => r.better).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">
          Lindström leads on <span className="font-semibold text-ink">{leads} of {ranked}</span> measurable comparisons, and is the only provider here that repairs and tracks every garment.
        </p>
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-amber-800 ring-1 ring-inset ring-amber-300">
          Mock competitor data · anonymised archetypes · illustrative
        </span>
      </div>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="w-[18%] px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-muted">Compared on</th>
                {PROVIDERS.map((p) => (
                  <th key={p.id} className={`px-3 py-3 align-bottom ${p.id === "lindstrom" ? "bg-navy text-white" : ""}`}>
                    <div className="text-[14px] font-semibold">{p.name}</div>
                    <div className={`text-[11px] font-normal leading-snug ${p.id === "lindstrom" ? "text-blue-100" : "text-muted"}`}>{p.kind}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const lead = lindstromLeads(row);
                return (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-ink">{row.label}</div>
                      {row.metricId && review.metrics.some((m) => m.id === row.metricId) && (
                        <button onClick={() => onOpenMetric(row.metricId!)} className="text-[11px] text-navy hover:underline">
                          Lindström evidence
                        </button>
                      )}
                    </td>
                    {PROVIDERS.map((p) => {
                      const cell = row.cells[p.id];
                      const own = p.id === "lindstrom";
                      return (
                        <td key={p.id} className={`px-3 py-2.5 align-top ${own ? "bg-navy-50/70" : ""}`}>
                          <span className="flex items-start gap-1.5">
                            <span title={SOURCE[cell.source].hint} className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SOURCE[cell.source].dot}`} />
                            <span className={`${own ? "font-semibold text-navy-900" : "text-slate-700"} ${cell.value != null ? "tnum" : ""}`}>{cell.text}</span>
                            {own && lead && <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" aria-label="Best of the compared providers" />}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line bg-canvas px-4 py-2.5 text-[11.5px] text-muted">
          {(Object.keys(SOURCE) as Source[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5" title={SOURCE[s].hint}>
              <span className={`h-1.5 w-1.5 rounded-full ${SOURCE[s].dot}`} /> {SOURCE[s].label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <Check size={12} className="text-emerald-600" /> best of the compared providers
          </span>
          <span>Competitors are anonymised category archetypes, not real companies.</span>
        </div>
      </section>

      {reasons.length > 0 && (
        <section className="mt-4">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Trophy size={16} className="text-brand-red" /> Why Lindström stands out
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {reasons.map((r, i) => (
              <div key={r.title} className="lift-in rounded-xl border border-line bg-white p-4">
                <div className="flex items-start gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-[12px] font-semibold text-white">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-ink">{r.title}</div>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{r.text}</p>
                    {r.metricId && review.metrics.some((m) => m.id === r.metricId) && (
                      <button onClick={() => onOpenMetric(r.metricId!)} className="mt-1.5 text-[11.5px] font-medium text-navy hover:underline">
                        Show the calculation
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
