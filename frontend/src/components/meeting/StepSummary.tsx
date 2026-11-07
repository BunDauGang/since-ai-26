"use client";

import { ArrowRight, Handshake, Quote } from "lucide-react";
import { equivalents } from "@/lib/calc";
import { personaDef, personaStory, type Persona } from "@/lib/personas";
import type { Review } from "@/lib/types";
import { BigStat, StepHeader } from "./parts";

export function StepSummary({ review, persona, onOpenMetric }: { review: Review; persona: Persona; onOpenMetric: (id: string) => void }) {
  const p = personaDef(persona);
  const story = personaStory(review, persona);
  const stats = p.stats.map((id) => review.metrics.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m);
  const everyday = stats.flatMap((m) => equivalents(m.value.base, m.unit))[0];

  return (
    <div>
      <StepHeader kicker={`Executive summary · for the ${p.role.toLowerCase()}`} title={story.headline} sub={story.opening} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((m, i) => (
          <BigStat key={m.id} metric={m} review={review} onOpen={onOpenMetric} tone={i === 0 ? "navy" : "white"} />
        ))}
      </div>
      {everyday && (
        <p className="mt-2 text-[12px] text-muted" title={everyday.basis}>
          In everyday terms: {everyday.text.replace(/^≈\s*/, "about ")} (illustrative public reference, not a Lindström claim).
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="card p-5 sm:p-6">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Quote size={16} className="text-brand-red" /> The story in three points
          </h3>
          <ol className="mt-4 space-y-4">
            {story.points.map((pt, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-[13px] font-semibold text-white">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-[15px] leading-relaxed text-ink">{pt.text}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {pt.metricIds
                      .filter((id) => review.metrics.some((m) => m.id === id))
                      .map((id) => (
                        <button key={id} onClick={() => onOpenMetric(id)} className="rounded-md bg-navy-50 px-1.5 py-0.5 text-[11px] font-medium text-navy hover:underline">
                          Evidence: {review.metrics.find((m) => m.id === id)!.label}
                        </button>
                      ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="card flex flex-col justify-between bg-gradient-to-br from-white to-navy-50 p-5 sm:p-6">
          <div>
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <Handshake size={16} className="text-navy" /> What we&apos;d like to agree today
            </h3>
            <p className="mt-3 text-[16px] font-medium leading-relaxed text-navy-900">{story.ask}</p>
          </div>
          <p className="mt-5 inline-flex items-center gap-1 text-[12px] text-muted">
            Details follow in the next steps <ArrowRight size={12} />
          </p>
        </section>
      </div>
    </div>
  );
}
