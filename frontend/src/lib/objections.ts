import { dqNotes } from "./dq";
import { full, pct } from "./format";
import type { Review } from "./types";

/*
 * Customer Objection Simulator (README innovation #2): the questions a customer is likely to ask in the
 * review meeting, each answered only from this review's evidence, with an honest status. Questions the
 * data cannot answer say so and name the source that would. Templates only; no number is generated.
 */

export type Readiness = "evidence" | "caveat" | "unanswerable";

export interface Objection {
  id: string;
  question: string;
  readiness: Readiness;
  /** Short answer the KAM can give. */
  answer: string;
  /** Supporting points with the review's own numbers. */
  points: string[];
  /** Metrics the answer relies on (open "Show the calculation"). */
  metricIds: string[];
  /** For caveat / unanswerable: what would close the gap. */
  needs?: string;
}

const m = (r: Review, id: string) => r.metrics.find((x) => x.id === id);
const gapSource = (r: Review, words: string[]) =>
  r.data_gaps.find((g) => words.some((w) => `${g.gap} ${g.future_source}`.toLowerCase().includes(w)))?.future_source.split(";")[0];

export function buildObjections(r: Review): Objection[] {
  const out: Objection[] = [];
  const baseline = r.meta.baseline_name.toLowerCase();
  const dq = dqNotes(r);

  // 1. Reliability of the headline water saving
  const water = m(r, "water_saving_l");
  const kg = m(r, "washed_kg");
  if (water) {
    const dq4 = dq.byMetric.get("water_saving_l")?.find((n) => n.code === "DQ4");
    out.push({
      id: "water-reliability",
      question: "How reliable is your water-saving number?",
      readiness: dq4 ? "caveat" : "evidence",
      answer: `It is an allocated estimate against ${baseline}, given as a range rather than one number: ${full(water.value.low / 1000, 0)}–${full(water.value.high / 1000, 0)} m³, base case ${full(water.value.base / 1000, 0)} m³.`,
      points: [
        `Calculated from your own volume${kg ? ` (${full(kg.value.base, 0)} kg washed)` : ""} × the baseline's litres per kg, minus the water Lindström's laundries used for you.`,
        "Laundries meter water per site, not per customer, so your share is allocated by washed kg (assumption A003).",
        "The range tests the baseline factor at ±20% (team assumption T002).",
        ...(dq4 ? [dq4.detail] : []),
      ],
      metricIds: ["water_saving_l", "customer_water_l", "washed_kg"],
      needs: dq4 ? "Reconcile laundry volumes with the WWS Washed Kg report before external use." : undefined,
    });
  }

  // 2. Why this baseline?
  if (r.baseline_comparison.length > 1) {
    const rows = r.baseline_comparison
      .filter((b) => b.water_saving_l)
      .map((b) => `${b.name}: ${full(b.water_saving_l.base / 1000, 0)} m³ water, ${full(b.co2e_saving_kg.base / 1000, 1)} t CO₂e (base case)`);
    out.push({
      id: "baseline-choice",
      question: `Why compare with ${baseline}? Isn't that the comparison that makes you look best?`,
      readiness: "evidence",
      answer: `${r.meta.baseline_name} is the agreed default (A001), but you can choose the comparison. All three are calculated the same way:`,
      points: rows,
      metricIds: ["water_saving_l", "co2e_saving_kg"],
    });
  }

  // 3. Idle stock / are we paying for unused garments?
  const use = m(r, "allocation_use_rate");
  const idle = m(r, "idle_pieces");
  if (use && idle) {
    const r1 = r.sites.filter((s) => s.flags.some((f) => f.startsWith("R1_")));
    const idleR1 = r1.reduce((a, s) => a + (s.metrics.idle_pieces ?? 0), 0);
    out.push({
      id: "idle-stock",
      question: `Only ${pct(use.value.base, 1)} of our garments are in use. Are we paying for idle stock?`,
      readiness: "caveat",
      answer: `${full(idle.value.base, 0)} allocated garments were not scanned in circulation in the latest month. Some of that is a deliberate buffer for shifts and sizes, so it is a review scope, not proven waste.`,
      points: [
        r1.length ? `${r1.length} sites have the lowest utilisation (rule R1) and hold ${full(idleR1, 0)} of the idle garments: the place to start.` : "No site is in the lowest-utilisation group.",
        "The 2026 what-if shows what reclaiming part of them would do to utilisation.",
      ],
      metricIds: ["allocation_use_rate", "idle_pieces"],
      needs: "Cost impact needs contract and invoice data, which this prototype does not have.",
    });
  }

  // 4. How many people really wear the garments?
  const wearers = m(r, "wearers_min_est");
  const assign = m(r, "wearer_product_assignments");
  if (wearers) {
    out.push({
      id: "wearers",
      question: "How many of our people actually wear your garments?",
      readiness: "caveat",
      answer: `At least ${full(wearers.value.base, 0)} people in the latest month. That is a minimum, not an exact head count.`,
      points: [
        assign
          ? `${full(assign.value.base, 0)} is the number of wearer-product assignments: one person with a jacket and trousers counts twice, so it must not be quoted as people (DQ5).`
          : "Wearers are reported per product, so summing them double-counts people (DQ5).",
      ],
      metricIds: ["wearers_min_est", "wearer_product_assignments"],
      needs: `Unique wearer IDs from ${gapSource(r, ["wearer"]) ?? "eLindström"}.`,
    });
  }

  // 5. Service performance
  const onTime = m(r, "on_time_rate");
  const cycle = m(r, "median_cycle_hours");
  if (onTime) {
    const r3 = r.sites.filter((s) => s.flags.some((f) => f.startsWith("R3_")));
    out.push({
      id: "service",
      question: "Are deliveries actually on time across all our sites?",
      readiness: "evidence",
      answer: `${pct(onTime.value.base, 1)} of service cycles were on time${cycle ? `, with a median cycle of ${full(cycle.value.base, 0)} hours` : ""}.`,
      points: r3.length
        ? (() => {
            const worst = Math.min(...r3.map((s) => s.metrics.on_time_rate ?? onTime.value.base));
            return [
              `${r3.length} sites are below your own average; the largest gap is ${full((onTime.value.base - worst) * 100, 1)} percentage points. We propose reviewing pickup schedules at those sites first.`,
            ];
          })()
        : ["No site is below your own on-time average."],
      metricIds: ["on_time_rate", "median_cycle_hours"],
    });
  }

  // 6. Repairs and new purchases
  const repairs = m(r, "repairs_total");
  const postponed = m(r, "replacements_postponed");
  if (repairs) {
    out.push({
      id: "repairs",
      question: "Did all those repairs really save us buying new garments?",
      readiness: "caveat",
      answer: `${full(repairs.value.base, 0)} repairs were completed.${postponed ? ` They postponed an estimated ${full(postponed.value.low, 0)}–${full(postponed.value.base, 0)} replacements.` : ""}`,
      points: [
        "The pack assumes each repair postpones one replacement (A002). Because that is unproven, the Low case assumes only half do (T001).",
        "The CO₂e of avoided new garments uses synthetic product footprints (A005), so we keep it internal until approved LCA data exists.",
      ],
      metricIds: ["repairs_total", "replacements_postponed", "avoided_product_co2e_kg"],
      needs: "Approved product LCA footprints.",
    });
  }

  // 7. Can we put this in our sustainability report?
  out.push({
    id: "audited",
    question: "Are these figures audited? Can we put them in our sustainability report?",
    readiness: "unanswerable",
    answer: "Not yet. This prototype uses synthetic, illustrative data and estimates; nothing here is audited or verified.",
    points: [
      "Every number shows its status (calculated, allocated estimate, estimate, synthetic) and its range.",
      `Open data gaps before external use: ${r.data_gaps.slice(0, 3).map((g) => g.gap.toLowerCase()).join("; ")}${r.data_gaps.length > 3 ? ` and ${r.data_gaps.length - 3} more` : ""}.`,
    ],
    metricIds: [],
    needs: "Approved Lindström factors, reconciled laundry volumes and production data sources (see Methodology).",
  });

  // 8. Service-request causes
  const requests = m(r, "service_requests");
  out.push({
    id: "request-causes",
    question: "What is causing our service requests?",
    readiness: "unanswerable",
    answer: requests
      ? `We can see ${full(requests.value.base, 0)} requests and where they cluster, but not their causes.`
      : "The causes of service requests are not in this data.",
    points: ["Rule R4 shows which sites have unusually many requests per wearer: a starting point for a joint review."],
    metricIds: requests ? ["service_requests"] : [],
    needs: `Request IDs, timestamps and cause codes from ${gapSource(r, ["service-request", "request"]) ?? "the service-request system"}.`,
  });

  // 9. Money
  out.push({
    id: "money",
    question: "How much money will we save next year?",
    readiness: "unanswerable",
    answer: "We cannot promise a cost saving from this data. The euro figures shown are illustrative stock values, not savings.",
    points: ["What we can show: the operational effect of an action, for example utilisation in the 2026 what-if."],
    metricIds: [],
    needs: "Contract and invoice data, which this prototype does not have.",
  });

  return out;
}
