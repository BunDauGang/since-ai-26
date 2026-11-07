"use client";

import { Check, Copy, MessageCircleQuestion, Sparkles, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { neverSay } from "@/lib/claims";
import { full } from "@/lib/format";
import { buildObjections } from "@/lib/objections";
import { PERSONAS, personaDef, personaStory, type Persona, type StoryPoint } from "@/lib/personas";
import { roughCalc, type RoughInputs } from "@/lib/roughcalc";
import type { Review } from "@/lib/types";
import { Segmented } from "../ui";

/*
 * Story Assistant: the KAM says who they meet, for how long and why; the assistant assembles a talk
 * track from the review (persona story + a goal-specific angle + likely questions + phrases to avoid).
 * Deterministic templates only: every number is the review's own. No text is sent anywhere.
 */

const GOALS = [
  "Summarise our value in 15 minutes",
  "Convince them we're worth it vs a cheaper local laundry",
  "Prepare for the contract renewal",
  "Agree improvement actions for next year",
  "Support their sustainability report",
];

const PERSONA_QUESTIONS: Record<Persona, string[]> = {
  ceo: ["money", "audited", "idle-stock"],
  cfo: ["money", "idle-stock", "repairs"],
  operations: ["service", "request-causes", "wearers"],
  sustainability: ["water-reliability", "baseline-choice", "audited"],
};

type Angle = { title: string; points: StoryPoint[] };

function goalAngle(review: Review, goal: string, rough: RoughInputs | null): Angle | null {
  const g = goal.toLowerCase();
  const m = (id: string) => review.metrics.find((x) => x.id === id);
  if (/(cheap|competit|price|local laundry|alternative|worth|value for money|cost)/.test(g)) {
    const res = rough ? roughCalc(review, rough) : null;
    const repairs = m("repairs_total");
    return {
      title: "Value vs the alternative",
      points: [
        {
          text: res
            ? `At the prices agreed at the table, the service is worth roughly €${full(res.total.base, 0)} a year in water, energy and avoided garment purchases compared with ${res.baselineName.toLowerCase()} (rough calculation, step 5).`
            : `Agree water, energy and garment prices with them in step 5; only then put a rough euro value on the service compared with ${review.meta.baseline_name.toLowerCase()}.`,
          metricIds: ["water_saving_l", "energy_saving_kwh"],
        },
        ...(repairs
          ? [{ text: `A laundry-only service washes; we also repaired ${full(repairs.value.base, 0)} garments and keep them in circulation.`, metricIds: ["repairs_total"] }]
          : []),
        { text: "Every number comes with its source, formula and range, so they can check it rather than trust it.", metricIds: [] },
      ],
    };
  }
  if (/(renew|contract|retain|extend|tender)/.test(g)) {
    const onTime = m("on_time_rate");
    return {
      title: "Why continue together",
      points: [
        ...(onTime ? [{ text: `Reliability they already rely on: ${(onTime.value.base * 100).toFixed(1)}% of cycles back on time.`, metricIds: ["on_time_rate"] }] : []),
        { text: "Show the agreed KPIs (step 3) and agree next year's targets before discussing price.", metricIds: [] },
        { text: "Offer a joint improvement pilot (step 6) as part of the renewal, not a discount.", metricIds: [] },
      ],
    };
  }
  if (/(improve|action|next year|plan|2026)/.test(g)) {
    return {
      title: "Improvement proposals",
      points: review.observations.slice(0, 3).map((o) => ({ text: `${o.title} (owner: ${o.owner}).`, metricIds: o.metric_ids.slice(0, 1) })),
    };
  }
  if (/(sustainab|report|esg|csrd|climate|carbon|water)/.test(g)) {
    return {
      title: "Reporting-ready, with limits",
      points: [
        { text: "Use the Base value and say the range; never the High case alone.", metricIds: ["water_saving_l", "co2e_saving_kg"] },
        { text: "Figures are estimates until Lindström's factors are approved: agree what goes in the report now and what after verification.", metricIds: [] },
      ],
    };
  }
  return null;
}

export function StoryAssistant({ review, defaultPersona, rough, onOpenMetric }: {
  review: Review;
  defaultPersona: Persona;
  rough: RoughInputs | null;
  onOpenMetric: (id: string) => void;
}) {
  const [persona, setPersona] = useState<Persona>(defaultPersona);
  const [minutes, setMinutes] = useState<"15" | "30" | "60">("15");
  const [goal, setGoal] = useState(GOALS[0]);
  const [copied, setCopied] = useState(false);

  const track = useMemo(() => {
    const story = personaStory(review, persona);
    const angle = goalAngle(review, goal, rough);
    const objections = buildObjections(review);
    const questions = PERSONA_QUESTIONS[persona].map((id) => objections.find((o) => o.id === id)).filter((o): o is NonNullable<typeof o> => !!o);
    const avoid = neverSay(review).slice(0, 3);
    const total = Number(minutes);
    const plan = [
      { label: "Opening", min: Math.max(1, Math.round(total * 0.1)) },
      { label: "Three points", min: Math.round(total * 0.45) },
      { label: angle ? angle.title : "Questions", min: Math.round(total * 0.3) },
      { label: "The ask", min: Math.max(1, total - Math.max(1, Math.round(total * 0.1)) - Math.round(total * 0.45) - Math.round(total * 0.3)) },
    ];
    return { story, angle, questions, avoid, plan };
  }, [review, persona, goal, minutes, rough]);

  const text = [
    `Talk track: ${personaDef(persona).role}, ${minutes} min, goal: ${goal}`,
    `${review.meta.customer_name} · ${review.meta.period.from} to ${review.meta.period.to} (synthetic prototype data)`,
    "",
    `Plan: ${track.plan.map((p) => `${p.label} ${p.min} min`).join(" · ")}`,
    "",
    `OPENING: ${track.story.opening}`,
    "",
    `HEADLINE: ${track.story.headline}`,
    ...track.story.points.map((p, i) => `${i + 1}. ${p.text}`),
    ...(track.angle ? ["", `${track.angle.title.toUpperCase()}:`, ...track.angle.points.map((p) => `- ${p.text}`)] : []),
    "",
    "LIKELY QUESTIONS:",
    ...track.questions.map((q) => `- ${q.question}\n  → ${q.answer}`),
    "",
    `THE ASK: ${track.story.ask}`,
    "",
    "AVOID SAYING:",
    ...track.avoid.map((a) => `- ${a.phrase} (${a.why})`),
  ].join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }

  const Chips = ({ ids }: { ids: string[] }) => (
    <>
      {ids
        .filter((id) => review.metrics.some((m) => m.id === id))
        .map((id) => (
          <button key={id} onClick={() => onOpenMetric(id)} className="ml-1 rounded bg-navy-50 px-1 py-px text-[10.5px] font-medium text-navy hover:underline">
            {review.metrics.find((m) => m.id === id)!.label}
          </button>
        ))}
    </>
  );

  return (
    <section className="card overflow-hidden" aria-label="Story assistant">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-gradient-to-r from-navy-900 to-navy px-5 py-3.5 text-white">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Sparkles size={16} className="text-amber-300" /> Story assistant
          </h2>
          <p className="text-[12px] text-blue-100">Tell it who you&apos;re meeting and why; it builds a talk track from this review&apos;s evidence.</p>
        </div>
        <button onClick={copy} className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1.5 text-[12px] font-medium hover:bg-white/20">
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy talk track"}
        </button>
      </div>
      <div className="grid gap-5 p-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-[12px] font-medium text-slate-700">Who are you meeting?</div>
            <Segmented size="sm" value={persona} onChange={setPersona} options={PERSONAS.map((p) => ({ value: p.id, label: p.label }))} />
          </div>
          <div>
            <div className="mb-1 text-[12px] font-medium text-slate-700">How long?</div>
            <Segmented size="sm" value={minutes} onChange={setMinutes} options={[{ value: "15", label: "15 min" }, { value: "30", label: "30 min" }, { value: "60", label: "1 hour" }]} />
          </div>
          <label className="block">
            <span className="text-[12px] font-medium text-slate-700">What do you want to achieve?</span>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-line px-2.5 py-2 text-[13px] outline-none focus:border-navy/50"
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {GOALS.map((g) => (
              <button
                key={g}
                onClick={() => setGoal(g)}
                className={`rounded-full px-2.5 py-1 text-left text-[11.5px] ring-1 ring-inset ${goal === g ? "bg-navy text-white ring-navy" : "bg-canvas text-slate-700 ring-line hover:bg-navy-50"}`}
              >
                {g}
              </button>
            ))}
          </div>
          <p className="flex gap-1.5 text-[11px] leading-snug text-muted">
            <Wand2 size={12} className="mt-0.5 shrink-0" /> Built by templates from the review: it never invents a number, and nothing you type leaves this page.
          </p>
        </div>

        <div className="min-w-0 space-y-4 text-[13.5px] leading-relaxed text-ink">
          <div className="flex flex-wrap gap-1.5">
            {track.plan.map((p) => (
              <span key={p.label} className="rounded-full bg-canvas px-2.5 py-1 text-[11.5px] text-slate-700 ring-1 ring-inset ring-line">
                {p.label} · <span className="font-semibold tnum">{p.min} min</span>
              </span>
            ))}
          </div>
          <Block title="Opening">{track.story.opening}</Block>
          <Block title={track.story.headline}>
            <ol className="list-decimal space-y-1 pl-5">
              {track.story.points.map((p, i) => (
                <li key={i}>
                  {p.text}
                  <Chips ids={p.metricIds} />
                </li>
              ))}
            </ol>
          </Block>
          {track.angle && (
            <Block title={track.angle.title}>
              <ul className="list-disc space-y-1 pl-5">
                {track.angle.points.map((p, i) => (
                  <li key={i}>
                    {p.text}
                    <Chips ids={p.metricIds} />
                  </li>
                ))}
              </ul>
            </Block>
          )}
          <Block title="Likely questions">
            <ul className="space-y-2">
              {track.questions.map((q) => (
                <li key={q.id}>
                  <div className="flex items-start gap-1.5 font-medium">
                    <MessageCircleQuestion size={14} className="mt-1 shrink-0 text-brand-red" /> {q.question}
                  </div>
                  <div className="pl-5 text-[13px] text-slate-600">{q.answer}</div>
                </li>
              ))}
            </ul>
          </Block>
          <Block title="The ask">
            <span className="font-medium text-navy-900">{track.story.ask}</span>
          </Block>
          <Block title="Avoid saying">
            <ul className="space-y-1 text-[12.5px]">
              {track.avoid.map((a) => (
                <li key={a.phrase}>
                  <span className="font-medium text-red-700 line-through decoration-red-300">{a.phrase}</span> <span className="text-muted">{a.why}</span>
                </li>
              ))}
            </ul>
          </Block>
        </div>
      </div>
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">{title}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
