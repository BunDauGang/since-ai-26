"use client";

import { ArrowDown, ArrowRight, Braces, CheckCircle2, Cpu, Database, FileSpreadsheet, LayoutDashboard, Plug, Presentation, Users } from "lucide-react";
import type { DataGap } from "@/lib/types";

/**
 * Production integration path: Sources → pluggable adapter → engine → review.json → outputs.
 * Solid = running in this prototype; dashed = the production step. Each future source lists the
 * data gaps (from review.data_gaps) it would close, matched on the gap's stated future source.
 */
const SOURCES: { name: string; detail: string; match: string[] }[] = [
  { name: "Tableau / Power BI exports", detail: "Allocated pieces · Washing % · End-to-end delivery · Repairs table", match: ["tableau", "power bi"] },
  { name: "WWS Washed Kg report", detail: "Laundry × month washed volume", match: ["wws"] },
  { name: "eLindström", detail: "Unique wearer IDs · service requests", match: ["elindström", "elindstrom", "service-request"] },
  { name: "ERP · customer master · contracts", detail: "Parent/site hierarchy · invoices", match: ["customer master", "erp", "contract", "invoice"] },
  { name: "Approved LCA & calculator factors", detail: "Product footprints · baseline ranges", match: ["lca", "calculator"] },
];

export function PipelineDiagram({ gaps }: { gaps: DataGap[] }) {
  const closes = (match: string[]) =>
    gaps.filter((g) => match.some((m) => g.future_source.toLowerCase().includes(m))).map((g) => g.gap.replace(/^Unavailable metric: /, ""));

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Production integration path</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Only the adapter changes when real Lindström data arrives. The engine, the review.json contract, this dashboard and the deck stay the same.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11.5px] text-muted">
          <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded border-2 border-navy bg-navy-50" /> Running in this prototype</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded border-2 border-dashed border-slate-400" /> Production step</span>
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-2 xl:flex-row">
        {/* 1. Sources */}
        <Stage title="1 · Data sources" className="xl:w-[30%]">
          <Node icon={FileSpreadsheet} name="Excel data pack (synthetic)" detail="20 sheets · today's only input" built />
          {SOURCES.map((s) => {
            const c = closes(s.match);
            return (
              <Node key={s.name} icon={Database} name={s.name} detail={s.detail}>
                {c.length > 0 && <div className="mt-1 text-[10.5px] text-emerald-700">Closes gap: {c.join(" · ")}</div>}
              </Node>
            );
          })}
        </Stage>
        <Arrow />
        {/* 2. Adapter */}
        <Stage title="2 · Pluggable adapter" className="xl:w-[17%]">
          <Node icon={Plug} name="excel_adapter.py" detail="The only module that reads Excel" built />
          <Node icon={Plug} name="tableau / wws / eLindström adapters" detail="Same output tables, new source" />
        </Stage>
        <Arrow />
        {/* 3. Engine */}
        <Stage title="3 · Deterministic engine" className="xl:w-[17%]">
          <Node icon={Cpu} name="Validate" detail="DQ1–DQ5 checks, nothing deleted" built />
          <Node icon={Cpu} name="Calculate" detail="KPIs · footprint · handprint · low/base/high" built />
          <Node icon={Cpu} name="Rules R1–R6" detail="Findings → observations" built />
        </Stage>
        <Arrow />
        {/* 4. Contract */}
        <Stage title="4 · Contract" className="xl:w-[12%]">
          <Node icon={Braces} name="review.json" detail="One versioned schema; every value keeps status, formula, sources, range" built />
        </Stage>
        <Arrow />
        {/* 5. Outputs */}
        <Stage title="5 · Outputs" className="xl:w-[18%]">
          <Node icon={LayoutDashboard} name="KAM dashboard" detail="This app" built />
          <Node icon={Presentation} name="PPTX / PDF review" detail="Same numbers as the screen" built />
          <Node icon={Users} name="eLindström portal module" detail="Customer decision-maker view, all countries & service lines" />
        </Stage>
      </div>

      <ol className="mt-4 grid gap-2 text-[12px] md:grid-cols-3">
        <Phase n="1" title="Prototype (now)" body="Excel adapter on synthetic data; full engine, contract, dashboard and export." active />
        <Phase n="2" title="Pilot on approved sources" body="Add Tableau / WWS / eLindström adapters and approved factors. Close the data gaps shown above." />
        <Phase n="3" title="eLindström module" body="Self-service customer view across countries and service lines (Workwear, Mats, Cleanroom, Wipers)." />
      </ol>
    </div>
  );
}

function Stage({ title, className = "", children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">{title}</div>
      {children}
    </div>
  );
}

function Node({ icon: Icon, name, detail, built, children }: {
  icon: React.ElementType;
  name: string;
  detail: string;
  built?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border-2 px-2.5 py-2 ${built ? "border-navy bg-navy-50" : "border-dashed border-slate-300 bg-white"}`}>
      <div className="flex items-center gap-1.5">
        <Icon size={13} className={built ? "text-navy" : "text-slate-400"} />
        <span className={`text-[12px] font-semibold ${built ? "text-navy" : "text-slate-700"}`}>{name}</span>
        {built && <CheckCircle2 size={12} className="ml-auto shrink-0 text-emerald-600" aria-label="Running in prototype" />}
      </div>
      <div className="mt-0.5 text-[11px] leading-snug text-slate-600">{detail}</div>
      {children}
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center justify-center text-slate-400" aria-hidden>
      <ArrowRight size={18} className="hidden xl:block" />
      <ArrowDown size={18} className="xl:hidden" />
    </div>
  );
}

function Phase({ n, title, body, active }: { n: string; title: string; body: string; active?: boolean }) {
  return (
    <li className={`rounded-lg p-2.5 ${active ? "bg-navy-50 ring-1 ring-navy/30" : "bg-canvas"}`}>
      <div className="flex items-center gap-1.5 font-semibold text-ink">
        <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${active ? "bg-brand-red text-white" : "bg-line text-muted"}`}>{n}</span>
        {title}
      </div>
      <div className="mt-0.5 text-slate-600">{body}</div>
    </li>
  );
}
