"use client";

import { AlertTriangle, ClipboardList, Info, TrendingDown, TrendingUp } from "lucide-react";
import { SITE_METRIC_META } from "@/lib/config";
import { median } from "@/lib/derive";
import { formatValue, pct } from "@/lib/format";
import type { Review, SiteMetricKey } from "@/lib/types";
import { Drawer, FlagChip } from "./ui";

/** Direction of "good" for each site KPI. null = neutral (scale). */
const GOOD: Partial<Record<SiteMetricKey, "up" | "down">> = {
  allocation_use_rate: "up",
  idle_pieces: "down",
  repair_rate_per_1000: "down",
  on_time_rate: "up",
  median_cycle_hours: "down",
  service_requests: "down",
  water_saving_l: "up",
  co2e_saving_kg: "up",
};

const FLAG_EXPLAIN: Record<string, string> = {
  R1_LOW_ALLOCATION_USE: "Allocation use rate is in the lowest 20% of this customer's sites — review allocated quantities and returns.",
  R2_HIGH_REPAIR_RATE: "Repair rate is more than 1.5× the customer median — examine work conditions or product fit.",
  R3_LATE_CYCLES: "On-time cycle rate is below the customer average — review the pickup schedule.",
  R4_SERVICE_REQUESTS: "Service requests per 1,000 wearers are high — find the cause.",
};

export function SiteDrawer({ siteId, review, onClose, onOpenMetric, siteBaselineNote }: {
  siteId: string | null;
  review: Review;
  onClose: () => void;
  onOpenMetric: (id: string) => void;
  siteBaselineNote?: string;
}) {
  const site = review.sites.find((s) => s.site_id === siteId);
  if (!site) return null;
  const keys = Object.keys(SITE_METRIC_META) as SiteMetricKey[];
  const total = (k: SiteMetricKey) => review.sites.reduce((a, s) => a + (s.metrics[k] ?? 0), 0);
  const obs = review.observations.filter((o) => o.site_ids.includes(site.site_id));
  const rank = (k: SiteMetricKey) => {
    const sorted = [...review.sites].sort((a, b) => (b.metrics[k] ?? 0) - (a.metrics[k] ?? 0));
    return sorted.findIndex((s) => s.site_id === site.site_id) + 1;
  };

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-2xl"
      title={site.site_name}
      subtitle={
        <span>
          {site.site_id} · {site.city}, {site.country} · {site.site_type} · Laundry {site.laundry_id}
        </span>
      }
    >
      {site.flags.length > 0 ? (
        <div className="space-y-2">
          {site.flags.map((f) => (
            <div key={f} className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <div>
                <FlagChip flag={f} />
                <p className="mt-1 text-[13px] text-slate-700">{FLAG_EXPLAIN[f] ?? f}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-canvas p-3 text-[13px] text-slate-600">No rule flags for this site in the selected period.</div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-3">
        {(["washed_kg", "water_saving_l", "co2e_saving_kg"] as SiteMetricKey[]).map((k) => {
          const val = site.metrics[k] ?? 0;
          return (
            <div key={k} className="rounded-xl bg-canvas p-3">
              <div className="text-[11.5px] text-muted">{SITE_METRIC_META[k].label}</div>
              <div className="text-xl font-semibold text-ink tnum">{formatValue(val, SITE_METRIC_META[k].unit)}</div>
              <div className="text-[11px] text-muted">{pct(val / total(k))} of customer · #{rank(k)} of {review.sites.length}</div>
            </div>
          );
        })}
      </div>
      {siteBaselineNote && <p className="mt-1.5 text-[11px] text-muted">Site savings {siteBaselineNote}.</p>}

      <h3 className="mb-2 mt-6 text-[12px] font-semibold uppercase tracking-wider text-muted">Site vs customer median ({review.sites.length} sites)</h3>
      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-[12.5px]">
          <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2">Indicator</th>
              <th className="px-3 py-2 text-right">This site</th>
              <th className="px-3 py-2 text-right">Median</th>
              <th className="px-3 py-2 text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const val = site.metrics[k];
              if (val == null) return null;
              const med = median(review.sites.map((s) => s.metrics[k] ?? NaN));
              const delta = med ? (val - med) / med : 0;
              const good = GOOD[k];
              const isGood = good ? (good === "up" ? delta >= 0 : delta <= 0) : null;
              const notable = Math.abs(delta) >= 0.1;
              const unit = SITE_METRIC_META[k].unit;
              return (
                <tr key={k} className="border-t border-line">
                  <td className="px-3 py-2">
                    <button onClick={() => onOpenMetric(k)} className="text-left text-slate-700 hover:text-navy hover:underline">
                      {SITE_METRIC_META[k].label}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-ink tnum">{formatValue(val, unit, "full")}</td>
                  <td className="px-3 py-2 text-right text-muted tnum">{formatValue(med, unit, "full")}</td>
                  <td className="px-3 py-2 text-right tnum">
                    <span
                      className={`inline-flex items-center gap-0.5 ${
                        !notable || isGood === null ? "text-muted" : isGood ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {delta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {delta >= 0 ? "+" : ""}
                      {(delta * 100).toFixed(0)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] text-muted">Green/red only where a direction is clearly better (e.g. higher on-time rate). Scale indicators stay neutral.</p>

      {obs.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted">
            <ClipboardList size={14} /> Mentioned in observations
          </h3>
          <ul className="space-y-2">
            {obs.map((o) => (
              <li key={o.title} className="rounded-lg border border-line p-3">
                <div className="text-[13px] font-semibold text-ink">{o.title}</div>
                <div className="mt-1 text-[12.5px] text-slate-600">{o.recommended_action}</div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-6 flex gap-2 rounded-lg bg-navy-50 p-3 text-[12px] text-navy">
        <Info size={14} className="mt-0.5 shrink-0" />
        Product × month detail per site is not in review.json yet. It is available in the engine (Service_Activity, Repairs) and can be added to the contract.
      </div>
    </Drawer>
  );
}
