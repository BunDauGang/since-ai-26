"use client";

import { AlertTriangle, Check, Copy, Download, FileText, History, Loader2, Plus, Presentation, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { buildObjections } from "@/lib/objections";
import { isOverdue, meetingMarkdown, type MeetingAction, type MeetingState, type PreviousAction } from "@/lib/meeting";
import { splitAction } from "@/lib/story";
import type { Review } from "@/lib/types";
import { StepHeader } from "./parts";

export function StepNextSteps({ review, meeting, onChange, onExport, exporting, canExport }: {
  review: Review;
  meeting: MeetingState;
  onChange: (m: Partial<MeetingState>) => void;
  onExport: (format: "pptx" | "pdf") => void;
  exporting: "pptx" | "pdf" | null;
  canExport: boolean;
}) {
  const [draft, setDraft] = useState({ text: "", owner: "", due: "" });
  const [topic, setTopic] = useState("");
  const [copied, setCopied] = useState(false);

  // Proposed actions come from the rule-generated observations; the KAM ticks what was agreed.
  const proposed: MeetingAction[] = review.observations.map((o, i) => ({
    id: `obs:${o.id ?? i}`,
    text: o.title,
    owner: o.owner,
    due: "",
    agreed: false,
    source: "observation",
  }));
  const actions = [
    ...proposed.map((p) => meeting.actions.find((a) => a.id === p.id) ?? p),
    ...meeting.actions.filter((a) => a.source === "kam"),
  ];
  const upsert = (a: MeetingAction) =>
    onChange({ actions: meeting.actions.some((x) => x.id === a.id) ? meeting.actions.map((x) => (x.id === a.id ? a : x)) : [...meeting.actions, a] });
  const remove = (id: string) => onChange({ actions: meeting.actions.filter((a) => a.id !== id) });

  // Questions the data cannot answer yet are natural "open topics" for the next meeting.
  const suggestions = buildObjections(review)
    .filter((o) => o.readiness === "unanswerable")
    .map((o) => o.question)
    .filter((q) => !meeting.openTopics.includes(q));
  const addTopic = (t: string) => {
    const v = t.trim();
    if (v && !meeting.openTopics.includes(v)) onChange({ openTopics: [...meeting.openTopics, v] });
  };

  const agreed = actions.filter((a) => a.agreed).length;
  const overdue = meeting.previousActions.filter((a) => isOverdue(a));
  const setPrev = (id: string, patch: Partial<PreviousAction>) =>
    onChange({ previousActions: meeting.previousActions.map((a) => (a.id === id ? { ...a, ...patch } : a)) });

  // Close this meeting: today's agreed actions become next meeting's commitments; done ones are dropped.
  function closeMeeting() {
    if (!window.confirm("Close this meeting? Agreed actions move to 'From our last meeting' for the next one, and today's ticks are cleared.")) return;
    const carried: PreviousAction[] = [
      ...meeting.previousActions.filter((a) => a.status !== "done"),
      ...meeting.actions.filter((a) => a.agreed).map((a) => ({ id: `prev:${a.id}`, text: a.text, owner: a.owner, due: a.due, status: "open" as const })),
    ];
    onChange({ previousActions: carried, actions: [], satisfaction: { score: null, comment: "" }, nextMeeting: "" });
  }

  // Demo only: an example of last meeting's commitments, built from this review's observations.
  function loadExample() {
    const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const statuses: PreviousAction["status"][] = ["done", "open", "in_progress"];
    const dues = [day(-60), day(-14), day(30)];
    onChange({
      previousActions: review.observations.slice(0, 3).map((o, i) => ({
        id: `example:${o.id ?? i}`,
        text: o.title,
        owner: o.owner,
        due: dues[i],
        status: statuses[i],
      })),
    });
  }
  const md = meetingMarkdown(review, meeting);

  function downloadMd() {
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${review.meta.customer_name.replace(/\s+/g, "_")}_meeting_summary.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the download still works */
    }
  }

  return (
    <div>
      <StepHeader
        kicker="Next steps"
        title={agreed ? `${agreed} action${agreed === 1 ? "" : "s"} agreed, ${meeting.openTopics.length} open topic${meeting.openTopics.length === 1 ? "" : "s"}` : "What do we agree to do next?"}
        sub="Tick what was agreed, add your own actions, and park what we didn't finish. The customer takes all of it home in the summary."
      />
      <section className="card mb-4 p-5" aria-label="From our last meeting">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <History size={16} className="text-navy" /> From our last meeting
          </h3>
          {meeting.previousActions.length === 0 && (
            <button onClick={loadExample} className="text-[12px] font-medium text-navy hover:underline">
              Load an example previous meeting (demo)
            </button>
          )}
        </div>
        {meeting.previousActions.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">No commitments recorded yet. When you close this meeting, today&apos;s agreed actions appear here next time with their status.</p>
        ) : (
          <>
            {overdue.length > 0 && (
              <div className="mt-3 rounded-lg bg-red-50 px-3 py-2.5 ring-1 ring-inset ring-red-200">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-red-800">
                  <AlertTriangle size={14} /> Needs a steering decision: {overdue.length} overdue commitment{overdue.length === 1 ? "" : "s"}
                </div>
                <p className="mt-0.5 text-[12px] text-red-700">Agree a new owner or a new date, or drop it on purpose.</p>
              </div>
            )}
            <ul className="mt-3 space-y-2">
              {meeting.previousActions.map((a) => {
                const late = isOverdue(a);
                return (
                  <li key={a.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${late ? "border-red-200 bg-red-50/40" : "border-line"}`}>
                    <div className="min-w-0">
                      <div className={`text-[13.5px] font-medium ${a.status === "done" ? "text-muted line-through" : "text-ink"}`}>{a.text}</div>
                      <div className="text-[11.5px] text-muted">
                        {a.owner ? `Owner: ${a.owner}` : "No owner"} · {a.due ? `due ${a.due}` : "no date"}
                        {late && <span className="ml-1 font-semibold text-red-700">· overdue</span>}
                      </div>
                    </div>
                    <div className="inline-flex rounded-md bg-canvas p-0.5 ring-1 ring-inset ring-line" role="group" aria-label={`Status of ${a.text}`}>
                      {(["open", "in_progress", "done"] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => setPrev(a.id, { status: st })}
                          className={`rounded px-2 py-1 text-[11.5px] font-medium ${a.status === st ? "bg-white text-navy shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"}`}
                        >
                          {st === "open" ? "Open" : st === "in_progress" ? "In progress" : "Done"}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <section className="card p-5">
          <h3 className="text-[15px] font-semibold text-ink">Today&apos;s actions</h3>
          <ul className="mt-3 space-y-2">
            {actions.map((a) => {
              const why = a.source === "observation" ? splitAction(review.observations.find((o, i) => `obs:${o.id ?? i}` === a.id)?.recommended_action ?? "").action : "";
              return (
                <li key={a.id} className={`rounded-lg border px-3 py-2.5 ${a.agreed ? "border-navy/40 bg-navy-50/60" : "border-line"}`}>
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => upsert({ ...a, agreed: !a.agreed })}
                      aria-pressed={a.agreed}
                      aria-label={a.agreed ? "Mark as not agreed" : "Mark as agreed"}
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${a.agreed ? "bg-navy text-white ring-navy" : "bg-white ring-slate-300"}`}
                    >
                      {a.agreed && <Check size={13} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium text-ink">{a.text}</div>
                      {why && <div className="mt-0.5 line-clamp-2 text-[12px] text-muted">{why}</div>}
                      {a.agreed && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <input
                            value={a.owner}
                            onChange={(e) => upsert({ ...a, owner: e.target.value })}
                            placeholder="Owner"
                            className="h-8 rounded-md border border-line px-2 text-[12.5px] outline-none focus:border-navy/50"
                          />
                          <input
                            type="date"
                            value={a.due}
                            onChange={(e) => upsert({ ...a, due: e.target.value })}
                            className="h-8 rounded-md border border-line px-2 text-[12.5px] outline-none focus:border-navy/50"
                          />
                        </div>
                      )}
                    </div>
                    {a.source === "kam" && (
                      <button onClick={() => remove(a.id)} aria-label="Remove action" className="text-muted hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.text.trim()) return;
              upsert({ id: `kam:${Date.now()}`, text: draft.text.trim(), owner: draft.owner.trim(), due: draft.due, agreed: true, source: "kam" });
              setDraft({ text: "", owner: "", due: "" });
            }}
          >
            <input
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              placeholder="Add an action agreed in the meeting…"
              className="h-9 min-w-0 flex-[2_1_220px] rounded-lg border border-line px-2.5 text-[13px] outline-none focus:border-navy/50"
            />
            <input
              value={draft.owner}
              onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
              placeholder="Owner"
              className="h-9 min-w-0 flex-[1_1_110px] rounded-lg border border-line px-2.5 text-[13px] outline-none focus:border-navy/50"
            />
            <button type="submit" className="btn-secondary">
              <Plus size={14} /> Add
            </button>
          </form>
        </section>

        <div className="space-y-4">
          <section className="card p-5">
            <h3 className="text-[15px] font-semibold text-ink">Open topics for next time</h3>
            <ul className="mt-3 space-y-1.5">
              {meeting.openTopics.map((t) => (
                <li key={t} className="flex items-start gap-2 text-[13px] text-ink">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-red" />
                  <span className="flex-1">{t}</span>
                  <button onClick={() => onChange({ openTopics: meeting.openTopics.filter((x) => x !== t) })} aria-label="Remove topic" className="text-muted hover:text-red-600">
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
              {meeting.openTopics.length === 0 && <li className="text-[12.5px] text-muted">Nothing parked yet.</li>}
            </ul>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addTopic(topic);
                setTopic("");
              }}
            >
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Park a topic…"
                className="h-9 min-w-0 flex-1 rounded-lg border border-line px-2.5 text-[13px] outline-none focus:border-navy/50"
              />
              <button type="submit" className="btn-secondary" aria-label="Add topic">
                <Plus size={14} />
              </button>
            </form>
            {suggestions.length > 0 && (
              <div className="mt-3">
                <div className="text-[11.5px] font-medium text-muted">The data can&apos;t answer these yet:</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {suggestions.map((q) => (
                    <button key={q} onClick={() => addTopic(q)} className="rounded-full bg-canvas px-2.5 py-1 text-left text-[11.5px] text-slate-700 ring-1 ring-inset ring-line hover:bg-navy-50">
                      + {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className="mt-4 block">
              <span className="text-[12px] font-medium text-slate-700">Next meeting</span>
              <input
                type="date"
                value={meeting.nextMeeting}
                onChange={(e) => onChange({ nextMeeting: e.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-line px-2.5 text-[13px] outline-none focus:border-navy/50"
              />
            </label>
          </section>

          <section className="card p-5">
            <h3 className="text-[15px] font-semibold text-ink">Take it home</h3>
            <p className="mt-1 text-[12.5px] text-muted">The customer review deck with today&apos;s agreements, plus a short written summary.</p>
            <div className="mt-3 grid gap-2">
              <button onClick={() => onExport("pptx")} disabled={!canExport || exporting != null} className="btn-primary justify-center">
                {exporting === "pptx" ? <Loader2 size={14} className="animate-spin" /> : <Presentation size={14} />} Download for customer (PPTX)
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => onExport("pdf")} disabled={!canExport || exporting != null} className="btn-secondary justify-center">
                  {exporting === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
                </button>
                <button onClick={downloadMd} className="btn-secondary justify-center">
                  <FileText size={14} /> Summary (.md)
                </button>
              </div>
              <button onClick={closeMeeting} className="inline-flex items-center justify-center gap-1 text-[12.5px] font-medium text-slate-600 hover:underline">
                <RotateCcw size={13} /> Close this meeting and prepare the next
              </button>
              <button onClick={copy} className="inline-flex items-center justify-center gap-1 text-[12.5px] font-medium text-navy hover:underline">
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy summary for a follow-up email"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
