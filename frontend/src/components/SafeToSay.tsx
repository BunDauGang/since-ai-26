"use client";

import { Ban, CheckCircle2, ClipboardCopy, Lock, MessageSquareText, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { buildClaims, neverSay, type Claim, type ClaimClass } from "@/lib/claims";
import type { Review } from "@/lib/types";

const GROUPS: { cls: ClaimClass; title: string; hint: string; icon: React.ElementType; tone: string; dot: string }[] = [
  { cls: "shareable", title: "Safe to say", hint: "True even in the Low case or counted directly", icon: CheckCircle2, tone: "border-emerald-200 bg-emerald-50/50", dot: "text-emerald-600" },
  { cls: "caveat", title: "Say with the caveat", hint: "A data-quality finding affects it", icon: TriangleAlert, tone: "border-amber-200 bg-amber-50/50", dot: "text-amber-600" },
  { cls: "internal", title: "Internal only", hint: "Synthetic factors, illustrative cost or low confidence", icon: Lock, tone: "border-slate-200 bg-slate-50", dot: "text-slate-500" },
];

/**
 * Meeting prep for the KAM: which numbers can go in front of the customer, how to phrase them,
 * and what never to say. Classification rules are fixed and shown next to every sentence.
 */
export function SafeToSay({ review, onOpenMetric, audience = "kam" }: { review: Review; onOpenMetric: (id: string) => void; audience?: "kam" | "customer" }) {
  const customer = audience === "customer";
  const claims = useMemo(() => buildClaims(review), [review]);
  const never = useMemo(() => neverSay(review), [review]);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const lines = [
      `Talking points for ${review.meta.customer_name} (synthetic prototype data; confirm before external use):`,
      ...claims.filter((c) => c.cls === "shareable").map((c) => `- ${c.sentence}`),
      ...claims.filter((c) => c.cls === "caveat").map((c) => `- ${c.sentence} (${c.caveat})`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <section className="card overflow-hidden" aria-label="Safe to say">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-emerald-600 p-2 text-white">
            <MessageSquareText size={18} />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold text-ink">
              {customer ? "Key results of your Lindström service" : "Talking points: what is safe to say to the customer"}
            </h2>
            <p className="mt-0.5 max-w-2xl text-[12.5px] text-slate-600">
              {customer
                ? "Results stated conservatively: estimates use the Low case and name their comparison baseline. Prototype data is synthetic."
                : "Ready-to-use sentences built from this review. Estimates use the Low case, so they stay true across the range. The rules assume approved data: in this prototype every value is synthetic."}
            </p>
          </div>
        </div>
        <button onClick={copy} className="btn-secondary h-8 px-2.5 text-[12px]">
          <ClipboardCopy size={13} /> {copied ? "Copied" : customer ? "Copy results" : "Copy shareable points"}
        </button>
      </header>

      <div className={`grid gap-4 p-5 ${customer ? "xl:grid-cols-2" : "xl:grid-cols-3"}`}>
        {GROUPS.filter((g) => !customer || g.cls !== "internal").map((g) => {
          const items = claims.filter((c) => c.cls === g.cls);
          return (
            <div key={g.cls}>
              <div className="mb-2 flex items-center gap-1.5">
                <g.icon size={15} className={g.dot} />
                <span className="text-[13px] font-semibold text-ink">{g.title}</span>
                <span className="text-[11.5px] text-muted">· {g.hint}</span>
              </div>
              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line px-3 py-3 text-[12px] text-muted">None for this review.</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((c) => (
                    <ClaimItem key={c.metricId} c={c} tone={g.tone} onOpenMetric={onOpenMetric} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {!customer && (
      <div className="border-t border-line bg-red-50/40 px-5 py-4">
        <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <Ban size={15} className="text-brand-red" /> Never say
        </div>
        <ul className="grid gap-2 md:grid-cols-2">
          {never.map((n) => (
            <li key={n.phrase} className="text-[12.5px]">
              <span className="font-medium text-red-800 line-through decoration-red-300">{n.phrase}</span>
              <span className="block text-slate-600">{n.why}</span>
            </li>
          ))}
        </ul>
      </div>
      )}
    </section>
  );
}

function ClaimItem({ c, tone, onOpenMetric }: { c: Claim; tone: string; onOpenMetric: (id: string) => void }) {
  return (
    <li className={`rounded-lg border px-3 py-2.5 ${tone}`}>
      <p className="text-[13px] leading-relaxed text-ink">“{c.sentence}”</p>
      {c.caveat && <p className="mt-1 text-[12px] font-medium text-amber-900">Add: {c.caveat}</p>}
      <div className="mt-1.5 flex items-start justify-between gap-2">
        <span className="text-[11px] text-muted">{c.why}</span>
        <button onClick={() => onOpenMetric(c.metricId)} className="shrink-0 text-[11px] font-medium text-navy hover:underline">
          Show the math
        </button>
      </div>
    </li>
  );
}
