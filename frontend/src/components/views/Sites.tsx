"use client";

import { ArrowDown, ArrowUp, Filter } from "lucide-react";
import { useMemo, useState } from "react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { SITE_METRIC_META } from "@/lib/config";
import { median } from "@/lib/derive";
import { compact, formatValue, pct } from "@/lib/format";
import type { Review, Site, SiteMetricKey } from "@/lib/types";
import { FlagChip, SectionTitle, Segmented } from "../ui";

const COLUMNS: SiteMetricKey[] = [
  "wearers_min_est",
  "garments_allocated",
  "allocation_use_rate",
  "repair_rate_per_1000",
  "on_time_rate",
  "median_cycle_hours",
  "service_requests",
  "washed_kg",
  "water_saving_l",
  "co2e_saving_kg",
];

const FLAG_COUNTRY: Record<string, string> = { Finland: "🇫🇮", Sweden: "🇸🇪", Poland: "🇵🇱" };

export function Sites({ review, onOpenSite, siteBaselineNote }: { review: Review; onOpenSite: (id: string) => void; siteBaselineNote?: string }) {
  const [country, setCountry] = useState("all");
  const [type, setType] = useState("all");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SiteMetricKey | "site_name"; dir: 1 | -1 }>({ key: "allocation_use_rate", dir: 1 });

  const countries = Array.from(new Set(review.sites.map((s) => s.country)));
  const types = Array.from(new Set(review.sites.map((s) => s.site_type))).sort();

  const rows = useMemo(() => {
    const r = review.sites.filter(
      (s) => (country === "all" || s.country === country) && (type === "all" || s.site_type === type) && (!flaggedOnly || s.flags.length > 0),
    );
    return r.sort((a, b) => {
      if (sort.key === "site_name") return a.site_name.localeCompare(b.site_name) * sort.dir;
      return ((a.metrics[sort.key] ?? 0) - (b.metrics[sort.key] ?? 0)) * sort.dir;
    });
  }, [review.sites, country, type, flaggedOnly, sort]);

  const byCountry = countries.map((c) => {
    const ss = review.sites.filter((s) => s.country === c);
    const sum = (k: SiteMetricKey) => ss.reduce((a, s) => a + (s.metrics[k] ?? 0), 0);
    return {
      country: c,
      sites: ss.length,
      flagged: ss.filter((s) => s.flags.length).length,
      washed: sum("washed_kg"),
      wearers: sum("wearers_min_est"),
      use: sum("garments_allocated") ? (sum("garments_allocated") - sum("idle_pieces")) / sum("garments_allocated") : NaN,
    };
  });

  const medUse = median(review.sites.map((s) => s.metrics.allocation_use_rate ?? NaN));
  const medRepair = median(review.sites.map((s) => s.metrics.repair_rate_per_1000 ?? NaN));
  const scatter = review.sites.map((s) => ({
    id: s.site_id,
    name: s.site_name,
    x: (s.metrics.allocation_use_rate ?? 0) * 100,
    y: s.metrics.repair_rate_per_1000 ?? 0,
    z: s.metrics.washed_kg ?? 0,
    flagged: s.flags.length > 0,
  }));

  return (
    <div className="space-y-6">
      {/* Country roll-up */}
      <div className="grid gap-3 md:grid-cols-3">
        {byCountry.map((c) => (
          <button
            key={c.country}
            onClick={() => setCountry(country === c.country ? "all" : c.country)}
            className={`card p-4 text-left transition hover:shadow-md ${country === c.country ? "ring-2 ring-navy/40" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold text-ink">
                {FLAG_COUNTRY[c.country] ?? ""} {c.country}
              </span>
              <span className="text-[12px] text-muted">
                {c.sites} sites{c.flagged ? ` · ${c.flagged} flagged` : ""}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[12px] text-muted">
              <div>
                <div className="text-[17px] font-semibold text-ink tnum">{compact(c.washed)}</div>kg washed
              </div>
              <div>
                <div className="text-[17px] font-semibold text-ink tnum">{compact(c.wearers)}</div>wearers (min est.)
              </div>
              <div>
                <div className="text-[17px] font-semibold text-ink tnum">{pct(c.use)}</div>allocation use
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Scatter: where are the outliers */}
      <div className="card p-4">
        <SectionTitle sub="Bubble size = washed kg. Bottom-left quadrant of a well-run site is high use, low repairs. Red = rule-flagged. Click a bubble to drill down.">
          Allocation use vs repair rate — {review.sites.length} sites
        </SectionTitle>
        <div className="h-80">
          <ResponsiveContainer>
            <ScatterChart margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid stroke="#eef1f5" />
              <XAxis type="number" dataKey="x" name="Allocation use" unit="%" domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => v.toFixed(0)} label={{ value: "Allocation use rate (%)", position: "insideBottom", offset: -4, fontSize: 11, fill: "#64748b" }} />
              <YAxis type="number" dataKey="y" name="Repairs / 1,000 washes" tick={{ fontSize: 11, fill: "#64748b" }} width={40} label={{ value: "Repairs / 1,000", angle: -90, position: "insideLeft", fontSize: 11, fill: "#64748b" }} />
              <ZAxis type="number" dataKey="z" range={[40, 400]} />
              <ReferenceLine x={medUse * 100} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "median", fontSize: 10, fill: "#94a3b8", position: "top" }} />
              <ReferenceLine y={medRepair * 1.5} stroke="#e30613" strokeOpacity={0.4} strokeDasharray="4 4" label={{ value: "R2: 1.5× median", fontSize: 10, fill: "#e30613", position: "right" }} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ payload }) => {
                  const d = payload?.[0]?.payload as (typeof scatter)[number] | undefined;
                  if (!d) return null;
                  return (
                    <div className="rounded-lg border border-line bg-white px-3 py-2 text-[12px] shadow">
                      <div className="font-semibold">{d.name}</div>
                      <div>Allocation use {d.x.toFixed(1)}%</div>
                      <div>Repairs {d.y.toFixed(1)} / 1,000 washes</div>
                      <div>{compact(d.z)} kg washed</div>
                    </div>
                  );
                }}
              />
              <Scatter data={scatter.filter((d) => !d.flagged)} fill="#003f72" fillOpacity={0.55} onClick={(d: { id?: string }) => d.id && onOpenSite(d.id)} className="cursor-pointer" />
              <Scatter data={scatter.filter((d) => d.flagged)} fill="#e30613" fillOpacity={0.75} onClick={(d: { id?: string }) => d.id && onOpenSite(d.id)} className="cursor-pointer" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <Filter size={15} className="text-muted" />
          <Segmented
            size="sm"
            value={country}
            onChange={setCountry}
            options={[{ value: "all", label: "All countries" }, ...countries.map((c) => ({ value: c, label: c }))]}
          />
          <select className="select h-8 text-xs" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All site types</option>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[12.5px] text-slate-700">
            <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} className="accent-[#e30613]" />
            Flagged only
          </label>
          <span className="ml-auto text-[12px] text-muted">
            {rows.length} of {review.sites.length} sites{siteBaselineNote ? ` · savings ${siteBaselineNote}` : ""}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[12.5px]">
            <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <Th label="Site" k="site_name" sort={sort} setSort={setSort} />
                {COLUMNS.map((k) => (
                  <Th key={k} label={SITE_METRIC_META[k].label} k={k} sort={sort} setSort={setSort} right />
                ))}
                <th className="px-3 py-2.5">Flags</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <SiteRow key={s.site_id} s={s} onOpen={onOpenSite} medUse={medUse} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ label, k, sort, setSort, right }: {
  label: string;
  k: SiteMetricKey | "site_name";
  sort: { key: SiteMetricKey | "site_name"; dir: 1 | -1 };
  setSort: (s: { key: SiteMetricKey | "site_name"; dir: 1 | -1 }) => void;
  right?: boolean;
}) {
  const active = sort.key === k;
  return (
    <th className={`px-3 py-2.5 font-semibold ${right ? "text-right" : ""}`}>
      <button
        onClick={() => setSort({ key: k, dir: active ? (sort.dir === 1 ? -1 : 1) : k === "site_name" ? 1 : -1 })}
        className={`inline-flex items-center gap-0.5 uppercase ${active ? "text-navy" : ""}`}
      >
        {label}
        {active && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );
}

function SiteRow({ s, onOpen, medUse }: { s: Site; onOpen: (id: string) => void; medUse: number }) {
  const m = s.metrics;
  return (
    <tr onClick={() => onOpen(s.site_id)} className="cursor-pointer border-t border-line hover:bg-navy-50/50">
      <td className="px-3 py-2">
        <div className="font-medium text-ink">{s.site_name}</div>
        <div className="text-[11px] text-muted">
          {s.site_id} · {s.city} · {s.site_type}
        </div>
      </td>
      {COLUMNS.map((k) => {
        const val = m[k];
        if (val == null) return <td key={k} className="px-3 py-2 text-right text-slate-300">—</td>;
        if (k === "allocation_use_rate") {
          return (
            <td key={k} className="px-3 py-2 text-right">
              <div className="flex items-center justify-end gap-2">
                <span className="h-1.5 w-14 overflow-hidden rounded-full bg-canvas">
                  <span className={`block h-full rounded-full ${val < medUse ? "bg-amber-500" : "bg-navy/70"}`} style={{ width: `${val * 100}%` }} />
                </span>
                <span className="w-12 tnum">{pct(val)}</span>
              </div>
            </td>
          );
        }
        return (
          <td key={k} className="px-3 py-2 text-right text-slate-700 tnum">
            {formatValue(val, SITE_METRIC_META[k].unit)}
          </td>
        );
      })}
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {s.flags.map((f) => (
            <FlagChip key={f} flag={f} />
          ))}
        </div>
      </td>
    </tr>
  );
}
