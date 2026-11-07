"use client";

import { AlertCircle, Bot, Check, CircleHelp, Copy, Loader2, MapPin, Send, Sparkles, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { AUDIENCE_SUGGESTIONS, matchAudience } from "@/lib/audience";
import type { Comparison } from "@/lib/comparison";
import type { MeetingState } from "@/lib/meeting";
import { personaDef } from "@/lib/personas";
import { aiPrep, freeRequestTemplate, siteName, STEERCO_QUESTIONS, steercoTemplate, type PrepAnswer, type PrepContext } from "@/lib/prep";
import type { Review } from "@/lib/types";
import { Segmented } from "../ui";
import { StoryAssistant } from "./StoryAssistant";

const READY: Record<PrepAnswer["readiness"], { label: string; cls: string }> = {
  ready: { label: "Answer ready", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  partial: { label: "Answer with caveats", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  needs_input: { label: "Ask the customer", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
};

/**
 * KAM-only preparation for any audience: steering-committee questions, free requests and the talk track.
 * Every number comes from the review; an optional AI endpoint may only rephrase (see lib/prep.ts).
 */
export function MeetingPrepAI({ review, meeting, comparison, onAudience, onOpenMetric, onOpenSite, live }: {
  review: Review;
  meeting: MeetingState;
  comparison: Comparison;
  /** Free-text role → closest story; the page also switches the lens. */
  onAudience: (label: string) => void;
  onOpenMetric: (id: string) => void;
  onOpenSite: (id: string) => void;
  live: boolean;
}) {
  const [tab, setTab] = useState<"steerco" | "ask" | "talk">("steerco");
  const [audienceDraft, setAudienceDraft] = useState(meeting.audienceLabel || personaDef(meeting.persona).role);
  const audience = meeting.audienceLabel || personaDef(meeting.persona).role;
  const match = matchAudience(audience);
  const ctx: PrepContext = { review, meeting, comparison, audience };
  const template = useMemo(() => steercoTemplate(ctx), [review, meeting, comparison, audience]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ai, setAi] = useState<{ key: string; answers: PrepAnswer[]; replaced: number } | null>(null);
  const [aiState, setAiState] = useState<"idle" | "busy" | "unavailable">("idle");
  const aiKey = JSON.stringify([review.meta.customer_id, review.meta.period, audience, template.map((t) => t.answer)]);
  const answers = ai && ai.key === aiKey ? ai.answers : template;
  const [copied, setCopied] = useState(false);
  const [request, setRequest] = useState("");
  const [asked, setAsked] = useState<PrepAnswer[]>([]);
  const [askBusy, setAskBusy] = useState(false);

  function applyAudience(text: string) {
    const t = text.trim();
    if (!t) return;
    setAudienceDraft(t);
    onAudience(t);
  }

  async function polish() {
    setAiState("busy");
    const res = await aiPrep(ctx, STEERCO_QUESTIONS, template);
    if (res) {
      setAi({ key: aiKey, ...res });
      setAiState("idle");
    } else setAiState("unavailable");
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = request.trim();
    if (!q) return;
    setAskBusy(true);
    const base = freeRequestTemplate(ctx, q);
    const res = live ? await aiPrep(ctx, [{ id: "free", text: q }], [base]) : null;
    setAsked((list) => [res?.answers[0] ?? base, ...list]);
    setRequest("");
    setAskBusy(false);
  }

  const asText = (list: PrepAnswer[]) =>
    [
      `Meeting prep for: ${audience} · ${review.meta.customer_name} · ${review.meta.period.from} to ${review.meta.period.to} (synthetic prototype data)`,
      "",
      ...list.flatMap((a, i) => [
        `${i + 1}. ${a.question}`,
        `   ${a.answer}`,
        ...a.points.map((p) => `   - ${p.text}`),
        ...(a.gap ? [`   Still open: ${a.gap}`] : []),
        "",
      ]),
    ].join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(asText(answers));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <section className="card overflow-hidden" aria-label="Meeting prep AI">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-gradient-to-r from-navy-900 to-navy px-5 py-4 text-white">
        <div>
          <h2 className="flex items-center gap-2 text-[16px] font-semibold">
            <Bot size={18} className="text-amber-300" /> Meeting prep AI
          </h2>
          <p className="text-[12.5px] text-blue-100">Prepare for anyone you meet: steering-committee answers, free questions and a talk track, all from this review&apos;s evidence.</p>
        </div>
        <Segmented
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: "steerco", label: "Steering committee" },
            { value: "ask", label: "Ask anything" },
            { value: "talk", label: "Talk track" },
          ]}
        />
      </div>

      <div className="border-b border-line bg-canvas/60 px-5 py-3">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            applyAudience(audienceDraft);
          }}
        >
          <label className="flex items-center gap-1.5 text-[12.5px] font-medium text-slate-700" htmlFor="prep-audience">
            <UserRound size={14} /> Who are you meeting?
          </label>
          <input
            id="prep-audience"
            value={audienceDraft}
            onChange={(e) => setAudienceDraft(e.target.value)}
            placeholder="e.g. Head of Procurement"
            className="h-8 min-w-0 flex-[1_1_200px] rounded-md border border-line bg-white px-2.5 text-[13px] outline-none focus:border-navy/50"
          />
          <button type="submit" className="btn-secondary h-8">Use</button>
          <span className="flex flex-wrap gap-1">
            {AUDIENCE_SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => applyAudience(s)} className="rounded-full bg-white px-2 py-0.5 text-[11.5px] text-slate-600 ring-1 ring-inset ring-line hover:bg-navy-50">
                {s}
              </button>
            ))}
          </span>
        </form>
        {match && (
          <p className="mt-1.5 text-[12px] text-muted">
            Preparing for <span className="font-semibold text-ink">{audience}</span>: closest story is the {personaDef(match.persona).label} story ({match.reason}). The meeting screen follows it.
          </p>
        )}
      </div>

      <div className="p-5">
        {tab === "steerco" && (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12.5px] text-muted">The five questions a steering committee should answer, prepared from the review, the meeting record and the change since the last meeting.</p>
              <div className="flex items-center gap-2">
                <button onClick={polish} disabled={!live || aiState === "busy"} className="btn-secondary h-8" title={live ? undefined : "Needs the live engine"}>
                  {aiState === "busy" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} className="text-amber-500" />} Polish wording with AI
                </button>
                <button onClick={copy} className="btn-secondary h-8">
                  {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy all"}
                </button>
              </div>
            </div>
            {aiState === "unavailable" && (
              <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 ring-1 ring-amber-200">
                <AlertCircle size={13} /> The AI service is not connected yet, so these are the evidence templates. Every number is still from the review.
              </p>
            )}
            {ai && ai.key === aiKey && (
              <p className="mb-3 text-[12px] text-emerald-700">AI wording applied to {ai.replaced} of {answers.length} answers; numbers were filled in from the review, not written by the AI.</p>
            )}
            <ol className="space-y-4">
              {answers.map((a, i) => (
                <AnswerCard key={a.questionId} a={a} index={i + 1} review={review} onOpenMetric={onOpenMetric} onOpenSite={onOpenSite} />
              ))}
            </ol>
          </>
        )}

        {tab === "ask" && (
          <>
            <form onSubmit={ask} className="flex gap-2">
              <input
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                placeholder='e.g. "What are the biggest risks for the Swedish sites?" or "Prepare 3 points on cost for procurement"'
                className="h-10 min-w-0 flex-1 rounded-lg border border-line px-3 text-[13.5px] outline-none focus:border-navy/50"
              />
              <button type="submit" disabled={askBusy || !request.trim()} className="btn-primary h-10">
                {askBusy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Ask
              </button>
            </form>
            <p className="mt-2 text-[11.5px] text-muted">
              Answers come from this review only. Without the AI service the closest prepared answer is shown; the AI can rephrase but never adds numbers.
            </p>
            <ol className="mt-4 space-y-4">
              {asked.map((a, i) => (
                <AnswerCard key={`${i}-${a.question}`} a={a} review={review} onOpenMetric={onOpenMetric} onOpenSite={onOpenSite} />
              ))}
              {!asked.length && (
                <li className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-3 text-[12.5px] text-muted">
                  <CircleHelp size={14} /> Ask about results, priorities, risks, savings or decisions, or about anything the customer might challenge.
                </li>
              )}
            </ol>
          </>
        )}

        {tab === "talk" && <StoryAssistant review={review} defaultPersona={match?.persona ?? meeting.persona} rough={meeting.rough} onOpenMetric={onOpenMetric} />}
      </div>
    </section>
  );
}

function AnswerCard({ a, index, review, onOpenMetric, onOpenSite }: {
  a: PrepAnswer;
  index?: number;
  review: Review;
  onOpenMetric: (id: string) => void;
  onOpenSite: (id: string) => void;
}) {
  const r = READY[a.readiness];
  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="flex min-w-0 items-start gap-2 text-[14.5px] font-semibold leading-snug text-ink">
          {index != null && <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-[12px] text-white">{index}</span>}
          {a.question}
        </h3>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${r.cls}`}>{r.label}</span>
      </div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-slate-700">{a.answer}</p>
      {a.points.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {a.points.map((p, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-ink">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-navy" />
              <span className="min-w-0">
                {p.text}
                {(p.metricIds ?? [])
                  .filter((id) => review.metrics.some((m) => m.id === id))
                  .map((id) => (
                    <button key={id} onClick={() => onOpenMetric(id)} className="ml-1 rounded bg-navy-50 px-1 py-px text-[10.5px] font-medium text-navy hover:underline">
                      {review.metrics.find((m) => m.id === id)!.label}
                    </button>
                  ))}
                {(p.siteIds ?? []).slice(0, 4).map((id) => (
                  <button key={id} onClick={() => onOpenSite(id)} className="ml-1 inline-flex items-center gap-0.5 rounded bg-canvas px-1 py-px text-[10.5px] font-medium text-slate-700 ring-1 ring-inset ring-line hover:underline">
                    <MapPin size={9} /> {siteName(review, id)}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {a.gap && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900 ring-1 ring-inset ring-amber-200">Still open: {a.gap}</p>}
    </li>
  );
}
