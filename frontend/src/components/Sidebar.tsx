"use client";

import { BarChart3, ClipboardList, FlaskConical, LayoutDashboard, MapPin, RefreshCw, Scale } from "lucide-react";
import type { ViewId } from "@/lib/config";
import type { Mode } from "@/lib/useReview";

const NAV: { id: ViewId; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Executive overview", icon: LayoutDashboard },
  { id: "sites", label: "Sites & drill-down", icon: MapPin },
  { id: "baselines", label: "Baseline & circularity", icon: Scale },
  { id: "observations", label: "Meeting prep & actions", icon: ClipboardList },
  { id: "methodology", label: "Methodology & data", icon: FlaskConical },
];

export function Sidebar({ view, onView, customerName, industry, counts, mode, onRecheck }: {
  view: ViewId;
  onView: (v: ViewId) => void;
  customerName: string;
  industry: string;
  counts: Partial<Record<ViewId, number>>;
  mode: Mode;
  onRecheck: () => void;
}) {
  return (
    <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-white lg:flex">
      <div className="flex h-16 items-center border-b border-line px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lindstrom-logo.png" alt="Lindström" className="h-7 w-auto" />
      </div>
      <div className="px-5 pb-3 pt-5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Value review</div>
        <div className="mt-1 text-[15px] font-semibold leading-tight text-ink">{customerName}</div>
        <div className="text-xs text-muted">{industry}</div>
      </div>
      <nav className="flex flex-col gap-0.5 px-3">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => onView(id)}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13.5px] transition ${
                active ? "bg-navy-50 font-semibold text-navy" : "text-slate-600 hover:bg-canvas hover:text-ink"
              }`}
            >
              {active && <span className="absolute -left-3 top-1.5 bottom-1.5 w-1 rounded-r bg-brand-red" />}
              <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
              <span className="flex-1">{label}</span>
              {counts[id] != null && (
                <span className={`rounded-full px-1.5 text-[11px] tnum ${active ? "bg-white text-navy" : "bg-canvas text-muted"}`}>{counts[id]}</span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto p-4">
        <div className="rounded-xl border border-line bg-canvas p-3.5">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-ink">
            <BarChart3 size={14} /> Data source
          </div>
          <div className="mt-2 flex items-center gap-2 text-[12px]">
            <span
              className={`h-2 w-2 rounded-full ${mode === "live" ? "bg-emerald-500" : mode === "checking" ? "animate-pulse bg-amber-400" : "bg-slate-400"}`}
            />
            <span className="text-slate-700">
              {mode === "live" ? "Live engine (FastAPI)" : mode === "checking" ? "Connecting…" : "Bundled sample review.json"}
            </span>
          </div>
          {mode === "offline" && (
            <button onClick={onRecheck} className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-navy hover:underline">
              <RefreshCw size={12} /> Retry backend
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

export function MobileNav({ view, onView }: { view: ViewId; onView: (v: ViewId) => void }) {
  return (
    <div className="no-print flex gap-1 overflow-x-auto border-b border-line bg-white px-4 py-2 lg:hidden">
      {NAV.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onView(id)}
          className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium ${view === id ? "bg-navy-50 text-navy" : "text-muted"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
