"use client";

import { Calculator, Star } from "lucide-react";
import { formatValue, unitLabel } from "@/lib/format";
import type { Metric, Sensitivity } from "@/lib/types";
import type { DqNote } from "@/lib/dq";
import { ConfidenceDots, DqPill, RangeBar, StatusBadge } from "./ui";

export function KpiCard({ metric, sensitivity, emphasized, onOpen, size = "md", notes = [] }: {
  notes?: DqNote[];
  metric: Metric;
  sensitivity: Sensitivity;
  emphasized?: boolean;
  onOpen: (id: string) => void;
  size?: "sm" | "md" | "lg";
}) {
  const { low, base, high } = metric.value;
  const value = metric.value[sensitivity];
  const hasRange = high > low;
  if (size === "sm") {
    // Compact row-like card for secondary indicators: same evidence, a third of the height.
    return (
      <button
        onClick={() => onOpen(metric.id)}
        title="Show the calculation"
        className="lift-in group flex h-full flex-col rounded-lg border border-line bg-white px-3 py-2.5 text-left transition hover:border-navy/40 hover:shadow-sm"
      >
        <span className="line-clamp-1 text-[12px] font-medium text-slate-600">{metric.label}</span>
        {notes.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {notes.map((n) => (
              <DqPill key={n.code} note={n} />
            ))}
          </span>
        )}
        <span className="mt-0.5 flex items-baseline gap-1">
          <span className="text-lg font-semibold text-ink tnum">{formatValue(value, metric.unit)}</span>
          <span className="text-[11.5px] text-muted">{unitLabel(metric.unit)}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center justify-between gap-1.5">
          <StatusBadge status={metric.status} small />
          <span className="text-[10.5px] text-muted tnum">
            {hasRange ? `${formatValue(low, metric.unit)}–${formatValue(high, metric.unit)}` : metric.confidence}
          </span>
        </span>
      </button>
    );
  }
  return (
    <button
      onClick={() => onOpen(metric.id)}
      className={`lift-in group relative flex h-full flex-col rounded-xl border bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
        emphasized ? "border-navy/30 shadow-sm ring-1 ring-navy/10" : "border-line"
      }`}
    >
      {emphasized && <span className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-brand-red" />}
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12.5px] font-medium leading-snug text-slate-600">{metric.label}</span>
        {emphasized && <Star size={13} className="mt-0.5 shrink-0 fill-brand-red text-brand-red" aria-label="Emphasized for this priority" />}
      </div>
      {notes.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {notes.map((n) => (
            <DqPill key={n.code} note={n} />
          ))}
        </div>
      )}
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`tnum font-semibold tracking-tight text-ink ${size === "lg" ? "text-3xl" : "text-2xl"}`}>{formatValue(value, metric.unit)}</span>
        <span className="text-[13px] text-muted">{unitLabel(metric.unit)}</span>
      </div>
      {hasRange ? (
        <div className="mt-2.5">
          <RangeBar low={low} base={base} high={high} active={sensitivity} />
          <div className="mt-1 flex justify-between text-[10.5px] text-muted tnum">
            <span>Low {formatValue(low, metric.unit)}</span>
            <span>High {formatValue(high, metric.unit)}</span>
          </div>
        </div>
      ) : (
        <div className="mt-2.5 text-[10.5px] text-muted">Single value · no sensitivity range</div>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
        <StatusBadge status={metric.status} small />
        <ConfidenceDots confidence={metric.confidence} />
      </div>
      <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-md bg-navy-900 px-2 py-1 text-[11px] text-white group-hover:flex">
        <Calculator size={11} /> Show the calculation
      </span>
    </button>
  );
}
