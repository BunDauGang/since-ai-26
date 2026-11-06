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

1. **Executive overview**: priority spotlight (with the industry rule that explains *why*), emphasized KPI cards, site ranking for the lens, monthly trend, top observation, and all indicators grouped by category.
2. **Sites & drill-down**: FI/SE/PL roll-up, allocation-vs-repair scatter (R2 threshold line), sortable and filterable 24-site table, site drawer comparing each site with the customer median.
3. **Baseline & circularity**: savings vs local/home/in-house with low–high whiskers, per-kg baseline factors, repair handprint by product, textile waste routes.
4. **Observations & actions**: owner tags, steering questions (copy all), clickable metric/site evidence chips.
5. **Methodology & data**: boundaries, DQ findings (L003, wearer de-duplication), metric registry, assumptions A/T, data gaps, path to production.

**Show the calculation**: click any KPI (or any metric chip anywhere) to see the value, the low/base/high range, the formula, source sheets, linked assumptions, the per-site breakdown and the observations that cite it.

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
