"use client";

import { Bot, ClipboardCopy, MapPin, MessageCircleQuestion, Target, Users } from "lucide-react";
import { useState } from "react";
import { INDUSTRY_RULES, priorityDef } from "@/lib/config";
import type { Priority, Review } from "@/lib/types";
import { ConfidenceDots, SectionTitle } from "../ui";

function ownerTone(owner: string) {
  const o = owner.toLowerCase();
  const l = o.includes("lindstr");
  const c = o.includes("customer");
  if ((l && c) || o === "both") return "bg-violet-50 text-violet-700 ring-violet-200";
  if (c) return "bg-teal-50 text-teal-700 ring-teal-200";
  return "bg-red-50 text-brand-red ring-red-200";
}

export function Observations({ review, priority, emphasized, onOpenMetric, onOpenSite }: {
  review: Review;
  priority: Priority;
  emphasized: string[];
  onOpenMetric: (id: string) => void;
  onOpenSite: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const metricLabel = (id: string) => review.metrics.find((m) => m.id === id)?.label ?? id;
  const siteName = (id: string) => review.sites.find((s) => s.site_id === id)?.site_name ?? id;
  const rules = INDUSTRY_RULES[review.meta.industry] ?? [];
  const questions = review.observations.map((o) => o.steering_question).filter(Boolean);

  const copyQuestions = async () => {
    try {
      await navigator.clipboard.writeText(questions.map((q, i) => `${i + 1}. ${q}`).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: ignore */
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <SectionTitle sub={`Rules (R1–R6) find the facts; AI only writes the wording and cites metric IDs. Ordered for the ${priorityDef(priority).label} lens.`}>
          Observations & recommended actions
        </SectionTitle>
        {review.observations.length === 0 && (
          <div className="card p-6 text-[13px] text-muted">No observations in this review.json yet — the insights engine (backend/insights) adds them.</div>
        )}
        {review.observations.map((o, i) => {
          const relevant = o.metric_ids.some((id) => emphasized.includes(id));
          return (
            <article key={o.title} className={`lift-in card overflow-hidden ${relevant ? "ring-1 ring-navy/20" : ""}`}>
              <div className="flex items-start gap-3 px-5 pt-4">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${relevant ? "bg-navy text-white" : "bg-canvas text-muted"}`}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold leading-snug text-ink">{o.title}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-700">{o.observation}</p>
                </div>
              </div>
              <div className="mx-5 mt-3 rounded-lg border-l-[3px] border-brand-red bg-brand-red-soft/50 px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-brand-red">
                    <Target size={12} /> Recommended action
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${ownerTone(o.owner)}`}>
                    <Users size={11} /> {o.owner}
                  </span>
                </div>
                <p className="mt-1 text-[13.5px] text-ink">{o.recommended_action}</p>
              </div>
              {o.steering_question && (
                <div className="mx-5 mt-2 flex gap-2 text-[13px] italic text-slate-600">
                  <MessageCircleQuestion size={15} className="mt-0.5 shrink-0 text-navy" />
                  {o.steering_question}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line bg-canvas/50 px-5 py-2.5">
                <span className="text-[11px] text-muted">Evidence:</span>
                {o.metric_ids.map((id) => (
                  <button
                    key={id}
                    onClick={() => onOpenMetric(id)}
                    title={metricLabel(id)}
                    className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[11px] text-navy ring-1 ring-inset ring-line hover:ring-navy/50"
                  >
                    {id}
                  </button>
                ))}
                {o.site_ids.map((id) => (
                  <button
                    key={id}
                    onClick={() => onOpenSite(id)}
                    className="inline-flex items-center gap-0.5 rounded-md bg-white px-1.5 py-0.5 text-[11px] text-slate-700 ring-1 ring-inset ring-line hover:ring-navy/50"
                  >
                    <MapPin size={10} /> {siteName(id).replace(/^NorthStar /, "")}
                  </button>
                ))}
                <span className="ml-auto flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[10.5px] uppercase tracking-wide text-muted" title={o.status}>
                    <Bot size={12} /> {o.status.startsWith("AI") ? "AI-written from calculated data" : o.status.replaceAll("_", " ").toLowerCase()}
                  </span>
                  <ConfidenceDots confidence={o.confidence} />
                </span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="space-y-4">
        <div className="card p-4">
          <SectionTitle
            right={
              questions.length > 0 && (
                <button onClick={copyQuestions} className="inline-flex items-center gap-1 text-[12px] font-medium text-navy hover:underline">
                  <ClipboardCopy size={12} /> {copied ? "Copied" : "Copy"}
                </button>
              )
            }
          >
            Steering-committee questions
          </SectionTitle>
          <ol className="space-y-2.5">
            {questions.map((q, i) => (
              <li key={q} className="flex gap-2.5 text-[13px] text-slate-700">
                <span className="font-semibold text-brand-red tnum">{i + 1}.</span>
                {q}
              </li>
            ))}
          </ol>
        </div>
        <div className="card p-4">
          <SectionTitle sub="From Industry_Priorities. Rules change emphasis and ordering only — never the numbers, and never legal advice (A007).">
            {review.meta.industry} priorities
          </SectionTitle>
          <ol className="space-y-2">
            {rules.map((r) => {
              const active = r.priority === priority;
              return (
                <li key={r.rank} className={`rounded-lg p-2.5 text-[12.5px] ${active ? "bg-navy-50 ring-1 ring-navy/20" : "bg-canvas"}`}>
                  <div className="font-semibold text-ink">
                    #{r.rank} {r.theme}
                  </div>
                  <div className="text-slate-600">{r.emphasis}</div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
