"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchReview, pingBackend, SAMPLE_REVIEW } from "./api";
import { CUSTOMERS } from "./config";
import { emphasizedIds, normalizeReview, rankObservations, rebaseReview } from "./derive";
import type { Priority, Review, Sensitivity } from "./types";

export type Mode = "checking" | "live" | "offline";

export interface Controls {
  customerId: string;
  baselineId: string;
  sensitivity: Sensitivity;
  priority: Priority;
  periodFrom: string;
  periodTo: string;
  /** Last free-text prompt; display only — it is resolved to `priority` before any request. */
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

const NORMALIZED_SAMPLE = normalizeReview(SAMPLE_REVIEW);

/**
 * Everything the engine output depends on. Sensitivity changes site/month scalars and
 * priority changes rule ordering + observations, so both are part of the key.
 */
const requestKey = (c: Controls) => [c.customerId, c.baselineId, c.sensitivity, c.priority, c.periodFrom, c.periodTo].join("|");

export function useReview() {
  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS);
  const [mode, setMode] = useState<Mode>("checking");
  const [live, setLive] = useState<{ key: string; review: Review } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const checkBackend = useCallback(async () => {
    setMode("checking");
    setMode((await pingBackend()) ? "live" : "offline");
  }, []);

  useEffect(() => {
    void checkBackend();
  }, [checkBackend]);

  const periodValid = controls.periodFrom <= controls.periodTo;
  const key = requestKey(controls);

  // Live mode: each change of an engine input asks for a freshly calculated review.json.
  useEffect(() => {
    if (mode !== "live" || !periodValid) return;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const r = await fetchReview({
          customer_id: controls.customerId,
          period_from: controls.periodFrom,
          period_to: controls.periodTo,
          baseline_id: controls.baselineId,
          sensitivity: controls.sensitivity,
          priority: controls.priority,
        });
        if (id !== reqId.current) return;
        // The API silently falls back to the NorthStar sample when the engine fails, overwriting only
        // meta.customer_id/period. Check the name too, so another customer's numbers are never shown.
        const expectedName = CUSTOMERS.find((c) => c.id === controls.customerId)?.name;
        if (r.meta?.customer_id !== controls.customerId || (expectedName && r.meta?.customer_name !== expectedName)) {
          throw new Error(`the engine could not calculate ${expectedName ?? controls.customerId} (API returned ${r.meta?.customer_name ?? "no customer"} data)`);
        }
        setLive({ key, review: normalizeReview(r) });
      } catch (e) {
        if (id === reqId.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
    // `key` captures every engine input; controls fields are read from the same render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, key, periodValid, attempt]);

  // Can the review on screen be trusted to match the controls?
  const liveForCustomer = live && live.review.meta.customer_id === controls.customerId ? live : null;
  const stale = mode === "live" && (!live || live.key !== key);
  /** True when there is nothing correct to show for this customer (first load, or a failed switch). */
  const blocking = mode === "live" && !liveForCustomer;

  const derived = useMemo(() => {
    const useLive = mode === "live" && liveForCustomer;
    const { review, siteLevelBaselineId } = useLive
      ? { review: liveForCustomer.review, siteLevelBaselineId: liveForCustomer.review.meta.baseline_id }
      : rebaseReview(NORMALIZED_SAMPLE, controls.baselineId);
    const emphasized = emphasizedIds(review, controls.priority);
    // Sent to /api/export. Observations keep the engine's order: backend/export only reuses supplied
    // observations when they match its own rule order, so re-ranking them here would make the deck drop them.
    const exportReview: Review = {
      ...review,
      meta: { ...review.meta, sensitivity: controls.sensitivity, priority: controls.priority },
      priority_view: { ...review.priority_view, priority: controls.priority, emphasized_metric_ids: emphasized },
    };
    // Shown on screen: same data, observations touching the active lens first.
    const display: Review = { ...exportReview, observations: rankObservations(review.observations, emphasized) };
    return { review: display, exportReview, emphasized, siteLevelBaselineId };
  }, [mode, liveForCustomer, controls.baselineId, controls.priority, controls.sensitivity]);

  const update = useCallback((patch: Partial<Controls>) => setControls((c) => ({ ...c, ...patch })), []);

  const customerAvailable = (id: string) => mode === "live" || id === SAMPLE_REVIEW.meta.customer_id;
  const customer = CUSTOMERS.find((c) => c.id === controls.customerId) ?? CUSTOMERS[0];

  return {
    controls,
    update,
    mode,
    checkBackend,
    retry,
    loading,
    error,
    stale,
    blocking,
    periodValid,
    canExport: !stale && periodValid,
    customer,
    customerAvailable,
    ...derived,
  };
}
