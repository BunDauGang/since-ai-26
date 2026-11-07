"use client";

import { ChevronDown, CircleHelp, ClipboardCopy, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { buildObjections, type Objection, type Readiness } from "@/lib/objections";
import type { Review } from "@/lib/types";

const READINESS: Record<Readiness, { label: string; pill: string; bar: string }> = {
  evidence: { label: "Answer with evidence", pill: "bg-emerald-50 text-emerald-800 ring-emerald-200", bar: "bg-emerald-500" },
  caveat: { label: "Answer with caveats", pill: "bg-amber-50 text-amber-900 ring-amber-200", bar: "bg-amber-500" },
  unanswerable: { label: "Data can't answer yet", pill: "bg-slate-100 text-slate-700 ring-slate-300", bar: "bg-slate-400" },
};

/**
 * Customer Objection Simulator (README innovation #2): likely customer questions with answers grounded
 * in this review, and an honest flag where the data cannot answer. KAM-only meeting preparation.
 */
export function ObjectionPrep({ review, onOpenMetric }: { review: Review; onOpenMetric: (id: string) => void }) {
  const items = useMemo(() => buildObjections(review), [review]);
  const [filter, setFilter] = useState<Readiness | "all">("all");
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);
  const [copied, setCopied] = useState(false);
  const shown = items.filter((o) => filter === "all" || o.readiness === filter);

  const copy = async () => {
    const text = items
      .map((o) => `Q: ${o.question}\n[${READINESS[o.readiness].label}] ${o.answer}${o.needs ? `\nTo answer fully: ${o.needs}` : ""}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(`Objection prep for ${review.meta.customer_name} (synthetic prototype data)\n\n${text}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <section className="card overflow-hidden" aria-label="Customer objection simulator">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-navy p-2 text-white">
            <CircleHelp size={18} />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Tough questions the customer may ask, and how to answer</h2>
            <p className="mt-0.5 max-w-2xl text-[12.5px] text-slate-600">
              Each answer uses only this review&apos;s evidence. Where the data cannot answer, it says so and names the source that would. Review before
              using with a customer.
            </p>
          </div>
        </div>
        <button onClick={copy} className="btn-secondary h-8 px-2.5 text-[12px]">
          <ClipboardCopy size={13} /> {copied ? "Copied" : "Copy Q&A prep"}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas/60 px-5 py-2.5">
        <Search size={13} className="text-muted" />
        <Chip active={filter === "all"} onClick={() => setFilter("all")} label={`All ${items.length}`} />
        {(Object.keys(READINESS) as Readiness[]).map((k) => (
          <Chip
            key={k}
            active={filter === k}
            onClick={() => setFilter(k)}
            label={`${READINESS[k].label} ${items.filter((o) => o.readiness === k).length}`}
          />
        ))}
      </div>

      <ul className="divide-y divide-line">
        {shown.map((o) => (
          <Item key={o.id} o={o} open={open === o.id} onToggle={() => setOpen(open === o.id ? null : o.id)} onOpenMetric={onOpenMetric} />
        ))}
      </ul>
    </section>
  );
}

function Item({ o, open, onToggle, onOpenMetric }: { o: Objection; open: boolean; onToggle: () => void; onOpenMetric: (id: string) => void }) {
  const r = READINESS[o.readiness];
  return (
    <li className="relative">
      <span className={`absolute inset-y-0 left-0 w-1 ${r.bar}`} />
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-canvas/50">
        <span className="flex-1">
          <span className="block text-[13.5px] font-semibold text-ink">“{o.question}”</span>
          {!open && <span className="mt-0.5 line-clamp-1 block text-[12.5px] text-slate-600">{o.answer}</span>}
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${r.pill}`}>{r.label}</span>
        <ChevronDown size={16} className={`mt-0.5 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-4 pl-6">
          <p className="text-[13.5px] leading-relaxed text-ink">{o.answer}</p>
          {o.points.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px] text-slate-700">
              {o.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {o.needs && (
            <p className="mt-2 rounded-md bg-canvas px-3 py-2 text-[12px] text-slate-700">
              <b className="text-navy">To answer fully:</b> {o.needs}
            </p>
          )}
          {o.metricIds.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted">Evidence:</span>
              {o.metricIds.map((id) => (
                <button
                  key={id}
                  onClick={() => onOpenMetric(id)}
                  className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[11px] text-navy ring-1 ring-inset ring-line hover:ring-navy/50"
                >
                  {id}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset ${active ? "bg-navy text-white ring-navy" : "bg-white text-slate-700 ring-line hover:ring-navy/40"}`}
    >
      {label}
    </button>
  );
}
