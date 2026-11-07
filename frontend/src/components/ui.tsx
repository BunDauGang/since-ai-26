"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { FLAG_LABELS } from "@/lib/config";

const STATUS_STYLE: Record<string, { cls: string; label: string; hint: string }> = {
  MEASURED: { cls: "bg-teal-50 text-st-measured ring-teal-200", label: "Measured", hint: "Directly measured value" },
  CALCULATED: { cls: "bg-blue-50 text-st-calculated ring-blue-200", label: "Calculated", hint: "Deterministic calculation from source rows" },
  ALLOCATED_ESTIMATE: { cls: "bg-violet-50 text-st-allocated ring-violet-200", label: "Allocated estimate", hint: "Laundry-level value allocated to the customer by washed kg" },
  ESTIMATE: { cls: "bg-amber-50 text-st-estimate ring-amber-200", label: "Estimate", hint: "Depends on a stated assumption; see range" },
  SYNTHETIC: { cls: "bg-slate-100 text-st-synthetic ring-slate-200", label: "Synthetic", hint: "Synthetic value from the hackathon data pack" },
  PUBLIC_REFERENCE: { cls: "bg-emerald-50 text-st-public ring-emerald-200", label: "Public reference", hint: "Publicly stated Lindström context, not a calculation input" },
};

export function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const s = STATUS_STYLE[status] ?? { cls: "bg-slate-100 text-slate-600 ring-slate-200", label: status.replaceAll("_", " ").toLowerCase(), hint: status };
  return (
    <span
      title={s.hint}
      className={`inline-flex items-center rounded-full font-medium uppercase tracking-wide ring-1 ring-inset ${s.cls} ${
        small ? "px-1.5 py-px text-[9.5px]" : "px-2 py-0.5 text-[10.5px]"
      }`}
    >
      {s.label}
    </span>
  );
}

export function ConfidenceDots({ confidence }: { confidence: string }) {
  const levels: Record<string, number> = { Low: 1, "Low-Medium": 2, Medium: 3, "Medium-High": 4, High: 5 };
  const n = levels[confidence] ?? 0;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted" title={`Confidence: ${confidence}`}>
      <span className="flex gap-[2px]">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= n ? "bg-navy" : "bg-slate-200"}`} />
        ))}
      </span>
      {confidence}
    </span>
  );
}

export function FlagChip({ flag, onClick }: { flag: string; onClick?: () => void }) {
  const f = FLAG_LABELS[flag] ?? { label: flag.replaceAll("_", " "), tone: "blue" as const };
  const tone = {
    red: "bg-red-50 text-red-700 ring-red-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    blue: "bg-navy-50 text-navy ring-blue-200",
  }[f.tone];
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tone} ${onClick ? "cursor-pointer" : ""}`}
    >
      {f.label}
    </span>
  );
}

/** Low–base–high bar. Shows where the base case sits inside its sensitivity range. */
export function RangeBar({ low, base, high, active }: { low: number; base: number; high: number; active?: "low" | "base" | "high" }) {
  if (!(high > low)) return <div className="h-1.5 w-full rounded-full bg-slate-100" title="No range: single value" />;
  const pos = (x: number) => `${((x - low) / (high - low)) * 100}%`;
  return (
    <div className="relative h-1.5 w-full rounded-full bg-gradient-to-r from-navy-50 via-blue-100 to-navy-50">
      {(["low", "base", "high"] as const).map((k) => {
        const x = k === "low" ? low : k === "base" ? base : high;
        const on = active === k;
        return (
          <span
            key={k}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
              on ? "h-3 w-3 bg-navy ring-2 ring-white" : k === "base" ? "h-2.5 w-0.5 bg-navy/60" : "h-2 w-0.5 bg-navy/30"
            }`}
            style={{ left: pos(x) }}
          />
        );
      })}
    </div>
  );
}

export function Drawer({ open, onClose, title, subtitle, children, width = "max-w-xl" }: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-navy-900/30 backdrop-blur-[1px]" onClick={onClose} />
      <aside className={`drawer-in relative flex h-full w-full ${width} flex-col bg-white shadow-2xl`}>
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-canvas" aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>
  );
}

export function SectionTitle({ children, right, sub }: { children: React.ReactNode; right?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{children}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = "md" }: {
  value: T;
  options: { value: T; label: React.ReactNode; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-lg bg-canvas p-0.5 ring-1 ring-inset ring-line">
      {options.map((o) => (
        <button
          key={o.value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`rounded-md font-medium transition ${size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-[13px]"} ${
            value === o.value ? "bg-white text-navy shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Inline data-quality warning. Hover (title) or the drawer shows the full explanation. */
export function DqPill({ note, className = "" }: { note: { code: string; short: string; detail: string }; className?: string }) {
  return (
    <span
      title={note.detail}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-300 ${className}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      {note.short}
    </span>
  );
}
