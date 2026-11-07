"use client";

import { Building2, Clock, Factory, MapPin, Shirt, Users } from "lucide-react";
import { LAUNDRY_NAMES } from "@/lib/dq";
import { full } from "@/lib/format";
import { personaDef, type Persona } from "@/lib/personas";
import type { Review } from "@/lib/types";

export const AGENDA = [
  { step: 1, title: "Welcome & partnership basics", minutes: 5 },
  { step: 2, title: "The year in one picture", minutes: 10 },
  { step: 3, title: "Our agreement: service KPIs", minutes: 10 },
  { step: 4, title: "How your sites compare", minutes: 10 },
  { step: 5, title: "Value vs the alternative: rough calculation", minutes: 15 },
  { step: 6, title: "Next steps & open topics", minutes: 10 },
];

export function StepTitle({ review, persona, onGo }: { review: Review; persona: Persona; onGo: (step: number) => void }) {
  const m = (id: string) => review.metrics.find((x) => x.id === id)?.value.base;
  const countries = Array.from(new Set(review.sites.map((s) => s.country)));
  const laundries = Array.from(new Set(review.sites.map((s) => s.laundry_id)));
  const p = personaDef(persona);
  const year = review.meta.period.from.slice(0, 4) === review.meta.period.to.slice(0, 4) ? review.meta.period.from.slice(0, 4) : `${review.meta.period.from} to ${review.meta.period.to}`;
  const facts = [
    { icon: MapPin, value: `${review.sites.length} sites`, label: countries.join(" · ") },
    { icon: Users, value: m("wearers_min_est") != null ? `${full(m("wearers_min_est")!, 0)}+` : "–", label: "people wearing Lindström workwear" },
    { icon: Shirt, value: m("garments_allocated") != null ? full(m("garments_allocated")!, 0) : "–", label: "garments in service" },
    { icon: Factory, value: m("washed_kg") != null ? `${full(m("washed_kg")! / 1000, 0)} t` : "–", label: "of workwear washed" },
    { icon: Building2, value: String(laundries.length), label: `Lindström laundries (${laundries.map((l) => LAUNDRY_NAMES[l] ?? l).join(", ")})` },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
      <div className="lift-in relative overflow-hidden rounded-2xl bg-navy px-6 py-8 text-white sm:px-9 sm:py-10">
        <span className="absolute right-0 top-0 h-full w-1.5 bg-brand-red" aria-hidden />
        <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-blue-200">Customer review {year}</div>
        <h2 className="mt-3 text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[42px]">{review.meta.customer_name}</h2>
        <p className="mt-2 text-[15px] text-blue-100">
          {review.meta.industry} · {review.meta.segment} · HQ {review.meta.hq_country}
        </p>
        <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-white">
          Today&apos;s focus for the {p.role.toLowerCase()}: <span className="font-semibold">{p.cares.charAt(0).toLowerCase() + p.cares.slice(1)}</span>
        </p>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {facts.map(({ icon: Icon, value, label }) => (
            <div key={label} className="min-w-0">
              <Icon size={16} className="text-blue-200" />
              <div className="mt-1 text-[22px] font-semibold tnum">{value}</div>
              <div className="text-[12px] leading-snug text-blue-100">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-ink">Agenda for our hour</h3>
          <span className="inline-flex items-center gap-1 text-[12px] text-muted">
            <Clock size={13} /> {AGENDA.reduce((a, x) => a + x.minutes, 0)} min
          </span>
        </div>
        <ol className="mt-4 space-y-1.5">
          {AGENDA.map((a) => (
            <li key={a.step}>
              <button onClick={() => onGo(a.step)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-canvas">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-50 text-[12.5px] font-semibold text-navy">{a.step}</span>
                <span className="flex-1 text-[13.5px] text-ink">{a.title}</span>
                <span className="text-[12px] text-muted tnum">{a.minutes} min</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-lg bg-canvas px-3 py-2.5 text-[12px] leading-relaxed text-muted">
          Not everything has to be finished today. Anything we don&apos;t close goes into the open topics in step 6 and into the summary you take home.
        </p>
      </div>
    </div>
  );
}
