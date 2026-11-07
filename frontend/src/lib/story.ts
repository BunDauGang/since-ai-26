import type { Observation } from "./types";

/**
 * Splits the insights engine's observation prose into its parts so the UI can lay them out as a story.
 * Engine format (backend/insights): "<finding>. Evidence: <numbers>. Why it matters: <context>."
 * Nothing is rewritten or invented; every piece is a verbatim slice of the observation.
 */
export function splitObservation(o: Observation): { finding: string; evidence: string | null; why: string | null } {
  const text = o.observation ?? "";
  const whyAt = text.indexOf("Why it matters:");
  const evidenceAt = text.indexOf("Evidence:");
  const why = whyAt >= 0 ? text.slice(whyAt + "Why it matters:".length).trim() : null;
  const head = whyAt >= 0 ? text.slice(0, whyAt) : text;
  const evidence = evidenceAt >= 0 && evidenceAt < head.length ? head.slice(evidenceAt + "Evidence:".length).trim() : null;
  const finding = (evidenceAt >= 0 && evidenceAt < head.length ? head.slice(0, evidenceAt) : head).trim();
  return { finding, evidence, why };
}

/**
 * Splits "Proposed Q1 2026 planning scenario (KAM must confirm or reschedule): <action> Potential benefit: <benefit>"
 * into a short tag, the action itself and the stated benefit.
 */
export function splitAction(text: string): { tag: string | null; action: string; benefit: string | null } {
  let rest = (text ?? "").trim();
  let tag: string | null = null;
  const m = rest.match(/^Proposed (.+?) planning scenario \((.+?)\):\s*/i);
  if (m) {
    tag = `Proposed for ${m[1]} · ${m[2].replace(/must confirm or reschedule/i, "to confirm")}`;
    rest = rest.slice(m[0].length);
  }
  const benefitAt = rest.indexOf("Potential benefit:");
  const benefit = benefitAt >= 0 ? rest.slice(benefitAt + "Potential benefit:".length).trim() : null;
  const action = (benefitAt >= 0 ? rest.slice(0, benefitAt) : rest).trim();
  return { tag, action, benefit };
}
