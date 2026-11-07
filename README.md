# Lindström — Customer Value & Sustainability Review Studio

> **Since AI Hackathon 2026** · Challenge Partner: **Lindström Group**  
> **Important Notice:** All customer, site, operational, baseline, and factor figures in this repository are **100% synthetic and illustrative** unless explicitly marked `PUBLIC_REFERENCE`. Outputs must not be presented as audited sustainability disclosures or verified Lindström/customer claims.

---

## 1. Overview

An end-to-end B2B customer review platform and 1-click executive deck generator designed for Lindström Key Account Managers (KAMs) and enterprise customers. 

The platform transforms multi-site laundry, RFID scan, repair, and environmental data into a **proof-first, stakeholder-adaptive review experience**:
- **Dynamic Priority & Prompt Personalization:** Switch between 6 stakeholder lenses (*Water*, *Emissions*, *Cost & Allocation*, *Repairs & Circularity*, *Service & Hygiene*, *Next-Year Improvement*) or query in plain language (e.g., *"How are our Swedish production plants doing on water?"*) to filter both KPIs and site scope.
- **"Show the Calculation" & Sensitivity Bands:** Every metric carries an explicit provenance status (`MEASURED`, `CALCULATED`, `ALLOCATED_ESTIMATE`, `ESTIMATE`, `SYNTHETIC`), a **Low / Base / High sensitivity range** ($\pm 20\%$ baseline intensity band; $0.5\text{–}1.0$ repair replacement factor), and a step-by-step live arithmetic drawer checked (`✓`) in the browser against the Python calculation engine.
- **Meeting Prep, 2026 What-If Simulator & Objection Handling:** Includes conservative Low-case talking points, a strict *"Never Say"* compliance list, an interactive **Customer Objection Simulator**, and a **2026 What-If Action Simulator** for allocation right-sizing at low-use sites (`R1`) and closing the gap to the median repair rate. Toggle to **Customer View** to preview a customer-facing decision-maker module in **eLindström**.
- **Story-First Customer Meeting (home screen):** A 6-step, one-hour meeting flow in the order Lindström's mentor described (welcome → executive summary → agreed KPIs → peer review incl. competitor comparison → rough calculation → next steps), told differently for a CEO, CFO, Operations or Sustainability audience or any typed role. It records agreed targets, customer priorities, last meeting's actions with status, and what changed since the last steering committee.
- **Meeting Prep AI (KAM only):** Answers the five steering-committee questions and free questions from the review's evidence for any audience. Optional Gemini wording may only pick approved, number-free sentences; every number is filled in from the review, and unmatched questions get an honest "I won't guess" reply.
- **1-Click PowerPoint & PDF Export:** Generates a Lindström-branded, persona-led customer deck (12 slides; 13 with the meeting record) directly from the active `review.json` contract, following the mentor's meeting order, with the full source contract and formulas in the slide notes/attachments.

---

## 2. Quick Index of Required Deliverables (For Judges)

| Deliverable | Location | Description |
| :--- | :--- | :--- |
| **D1. Interactive Dashboard Prototype** | [`frontend/`](./frontend/) & [`backend/`](./backend/) | Next.js 15 + FastAPI application supporting `CUST001` (24 sites), `CUST002` (6 sites), and `CUST003` (4 sites), with full offline fallback via [`contracts/sample_review.json`](./contracts/sample_review.json). |
| **D2. Customer-Ready PPTX & PDF Decks** | [`deliverables/`](./deliverables/) & `/api/export` | Pre-exported NorthStar reviews (`Water` and `Cost` lenses, 12 slides) and a CFO meeting packet with agreed KPIs, rough calculation and next steps (13 slides), as `.pptx` and `.pdf`; plus live 1-click export in the dashboard (`backend/export/`). |
| **D3. Priority & Prompt Personalization** | [`frontend/src/components/ControlBar.tsx`](./frontend/src/components/ControlBar.tsx) & [`backend/insights/generate.py`](./backend/insights/generate.py) | 6 priority lenses, industry-ranked emphasis (`Food & Beverage`, `Manufacturing`, `Healthcare`), and natural-language prompt routing with site-scope filtering. |
| **D4. Rule- & AI-Backed Observations** | [`backend/insights/rules.py`](./backend/insights/rules.py) & [`actions.py`](./backend/insights/actions.py) | Deterministic rules (`R1–R6`) with quantified Q1 2026 planning scenarios, assigned owners, steering-committee questions, and a strict numeric anti-hallucination guard (`llm.py`). |
| **D5. Final Pitch & Demo Script** | [`Script.md`](./Script.md) & [`docs/JUDGE_QA.md`](./docs/JUDGE_QA.md) | 3-minute demo script with click path and checked numbers, plus the judge Q&A preparation. |
| **D6. Methodology Note** | [`docs/METHODOLOGY.md`](./docs/METHODOLOGY.md) | Baselines (`B_LOCAL`, `B_HOME`, `B_INHOUSE`), documented footprint/handprint formulas, Low/Base/High sensitivity parameters, `DQ4` (`L003` Malmö volume reconciliation), and `DQ5` (wearer deduplication). |
| **D7. Data-Readiness & Production Note** | [`docs/DATA_READINESS.md`](./docs/DATA_READINESS.md) | Field-level mapping to Lindström production systems (*Tableau*, *WWS Washed Kg*, *eLindström*, *Repairs Table*, *ERP*) and prioritized `P1–P3` data-gap remediation roadmap. |
| **D8. Shared Data Contract** | [`contracts/review.schema.json`](./contracts/review.schema.json) | JSON Schema contract decoupling the calculation engine, insights generator, dashboard UI, and slide exporter. |
| **D9. Customer Meeting & Meeting Prep AI** | [`frontend/src/components/meeting/`](./frontend/src/components/meeting/) & [`backend/api/prep.py`](./backend/api/prep.py) | Story-first meeting flow, steering-committee answers, period comparison and `POST /api/prep` with guarded Gemini wording ([`docs/MEETING_PREP_API.md`](./docs/MEETING_PREP_API.md)). |

---

## 3. Run Instructions (Local Setup)

**Requirements:** Python 3.11+ and Node.js 20+.

```bash
# 1. Start the FastAPI Backend (http://localhost:8000)
python -m venv .venv
source .venv/bin/activate            # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Optional AI wording: cp .env.example .env and add GEMINI_API_KEY (works fully offline without it)
python -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8000

# 2. Start the Next.js Frontend Dashboard (http://localhost:3000) in a second terminal
cd frontend
npm install
npm run dev
```

### Data Pack & Offline Resilience
- **Live Engine Mode:** Place `Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx` inside [`data/`](./data/) (excluded from public Git via `.gitignore`). The API calculates live reviews across all customers (`CUST001–CUST003`), periods, baselines, and sensitivities, caching parsed workbooks in memory.
- **Zero-Config Sample / Offline Mode:** If the `.xlsx` file is absent or the backend is not running, both the API and the Next.js dashboard seamlessly serve the pre-computed [`contracts/sample_review.json`](./contracts/sample_review.json) (`CUST001`, full year 2025) and display an explicit data-source indicator.
- **Run Automated Test Suite (177 Tests):**
  ```bash
  python -m pytest backend/tests
  ```
- **Regenerate Shared Sample JSON:**
  ```bash
  python scripts/build_review.py --source data/Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx --out contracts/sample_review.json
  cd frontend && npm run sync-contract
  ```
- **CLI Deck Exporter:**
  ```bash
  python -m backend.export --help
  ```

---

## 4. Architecture & Implemented Innovations vs. Future Roadmap

### Implemented in This Prototype
1. **Deterministic Calculation & Data-Quality Engine (`backend/engine/`):** Reproduces all 1,248 reference rows in `Customer_Impacts` and executes automated `DQ1–DQ5` checks on every load—surfacing the `L003` Malmö laundry volume discrepancy (`DQ4`) and multi-product wearer double counting (`DQ5`) directly in context on affected sites and KPI cards.
2. **Data Trust Passport ("Show the Calculation" — `CalcDrawer.tsx` & `calc.ts`):** Replays each KPI formula in the browser with the customer's actual numbers, verifies agreement with the engine, and provides everyday equivalencies.
3. **2026 What-If Scenario Simulator (`WhatIfSimulator.tsx` & `whatif.ts`):** Interactive sliders allowing KAMs and customers to explore locker allocation right-sizing at `R1`-flagged sites and repair-rate convergence at `R2`-flagged sites with explicit assumption labels.
4. **KAM Safe-to-Say & Customer Objection Simulator (`SafeToSay.tsx` & `ObjectionPrep.tsx`):** Generates conservative Low-case talking points, a *"Never Say"* compliance guard, and evidence-backed responses to tough customer questions on water methodology, cost claims, `L003` reconciliation, and repair handprints.

### Proposed Future Production Extensions (Phase 2 Roadmap in eLindström)
1. **Closed-Loop Action Tracking & Before/After Verification:** Extend the current Q1 2026 planning scenarios (`backend/insights/actions.py`) into persistent action records with assigned department owners, deadlines, and longitudinal before/after KPI comparison across review periods.
2. **Privacy-Safe Peer Benchmarking:** Once connected to multi-account production data in eLindström, enable anonymized benchmarking across comparable site types, industries, and garment mixes with minimum cohort-size and confidentiality safeguards.
3. **Direct Production Adapters (`backend/engine/adapters/`):** Swap `excel_adapter.py` for direct connectors to *Tableau Allocated Pieces & Washing %*, *WWS Washed Kg*, *Internal Repairs Table*, and *eLindström* unique wearer counts (`COUNT(DISTINCT wearer_id)`).
