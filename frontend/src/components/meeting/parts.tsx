"use client";

import { Calculator } from "lucide-react";
import { meaning, sayValue } from "@/lib/personas";
import type { Metric, Review } from "@/lib/types";
import { StatusBadge } from "../ui";

/** Big, friendly headline number with one plain-language line and a way into the evidence. */
export function BigStat({ metric, review, onOpen, tone = "white" }: {
  metric: Metric;
  review: Review;
  onOpen: (id: string) => void;
  tone?: "white" | "navy";
}) {
  const navy = tone === "navy";
  const hasRange = metric.value.high > metric.value.low;
  return (
    <button
      onClick={() => onOpen(metric.id)}
      className={`lift-in group flex h-full flex-col rounded-2xl p-5 text-left transition ${
        navy ? "bg-navy text-white hover:bg-navy-900" : "border border-line bg-white hover:border-navy/40 hover:shadow-md"
      }`}
    >
      <span className={`text-[30px] font-semibold leading-none tracking-tight tnum sm:text-[34px] ${navy ? "text-white" : "text-ink"}`}>{sayValue(metric)}</span>
      <span className={`mt-2 text-[14px] leading-snug ${navy ? "text-blue-100" : "text-slate-600"}`}>{meaning(metric.id, review)}</span>
      {hasRange && (
        <span className={`mt-1 text-[12px] tnum ${navy ? "text-blue-200" : "text-muted"}`}>
          range {sayValue(metric, metric.value.low)} to {sayValue(metric, metric.value.high)}
        </span>
      )}
      <span className="mt-auto flex items-center justify-between gap-2 pt-4">
        <StatusBadge status={metric.status} small />
        <span className={`inline-flex items-center gap-1 text-[11.5px] font-medium group-hover:underline ${navy ? "text-blue-100" : "text-navy"}`}>
          <Calculator size={11} /> Show the calculation
        </span>
      </span>
    </button>
  );
}

export function StepHeader({ kicker, title, sub, right }: { kicker: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-3xl">
        <div className="text-[11.5px] font-semibold uppercase tracking-wider text-brand-red">{kicker}</div>
        <h2 className="mt-1 text-[24px] font-semibold leading-tight tracking-tight text-ink sm:text-[28px]">{title}</h2>
        {sub && <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function RoughLabel({ text = "ROUGH CALCULATION · KAM ASSUMPTIONS · NOT A QUOTE" }: { text?: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-amber-800 ring-1 ring-inset ring-amber-300">
      {text}
    </span>
  );
}

export function NumberInput({ label, value, onChange, step = 1, min = 0, max, prefix, suffix, hint }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  prefix?: string;
  suffix?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-[12px] font-medium text-slate-700">{label}</span>}
      <span className="flex h-9 items-center rounded-lg border border-line bg-white px-2.5 focus-within:border-navy/50">
        {prefix && <span className="mr-1 text-[13px] text-muted">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ""}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange(Number.isFinite(v) ? Math.max(min, max != null ? Math.min(max, v) : v) : min);
          }}
          className="w-full min-w-0 bg-transparent text-[13px] text-ink outline-none tnum"
        />
        {suffix && <span className="ml-1 whitespace-nowrap text-[12px] text-muted">{suffix}</span>}
      </span>
      {hint && <span className="mt-1 block text-[11px] leading-snug text-muted">{hint}</span>}
    </label>
  );
}
