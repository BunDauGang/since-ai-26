import type { Persona } from "./personas";

/*
 * Any audience → the closest story. A KAM types the role they are meeting ("Head of Procurement",
 * "HSE manager", "Plant director"); this maps it to one of the four evidence-backed stories. The AI prep
 * endpoint may refine the mapping, but this offline table always works.
 */

export interface AudienceMatch {
  persona: Persona;
  /** Why this story was chosen, shown to the KAM. */
  reason: string;
}

const RULES: { persona: Persona; words: string[]; reason: string }[] = [
  {
    persona: "cfo",
    words: ["cfo", "finance", "financial", "procurement", "purchas", "buyer", "sourcing", "controller", "cost", "budget", "commercial"],
    reason: "cares about value for money, stock and contract terms",
  },
  {
    persona: "sustainability",
    words: ["sustainab", "esg", "csr", "csrd", "environment", "climate", "carbon", "hse", "ehs", "health and safety", "safety", "compliance", "quality"],
    reason: "cares about credible environmental evidence and compliance",
  },
  {
    persona: "operations",
    words: ["operation", "site", "plant", "factory", "production", "logistic", "supply chain", "facility", "facilities", "maintenance", "shift", "warehouse", "coo", "hr", "people", "workforce"],
    reason: "cares about day-to-day service, availability and site issues",
  },
  {
    persona: "ceo",
    words: ["ceo", "chief executive", "managing director", "general manager", "president", "owner", "board", "steering", "director", "vp", "vice president", "head of business"],
    reason: "cares about the big picture and the partnership",
  },
];

export const AUDIENCE_SUGGESTIONS = ["Head of Procurement", "HSE manager", "Plant director", "Facilities manager", "Steering committee", "HR director"];

export function matchAudience(text: string): AudienceMatch | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  // Most specific role words first: "Sustainability director" is a sustainability story, not a CEO story.
  for (const rule of RULES) {
    if (rule.words.some((w) => t.includes(w))) return { persona: rule.persona, reason: rule.reason };
  }
  return { persona: "ceo", reason: "no specific role recognised, so the big-picture story is used" };
}
