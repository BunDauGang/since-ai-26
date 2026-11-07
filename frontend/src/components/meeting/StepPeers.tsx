"use client";

import { Award, Globe2, TrendingDown } from "lucide-react";
import { useState } from "react";
import { shortSiteName } from "@/lib/config";
import { formatPeer, PEER_KPIS, peerSummary, type PeerRow, type PeerSummary } from "@/lib/peers";
import type { Review } from "@/lib/types";
import { Segmented } from "../ui";
import { CompetitorCompare } from "./CompetitorCompare";
import { StepHeader } from "./parts";

/** Step 4: Lindström vs competing providers first (mentor feedback), then the customer's own sites side by side. */
export function StepPeers({ review, onOpenSite, onOpenMetric }: { review: Review; onOpenSite: (id: string) => void; onOpenMetric: (id: string) => void }) {
  const [mode, setMode] = useState<"competitors" | "sites">("competitors");
  const toggle = (
    <Segmented
      value={mode}
      onChange={setMode}
      options={[
        { value: "competitors", label: "Lindström vs competitors" },
        { value: "sites", label: "Your sites side by side" },
      ]}
    />
  );
  if (mode === "sites") return <SitePeers review={review} onOpenSite={onOpenSite} toggle={toggle} />;
  return (
    <div>
      <StepHeader
        kicker="Peer review"
        title="Why Lindström stands out against the alternatives"
        sub="The same service compared with a competing rental provider, a wash-only local laundry and washing in-house. Every cell shows where its number comes from."
        right={toggle}
      />
      <CompetitorCompare review={review} onOpenMetric={onOpenMetric} />
    </div>
  );
}

function SitePeers({ review, onOpenSite, toggle }: { review: Review; onOpenSite: (id: string) => void; toggle: React.ReactNode }) {
  const available = PEER_KPIS.map((k) => peerSummary(review, k)).filter((s): s is PeerSummary => !!s);
  const [kpiId, setKpiId] = useState(available[0]?.kpi.id ?? "");
  const s = available.find((x) => x.kpi.id === kpiId) ?? available[0];
  if (!s) {
    return (
      <div>
        <StepHeader kicker="Peer review" title="Not enough site data to compare" right={toggle} />
      </div>
    );
  }
  const name = (row: PeerRow) => shortSiteName(row.site.site_name, review.meta.customer_name);
  const fmt = (v: number) => formatPeer(s.kpi.unit, v);
  const belowMedian = s.rows.filter((r) => (s.kpi.better === "higher" ? r.value < s.median : r.value > s.median)).length;
  const n = Math.max(1, Math.min(3, Math.floor(s.rows.length / 2)));
  const plural = (k: number) => `${k} site${k === 1 ? "" : "s"}`;
  const reachTop = s.rows.filter((r) => (s.kpi.better === "higher" ? r.value >= s.topQuartile : r.value <= s.topQuartile)).length;

  return (
    <div>
      <StepHeader
        kicker="Peer review"
        title={`Your best sites already reach ${fmt(s.topQuartile)}`}
        sub={`${s.kpi.label}: the best quarter of your ${s.rows.length} sites reach ${fmt(s.topQuartile)} or better; the median site is at ${fmt(s.median)}. The gap between your own sites is the most credible benchmark we have.`}
        right={toggle}
      />
      <div className="mb-3 overflow-x-auto">
        <Segmented size="sm" value={s.kpi.id} onChange={setKpiId} options={available.map((x) => ({ value: x.kpi.id, label: x.kpi.label }))} />
      </div>

      <section className="card p-5">
        <Strip s={s} onOpenSite={onOpenSite} name={name} />
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-navy" /> top quarter ({plural(reachTop)})</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> middle</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> below the median ({plural(belowMedian)})</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-0.5 bg-ink" /> median</span>
          <span>{s.kpi.better === "higher" ? "Higher is better" : "Lower is better"} · click a dot to open the site</span>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <List title="Leading sites" icon={Award} rows={s.rows.slice(0, n)} fmt={fmt} name={name} onOpenSite={onOpenSite} tone="navy" />
        <List title="Sites to look at together" icon={TrendingDown} rows={s.rows.slice(-n).reverse()} fmt={fmt} name={name} onOpenSite={onOpenSite} tone="amber" />
        <section className="card p-4">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <Globe2 size={15} className="text-navy" /> By country (median)
          </h3>
          <ul className="mt-3 space-y-2">
            {s.byCountry.map((c) => (
              <li key={c.country} className="flex items-center justify-between text-[13.5px]">
                <span className="text-ink">{c.country} <span className="text-[12px] text-muted">({plural(c.n)})</span></span>
                <span className="font-semibold text-ink tnum">{fmt(c.median)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed text-muted">
            {s.network ? (
              <>
                Lindström network median (anonymised{s.network.sampleSize ? `, ${s.network.sampleSize} customers` : ""}):{" "}
                <span className="font-semibold text-ink">{fmt(s.network.median)}</span>
                {(() => {
                  const yours = review.metrics.find((m) => m.id === s.kpi.metricId)?.value.base;
                  if (yours == null) return null;
                  const v = yours * (s.kpi.networkScale ?? 1);
                  const better = s.kpi.better === "higher" ? v > s.network!.median : v < s.network!.median;
                  return <> · yours {fmt(v)}, {v === s.network!.median ? "at" : better ? "better than" : "behind"} the network median</>;
                })()}
              </>
            ) : (
              <>A Lindström network benchmark (other customers, anonymised) appears here once the engine provides it. Other customers are never named.</>
            )}
          </div>
        </section>
      </div>
      {s.missing > 0 && <p className="mt-2 text-[12px] text-muted">{s.missing} sites have no data for this KPI and are not shown.</p>}
    </div>
  );
}

function Strip({ s, onOpenSite, name }: { s: PeerSummary; onOpenSite: (id: string) => void; name: (r: PeerRow) => string }) {
  const values = s.rows.map((r) => r.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.08 || 1;
  const lo = min - pad;
  const hi = max + pad;
  // Better values always to the right.
  const x = (v: number) => {
    const t = (v - lo) / (hi - lo);
    return (s.kpi.better === "higher" ? t : 1 - t) * 100;
  };
  const tone = (v: number) => {
    const good = s.kpi.better === "higher" ? v >= s.topQuartile : v <= s.topQuartile;
    const bad = s.kpi.better === "higher" ? v < s.median : v > s.median;
    return good ? "bg-navy" : bad ? "bg-amber-500" : "bg-slate-400";
  };
  // Stack dots that would overlap.
  const placed: { row: PeerRow; left: number; lane: number }[] = [];
  for (const row of [...s.rows].sort((a, b) => x(a.value) - x(b.value))) {
    const left = x(row.value);
    let lane = 0;
    while (placed.some((p) => p.lane === lane && Math.abs(p.left - left) < 2.2)) lane++;
    placed.push({ row, left, lane });
  }
  const lanes = Math.max(1, ...placed.map((p) => p.lane + 1));
  const fmt = (v: number) => formatPeer(s.kpi.unit, v);

  return (
    <div>
      <div className="relative" style={{ height: 28 + lanes * 16 }}>
        <div className="absolute inset-x-0 bottom-3 h-px bg-line" />
        <div className="absolute bottom-0 top-0 w-0.5 bg-ink" style={{ left: `${x(s.median)}%` }} title={`Median ${fmt(s.median)}`} />
        <div className="absolute bottom-0 top-0 border-l border-dashed border-navy/50" style={{ left: `${x(s.topQuartile)}%` }} title={`Top quarter from ${fmt(s.topQuartile)}`} />
        {placed.map(({ row, left, lane }) => (
          <button
            key={row.site.site_id}
            onClick={() => onOpenSite(row.site.site_id)}
            title={`${name(row)}: ${fmt(row.value)}`}
            aria-label={`${name(row)}: ${fmt(row.value)}`}
            className={`absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full ring-2 ring-white transition hover:scale-125 ${tone(row.value)}`}
            style={{ left: `${left}%`, bottom: 6 + lane * 16 }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11.5px] text-muted tnum">
        <span>{fmt(s.weakest.value)} · needs attention</span>
        <span>median {fmt(s.median)}</span>
        <span>best · {fmt(s.best.value)}</span>
      </div>
    </div>
  );
}

function List({ title, icon: Icon, rows, fmt, name, onOpenSite, tone }: {
  title: string;
  icon: React.ElementType;
  rows: PeerRow[];
  fmt: (v: number) => string;
  name: (r: PeerRow) => string;
  onOpenSite: (id: string) => void;
  tone: "navy" | "amber";
}) {
  return (
    <section className="card p-4">
      <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
        <Icon size={15} className={tone === "navy" ? "text-navy" : "text-amber-600"} /> {title}
      </h3>
      <ul className="mt-3 space-y-1">
        {rows.map((r) => (
          <li key={r.site.site_id}>
            <button onClick={() => onOpenSite(r.site.site_id)} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13.5px] hover:bg-canvas">
              <span className="min-w-0 truncate text-ink">
                {name(r)} <span className="text-[12px] text-muted">{r.site.country}</span>
              </span>
              <span className={`font-semibold tnum ${tone === "navy" ? "text-navy" : "text-amber-700"}`}>{fmt(r.value)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
