"use client";

import { FileDown, Filter, Loader2, Presentation, Sparkles, Wand2, X } from "lucide-react";
import { useRef, useState } from "react";
import { interpretPrompt } from "@/lib/api";
import { BASELINES, CUSTOMERS, INDUSTRY_RULES, interpretPromptOffline, interpretScope, PRIORITIES, priorityDef, SUGGESTED_PROMPTS, type SiteScope, type ViewId } from "@/lib/config";
import type { Controls, Mode } from "@/lib/useReview";
import type { Priority, Sensitivity } from "@/lib/types";
import { Segmented } from "./ui";

const MONTHS = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, "0")}`);

export function ControlBar({ controls, update, mode, industry, customerAvailable, onView, onExport, exporting, canExport, exportBlockedReason, sites, scope, onScope, compact }: {
  sites: { country: string; site_type: string }[];
  scope: SiteScope | null;
  onScope: (s: SiteScope | null) => void;
  controls: Controls;
  update: (p: Partial<Controls>) => void;
  mode: Mode;
  industry: string;
  customerAvailable: (id: string) => boolean;
  onView: (v: ViewId) => void;
  onExport: (f: "pptx" | "pdf") => void;
  exporting: "pptx" | "pdf" | null;
  canExport: boolean;
  exportBlockedReason?: string;
  /** Meeting mode: setup row only; the persona picker replaces the lens and prompt rows. */
  compact?: boolean;
}) {
  const [draft, setDraft] = useState(controls.prompt);
  const [interp, setInterp] = useState<{ text: string; priority: Priority; secondary: Priority[]; source: "interpret API" | "keywords" | "industry default" } | null>(null);
  const [busy, setBusy] = useState(false);
  // Every prompt or manual lens click bumps this; a late /api/interpret answer for an older prompt is dropped.
  const intent = useRef(0);

  function choosePriority(p: Priority) {
    intent.current++;
    setBusy(false);
    setInterp(null);
    update({ priority: p });
  }

  async function runPrompt(text: string, jumpTo?: ViewId) {
    if (!text.trim()) return;
    const id = ++intent.current;
    setBusy(true);
    onScope(interpretScope(text, sites)); // "our Swedish plants" -> site filter (display only)
    const offline = interpretPromptOffline(text, industry);
    let priority = offline.priority;
    let source: "interpret API" | "keywords" | "industry default" = offline.matched ? "keywords" : "industry default";
    if (mode === "live") {
      const ai = await interpretPrompt(text, industry);
      if (id !== intent.current) return; // user moved on while we waited
      if (ai) {
        priority = ai;
        source = "interpret API";
      }
    }
    setInterp({ text, priority, secondary: offline.secondary.filter((p) => p !== priority), source });
    update({ priority, prompt: text });
    if (jumpTo) onView(jumpTo);
    setBusy(false);
  }

  const periodOk = controls.periodFrom <= controls.periodTo;
  const periodLocked = mode !== "live";

  return (
    <div className="no-print border-b border-line bg-white">
      {/* Row 1: setup */}
      <div className={`flex flex-wrap items-end gap-x-5 gap-y-3 px-4 pt-4 lg:px-8 ${compact ? "pb-4" : ""}`}>
        <Field label="Customer">
          <select
            aria-label="Customer"
            className="select min-w-56"
            value={controls.customerId}
            onChange={(e) => {
              const c = CUSTOMERS.find((x) => x.id === e.target.value)!;
              intent.current++;
              setBusy(false);
              setInterp(null);
              setDraft("");
              onScope(null);
              update({ customerId: c.id, priority: c.defaultPriority, prompt: "" });
            }}
          >
            {CUSTOMERS.map((c) => (
              <option key={c.id} value={c.id} disabled={!customerAvailable(c.id)}>
                {c.id} · {c.name}
                {!customerAvailable(c.id) ? " (needs live engine)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reporting period">
          <div className="flex items-center gap-1.5" title={periodLocked ? "Bundled sample covers the full year 2025. Connect the engine to change the period." : undefined}>
            <select aria-label="Period from" className="select" value={controls.periodFrom} disabled={periodLocked} onChange={(e) => update({ periodFrom: e.target.value })}>
              {MONTHS.map((m) => <option key={m}>{m}</option>)}
            </select>
            <span className="text-muted">–</span>
            <select aria-label="Period to" className="select" value={controls.periodTo} disabled={periodLocked} onChange={(e) => update({ periodTo: e.target.value })}>
              {MONTHS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          {!periodOk && <span className="text-[11px] text-red-600">Start month is after end month</span>}
        </Field>
        <Field label="Comparison baseline">
          <select aria-label="Comparison baseline" className="select min-w-52" value={controls.baselineId} onChange={(e) => update({ baselineId: e.target.value })}>
            {BASELINES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.id === "B_LOCAL" ? " (default)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sensitivity case">
          <Segmented<Sensitivity>
            value={controls.sensitivity}
            onChange={(s) => update({ sensitivity: s })}
            options={[
              { value: "low", label: "Low" },
              { value: "base", label: "Base" },
              { value: "high", label: "High" },
            ]}
          />
        </Field>
        <div className="ml-auto flex items-center gap-2 pb-0.5">
          <button onClick={() => onExport("pptx")} disabled={!!exporting || !canExport} title={canExport ? undefined : exportBlockedReason} className="btn-primary">
            {exporting === "pptx" ? <Loader2 size={15} className="animate-spin" /> : <Presentation size={15} />} Download PPTX
          </button>
          <button onClick={() => onExport("pdf")} disabled={!!exporting || !canExport} title={canExport ? undefined : exportBlockedReason} className="btn-secondary">
            {exporting === "pdf" ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} PDF
          </button>
        </div>
      </div>

      {!compact && (
      <>
      {/* Row 2: priority lens + prompt */}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line bg-canvas/60 px-4 py-3 lg:px-8">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Priority lens</span>
        <div className="flex flex-wrap gap-1.5">
          {PRIORITIES.map((p) => {
            const active = controls.priority === p.id;
            const industryRank = INDUSTRY_RULES[industry]?.find((r) => r.priority === p.id)?.rank;
            return (
              <button
                key={p.id}
                onClick={() => choosePriority(p.id)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset transition ${
                  active ? "bg-navy text-white ring-navy" : "bg-white text-slate-700 ring-line hover:ring-navy/40"
                }`}
                title={industryRank ? `${industry} priority #${industryRank}` : undefined}
              >
                {p.label}
                {industryRank && !active && <span className="ml-1 text-[10px] text-brand-red">#{industryRank}</span>}
              </button>
            );
          })}
        </div>
        <form
          className="flex min-w-72 flex-1 items-center gap-2 rounded-lg bg-white px-3 py-1.5 ring-1 ring-inset ring-line focus-within:ring-navy/50"
          onSubmit={(e) => {
            e.preventDefault();
            void runPrompt(draft);
          }}
        >
          <Sparkles size={15} className="shrink-0 text-brand-red" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder='Ask in plain words, e.g. "Focus on water and emissions for the food-industry sites"'
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400"
          />
          <button type="submit" disabled={busy || !draft.trim()} className="inline-flex items-center gap-1 rounded-md bg-navy px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} Apply
          </button>
        </form>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 lg:px-8">
        {scope && (
          <span className="lift-in inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-medium text-amber-900 ring-1 ring-inset ring-amber-300">
            <Filter size={12} /> Site scope: {scope.label}
            <span className="font-normal text-amber-800">(site views filtered; KPIs stay customer totals)</span>
            <button onClick={() => onScope(null)} aria-label="Clear site scope" className="ml-0.5 rounded-full p-0.5 hover:bg-amber-100">
              <X size={12} />
            </button>
          </span>
        )}
        {interp ? (
          <div className="lift-in flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="text-muted">Interpreted as</span>
            <span className="rounded-full bg-navy px-2 py-0.5 font-semibold text-white">{priorityDef(interp.priority).label}</span>
            {interp.secondary.length > 0 && (
              <span className="text-muted">
                also mentions{" "}
                {interp.secondary.map((s) => (
                  <button key={s} onClick={() => choosePriority(s)} className="mr-1 font-medium text-navy underline decoration-dotted">
                    {priorityDef(s).label}
                  </button>
                ))}
              </span>
            )}
            <span className="rounded bg-white px-1.5 py-0.5 text-[10.5px] uppercase tracking-wide text-muted ring-1 ring-line">via {interp.source}</span>
            <button onClick={() => setInterp(null)} className="text-muted hover:text-ink">· clear</button>
          </div>
        ) : (
          <>
            <span className="text-[11.5px] text-muted">Try:</span>
            {SUGGESTED_PROMPTS.map((s) => (
              <button
                key={s.prompt}
                disabled={busy}
                onClick={() => {
                  setDraft(s.prompt);
                  void runPrompt(s.prompt, s.view);
                }}
                className="rounded-full border border-dashed border-slate-300 bg-white px-2.5 py-1 text-[12px] text-slate-600 hover:border-navy hover:text-navy disabled:opacity-50"
              >
                <span className="mr-1 text-[10px] font-semibold uppercase text-muted">{s.who}</span>
                {s.prompt}
              </button>
            ))}
          </>
        )}
      </div>
      </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      {children}
    </div>
  );
}
