"use client";

import { Recycle, Wrench } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ErrorBar, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BASELINES } from "@/lib/config";
import { metricMap } from "@/lib/derive";
import { compact, formatValue, full, pct } from "@/lib/format";
import type { Range, Review, Sensitivity } from "@/lib/types";
import { SectionTitle, StatusBadge } from "../ui";

const IMPACTS = [
  { key: "water_saving_l", label: "Water saving", unit: "L" },
  { key: "energy_saving_kwh", label: "Energy saving", unit: "kWh" },
  { key: "co2e_saving_kg", label: "CO₂e saving", unit: "kgCO2e" },
] as const;

const ROUTE_LABEL: Record<string, { label: string; color: string }> = {
  recycling_kg: { label: "Recycling", color: "#0f766e" },
  reuse_kg: { label: "Reuse", color: "#14b8a6" },
  energy_recovery_kg: { label: "Energy recovery", color: "#94a3b8" },
  incineration_kg: { label: "Incineration", color: "#cbd5e1" },
};

const PRODUCT_COLORS = ["#003f72", "#3b82c4", "#93c5fd", "#64748b", "#0f766e", "#b45309"];

export function Baselines({ review, sensitivity, baselineId, onBaseline, onOpenMetric }: {
  review: Review;
  sensitivity: Sensitivity;
  baselineId: string;
  onBaseline: (id: string) => void;
  onOpenMetric: (id: string) => void;
}) {
  const byId = metricMap(review);
  const metric = (id: string) => byId.get(id);
  const washed = metric("washed_kg");
  const customerWater = metric("customer_water_l");
  const waste = metric("textile_waste_kg");
  const circShare = metric("circular_waste_share");
  const repairs = metric("repairs_total");
  const postponed = metric("replacements_postponed");
  const avoided = metric("avoided_product_co2e_kg");

  const wasteVal = waste?.value[sensitivity] ?? 0;
  const circ = circShare?.value[sensitivity] ?? 0;
  // Prefer the engine's per-route allocation; fall back to the circular share (hand-made sample has no routes).
  const routes = waste?.breakdown?.by_route?.filter((r) => typeof r.value === "number") as { route: string; value: number }[] | undefined;
  const wasteData = routes?.length
    ? routes.map((r) => ({ name: ROUTE_LABEL[r.route]?.label ?? r.route, value: r.value, color: ROUTE_LABEL[r.route]?.color ?? "#94a3b8" }))
    : [
        { name: "Recycling + reuse (circular)", value: wasteVal * circ, color: "#0f766e" },
        { name: "Energy recovery + incineration", value: wasteVal * (1 - circ), color: "#cbd5e1" },
      ];
  const repairTypes = (repairs?.breakdown?.by_repair_type ?? [])
    .filter((r): r is { repair_type: string; value: number } => typeof r.value === "number")
    .sort((a, b) => b.value - a.value);
  const repairMax = Math.max(0, ...repairTypes.map((r) => r.value));
  const products = review.products.map((p, i) => ({ ...p, color: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }));

  return (
    <div className="space-y-6">
      {/* Baseline comparison */}
      <div className="card p-4">
        <SectionTitle
          sub="Lindström circular service vs each alternative. Bars show the selected sensitivity case; whiskers show the low–high range. Click a baseline to make it the comparison for the whole review."
          right={<StatusBadge status="ALLOCATED_ESTIMATE" />}
        >
          Savings vs alternative washing models
        </SectionTitle>
        <div className="grid gap-4 lg:grid-cols-3">
          {IMPACTS.map((imp) => {
            const data = review.baseline_comparison.map((b) => {
              const r = b[imp.key] as Range;
              const val = r[sensitivity];
              return { id: b.baseline_id, name: BASELINES.find((x) => x.id === b.baseline_id)?.short ?? b.name, value: val, err: [val - r.low, r.high - val] as [number, number], r };
            });
            return (
              <div key={imp.key} className="rounded-xl border border-line p-3">
                <button onClick={() => onOpenMetric(imp.key)} className="text-[13px] font-semibold text-ink hover:text-navy hover:underline">
                  {imp.label} <span className="font-normal text-muted">({imp.unit})</span>
                </button>
                <div className="mt-2 h-52">
                  <ResponsiveContainer>
                    <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
                      <CartesianGrid vertical={false} stroke="#eef1f5" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={compact} tick={{ fontSize: 10.5, fill: "#64748b" }} axisLine={false} tickLine={false} width={42} />
                      <Tooltip
                        cursor={{ fill: "#f3f5f8" }}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        formatter={(_v: number, _n: string, item: { payload?: { r: Range } }) => {
                          const r = item.payload!.r;
                          return [`${full(r.low, 0)} – ${full(r.high, 0)} (base ${full(r.base, 0)})`, imp.unit];
                        }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} onClick={(d: { id?: string }) => d.id && onBaseline(d.id)} className="cursor-pointer">
                        {data.map((d) => (
                          <Cell key={d.id} fill={d.id === baselineId ? "#003f72" : "#93a8c2"} />
                        ))}
                        <ErrorBar dataKey="err" width={6} strokeWidth={1.5} stroke="#0b2a4a" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12.5px]">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3">Baseline (sheet Baselines)</th>
                <th className="py-2 pr-3 text-right">Water L/kg</th>
                <th className="py-2 pr-3 text-right">Energy kWh/kg</th>
                <th className="py-2 pr-3 text-right">Process + delivery kgCO₂e/kg</th>
                <th className="py-2 text-right">Why savings differ</th>
              </tr>
            </thead>
            <tbody>
              {BASELINES.map((b) => (
                <tr key={b.id} onClick={() => onBaseline(b.id)} className={`cursor-pointer border-b border-line last:border-0 ${b.id === baselineId ? "bg-navy-50/60 font-medium" : "hover:bg-canvas"}`}>
                  <td className="py-2 pr-3">
                    {b.name} <span className="font-mono text-[11px] text-muted">{b.id}</span>
                  </td>
                  <td className="py-2 pr-3 text-right tnum">{b.waterLPerKg}</td>
                  <td className="py-2 pr-3 text-right tnum">{b.energyKwhPerKg}</td>
                  <td className="py-2 pr-3 text-right tnum">{b.co2ePerKg}</td>
                  <td className="py-2 text-right text-muted">
                    {washed && customerWater
                      ? `${compact(washed.value.base)} kg × ${b.waterLPerKg} L/kg = ${compact(washed.value.base * b.waterLPerKg)} L would be used`
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {washed && customerWater && (
            <p className="mt-2 text-[12px] text-muted">
              Lindström allocated water use for the same {compact(washed.value.base)} kg: {compact(customerWater.value.base)} L. Baseline factors are illustrative pack values;
              low/high apply ±20% (team assumption T002).
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Repair handprint */}
        <div className="card p-4">
          <SectionTitle sub="Assumption A002: one completed repair postpones one replacement (low case: 0.5)." right={<StatusBadge status="ESTIMATE" />}>
            <span className="inline-flex items-center gap-1.5">
              <Wrench size={15} className="text-navy" /> Repair handprint
            </span>
          </SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            {[repairs, postponed, avoided].filter(Boolean).map((m) => (
              <button key={m!.id} onClick={() => onOpenMetric(m!.id)} className="rounded-lg bg-canvas p-3 text-left hover:ring-1 hover:ring-navy/30">
                <div className="text-[11.5px] text-muted">{m!.label}</div>
                <div className="text-lg font-semibold text-ink tnum">{formatValue(m!.value[sensitivity], m!.unit)}</div>
                <div className="text-[11px] text-muted">{m!.unit}</div>
              </button>
            ))}
          </div>
          <div className="mt-4 text-[12px] font-semibold uppercase tracking-wider text-muted">By product</div>
          <div className="mt-2 h-48">
            <ResponsiveContainer>
              <BarChart data={products} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} stroke="#eef1f5" />
                <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="product_name" width={140} tick={{ fontSize: 11.5, fill: "#334155" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#f3f5f8" }} contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number, n: string) => [full(v, 0), n]} />
                <Bar dataKey="metrics.repairs_total" name="Repairs" fill="#003f72" radius={[0, 4, 4, 0]} />
                <Bar dataKey="metrics.avoided_product_co2e_kg" name="Avoided product kgCO₂e" fill="#93c5fd" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex gap-4 text-[11px] text-muted">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-navy" /> Repairs</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-blue-300" /> Avoided product kgCO₂e</span>
          </div>
          {repairTypes.length > 0 && (
            <>
              <div className="mt-4 text-[12px] font-semibold uppercase tracking-wider text-muted">By repair type</div>
              <ul className="mt-2 space-y-1.5">
                {repairTypes.map((r) => (
                  <li key={r.repair_type} className="flex items-center gap-2 text-[12.5px]">
                    <span className="w-40 truncate capitalize text-slate-700">{r.repair_type.toLowerCase()}</span>
                    <span className="relative h-2 flex-1 rounded-full bg-canvas">
                      <span className="absolute inset-y-0 left-0 rounded-full bg-navy/70" style={{ width: `${repairMax ? (r.value / repairMax) * 100 : 0}%` }} />
                    </span>
                    <span className="w-14 text-right text-slate-600 tnum">{full(r.value, 0)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Waste routes */}
        <div className="card p-4">
          <SectionTitle sub="Laundry-level waste allocated by the customer's share of washed kg (A003). Baseline: 100% mixed waste (A004)." right={<StatusBadge status="ALLOCATED_ESTIMATE" />}>
            <span className="inline-flex items-center gap-1.5">
              <Recycle size={15} className="text-navy" /> Textile waste routes
            </span>
          </SectionTitle>
          <div className="flex flex-wrap items-center gap-6">
            <div className="relative h-52 w-52">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={wasteData} dataKey="value" innerRadius={62} outerRadius={90} startAngle={90} endAngle={-270} strokeWidth={2}>
                    {wasteData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [`${full(v, 0)} kg`, ""]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-2xl font-semibold text-ink tnum">{pct(circ, 0)}</div>
                <div className="text-[11px] text-muted">circular</div>
              </div>
            </div>
            <div className="flex-1 space-y-3">
              {wasteData.map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-[13px]">
                  <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                  <span className="flex-1 text-slate-700">{d.name}</span>
                  <span className="font-semibold tnum">{full(d.value, 0)} kg</span>
                </div>
              ))}
              {waste && (
                <button onClick={() => onOpenMetric(waste.id)} className="text-[12.5px] font-medium text-navy hover:underline">
                  Total allocated textile waste: {full(wasteVal, 0)} kg → show calculation
                </button>
              )}
              <p className="text-[12px] text-muted">
                In the baseline, the same waste would go 100% to mixed-waste treatment.{" "}
                {routes?.length ? "Route split allocated from Waste_Circularity by washed kg." : "Per-route kg are derived from the circular share (route detail needs the live engine)."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
