# Workstreams: Who Does What

> **Read first:** [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) and [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md).
> This document defines **who** builds each part, **which files** each person owns, the shared `review.json` contract, and **copy-paste briefs** for each coding agent.

---

## 1. Team Division (4 Seats)

| Seat | Tool | Role | Owns |
| :--- | :--- | :--- | :--- |
| **Lead** | Antigravity | Coordinator, API, docs & pitch | `contracts/`, `backend/api/`, `docs/`, `README.md`, `AGENTS.md`, `CLAUDE.md`, merges |
| **Worker A** | Codex | Data & calculation engineer | `backend/engine/`, `backend/tests/test_engine.py`, `scripts/` (Part 2: CONSOLIDATE) |
| **Worker B** | Codex | Insights & export engineer | `backend/insights/`, `backend/export/`, `backend/tests/test_insights.py`, `backend/tests/test_export.py` (Part 3: GENERATE + Part 4b: EXPORT) |
| **Worker C** | Claude Code | Frontend dashboard engineer | `frontend/` (Part 1: INPUT + Part 4a: DASHBOARD UI) |

---

## 2. The Shared Contract (`review.json`)

Everyone builds against **one shared JSON format**:
- Formal schema: [`contracts/review.schema.json`](../contracts/review.schema.json)
- Ready-to-use sample: [`contracts/sample_review.json`](../contracts/sample_review.json)

How each seat uses it:
- **Worker A** produces this exact JSON dictionary from the Excel data pack.
- **Worker B** takes this JSON, populates `observations[]`, and renders the 9-slide PowerPoint/PDF from it.
- **Worker C** renders the interactive web dashboard from this JSON (and triggers export downloads).
- **Lead** wires them together in `backend/api/main.py` and validates the schema.

Until Worker A merges the real engine, **Worker B and Worker C develop and test against `contracts/sample_review.json`**. Nobody waits for anybody.

### 2.1 Top-Level Structure of `review.json`

```jsonc
{
  "meta": {
    "customer_id": "CUST001",
    "customer_name": "NorthStar Foods Group",
    "industry": "Food & Beverage",
    "segment": "Strategic High Value",
    "hq_country": "Finland",
    "period": { "from": "2025-01", "to": "2025-12" },
    "baseline_id": "B_LOCAL",
    "baseline_name": "Outsourced local laundry",
    "sensitivity": "base",
    "priority": "water",
    "generated_at": "2026-11-06T20:00:00Z",
    "data_notice": "Synthetic, illustrative data. Not audited. Not a Lindström claim."
  },
  "metrics": [
    {
      "id": "water_saving_l",
      "label": "Water saving vs outsourced local laundry",
      "category": "handprint",
      "value": { "low": 1125186.1, "base": 1406482.6, "high": 1687779.1 },
      "unit": "L",
      "status": "ALLOCATED_ESTIMATE",
      "formula": "customer_washed_kg × B.water_l_per_kg − customer_water_l",
      "sources": ["Service_Activity", "Laundry_Resources", "Baselines"],
      "assumptions": ["A001", "A003", "T002"],
      "confidence": "Low-Medium"
    }
  ],
  "sites": [
    {
      "site_id": "S001",
      "site_name": "NorthStar Helsinki",
      "country": "Finland",
      "city": "Helsinki",
      "site_type": "Office & Operations",
      "laundry_id": "L001",
      "metrics": {
        "wearers_min_est": 654,
        "garments_allocated": 1445,
        "allocation_use_rate": 0.892,
        "idle_pieces": 156,
        "washed_kg": 24120.5,
        "repairs_total": 620,
        "repair_rate_per_1000": 14.2,
        "on_time_rate": 0.985,
        "median_cycle_hours": 80.0,
        "service_requests": 21,
        "water_saving_l": 68420.0,
        "co2e_saving_kg": 12410.0
      },
      "flags": []
    }
  ],
  "products": [
    {
      "product_id": "P1002",
      "product_name": "Work Trouser Standard",
      "product_group": "Trousers",
      "metrics": {
        "garments_allocated": 12400,
        "washed_kg": 198400.0,
        "repairs_total": 6120,
        "avoided_product_co2e_kg": 80784.0
      }
    }
  ],
  "timeseries": {
    "washed_kg": [{ "month": "2025-01", "value": 41850.2 }],
    "water_saving_l": [{ "month": "2025-01", "value": 118200.4 }],
    "co2e_saving_kg": [{ "month": "2025-01", "value": 21450.0 }],
    "repairs_total": [{ "month": "2025-01", "value": 1280 }]
  },
  "baseline_comparison": [
    {
      "baseline_id": "B_LOCAL",
      "name": "Outsourced local laundry",
      "water_saving_l": { "low": 1125186.1, "base": 1406482.6, "high": 1687779.1 },
      "energy_saving_kwh": { "low": 124800.0, "base": 156000.0, "high": 187200.0 },
      "co2e_saving_kg": { "low": 204058.5, "base": 255073.1, "high": 306087.7 }
    }
  ],
  "priority_view": {
    "priority": "water",
    "emphasized_metric_ids": ["water_saving_l", "customer_water_l", "washed_kg", "co2e_saving_kg"],
    "industry_rules": [
      "Food & Beverage #1: Hygiene and compliance — Show service continuity, food-industry garment control and hygiene-related performance.",
      "Food & Beverage #2: Water efficiency — Prioritize water use/savings and washed-kg efficiency.",
      "Food & Beverage #3: Service reliability — Highlight turnaround, service-request-free days and delivery performance."
    ]
  },
  "observations": [],
  "data_quality": [],
  "assumptions": [],
  "data_gaps": []
}
```

### 2.2 Fixed Metric IDs (Use Exactly These Names)

| Category | Metric IDs |
| :--- | :--- |
| **Scale** | `delivery_sites`, `wearers_min_est`, `wearer_product_assignments`, `garments_allocated`, `washed_kg` |
| **Allocation** | `allocation_use_rate`, `idle_pieces`, `idle_value_eur` |
| **Service** | `wash_frequency`, `service_requests`, `on_time_rate`, `median_cycle_hours` |
| **Repair** | `repairs_total`, `repair_rate_per_1000`, `replacements_postponed`, `avoided_product_co2e_kg` |
| **Footprint** | `customer_water_l`, `customer_energy_kwh`, `customer_co2e_kg`, `textile_waste_kg`, `circular_waste_share` |
| **Handprint** | `water_saving_l`, `energy_saving_kwh`, `co2e_saving_kg` |

### 2.3 Function Signatures & API Endpoints

```python
# Worker A — backend/engine/build_review.py
def build_review(
    customer_id: str = "CUST001",
    period_from: str = "2025-01",
    period_to: str = "2025-12",
    baseline_id: str = "B_LOCAL",
    sensitivity: str = "base",
    priority: str | None = None,
    source_path: str | None = None,
) -> dict: ...

# Worker B — backend/insights/generate.py
def generate_observations(review: dict, use_llm: bool = True) -> list[dict]: ...
def interpret_prompt(text: str, industry: str) -> str:
    """Maps free text to one of: water, emissions, cost, circularity, service, improvement."""

# Worker B — backend/export/pptx_export.py & pdf_export.py
def export_pptx(review: dict, out_path: str) -> str: ...
def export_pdf(review: dict, out_path: str) -> str: ...
```

**FastAPI Endpoints (`backend/api/main.py` — owned by Lead):**
- `GET /api/customers` → list of customers, priorities, and baselines
- `POST /api/review` → accepts `{customer_id, period_from, period_to, baseline_id, sensitivity, priority, prompt}` and returns full `review.json`
- `POST /api/interpret` → accepts `{prompt, industry}` and returns `{priority}`
- `POST /api/export?format=pptx|pdf` → accepts `review.json` (or query parameters) and returns the downloadable `.pptx` or `.pdf` file

---

## 3. Repository Structure & Strict File Ownership

Only the owner edits a folder. This guarantees **zero Git merge conflicts**.

```text
since-ai-26/
├── README.md                      LEAD
├── AGENTS.md                      LEAD      Read automatically by Codex
├── CLAUDE.md                      LEAD      Read automatically by Claude Code
├── GEMINI.md                      LEAD      Read automatically by Antigravity
├── .gitignore                     LEAD
├── contracts/
│   ├── review.schema.json         LEAD
│   └── sample_review.json         LEAD
├── data/                          LOCAL     Drop Excel pack here (gitignored)
├── backend/
│   ├── engine/                    WORKER A (Branch: feat/engine)
│   │   ├── adapters/excel_adapter.py
│   │   ├── validate.py
│   │   ├── kpis.py
│   │   ├── impacts.py
│   │   ├── sensitivity.py
│   │   └── build_review.py
│   ├── insights/                  WORKER B (Branch: feat/insights-export)
│   │   ├── rules.py
│   │   ├── llm.py
│   │   ├── generate.py
│   │   └── prompts/
│   ├── export/                    WORKER B (Branch: feat/insights-export)
│   │   ├── pptx_export.py
│   │   ├── pdf_export.py
│   │   └── slide_text.yaml
│   ├── api/                       LEAD (Branch: main / feat/api)
│   │   └── main.py
│   └── tests/
│       ├── test_engine.py         WORKER A
│       ├── test_insights.py       WORKER B
│       └── test_export.py         WORKER B
├── frontend/                      WORKER C (Branch: feat/frontend)
└── docs/                          LEAD
    ├── PROJECT_OVERVIEW.md
    ├── CHALLENGE_BRIEF.md
    ├── IMPLEMENTATION_GUIDE.md
    ├── WORKSTREAMS.md
    ├── METHODOLOGY.md
    ├── DATA_READINESS.md
    └── PITCH_SCRIPT.md
```

---

## 4. Copy-Paste Briefs for Each Worker

### 4.1 Brief for Worker A (Codex — Data & Calculation Engine)

```text
You are Worker A on our Lindström Hackathon team, working in branch `feat/engine`.
First read `AGENTS.md`, `docs/IMPLEMENTATION_GUIDE.md` (sections 6.1–6.6), `docs/WORKSTREAMS.md`, and `contracts/sample_review.json`.

Goal: Implement `backend/engine/` in Python so `build_review(...)` reads the Excel data pack in `data/Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx` and returns a dictionary matching `contracts/review.schema.json` and `contracts/sample_review.json`.

Requirements:
1. `backend/engine/adapters/excel_adapter.py`: The ONLY module that reads Excel (`openpyxl`/`pandas`). Returns normalized DataFrames or dicts. Other modules never import `openpyxl`.
2. `backend/engine/validate.py`: Run data-quality checks DQ1 (blank cells), DQ2 (unmapped foreign keys — count and report them without crashing), DQ3 (site belongs to customer), DQ4 (sum of customer shares per laundry-month > 100% — flags Laundry L003 where share sum is ~1000%).
3. `backend/engine/kpis.py`: Compute all operational KPIs in `docs/IMPLEMENTATION_GUIDE.md` §6.3. For active wearers, compute both `wearers_min_est` (per site-month MAX across products, then latest month sum across sites) and `wearer_product_assignments` (SUM across product rows, matching 28,367 in Dec for CUST001). Convert Excel serial timestamps in `Service_Cycles` to dates.
4. `backend/engine/impacts.py`: Compute customer footprint using laundry per-kg intensity × `customer_washed_kg`, handprint savings vs any selected baseline (`B_LOCAL`, `B_HOME`, `B_INHOUSE`), repair handprint (`A002`), and allocated textile waste by route (`A003`, `A004`).
5. `backend/engine/sensitivity.py`: Compute `{low, base, high}` ranges (§6.5: repair factor 0.5 / 1.0 / 1.0; baseline factors -20% / base / +20%) and include team assumptions `T001` and `T002` in `assumptions[]`.
6. Every metric object in `metrics[]` must include `id`, `label`, `category`, `value: {low, base, high}`, `unit`, `status`, `formula`, `sources`, `assumptions`, `confidence`. Use the exact metric IDs from `docs/WORKSTREAMS.md` §2.2.
7. Populate `sites[]`, `products[]`, `timeseries{}`, `baseline_comparison[]` (all 3 baselines), `priority_view`, `data_quality[]`, `assumptions[]`, and `data_gaps[]`. Leave `observations[]` as an empty list `[]`.
8. Write `pytest` tests in `backend/tests/test_engine.py` verifying:
   - Recomputed `B_LOCAL` savings match `Customer_Impacts` row by row within 1%.
   - `CUST001` full-year 2025 totals match `Sample_Output`: washed_kg = 502,074.7; repairs_total = 15,233; water_saving_l = 1,406,482.6; co2e_saving_kg = 255,073.1; wearer_product_assignments (Dec) = 28,367.
   - DQ4 flags Laundry L003.
   - Bad-data test case (missing cell + unmapped site_id) logs DQ1/DQ2 warnings without crashing.

Strict boundary: Only create/edit files inside `backend/engine/`, `backend/tests/test_engine.py`, and `scripts/`.
```

### 4.2 Brief for Worker B (Codex — Insights & PowerPoint/PDF Export)

```text
You are Worker B on our Lindström Hackathon team, working in branch `feat/insights-export`.
First read `AGENTS.md`, `docs/IMPLEMENTATION_GUIDE.md` (sections 7 and 8.2), `docs/WORKSTREAMS.md`, and `contracts/sample_review.json`.
Use `contracts/sample_review.json` as your test input right away.

Goal: Implement `backend/insights/` (deterministic rules + Gemini LLM observation generator with offline fallback) and `backend/export/` (9-slide PowerPoint `.pptx` and `.pdf` generator).

Part 1 — `backend/insights/`:
1. `rules.py`: Deterministic rules R1–R6 from `docs/IMPLEMENTATION_GUIDE.md` §7.2 inspecting `review["sites"]`, `review["metrics"]`, and `review["data_quality"]`. Output structured fact dicts `{rule_id, title, metric_ids, site_ids, numbers, severity}`. Sort facts by customer `industry` (`Industry_Priorities`) and selected `priority`.
2. `llm.py`: Optional Gemini API integration (reads `GEMINI_API_KEY` from env). Sends ONLY the structured facts to the LLM. Validates that the LLM does not invent numbers not present in the facts.
3. Offline Fallback: If `GEMINI_API_KEY` is not set, times out, or validation fails, deterministically render clean executive observations, recommended actions, and steering-committee questions from templates so the app works 100% offline.
4. `generate.py`: Implement `generate_observations(review: dict, use_llm: bool = True) -> list[dict]` returning 3–5 observations matching the schema in `contracts/sample_review.json`, and `interpret_prompt(text: str, industry: str) -> str` mapping a user prompt to one priority (`water`, `emissions`, `cost`, `circularity`, `service`, `improvement`).

Part 2 — `backend/export/`:
5. `pptx_export.py` using `python-pptx`: Generate a clean, executive 9-slide presentation (`docs/IMPLEMENTATION_GUIDE.md` §8.2) in Lindström brand colors (Lindström red `#E30613`, dark slate `#1E293B`, clean white cards):
   - Slide 1: Title, Customer, Period, Selected Baseline, Priority, "SYNTHETIC DATA – PROTOTYPE" badge
   - Slide 2: Executive Summary KPIs with status badges & confidence
   - Slide 3: Priority Spotlight (tailored to selected priority & industry rules)
   - Slide 4: Baseline Comparison (Outsourced Local vs Home vs In-House + Low/Base/High range)
   - Slide 5: Multi-Site Performance Overview (top & outlier sites across FI, SE, PL)
   - Slide 6: Circularity & Repair Handprint (repairs by type, postponed replacements, waste routing)
   - Slide 7: Key Observations & Recommended Next Actions
   - Slide 8: Steering-Committee Discussion Questions
   - Slide 9: Methodology, Assumptions, Data Quality Flags (including L003 finding) & Production Data Gaps
   Every slide must carry the footer: "Synthetic, illustrative data. Not audited. Not an approved Lindström claim."
6. `pdf_export.py`: Implement `export_pdf(review: dict, out_path: str) -> str` (using `reportlab` or PPTX conversion) producing a matching multi-page PDF report.
7. Write `pytest` tests in `backend/tests/test_insights.py` and `backend/tests/test_export.py` using `contracts/sample_review.json`.

Strict boundary: Only create/edit files inside `backend/insights/`, `backend/export/`, `backend/tests/test_insights.py`, and `backend/tests/test_export.py`.
```

### 4.3 Brief for Worker C (Claude Code — Interactive Dashboard UI)

```text
You are Worker C on our Lindström Hackathon team, working in branch `feat/frontend`.
First read `CLAUDE.md`, `docs/PROJECT_OVERVIEW.md`, `docs/IMPLEMENTATION_GUIDE.md` (sections 5 and 8.1), `docs/WORKSTREAMS.md`, and `contracts/sample_review.json`.

Goal: Build the interactive Next.js (App Router + TypeScript + Tailwind CSS + Lucide icons + Recharts) dashboard inside `frontend/`.

Key design rule:
Load `contracts/sample_review.json` as the built-in default/fallback dataset so the frontend works immediately standalone AND can call the FastAPI backend (`NEXT_PUBLIC_API_URL`, defaulting to `http://localhost:8000`) when running live.

Required UI features (`docs/IMPLEMENTATION_GUIDE.md` §5 & §8.1):
1. **Lindström Brand Look & Feel:** Clean managerial B2B interface inspired by eLindström (Lindström red `#E30613`, slate navigation sidebar, crisp white cards, clear status badges). Persistent top banner: `"SYNTHETIC PROTOTYPE DATA — For demonstration only, not audited."`
2. **Top Control Bar / Setup Controls:**
   - Customer selector (`CUST001 NorthStar Foods Group`, `CUST002 Apex Industrial Systems`, `CUST003 Mediora Health Network`)
   - Priority lens switcher (`Water`, `Emissions`, `Cost`, `Circularity`, `Service performance`, `Next-year improvement`) + free-text prompt input (`"Focus on water and emissions for the food-industry sites"`)
   - Baseline selector (`B_LOCAL Outsourced local laundry`, `B_HOME Home washing`, `B_INHOUSE In-house laundry`)
   - Sensitivity toggle (`Low`, `Base`, `High`)
   - Export buttons (`Download PPTX`, `Download PDF`)
3. **Executive Value Overview & Priority Spotlight:**
   - KPI cards highlighting the metrics emphasized by the active priority and industry rules.
   - Every KPI card displays: Value, Low–High sensitivity range, Unit, Status Badge (`SYNTHETIC`, `CALCULATED`, `ALLOCATED_ESTIMATE`, `ESTIMATE`), and Confidence level.
4. **"Show the Calculation" Inspector Drawer / Modal:**
   - Clicking any KPI card opens an audit drawer showing the exact `formula`, `sources[]`, `assumptions[]` (linked to full assumption descriptions), `status`, `confidence`, and Low/Base/High breakdown.
5. **Multi-Site Consolidation & Site Drill-Down:**
   - Interactive table & visual comparison of the 24 customer sites across Finland, Sweden, and Poland, with country/site-type filters and outlier flags (`R1 Low Allocation`, `R2 High Repair`, etc.).
   - Clicking a site opens a detailed Site Drill-Down view comparing that site against the customer average.
6. **Baseline & Circularity Comparison View:**
   - Visual chart comparing Lindström circular service vs Local Laundry / Home Washing / In-House Laundry with Low/Base/High uncertainty bars, repair handprint breakdown, and waste circularity routes.
7. **Observations, Recommended Actions & Steering Questions:**
   - Cards displaying the rules+AI observations, recommended actions (with owner tags `Lindström` / `Customer` / `Both`), clickable metric/site badges, and steering-committee discussion questions.
8. **Methodology, Data Quality & Production Data Gaps Tab:**
   - Displays `assumptions[]`, `data_quality[]` warnings (such as the Laundry L003 volume discrepancy and wearer deduplication note), and `data_gaps[]` mapping prototype fields to future Lindström production sources.

Strict boundary: Only create/edit files inside `frontend/`.
```
