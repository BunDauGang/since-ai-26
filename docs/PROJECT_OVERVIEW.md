# Project Overview (Start Here)

## 1. What We Are Building in One Sentence

**A web application where a Lindström account manager selects a multi-site customer and their priority (water, cost, CO₂, circularity, or service performance), views an interactive dashboard with transparent calculations, and downloads a customer-ready PowerPoint/PDF for the annual review meeting.**

---

## 2. What the Judges Will See (The 7-Step Demo Flow)

1. **Setup Screen:** Select Customer (`NorthStar Foods Group` — 24 sites across Finland, Sweden, and Poland), Priority (`Water`), and Comparison Baseline (`Outsourced local laundry`).
2. **Executive Dashboard:** Top KPI cards (active wearers, allocated garments, washed kg, repairs, water saved, CO₂e saved). Every number displays a clear evidence badge (`SYNTHETIC`, `CALCULATED`, `ALLOCATED_ESTIMATE`, or `ESTIMATE`).
3. **"Show the Calculation" Drawer:** Click any KPI card to inspect its exact formula, source sheets, assumptions, confidence level, and low/base/high sensitivity range.
4. **Site Drill-Down:** Click any of the 24 customer sites (e.g., `NorthStar Warsaw` or `NorthStar Turku`) to inspect site-specific KPIs, product breakdowns, and outlier flags.
5. **Priority Switching:** Switch priority from `Water` to `Cost` or `Circularity` (or type a free-text prompt) — the dashboard re-orders and highlights the relevant indicators for that stakeholder and industry.
6. **Observations & Recommended Actions:** 3 to 5 rules-backed, AI-written observations explaining *what happened*, *why it matters*, and *what action Lindström and the customer should take next*.
7. **One-Click Export:** Download a 9-slide customer-ready PowerPoint (`.pptx`) or `.pdf` deck built from the exact same data.

---

## 3. How the System Works Inside (The Kitchen Analogy)

```text
Excel Data Pack  →  [1. Data Engine]  →  review.json  →  [2. Insights Engine]  →  review.json (+ observations)
(ingredients)         (the cook)         (the plate)       (adds the sauce)                │
                                                                          ┌────────────────┴────────────────┐
                                                                    [3. Dashboard UI]                [4. PPTX/PDF Export]
                                                                    (serve at table)                  (takeaway box)
```

1. **Excel Data Pack (`data/`):** Lindström's synthetic dataset containing 3 customers, 34 sites, 4 laundries, 6 products, washing logs, cycle times, repairs, resource factors, and baselines.
2. **Data Engine (`backend/engine/`):** Reads the Excel sheets, checks data quality, and calculates operational KPIs, environmental footprint, circular handprint savings, and low/base/high sensitivity ranges.
3. **`review.json` (`contracts/`):** One shared JSON structure that holds **all calculated results, labels, formulas, site breakdowns, and flags**.
4. **Insights Engine (`backend/insights/`):** Deterministic rules find site outliers and anomalies first; then the LLM writes concise observations and steering-committee questions citing those exact numbers (with an offline template fallback).
5. **Dashboard (`frontend/`) & Exporter (`backend/export/`):** Both simply read `review.json` and present it. Because they read the same file, the dashboard and the PowerPoint slides never disagree.

### Why `review.json` Is Our Secret Weapon
`review.json` works like a **restaurant order ticket**. Because we have a complete sample ticket (`contracts/sample_review.json`) on `main` right now:
- **Worker C (Claude Code)** can build the entire Dashboard UI immediately against `sample_review.json`.
- **Worker B (Codex B)** can build the Insights Engine and PowerPoint Exporter immediately against `sample_review.json`.
- **Worker A (Codex A)** builds the real Excel-to-`review.json` calculator in parallel.

**Nobody waits for anybody.**

---

## 4. Team Division (4 Seats)

| Seat | Tool | Folder Ownership | Mission |
| :--- | :--- | :--- | :--- |
| **Lead** | Antigravity | `contracts/`, `backend/api/`, `docs/` | Coordinator, shared `review.json` contract, FastAPI server connecting the parts, methodology & data-readiness notes, pitch. |
| **Worker A** | Codex | `backend/engine/`, `backend/tests/test_engine.py` | Load Excel pack, run data-quality checks, calculate KPIs, footprint/handprint, and low/base/high ranges into `review.json`. |
| **Worker B** | Codex | `backend/insights/`, `backend/export/`, `backend/tests/test_insights.py`, `backend/tests/test_export.py` | Rules R1–R6 + Gemini LLM observation generator (with offline fallback) + 9-slide PowerPoint/PDF generator. |
| **Worker C** | Claude Code | `frontend/` | Next.js interactive dashboard: setup screen, KPI cards with "Show the Calculation" drawer, priority switcher, site drill-down, export button. |

---

## 5. Future Roadmap (For the Pitch & 10% Scalability Score)

- **Phase 1 (Hackathon Prototype):** Excel adapter + deterministic calculation engine + dynamic dashboard + automated PPTX/PDF review on synthetic data.
- **Phase 2 (Pilot with Approved Sources):** Replace `excel_adapter.py` with connectors to Lindström's Tableau/Power BI exports (`Allocated pieces`, `Washing %`, `End to end delivery`, `Repairs table`, `WWS Washed Kg`) and approved LCA factors.
- **Phase 3 (Production eLindström Module):** Integrate into eLindström as a self-service customer decision-maker module across all countries and service lines (Workwear, Mats, Cleanroom, Industrial Wipers).
