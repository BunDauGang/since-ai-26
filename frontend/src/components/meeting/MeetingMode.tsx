"use client";

import { ArrowLeft, ArrowRight, Sparkles, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { MeetingState } from "@/lib/meeting";
import { PERSONAS, personaDef, type Persona } from "@/lib/personas";
import type { Review } from "@/lib/types";
import { Drawer } from "../ui";
import { StepAgreement } from "./StepAgreement";
import { StepNextSteps } from "./StepNextSteps";
import { StepPeers } from "./StepPeers";
import { StepRoughCalc } from "./StepRoughCalc";
import { StepSummary } from "./StepSummary";
import { AGENDA, StepTitle } from "./StepTitle";
import type { Comparison } from "@/lib/comparison";
import { MeetingPrepAI } from "./MeetingPrepAI";

const SHORT = ["Welcome", "The year", "Agreement", "Peers", "Rough calc", "Next steps"];

export function MeetingMode({ review, meeting, onMeeting, onPersona, onAudience, comparison, live, onOpenMetric, onOpenSite, onExport, exporting, canExport, customerView }: {
  review: Review;
  onAudience: (label: string) => void;
  comparison: Comparison;
  live: boolean;
  meeting: MeetingState;
  onMeeting: (patch: Partial<MeetingState>) => void;
  onPersona: (p: Persona) => void;
  onOpenMetric: (id: string) => void;
  onOpenSite: (id: string) => void;
  onExport: (format: "pptx" | "pdf") => void;
  exporting: "pptx" | "pdf" | null;
  canExport: boolean;
  customerView: boolean;
}) {
  const [step, setStep] = useState(1);
  const [assistant, setAssistant] = useState(false);
  const [other, setOther] = useState(false);
  const [otherDraft, setOtherDraft] = useState("");
  const go = (s: number) => {
    setStep(Math.min(6, Math.max(1, s)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Arrow keys move through the meeting like slides (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable=true]") || t.getAttribute("role") === "slider")) return;
      if (e.key === "ArrowRight") setStep((s) => Math.min(6, s + 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(1, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const p = personaDef(meeting.persona);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-medium text-muted">Meeting with the</span>
          <div className="inline-flex max-w-full flex-wrap rounded-lg bg-white p-0.5 ring-1 ring-inset ring-line" role="group" aria-label="Who are you meeting?">
            {PERSONAS.map((x) => (
              <button
                key={x.id}
                onClick={() => onPersona(x.id)}
                title={x.cares}
                className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${meeting.persona === x.id && !meeting.audienceLabel ? "bg-navy text-white shadow-sm" : "text-slate-600 hover:text-ink"}`}
              >
                {x.label}
              </button>
            ))}
            <button
              onClick={() => setOther((o) => !o)}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition ${meeting.audienceLabel ? "bg-navy text-white shadow-sm" : "text-slate-600 hover:text-ink"}`}
            >
              <UserRound size={13} /> {meeting.audienceLabel || "Other role…"}
            </button>
          </div>
          {other && (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (otherDraft.trim()) onAudience(otherDraft.trim());
                setOther(false);
              }}
            >
              <input
                autoFocus
                value={otherDraft}
                onChange={(e) => setOtherDraft(e.target.value)}
                placeholder="e.g. Head of Procurement"
                className="h-8 w-52 rounded-md border border-line bg-white px-2.5 text-[13px] outline-none focus:border-navy/50"
              />
              <button type="submit" className="btn-secondary h-8">Use</button>
            </form>
          )}
          <span className="hidden text-[12px] text-muted md:inline">
            {meeting.audienceLabel ? `${p.label} story: ${p.cares.charAt(0).toLowerCase()}${p.cares.slice(1)}` : p.cares}
          </span>
        </div>
        {!customerView && (
          <button onClick={() => setAssistant(true)} className="btn-secondary">
            <Sparkles size={14} className="text-amber-500" /> Meeting prep AI
          </button>
        )}
      </div>

      <nav aria-label="Meeting steps" className="mb-6 flex gap-1.5 overflow-x-auto pb-1">
        {AGENDA.map((a, i) => {
          const active = step === a.step;
          const done = step > a.step;
          return (
            <button
              key={a.step}
              onClick={() => go(a.step)}
              aria-current={active ? "step" : undefined}
              className={`flex min-w-[120px] flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left transition ${
                active ? "bg-navy text-white shadow-sm" : done ? "bg-navy-50 text-navy hover:bg-navy-50/70" : "bg-white text-slate-600 ring-1 ring-inset ring-line hover:text-ink"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
                  active ? "bg-white text-navy" : done ? "bg-navy text-white" : "bg-canvas text-slate-600"
                }`}
              >
                {a.step}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold">{SHORT[i]}</span>
                <span className={`block text-[11px] tnum ${active ? "text-blue-100" : "text-muted"}`}>{a.minutes} min</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div key={`${step}-${meeting.persona}`} className="lift-in min-h-[420px]">
        {step === 1 && <StepTitle review={review} persona={meeting.persona} onGo={go} />}
        {step === 2 && (
          <StepSummary
            review={review}
            persona={meeting.persona}
            onOpenMetric={onOpenMetric}
            comparison={comparison}
            onLastSteerCo={(month) => onMeeting({ lastSteerCo: month })}
            audienceLabel={meeting.audienceLabel}
          />
        )}
        {step === 3 && <StepAgreement review={review} meeting={meeting} onChange={onMeeting} onOpenMetric={onOpenMetric} />}
        {step === 4 && <StepPeers review={review} onOpenSite={onOpenSite} onOpenMetric={onOpenMetric} />}
        {step === 5 && <StepRoughCalc review={review} meeting={meeting} onChange={onMeeting} onOpenMetric={onOpenMetric} />}
        {step === 6 && <StepNextSteps review={review} meeting={meeting} onChange={onMeeting} onExport={onExport} exporting={exporting} canExport={canExport} />}
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-line pt-4">
        <button onClick={() => go(step - 1)} disabled={step === 1} className="btn-secondary">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="hidden text-[12px] text-muted sm:inline">Tip: use the ← → keys to move through the meeting</span>
        {step < 6 ? (
          <button onClick={() => go(step + 1)} className="btn-primary">
            {AGENDA[step].title} <ArrowRight size={14} />
          </button>
        ) : (
          <span className="text-[12.5px] font-medium text-navy">End of the meeting flow</span>
        )}
      </div>

      <Drawer
        open={assistant}
        onClose={() => setAssistant(false)}
        title="Meeting prep AI"
        subtitle="KAM only: not shown in Customer view"
        width="max-w-4xl"
      >
        <MeetingPrepAI review={review} meeting={meeting} comparison={comparison} onAudience={onAudience} onOpenMetric={onOpenMetric} onOpenSite={onOpenSite} live={live} />
      </Drawer>
    </div>
  );
}
