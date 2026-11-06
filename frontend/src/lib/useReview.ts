"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchReview, pingBackend, SAMPLE_REVIEW } from "./api";
import { CUSTOMERS } from "./config";
import { emphasizedIds, rankObservations, rebaseReview } from "./derive";
import type { Priority, Review, Sensitivity } from "./types";

export type Mode = "checking" | "live" | "offline";

export interface Controls {
  customerId: string;
  baselineId: string;
  sensitivity: Sensitivity;
  priority: Priority;
  periodFrom: string;
  periodTo: string;
  prompt: string;
}

const DEFAULT_CONTROLS: Controls = {
  customerId: SAMPLE_REVIEW.meta.customer_id,
  baselineId: SAMPLE_REVIEW.meta.baseline_id,
  sensitivity: "base",
  priority: (SAMPLE_REVIEW.meta.priority as Priority) ?? "water",
  periodFrom: SAMPLE_REVIEW.meta.period.from,
  periodTo: SAMPLE_REVIEW.meta.period.to,
  prompt: "",
};

export function useReview() {
  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS);
  const [mode, setMode] = useState<Mode>("checking");
  const [liveReview, setLiveReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const checkBackend = useCallback(async () => {
    setMode("checking");
    setMode((await pingBackend()) ? "live" : "offline");
  }, []);

  useEffect(() => {
    void checkBackend();
  }, [checkBackend]);

  // Live mode: every control change asks the engine for a freshly calculated review.json.
  useEffect(() => {
    if (mode !== "live") return;
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetchReview({
          customer_id: controls.customerId,
          period_from: controls.periodFrom,
          period_to: controls.periodTo,
          baseline_id: controls.baselineId,
          sensitivity: controls.sensitivity,
          priority: controls.priority,
          prompt: controls.prompt || undefined,
        });
        if (id === reqId.current) {
          setLiveReview(r);
          setError(null);
        }
      } catch (e) {
        if (id === reqId.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
    // prompt is applied through priority; don't refetch on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, controls.customerId, controls.baselineId, controls.sensitivity, controls.priority, controls.periodFrom, controls.periodTo]);

  const derived = useMemo(() => {
    const live = mode === "live" && liveReview;
    const base = live ? liveReview : SAMPLE_REVIEW;
    const { review, siteLevelBaselineId } = live
      ? { review: base, siteLevelBaselineId: base.meta.baseline_id }
      : rebaseReview(base, controls.baselineId);
    const emphasized = emphasizedIds(review, controls.priority);
    const observations = rankObservations(review.observations, emphasized);
    // What gets exported must equal what is on screen.
    const exportable: Review = {
      ...review,
      meta: { ...review.meta, sensitivity: controls.sensitivity, priority: controls.priority },
      priority_view: { ...review.priority_view, priority: controls.priority, emphasized_metric_ids: emphasized },
      observations,
    };
    return { review: exportable, emphasized, siteLevelBaselineId };
  }, [mode, liveReview, controls.baselineId, controls.priority, controls.sensitivity]);

  const update = useCallback((patch: Partial<Controls>) => setControls((c) => ({ ...c, ...patch })), []);

  const customerAvailable = (id: string) => mode === "live" || id === SAMPLE_REVIEW.meta.customer_id;
  const customer = CUSTOMERS.find((c) => c.id === controls.customerId) ?? CUSTOMERS[0];

  return { controls, update, mode, checkBackend, loading, error, customer, customerAvailable, ...derived };
}
