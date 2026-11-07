"use client";

import { Calculator, Info, RotateCcw } from "lucide-react";
import { useState } from "react";
import { BASELINES } from "@/lib/config";
import { full } from "@/lib/format";
import type { MeetingState } from "@/lib/meeting";
import { defaultRoughInputs, roughCalc, type RoughInputs } from "@/lib/roughcalc";
import type { Review } from "@/lib/types";
import { Segmented } from "../ui";
import { NumberInput, RoughLabel, StepHeader } from "./parts";

const eur = (n: number) => `€${full(n, 0)}`;

export function StepRoughCalc({ review, meeting, onChange, onOpenMetric }: {
  review: Review;
  meeting: MeetingState;
  onChange: (m: Partial<MeetingState>) => void;
  onOpenMetric: (id: string) => void;
}) {
  // No euro figure until the KAM and the customer have agreed the prices (Script.md; judges do not reward
  // the biggest claimed saving). Until then the prices are suggestions in a local draft.
  const [draft, setDraft] = useState<RoughInputs>(() => defaultRoughInputs(review));
  const agreed = meeting.rough != null;
  const inp: RoughInputs = meeting.rough ?? draft;
  const set = (patch: Partial<RoughInputs>) => (agreed ? onChange({ rough: { ...inp, ...patch } }) : setDraft({ ...inp, ...patch }));
  const res = roughCalc(review, inp);
  const maxLine = Math.max(1, ...res.lines.map((l) => l.eur.base));
  const alternatives = review.baseline_comparison;

  return (
    <div>
      <StepHeader
        kicker="Value vs the alternative"
        title={agreed ? `Roughly ${eur(res.total.base)} a year compared with ${res.baselineName.toLowerCase()}` : `What is the service worth compared with ${res.baselineName.toLowerCase()}?`}
        sub={
          agreed
            ? "Calculated at the prices we agreed together: the quantities come from your review, the prices are yours. Change any price and the total updates."
            : "The quantities below come from your review. Agree your own prices first; only then do we put a rough euro value on them."
        }
        right={<RoughLabel />}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <section className="card p-5">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Calculator size={16} className="text-navy" /> Your assumptions
          </h3>
          <div className="mt-3">
            <div className="mb-1 text-[12px] font-medium text-slate-700">Compared with</div>
            <Segmented
              size="sm"
              value={inp.baselineId}
              onChange={(v) => set({ baselineId: v })}
              options={alternatives.map((b) => ({ value: b.baseline_id, label: BASELINES.find((x) => x.id === b.baseline_id)?.short ?? b.name }))}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <NumberInput label="Water + wastewater" prefix="€" suffix="/m³" step={0.1} value={inp.waterEurPerM3} onChange={(v) => set({ waterEurPerM3: v })} />
            <NumberInput label="Energy" prefix="€" suffix="/kWh" step={0.01} value={inp.energyEurPerKwh} onChange={(v) => set({ energyEurPerKwh: v })} />
            <NumberInput
              label="Replacement garment"
              prefix="€"
              step={1}
              value={inp.garmentEur}
              onChange={(v) => set({ garmentEur: v })}
              hint="Default: average synthetic purchase cost of your garments"
            />
            <NumberInput label="Internal carbon price" prefix="€" suffix="/t" step={5} value={inp.carbonEurPerT} onChange={(v) => set({ carbonEurPerT: v })} hint="0 = not counted" />
          </div>
          <label className="mt-4 block">
            <span className="flex items-center justify-between text-[12px] font-medium text-slate-700">
              Repairs that really postpone a purchase
              <span className="font-semibold text-navy tnum">{Math.round(inp.repairShare * 100)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={inp.repairShare}
              onChange={(e) => set({ repairShare: parseFloat(e.target.value) })}
              className="mt-2 w-full accent-[#003f72]"
            />
            <span className="mt-1 block text-[11px] leading-snug text-muted">
              The data pack assumes every repair postpones one replacement; 50% is the cautious low case.
            </span>
          </label>
          {agreed ? (
            <button
              onClick={() => {
                setDraft(defaultRoughInputs(review));
                onChange({ rough: null });
              }}
              className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-navy hover:underline"
            >
              <RotateCcw size={12} /> Start again with suggested prices
            </button>
          ) : (
            <button onClick={() => onChange({ rough: draft })} className="btn-primary mt-4 w-full justify-center">
              <Calculator size={14} /> We agree these prices: calculate
            </button>
          )}
        </section>

        <section className="card p-5">
          <div className="space-y-4">
            {res.lines.map((l) => (
              <div key={l.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-medium text-ink">{l.label}</span>
                  <span className="text-[18px] font-semibold text-ink tnum">{agreed ? eur(l.eur.base) : "€ –"}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
                  <div className="h-full rounded-full bg-navy" style={{ width: agreed ? `${(l.eur.base / maxLine) * 100}%` : "0%" }} />
                </div>
                <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-[12px] text-muted tnum">
                  <span>
                    {l.quantity} × {l.price}
                  </span>
                  {agreed && l.eur.high > l.eur.low && (
                    <span>
                      range {eur(l.eur.low)} to {eur(l.eur.high)}
                    </span>
                  )}
                </div>
                <div className="text-[11.5px] text-muted">{l.note}</div>
              </div>
            ))}
          </div>
          {agreed ? (
            <div className="mt-5 rounded-xl bg-navy px-5 py-4 text-white">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[13px] text-blue-100">Rough value per year, at the prices we agreed</span>
                <span className="text-[30px] font-semibold tnum">{eur(res.total.base)}</span>
              </div>
              <div className="mt-1 flex flex-wrap justify-between gap-2 text-[12px] text-blue-200 tnum">
                <span>
                  range {eur(res.total.low)} to {eur(res.total.high)}
                </span>
                <span>
                  {res.perSite != null && <>≈ {eur(res.perSite)} per site</>}
                  {res.perWearer != null && <> · ≈ {eur(res.perWearer)} per wearer</>}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-navy/40 bg-navy-50/50 px-5 py-4 text-[13px] text-navy-900">
              No euro value yet. Go through the prices on the left with the customer, adjust them to theirs, then press
              <span className="font-semibold"> We agree these prices</span>.
            </div>
          )}
          <p className="mt-3 flex gap-2 text-[12px] leading-relaxed text-muted">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>
              Not included: the Lindström service fee, your own staff time for washing or stock handling, and any invoice data. Those need the contract, so
              this is a conversation starter, not a business case.{" "}
              <button onClick={() => onOpenMetric("water_saving_l")} className="font-medium text-navy hover:underline">
                See how the water saving is calculated
              </button>
              .
            </span>
          </p>
        </section>
      </div>
    </div>
  );
}
