"use client";

import { ClipboardCopy, FlaskConical, PackageCheck, RotateCcw, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { shortSiteName } from "@/lib/config";
import { full, pct } from "@/lib/format";
import type { Review } from "@/lib/types";
import { simulate } from "@/lib/whatif";
import { StatusBadge } from "./ui";

const DEFAULTS = { reclaimShare: 0.5, repairGapClosed: 0.5 };

/**
 * Interactive 2026 decision support. Moves two explicit levers over the review's own site data and
 * shows the projected effect. Scenario output only — never written into the review or the export.
 */
export function WhatIfSimulator({ review, onOpenSite }: { review: Review; onOpenSite: (id: string) => void }) {
  const [inp, setInp] = useState(DEFAULTS);
  const [copied, setCopied] = useState(false);
  const r = useMemo(() => simulate(review, inp), [review, inp]);
  const name = (s: { site_name: string }) => shortSiteName(s.site_name, review.meta.customer_name);

  const summary = [
    `2026 what-if for ${review.meta.customer_name} (illustrative scenario, synthetic data, not a forecast):`,
    r.available.reclaim
      ? `- Reclaim ${Math.round(inp.reclaimShare * 100)}% of idle garments at ${r.r1Sites.length} low-use sites (R1): ${full(r.reclaimed, 0)} pieces; ` +
        `allocation use ${pct(r.useRateBefore!)} -> ${pct(r.useRateAfter!)}` +
        (r.capitalReleasedEur != null ? `; illustrative stock value ~EUR ${full(r.capitalReleasedEur, 0)} (not a saving).` : ".")
      : null,
    r.available.repair
      ? `- Close ${Math.round(inp.repairGapClosed * 100)}% of the gap to the median repair rate (${full(r.medianRate, 1)}/1,000 washes) at ${r.repairSites.length} sites: ~${full(r.avoidedRepairs, 0)} fewer repairs per period.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <section className="card overflow-hidden" aria-label="2026 what-if simulator">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-gradient-to-r from-navy-50 to-white px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-navy p-2 text-white">
            <FlaskConical size={18} />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold text-ink">2026 what-if: try an action before proposing it</h2>
            <p className="mt-0.5 max-w-2xl text-[12.5px] text-slate-600">
              Move a lever to see what it would change, using this review&apos;s own site data. Everything else is held constant. This is a scenario to
              discuss, not a forecast or a commitment.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status="ESTIMATE" />
          <button onClick={() => setInp(DEFAULTS)} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-navy" title="Reset levers">
            <RotateCcw size={12} /> Reset
          </button>
          <button onClick={copy} className="btn-secondary h-8 px-2.5 text-[12px]">
            <ClipboardCopy size={13} /> {copied ? "Copied" : "Copy for steering deck"}
          </button>
        </div>
      </header>

      <div className="grid divide-y divide-line lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        {/* Lever 1 */}
        <div className="p-5">
          <LeverTitle icon={PackageCheck} title="Reclaim idle garments at low-use sites" rule="R1" />
          {r.available.reclaim ? (
            <>
              <Slider
                label="Share of idle garments reclaimed"
                value={inp.reclaimShare}
                onChange={(v) => setInp((x) => ({ ...x, reclaimShare: v }))}
              />
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Result label="Garments reclaimed" value={full(r.reclaimed, 0)} sub={`of ${full(r.idleAtR1, 0)} idle at ${r.r1Sites.length} sites`} />
                <Result
                  label="Allocation use"
                  value={pct(r.useRateAfter!)}
                  sub={`from ${pct(r.useRateBefore!)} (+${((r.useRateAfter! - r.useRateBefore!) * 100).toFixed(1)} pts)`}
                  highlight
                />
                <Result
                  label="Stock value released"
                  value={r.capitalReleasedEur != null ? `€${full(r.capitalReleasedEur, 0)}` : "—"}
                  sub="illustrative, not a saving"
                />
              </div>
              <SiteList
                rows={r.r1Sites.map((x) => ({ id: x.site.site_id, name: name(x.site), detail: `${full(x.reclaimed!, 0)} of ${full(x.idle!, 0)} idle` }))}
                onOpenSite={onOpenSite}
              />
              <Assumptions
                items={[
                  "Reclaimed pieces leave the customer's allocation and return to Lindström's pool; garments in use are unchanged.",
                  "Idle = allocated but not scanned in the latest month. Unscanned stock is not proof of waste: confirm shift buffers first.",
                  "Stock value uses the synthetic purchase cost of idle pieces (T003). It is capital tied up, not a cost saving.",
                ]}
              />
            </>
          ) : (
            <Empty text="No R1 low-allocation-use sites with idle garments in this review." />
          )}
        </div>

        {/* Lever 2 */}
        <div className="p-5">
          <LeverTitle icon={Wrench} title="Reduce excess repairs at high-repair sites" rule={r.repairSites.some((x) => x.site.flags.some((f) => f.startsWith("R2_"))) ? "R2" : undefined} />
          {r.available.repair ? (
            <>
              <Slider
                label={`Gap to the customer median (${full(r.medianRate, 1)} repairs / 1,000 washes) closed`}
                value={inp.repairGapClosed}
                onChange={(v) => setInp((x) => ({ ...x, repairGapClosed: v }))}
              />
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Result label="Repairs avoided" value={`~${full(r.avoidedRepairs, 0)}`} sub="per reporting period" highlight />
                <Result
                  label="Share of all repairs"
                  value={r.repairsTotal ? pct(r.avoidedRepairs / r.repairsTotal) : "—"}
                  sub={r.repairsTotal ? `of ${full(r.repairsTotal, 0)}` : ""}
                />
                <Result label="Sites in scope" value={String(r.repairSites.length)} sub="above the median rate" />
              </div>
              <SiteList
                rows={r.repairSites.slice(0, 6).map((x) => ({
                  id: x.site.site_id,
                  name: name(x.site),
                  detail: `${full(x.rate!, 1)} → ${full(x.target!, 1)} /1,000`,
                  flagged: x.site.flags.some((f) => f.startsWith("R2_")),
                }))}
                more={Math.max(0, r.repairSites.length - 6)}
                onOpenSite={onOpenSite}
              />
              <Assumptions
                items={[
                  "Washed volume per site stays as in this period; repairs scale with the repair rate.",
                  "Fewer repairs means less garment damage (e.g. better fit or work conditions), but also a smaller repair handprint. Discuss both.",
                  "A high repair rate is a signal to investigate, not proof of a problem at the site.",
                ]}
              />
            </>
          ) : (
            <Empty text="No sites above the customer's median repair rate." />
          )}
        </div>
      </div>
    </section>
  );
}

function LeverTitle({ icon: Icon, title, rule }: { icon: React.ElementType; title: string; rule?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon size={16} className="text-navy" />
      <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
      {rule && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">{rule} sites</span>}
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[12.5px] text-slate-700">
        {label}
        <span className="rounded-md bg-navy px-2 py-0.5 text-[12px] font-semibold text-white tnum">{Math.round(value * 100)}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="mt-2 w-full accent-[#003f72]"
      />
      <span className="flex justify-between text-[10.5px] text-muted">
        <span>0% (no change)</span>
        <span>100%</span>
      </span>
    </label>
  );
}

function Result({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 ${highlight ? "bg-navy text-white" : "bg-canvas"}`}>
      <div className={`text-[11px] ${highlight ? "text-blue-200" : "text-muted"}`}>{label}</div>
      <div className="text-lg font-semibold tnum">{value}</div>
      {sub && <div className={`text-[10.5px] ${highlight ? "text-blue-100" : "text-muted"}`}>{sub}</div>}
    </div>
  );
}

function SiteList({ rows, more = 0, onOpenSite }: {
  rows: { id: string; name: string; detail: string; flagged?: boolean }[];
  more?: number;
  onOpenSite: (id: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {rows.map((x) => (
        <button
          key={x.id}
          onClick={() => onOpenSite(x.id)}
          className={`rounded-md px-2 py-1 text-[11.5px] ring-1 ring-inset hover:ring-navy/50 ${x.flagged ? "bg-red-50 text-red-800 ring-red-200" : "bg-white text-slate-700 ring-line"}`}
        >
          <b className="font-medium">{x.name}</b> <span className="text-muted">{x.detail}</span>
        </button>
      ))}
      {more > 0 && <span className="px-1 py-1 text-[11.5px] text-muted">+{more} more</span>}
    </div>
  );
}

function Assumptions({ items }: { items: string[] }) {
  return (
    <details className="mt-3 text-[12px] text-slate-600">
      <summary className="cursor-pointer font-medium text-navy">Assumptions held constant</summary>
      <ul className="mt-1.5 list-disc space-y-1 pl-4">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </details>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg bg-canvas px-3 py-4 text-center text-[12.5px] text-muted">{text}</p>;
}
