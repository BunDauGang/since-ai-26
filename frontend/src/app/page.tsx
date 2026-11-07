"use client";

import { AlertTriangle, Braces, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CalcDrawer } from "@/components/CalcDrawer";
import { ControlBar } from "@/components/ControlBar";
import { MobileNav, Sidebar } from "@/components/Sidebar";
import { SiteDrawer } from "@/components/SiteDrawer";
import { Baselines } from "@/components/views/Baselines";
import { Methodology } from "@/components/views/Methodology";
import { Observations } from "@/components/views/Observations";
import { Overview } from "@/components/views/Overview";
import { Sites } from "@/components/views/Sites";
import { downloadJson, exportReview } from "@/lib/api";
import { priorityDef, type ViewId } from "@/lib/config";
import { baselineName } from "@/lib/derive";
import { useReview } from "@/lib/useReview";

const TITLES: Record<ViewId, string> = {
  overview: "Executive value overview",
  sites: "Multi-site consolidation & drill-down",
  baselines: "Baseline comparison & circularity",
  observations: "Observations, actions & steering questions",
  methodology: "Methodology, data quality & data gaps",
};

const VIEW_IDS = Object.keys(TITLES) as ViewId[];

export default function Page() {
  const r = useReview();
  const { review, controls, emphasized } = r;
  const [view, setViewState] = useState<ViewId>("overview");
  const [metricId, setMetricId] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pptx" | "pdf" | null>(null);
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

  const siteBaselineNote =
    r.siteLevelBaselineId !== controls.baselineId ? `vs ${baselineName(r.siteLevelBaselineId).toLowerCase()} (site/month detail needs live engine)` : undefined;

  async function onExport(format: "pptx" | "pdf") {
    if (!r.canExport) return;
    setExporting(format);
    try {
      await exportReview(review, format);
      setToast({ kind: "info", text: `${format.toUpperCase()} downloaded — built from the same review.json shown here.` });
    } catch {
      setToast({
        kind: "error",
        text: `Export service not reachable (${format.toUpperCase()} is rendered by backend/export via FastAPI). Start the API, or download the exact review.json behind this view.`,
        action: { label: "Download review.json", run: () => downloadJson(review) },
      });
    } finally {
      setExporting(null);
    }
  }

  const flagged = review.sites.filter((s) => s.flags.length).length;
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
              <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-ink">{TITLES[view]}</h1>
            </div>
            <div className="flex items-center gap-3 text-[12px] text-muted">
              {r.loading && (
                <span className="inline-flex items-center gap-1 text-navy">
                  <Loader2 size={13} className="animate-spin" /> Recalculating…
                </span>
              )}
              {flagged > 0 && view !== "sites" && !r.blocking && (
                <button onClick={() => setView("sites")} className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
                  {flagged} sites flagged
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
          {r.error && !r.blocking && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-[13px] text-red-700 ring-1 ring-red-200">
              Live engine error: {r.error}. The view below is from the previous settings and cannot be exported until a recalculation succeeds.
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
            />
          )}
          {view === "sites" && <Sites review={review} onOpenSite={openSite} siteBaselineNote={siteBaselineNote} />}
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
            <Observations review={review} priority={controls.priority} emphasized={emphasized} onOpenMetric={openMetric} onOpenSite={openSite} />
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
