# `frontend/` — Interactive Dashboard (Worker C / Claude Code)

Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Recharts · Lucide.
Specs: [`docs/WORKSTREAMS.md`](../docs/WORKSTREAMS.md) §4.3 and [`docs/IMPLEMENTATION_GUIDE.md`](../docs/IMPLEMENTATION_GUIDE.md) §5 & §8.1.

## Run

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
# optional: point at the FastAPI server (default http://localhost:8000)
cp .env.example .env.local
```

The app works **standalone**. It bundles `contracts/sample_review.json` (copied to `src/data/`). If `GET /api/customers` answers, it switches to **live mode** automatically (sidebar → *Data source*).

| | Offline (bundled sample) | Live (FastAPI) |
|---|---|---|
| Customer | CUST001 only | CUST001–003 |
| Baseline switch | customer-level savings come from `baseline_comparison[]`; site/month savings stay on the sample baseline (labelled in the UI) | full recalculation via `POST /api/review` |
| Sensitivity | picks `value.low/base/high` | same + re-fetch |
| Priority / prompt | client lens + keyword interpreter | `POST /api/interpret`, server `priority_view` |
| Export PPTX/PDF | falls back to downloading `review.json` | `POST /api/export?format=pptx\|pdf` with the on-screen review |

After the Lead updates the contract, run `npm run sync-contract`.

## Screens

1. **Executive overview**: priority spotlight (with the industry rule that explains *why*), the emphasized KPI cards, and a 3-column story strip (*What happened → Why it matters → Next action*) built verbatim from the engine's observations. Then the site ranking and trend for the lens. The other ~20 indicators are folded behind a toggle with category filters and search. The Cost and Next-year improvement lenses also show the what-if simulator here.
2. **Sites & drill-down**: FI/SE/PL roll-up, allocation-vs-repair scatter (R2 threshold line), sortable and filterable 24-site table, site drawer comparing each site with the customer median.
3. **Baseline & circularity**: savings vs local/home/in-house with low–high whiskers, per-kg baseline factors, repair handprint by product, textile waste routes.
4. **Actions & 2026 what-if**: an interactive simulator (reclaim idle garments at R1 low-use sites; close the gap to the median repair rate) with projected utilisation, reclaimed pieces, illustrative stock value and avoided repairs. All results are labelled ESTIMATE, with assumptions listed and never written into the review. Below it: observations with owner tags, steering questions (copy all) and clickable metric/site evidence chips.
5. **Methodology & data**: boundaries, a production integration diagram (Sources → pluggable adapter → engine → review.json → dashboard / deck / eLindström, with each source showing the data gaps it closes), DQ findings, metric registry, assumptions A/T and data gaps.

**Data-quality warnings in context**: DQ4 (Malmö L003 laundry volume mismatch) pills appear on the affected sites and on every laundry-dependent metric; DQ5 (wearer multi-product counting) pills appear on the wearer metrics. Hover a pill, or open the metric, for the engine's own numbers.

**Show the calculation**: click any KPI (or any metric chip anywhere). For handprint, repair and utilisation metrics the drawer re-plays the formula step by step with the review's own inputs, and shows it only when it reproduces the engine's value (✓). Other metrics show the engine's arithmetic trace. The drawer also explains why the Low/Base/High range exists (T002 baseline ±20%, T001 repair factor), gives everyday comparisons for water / CO₂e / energy (illustrative public reference factors, labelled, never used in calculations), and lists source sheets, linked assumptions, the per-site breakdown and the observations that cite the metric.

## Structure

```
src/
  app/            layout, page (state + routing via #hash), globals.css (brand tokens)
  components/     ControlBar, Sidebar, KpiCard, CalcDrawer, SiteDrawer, ui (badges, range bar, drawer)
  components/views/  Overview, Sites, Baselines, Observations, Methodology
  lib/            types (contract), api (FastAPI + fallback), useReview (state), derive, config (pack master data), format
  data/           sample_review.json (synced from contracts/)
```

Rule: the frontend never invents or recalculates impact numbers. It only selects and presents values from `review.json`.
