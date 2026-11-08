"use client";

import { AlertTriangle, Braces, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CalcDrawer } from "@/components/CalcDrawer";
import { MeetingMode } from "@/components/meeting/MeetingMode";
import { MeetingPrepAI } from "@/components/meeting/MeetingPrepAI";
import { matchAudience } from "@/lib/audience";
import { useComparison } from "@/lib/comparison";
import { ControlBar } from "@/components/ControlBar";
import { MobileNav, Sidebar } from "@/components/Sidebar";
import { SiteDrawer } from "@/components/SiteDrawer";
import { Baselines } from "@/components/views/Baselines";
import { Methodology } from "@/components/views/Methodology";
import { Observations } from "@/components/views/Observations";
import { Overview } from "@/components/views/Overview";
import { Sites } from "@/components/views/Sites";
import { ObjectionPrep } from "@/components/ObjectionPrep";
import { SafeToSay } from "@/components/SafeToSay";
import { WhatIfSimulator } from "@/components/WhatIfSimulator";
import { ApiError, downloadJson, exportReview } from "@/lib/api";
import { CUSTOMERS, isOutlier, KAM_ONLY_METRICS, priorityDef, type Audience, type SiteScope, type ViewId } from "@/lib/config";
import { baselineName } from "@/lib/derive";
import { emptyMeeting, loadMeeting, meetingBlock, saveMeeting, type MeetingState } from "@/lib/meeting";
import { personaPriority, type Persona } from "@/lib/personas";
import type { Priority } from "@/lib/types";
import { useReview } from "@/lib/useReview";

const TITLES: Record<ViewId, string> = {
  meeting: "Customer meeting",
  overview: "Executive value overview",
  sites: "Multi-site consolidation & drill-down",
  baselines: "Baseline comparison & circularity",
  observations: "Meeting prep: talking points, 2026 what-if & actions",
  methodology: "Methodology, data quality & data gaps",
};

const VIEW_IDS = Object.keys(TITLES) as ViewId[];

/** Static copy on GitHub Pages: no API, runs on the bundled sample review. */
const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === "true";
const DECKS_URL = "https://github.com/BunDauGang/since-ai-26/tree/main/deliverables";

export default function Page() {
  const [audience, setAudience] = useState<Audience>("kam");
  const r = useReview();
  const { controls } = r;
  const customerView = audience === "customer";
  // Customer view hides KAM-internal context; numbers themselves are unchanged.
  const review = customerView
    ? {
        ...r.review,
        metrics: r.review.metrics.filter((m) => !KAM_ONLY_METRICS.includes(m.id)),
        priority_view: {
          ...r.review.priority_view,
          emphasized_metric_ids: r.review.priority_view.emphasized_metric_ids.filter((id) => !KAM_ONLY_METRICS.includes(id)),
        },
      }
    : r.review;
  const emphasized = customerView ? r.emphasized.filter((id) => !KAM_ONLY_METRICS.includes(id)) : r.emphasized;
  const [view, setViewState] = useState<ViewId>("meeting");
  const [metricId, setMetricId] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pptx" | "pdf" | null>(null);
  const [scope, setScope] = useState<SiteScope | null>(null);
  // One meeting per customer, remembered in this browser only. `owner` says which customer the state
  // belongs to, so switching customers never saves one customer's meeting under another's id.
  const customerId = controls.customerId;
  const [meetingState, setMeetingState] = useState<{ owner: string | null; m: MeetingState }>(() => ({ owner: null, m: emptyMeeting() }));
  const meeting = meetingState.m;
  useEffect(() => {
    setMeetingState({ owner: customerId, m: loadMeeting(customerId) ?? emptyMeeting() });
  }, [customerId]);
  useEffect(() => {
    if (meetingState.owner === customerId) saveMeeting(customerId, meetingState.m);
  }, [meetingState, customerId]);
  const patchMeeting = useCallback((patch: Partial<MeetingState>) => setMeetingState((s) => ({ ...s, m: { ...s.m, ...patch } })), []);
  const update = r.update;
  const onPersona = useCallback(
    (p: Persona) => {
      patchMeeting({ persona: p, audienceLabel: "" });
      const def = CUSTOMERS.find((c) => c.id === customerId)?.defaultPriority ?? ("water" as Priority);
      update({ priority: personaPriority(p, def) });
    },
    [customerId, update, patchMeeting],
  );
  // Any audience: a typed role picks the closest story (and its lens), keeping the role as the label.
  const onAudience = useCallback(
    (label: string) => {
      const hit = matchAudience(label);
      if (!hit) return;
      onPersona(hit.persona);
      patchMeeting({ audienceLabel: label });
    },
    [onPersona, patchMeeting],
  );
  const comparison = useComparison({
    review,
    live: r.mode === "live" && r.liveSource === "engine",
    customerId: controls.customerId,
    baselineId: controls.baselineId,
    sensitivity: controls.sensitivity,
    priority: controls.priority,
    lastSteerCo: meeting.lastSteerCo,
  });
  const [toast, setToast] = useState<{ kind: "error" | "info"; text: string; action?: { label: string; run: () => void } } | null>(null);

  // Keep the active view in the URL hash so a demo can deep-link (#sites, #methodology…).
  useEffect(() => {
    const fromHash = window.location.hash.slice(1) as ViewId;
    if (VIEW_IDS.includes(fromHash)) setViewState(fromHash);
  }, []);
  const setView = useCallback((v: ViewId) => {
    setViewState(v);
    history.replaceState(null, "", `#${v}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const openMetric = useCallback(
    (id: string) => {
      if (review.metrics.some((m) => m.id === id)) {
        setSiteId(null);
        setMetricId(id);
      }
    },
    [review.metrics],
  );
  const openSite = useCallback((id: string) => {
    setMetricId(null);
    setSiteId(id);
  }, []);

  // Site/month detail of the bundled sample is fixed to its baseline and base case; say so next to those charts.
  const siteNoteParts = [
    r.siteLevelBaselineId !== controls.baselineId ? `vs ${baselineName(r.siteLevelBaselineId).toLowerCase()}` : null,
    r.siteLevelSensitivity !== controls.sensitivity ? `${r.siteLevelSensitivity} case` : null,
  ].filter(Boolean);
  const siteBaselineNote = siteNoteParts.length ? `${siteNoteParts.join(", ")} (site/month detail needs live engine)` : undefined;

  async function onExport(format: "pptx" | "pdf") {
    if (!r.canExport) return;
    if (STATIC_DEMO && r.mode !== "live") {
      setToast({
        kind: "info",
        text: "This online demo has no API, so it cannot build a deck. Ready-made NorthStar decks (PPTX and PDF) are in the repository.",
        action: { label: "Open the decks", run: () => window.open(DECKS_URL, "_blank", "noopener") },
      });
      return;
    }
    setExporting(format);
    try {
      await exportReview({ ...review, meeting: meetingBlock(review, meeting) }, format);
      setToast({ kind: "info", text: `${format.toUpperCase()} downloaded — built from the same review.json shown here.` });
    } catch (e) {
      setToast({
        kind: "error",
        text:
          e instanceof ApiError
            ? `${format.toUpperCase()} export failed (HTTP ${e.status}): ${e.message}`
            : `Export service not reachable (${format.toUpperCase()} is rendered by backend/export via FastAPI). Start the API, or download the exact review.json behind this view.`,
        action: { label: "Download review.json", run: () => downloadJson(review) },
      });
    } finally {
      setExporting(null);
    }
  }

  const flagged = review.sites.filter(isOutlier).length;
  const metric = metricId ? review.metrics.find((m) => m.id === metricId) ?? null : null;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        view={view}
        onView={setView}
        customerName={r.blocking ? r.customer.name : review.meta.customer_name}
        industry={r.blocking ? r.customer.industry : `${review.meta.industry} · ${review.meta.segment}`}
        counts={{ sites: review.sites.length, observations: review.observations.length, methodology: review.data_quality.length }}
        mode={r.mode}
        onRecheck={r.checkBackend}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Persistent synthetic-data banner */}
        <div className="flex items-center justify-center gap-2 bg-navy-900 px-4 py-1.5 text-center text-[12px] font-medium tracking-wide text-white">
          <AlertTriangle size={13} className="text-amber-300" />
          SYNTHETIC PROTOTYPE DATA — For demonstration only, not audited. Not an approved Lindström or customer claim.
        </div>
        <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white px-4 py-2 lg:px-8">
          <span className="text-[12px] text-muted">
            {customerView
              ? "Customer view: preview of a future eLindström decision-maker module. KAM-internal context is hidden."
              : "KAM view: full context for preparing the customer review."}
          </span>
          <div className="inline-flex rounded-lg bg-canvas p-0.5 ring-1 ring-inset ring-line" role="group" aria-label="Audience">
            {(["kam", "customer"] as const).map((a) => (
              <button
                key={a}
                onClick={() => setAudience(a)}
                className={`rounded-md px-3 py-1 text-[12.5px] font-medium ${audience === a ? "bg-white text-navy shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"}`}
              >
                {a === "kam" ? "KAM view" : "Customer view"}
              </button>
            ))}
          </div>
        </div>
        <ControlBar
          controls={controls}
          update={r.update}
          mode={r.mode}
          industry={r.customer.industry}
          customerAvailable={r.customerAvailable}
          onView={setView}
          onExport={onExport}
          exporting={exporting}
          canExport={r.canExport}
          sites={review.sites}
          scope={scope}
          onScope={setScope}
          compact={view === "meeting"}
          exportBlockedReason={!r.periodValid ? "Fix the reporting period first" : "Waiting for the engine to finish recalculating"}
        />
        <MobileNav view={view} onView={setView} />

        <main className="flex-1 px-4 py-6 lg:px-8">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[12px] font-medium text-muted">
                {r.blocking ? (
                  <>{r.customer.name} · {controls.periodFrom} → {controls.periodTo}</>
                ) : (
                  <>
                    {review.meta.customer_name} · {review.meta.period.from} → {review.meta.period.to} · {review.sites.length} sites (
                    {Array.from(new Set(review.sites.map((s) => s.country))).join(", ")}) · vs {review.meta.baseline_name.toLowerCase()} ·{" "}
                    {priorityDef(controls.priority).label} lens
                  </>
                )}
              </div>
              <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-ink">
                {customerView && view === "observations" ? "Your 2026 actions and results" : TITLES[view]}
              </h1>
            </div>
            <div className="flex items-center gap-3 text-[12px] text-muted">
              {r.loading && (
                <span className="inline-flex items-center gap-1 text-navy">
                  <Loader2 size={13} className="animate-spin" /> Recalculating…
                </span>
              )}
              {flagged > 0 && view !== "sites" && !r.blocking && (
                <button onClick={() => setView("sites")} className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
                  {flagged} outlier sites
                </button>
              )}
              <button
                onClick={() => downloadJson(review)}
                disabled={!r.canExport}
                className="inline-flex items-center gap-1 hover:text-navy disabled:opacity-40"
                title="Download the exact review.json behind this view"
              >
                <Braces size={13} /> review.json
              </button>
            </div>
          </div>
          {STATIC_DEMO && r.mode !== "live" && (
            <div className="mb-4 rounded-lg bg-navy-50 px-4 py-2.5 text-[13px] text-navy-900 ring-1 ring-blue-200">
              Online demo: runs in your browser on the bundled NorthStar review (synthetic 2025 data). Live recalculation, other customers and deck
              downloads need the API (see the repository README);{" "}
              <a href={DECKS_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                ready-made decks are here
              </a>
              .
            </div>
          )}
          {r.error && !r.blocking && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-[13px] text-red-700 ring-1 ring-red-200">
              Live engine error: {r.error}. The view below is from the previous settings and cannot be exported until a recalculation succeeds.
            </div>
          )}
          {r.liveSource === "sample" && !r.blocking && (
            <div className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800 ring-1 ring-amber-200">
              The API has no Excel data pack loaded, so it served the bundled sample review. Put the pack in <code>data/</code> and restart the API for live calculations.
            </div>
          )}
          {r.insightsError && !r.blocking && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-[13px] text-red-700 ring-1 ring-red-200">
              Observations could not be generated ({r.insightsError}). KPIs and sites are still calculated; the Observations view is empty.
            </div>
          )}
          {!r.periodValid && (
            <div className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800 ring-1 ring-amber-200">
              The reporting period starts after it ends. Choose a valid period to recalculate.
            </div>
          )}

          {r.blocking ? (
            <div className="card flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
              {r.error ? (
                <>
                  <AlertTriangle size={28} className="text-brand-red" />
                  <div className="text-lg font-semibold text-ink">Could not calculate the review for {r.customer.name}</div>
                  <div className="max-w-lg text-[13px] text-muted">{r.error}. No data is shown rather than another customer&apos;s numbers.</div>
                  <button onClick={r.retry} className="btn-secondary mt-2">Try again</button>
                </>
              ) : (
                <>
                  <Loader2 size={28} className="animate-spin text-navy" />
                  <div className="text-[15px] font-medium text-ink">Calculating {r.customer.name} from the data pack…</div>
                </>
              )}
            </div>
          ) : (
          <div className={`transition-opacity ${r.stale && r.loading ? "opacity-60" : ""}`}>

          {view === "meeting" && (
            <MeetingMode
              review={review}
              meeting={meeting}
              onMeeting={patchMeeting}
              onPersona={onPersona}
              onAudience={onAudience}
              comparison={comparison}
              live={r.mode === "live"}
              onOpenMetric={openMetric}
              onOpenSite={openSite}
              onExport={onExport}
              exporting={exporting}
              canExport={r.canExport}
              customerView={customerView}
            />
          )}
          {view === "overview" && (
            <Overview
              review={review}
              priority={controls.priority}
              sensitivity={controls.sensitivity}
              emphasized={emphasized}
              onOpenMetric={openMetric}
              onOpenSite={openSite}
              onView={setView}
              siteBaselineNote={siteBaselineNote}
              scope={scope}
            />
          )}
          {view === "sites" && <Sites review={review} onOpenSite={openSite} siteBaselineNote={siteBaselineNote} scope={scope} />}
          {view === "baselines" && (
            <Baselines
              review={review}
              sensitivity={controls.sensitivity}
              baselineId={controls.baselineId}
              onBaseline={(id) => r.update({ baselineId: id })}
              onOpenMetric={openMetric}
            />
          )}
          {view === "observations" && (
            <div className="space-y-6">
              {!customerView && (
                <MeetingPrepAI
                  review={review}
                  meeting={meeting}
                  comparison={comparison}
                  onAudience={onAudience}
                  onOpenMetric={openMetric}
                  onOpenSite={openSite}
                  live={r.mode === "live"}
                />
              )}
              <SafeToSay review={review} onOpenMetric={openMetric} audience={audience} />
              {!customerView && <ObjectionPrep review={review} onOpenMetric={openMetric} />}
              <WhatIfSimulator review={review} onOpenSite={openSite} />
              <Observations review={review} priority={controls.priority} emphasized={emphasized} onOpenMetric={openMetric} onOpenSite={openSite} />
            </div>
          )}
          {view === "methodology" && <Methodology review={review} sensitivity={controls.sensitivity} onOpenMetric={openMetric} />}
          </div>
          )}

          <footer className="mt-10 border-t border-line pt-4 text-[11.5px] text-muted">
            Synthetic, illustrative data. Not audited. Not a Lindström claim. · Generated {new Date(review.meta.generated_at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC · Lindström × Since AI
            Hackathon 2026 prototype
          </footer>
        </main>
      </div>

      <CalcDrawer
        metric={metric}
        review={review}
        sensitivity={controls.sensitivity}
        onClose={() => setMetricId(null)}
        onOpenSite={openSite}
        onOpenMetric={openMetric}
        siteBaselineNote={siteBaselineNote}
      />
      <SiteDrawer siteId={siteId} review={review} onClose={() => setSiteId(null)} onOpenMetric={openMetric} siteBaselineNote={siteBaselineNote} />

      {toast && (
        <div className="lift-in fixed bottom-5 left-1/2 z-[60] flex w-[min(640px,calc(100%-32px))] -translate-x-1/2 items-start gap-3 rounded-xl bg-navy-900 px-4 py-3 text-[13px] text-white shadow-2xl">
          <span className="flex-1">{toast.text}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.run();
                setToast(null);
              }}
              className="whitespace-nowrap rounded-md bg-white px-2.5 py-1 text-[12px] font-semibold text-navy"
            >
              {toast.action.label}
            </button>
          )}
          <button onClick={() => setToast(null)} aria-label="Dismiss" className="text-blue-200 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
