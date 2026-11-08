# Lindström — Customer Value & Sustainability Review Studio

> **Since AI Hackathon 2026** · Challenge partner: **Lindström Group**
> **Important:** every customer, site, operational, baseline and factor figure in this repository is **synthetic and illustrative** unless marked `PUBLIC_REFERENCE`. Nothing here is an audited sustainability disclosure or an approved Lindström or customer claim.

A Key Account Manager (KAM) tool that turns multi-site laundry, RFID, repair and environmental data into a **trusted, one-hour customer conversation**, and a customer-ready PowerPoint/PDF review. It answers the challenge's three questions:

1. **What value does the customer receive** from the textile service?
2. **How does the circular service compare** with the relevant alternatives?
3. **What should Lindström and the customer improve next?**

**3-minute demo:** [`Script.md`](./Script.md) (what to say, what to click, every number checked against the running product).

---

## 1. What you can do with it

- **Run a story-first customer meeting (home screen).** Six steps in the order Lindström's mentor described: welcome → executive summary → agreed KPIs → peer review → rough calculation → next steps. The story changes with the audience (CEO, CFO, Operations, Sustainability, or any typed role such as *Head of Procurement*); the numbers never do.
- **Prepare for a steering committee.** *Meeting Prep AI* (KAM only) answers the five steering-committee questions from the review's evidence: outcomes since the last meeting, the customer's priorities, risks and overdue commitments, the best opportunities, and the decisions needed today. Free questions are answered too, scoped to named sites ("the Swedish sites"); questions the data cannot answer get an honest "I won't guess".
- **Show what changed since the last meeting.** The engine recalculates the periods before and after the last steering committee and shows the trend for each KPI.
- **Compare with the alternatives.** Baselines from the data pack (outsourced local laundry, in-house, home washing) with Low / Base / High ranges, plus a peer view against anonymised competitor archetypes and the customer's own sites.
- **Put a rough euro value on it, honestly.** No euro figure appears until the KAM and the customer agree the prices; the result is labelled *ROUGH CALCULATION · NOT A QUOTE*.
- **Open the calculation behind any number.** Formula, data sources, evidence status, assumptions, range, data-quality warnings and an everyday equivalent.
- **Tailor the deep-dive views** by priority lens (water, emissions, cost, circularity, service, next-year improvement) or a plain-language prompt; drill into 24 sites; explore a 2026 what-if; prepare for customer objections.
- **Share safely.** *Customer view* hides KAM-only tools and internal values before the screen is shared.
- **Export the review.** One click produces a Lindström-branded PPTX or PDF that follows the meeting order and carries the agreed KPIs, rough calculation and next steps, with the full source data in the notes/attachment.

---

## 2. How it meets the judging criteria

| Criterion (weight) | Where to look |
|---|---|
| **Customer & business value (25%)** | Customer meeting flow; steering-committee answers; since-last-meeting comparison; agreed KPIs, priorities and actions; peer and competitor comparison; rough calculation |
| **Feasibility & completeness (20%)** | Working dashboard + API, customer-level totals and 24-site drill-down, live PPTX/PDF export, ready-made decks in [`deliverables/`](./deliverables/) |
| **Sustainability credibility & transparency (20%)** | Evidence status, Low/Base/High range and *Show the calculation* on every metric; named baseline on every saving; [`docs/METHODOLOGY.md`](./docs/METHODOLOGY.md) |
| **Data handling & calculation logic (15%)** | Deterministic engine reproducing all 1,248 reference rows of `Customer_Impacts`; data-quality checks DQ1–DQ5 surfaced where they matter (e.g. the Malmö laundry-volume mismatch); 350 automated tests |
| **Dynamic usability & communication (10%)** | Audience picker and free-text roles, priority lenses, plain-language prompts with site scope, Customer view |
| **Scalability & maintainability (10%)** | One shared data contract between all parts; swappable data adapter; [`docs/DATA_READINESS.md`](./docs/DATA_READINESS.md) maps every field to future Lindström sources |

---

## 3. Deliverables

| Deliverable | Location | Description |
| :--- | :--- | :--- |
| **D1. Interactive dashboard** | [`frontend/`](./frontend/) & [`backend/`](./backend/) | Next.js 15 + FastAPI for `CUST001` (24 sites), `CUST002` (6 sites) and `CUST003` (4 sites), with an offline fallback to [`contracts/sample_review.json`](./contracts/sample_review.json). |
| **D2. Customer-ready PPTX & PDF** | [`deliverables/`](./deliverables/) & `/api/export` | NorthStar reviews with the `Water` and `Cost` lenses (12 slides) and a CFO meeting packet with agreed KPIs, rough calculation and next steps (13 slides), as `.pptx` and `.pdf`; plus live export from the dashboard. |
| **D3. Priority & prompt personalisation** | [`ControlBar.tsx`](./frontend/src/components/ControlBar.tsx), [`personas.ts`](./frontend/src/lib/personas.ts), [`audience.ts`](./frontend/src/lib/audience.ts) | Six priority lenses, four audience stories plus free-text roles, industry-ranked emphasis, plain-language prompts with site scope. |
| **D4. Rule- and AI-backed observations** | [`rules.py`](./backend/insights/rules.py), [`actions.py`](./backend/insights/actions.py), [`llm.py`](./backend/insights/llm.py) | Deterministic rules R1–R6 with owners, steering-committee questions and planning scenarios; optional AI wording that can never add numbers. |
| **D5. Pitch & demo script** | [`Script.md`](./Script.md), [`docs/JUDGE_QA.md`](./docs/JUDGE_QA.md) | 3-minute script with click path and checked numbers; judge Q&A preparation. |
| **D6. Methodology note** | [`docs/METHODOLOGY.md`](./docs/METHODOLOGY.md) | Baselines, footprint/handprint formulas, Low/Base/High parameters, data-quality findings and limitations. |
| **D7. Data-readiness note** | [`docs/DATA_READINESS.md`](./docs/DATA_READINESS.md) | Field-level mapping to future Lindström sources and a prioritised data-gap roadmap. |
| **D8. Shared data contract** | [`contracts/review.schema.json`](./contracts/review.schema.json) | JSON Schema shared by the engine, insights, dashboard and exporter. |
| **D9. Customer meeting & Meeting Prep AI** | [`frontend/src/components/meeting/`](./frontend/src/components/meeting/), [`backend/api/prep.py`](./backend/api/prep.py) | Meeting flow, steering-committee answers, period comparison and `POST /api/prep` ([`docs/MEETING_PREP_API.md`](./docs/MEETING_PREP_API.md)). |

The challenge brief and judging criteria are in [`docs/CHALLENGE_BRIEF.md`](./docs/CHALLENGE_BRIEF.md).

---

## 4. Run it locally

**Requirements:** Python 3.11+ and Node.js 20+.

```bash
# Terminal 1 — API (http://localhost:8000)
python -m venv .venv
source .venv/bin/activate            # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8000

# Terminal 2 — dashboard (http://localhost:3000)
cd frontend
npm install
npm run dev
```

- **Data pack:** put `Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx` in [`data/`](./data/) (kept out of Git) for live calculations across all customers, periods, baselines and cases.
- **Offline:** without the data pack or the API, the dashboard and API serve the bundled [`contracts/sample_review.json`](./contracts/sample_review.json) (`CUST001`, 2025) and say so on screen.
- **Optional AI wording:** `cp .env.example .env` and add `GEMINI_API_KEY`. The API reads `.env` at startup; everything works without it.
- **Hosted demo:** Render (API, [`render.yaml`](./render.yaml) + [`Dockerfile`](./Dockerfile)) and Vercel (dashboard); steps in [`docs/DEPLOY.md`](./docs/DEPLOY.md).

```bash
python -m pytest -q backend          # 350 tests, no network needed
cd frontend && npm run build         # production build

# Regenerate the shared sample from the data pack
python scripts/build_review.py --source data/Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx --out contracts/sample_review.json
cd frontend && npm run sync-contract

# Export a deck from the command line
python -m backend.export --help
```

---

## 5. Architecture

```
Excel data pack ──► backend/engine ──► review.json ──► backend/insights ──► backend/api (FastAPI)
 (adapter)          KPIs, baselines,    (shared         rules R1–R6,         /api/review  /api/export
                    ranges, DQ1–DQ5     contract)       observations,        /api/prep    /api/story
                                                        guarded AI wording          │
                                                                                    ▼
                                         frontend (Next.js): customer meeting, prep AI, deep dives
                                         backend/export: PPTX / PDF from the same review.json
```

| Folder | What it holds |
|---|---|
| [`backend/engine/`](./backend/engine/) | Deterministic calculations, data-quality checks, peer benchmark, Excel adapter |
| [`backend/insights/`](./backend/insights/) | Rules, observations, meeting prep, persona stories, optional Gemini wording |
| [`backend/api/`](./backend/api/) | FastAPI endpoints and request validation |
| [`backend/export/`](./backend/export/) | Lindström-branded PPTX and PDF |
| [`frontend/`](./frontend/) | Dashboard: customer meeting, prep AI, deep-dive views |
| [`contracts/`](./contracts/) | `review.schema.json`, `prep.schema.json`, `sample_review.json` |
| [`docs/`](./docs/) | Challenge brief, methodology, data readiness, judge Q&A, prep API, deployment |

---

## 6. How AI is used (and where it is not)

- **Numbers never come from AI.** Every KPI, range and saving is calculated by deterministic code from the data pack.
- **AI may only choose wording** from approved, number-free sentences and evidence IDs; any digit, unknown ID or forbidden word ("audited", "verified", "certified", "guaranteed") is rejected and the template is kept.
- **Everything works offline** with deterministic templates; the AI is an optional layer.
- Coding-agent rules for this repository are in [`AGENTS.md`](./AGENTS.md).

---

## 7. Limitations and next steps

**Limitations:** synthetic data only; competitor figures are anonymised archetypes, partly mock; euro values are rough calculations at prices the KAM enters, not savings; meeting records are stored in the browser; there is no satisfaction survey in the data, so satisfaction is KAM input.

**Next steps toward production (eLindström):**
1. Replace the Excel adapter with connectors to Tableau (allocated pieces, washing %), WWS washed kg, the repairs table and eLindström unique wearer counts.
2. Store meeting records and action follow-up per account, with before/after KPI comparison across review periods.
3. Enable anonymised peer benchmarking across comparable site types and industries, with minimum cohort sizes.
4. Approve calculation factors and add customer-specific invoice data, so rough calculations can become agreed value statements.
