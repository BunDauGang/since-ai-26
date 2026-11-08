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
  const [live, setLive] = useState<{ key: string; review: Review; source: string; insightsError: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Without the data pack (e.g. a hosted demo) the API can only serve the sample customer.
  const [pack, setPack] = useState(true);
  const checkBackend = useCallback(async () => {
    setMode("checking");
    const { ok, pack: hasPack } = await pingBackend();
    setPack(hasPack);
    setMode(ok ? "live" : "offline");
  }, []);

  useEffect(() => {
    // A sleeping hosted API can take up to a minute to wake: keep the sample on screen and retry quietly.
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async () => {
      const { ok, pack: hasPack } = await pingBackend();
      if (cancelled) return;
      setPack(hasPack);
      setMode(ok ? "live" : "offline");
      if (!ok && ++tries < 5) timer = setTimeout(attempt, 15000);
    };
    void attempt();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const periodValid = controls.periodFrom <= controls.periodTo;
  const key = requestKey(controls);

  // Live mode: each change of an engine input asks for a freshly calculated review.json.
  useEffect(() => {
    if (mode !== "live" || !periodValid) {
      // A pending request may have been cancelled by this change: never leave "Recalculating…" spinning.
      reqId.current++;
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const { review: r, source, insightsError } = await fetchReview({
          customer_id: controls.customerId,
          period_from: controls.periodFrom,
          period_to: controls.periodTo,
          baseline_id: controls.baselineId,
          sensitivity: controls.sensitivity,
          priority: controls.priority,
        });
        if (id !== reqId.current) return;
        // Defence in depth: the API now refuses to relabel its sample, but never show another customer's numbers.
        const expectedName = CUSTOMERS.find((c) => c.id === controls.customerId)?.name;
        if (r.meta?.customer_id !== controls.customerId || (expectedName && r.meta?.customer_name !== expectedName)) {
          throw new Error(`the engine could not calculate ${expectedName ?? controls.customerId} (API returned ${r.meta?.customer_name ?? "no customer"} data)`);
        }
        setLive({ key, review: normalizeReview(r), source, insightsError });
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

  // Offline there is only the bundled sample: switch the controls to its customer and period, so another
  // customer's name is never shown (or exported) above the sample's numbers.
  useEffect(() => {
    const m = SAMPLE_REVIEW.meta;
    if (mode === "offline" && (controls.customerId !== m.customer_id || controls.periodFrom !== m.period.from || controls.periodTo !== m.period.to)) {
      setControls((c) => ({ ...c, customerId: m.customer_id, periodFrom: m.period.from, periodTo: m.period.to }));
    }
  }, [mode, controls.customerId, controls.periodFrom, controls.periodTo]);

  // Can the review on screen be trusted to match the controls?
  const liveForCustomer = live && live.review.meta.customer_id === controls.customerId ? live : null;
  const stale = mode === "live" && (!live || live.key !== key);
  /** True when there is nothing correct to show for this customer (first load, or a failed switch). */
  const blocking = mode === "live" && !liveForCustomer;

  const derived = useMemo(() => {
    const useLive = mode === "live" && liveForCustomer;
    // Site and month rows of the sample (offline, or the API's sample fallback) are base case only.
    const siteLevelSensitivity = useLive && liveForCustomer.source !== "sample" ? controls.sensitivity : SAMPLE_REVIEW.meta.sensitivity;
    const { review, siteLevelBaselineId } = useLive
      ? {
          review: liveForCustomer.review,
          // The API's sample fallback rebases customer totals only; site/month rows stay on the sample baseline.
          siteLevelBaselineId: liveForCustomer.source === "sample" ? SAMPLE_REVIEW.meta.baseline_id : liveForCustomer.review.meta.baseline_id,
        }
      : rebaseReview(NORMALIZED_SAMPLE, controls.baselineId);
    const emphasized = emphasizedIds(review, controls.priority);
    // One review for screen AND export: observations touching the active lens first. backend/export matches
    // observations by their evidence (not position), so the deck keeps this order.
    const display: Review = {
      ...review,
      meta: { ...review.meta, sensitivity: controls.sensitivity, priority: controls.priority },
      priority_view: { ...review.priority_view, priority: controls.priority, emphasized_metric_ids: emphasized },
      observations: rankObservations(review.observations, emphasized),
    };
    return { review: display, emphasized, siteLevelBaselineId, siteLevelSensitivity };
  }, [mode, liveForCustomer, controls.baselineId, controls.priority, controls.sensitivity]);

  const update = useCallback((patch: Partial<Controls>) => setControls((c) => ({ ...c, ...patch })), []);

  const customerAvailable = (id: string) => (mode === "live" && pack) || id === SAMPLE_REVIEW.meta.customer_id;
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
    /** "engine" | "sample" in live mode; null offline (bundled sample). */
    liveSource: mode === "live" && liveForCustomer ? liveForCustomer.source : null,
    insightsError: mode === "live" && liveForCustomer ? liveForCustomer.insightsError : null,
    customer,
    customerAvailable,
    ...derived,
  };
}
