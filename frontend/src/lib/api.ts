import sample from "@/data/sample_review.json";
import type { Priority, Review, ReviewRequest } from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export const SAMPLE_REVIEW = sample as unknown as Review;

async function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await p(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

/** True when the FastAPI backend answers. */
export async function pingBackend(): Promise<boolean> {
  try {
    const res = await withTimeout((signal) => fetch(`${API_URL}/api/customers`, { signal }), 1500);
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchReview(req: ReviewRequest): Promise<Review> {
  const res = await withTimeout(
    (signal) =>
      fetch(`${API_URL}/api/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal,
      }),
    30000,
  );
  if (!res.ok) throw new Error(`Review request failed (${res.status})`);
  return (await res.json()) as Review;
}

export async function interpretPrompt(prompt: string, industry: string): Promise<Priority | null> {
  try {
    const res = await withTimeout(
      (signal) =>
        fetch(`${API_URL}/api/interpret`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, industry }),
          signal,
        }),
      8000,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { priority?: Priority };
    return data.priority ?? null;
  } catch {
    return null;
  }
}

/** Downloads the PPTX/PDF rendered by backend/export from the exact review the user is looking at. */
export async function exportReview(review: Review, format: "pptx" | "pdf"): Promise<void> {
  const res = await withTimeout(
    (signal) =>
      fetch(`${API_URL}/api/export?format=${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(review),
        signal,
      }),
    60000,
  );
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const name = `${review.meta.customer_name.replace(/\s+/g, "_")}_Value_Review_${review.meta.period.to.slice(0, 4)}.${format}`;
  triggerDownload(blob, name);
}

export function downloadJson(review: Review) {
  const blob = new Blob([JSON.stringify(review, null, 2)], { type: "application/json" });
  triggerDownload(blob, `review_${review.meta.customer_id}_${review.meta.baseline_id}_${review.meta.sensitivity}.json`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
