# Self-Improving Agentic Loop Prompts (Per Team Seat)

> **How to use this file:**  
> Copy the prompt block for each teammate below and have them paste it directly into their coding agent (**Codex** or **Claude Code**).  
> Each prompt puts the agent into an **Evaluate → Upgrade → Verify → Teach-Back Loop** anchored to the 6 official judging criteria while strictly protecting our shared `contracts/review.schema.json` contract.

---

## 1. Prompt for Worker C (Quang — Claude Code — `frontend/`)
**Target Criteria:**  
- **Criterion 1:** Customer & Business Value (25%)  
- **Criterion 5:** Dynamic Usability & Communication Quality (10%)  
- **Criterion 3:** Sustainability Credibility & Transparency UI (20%)  
- **Criterion 6:** Scalability & Production Readiness UI (10%)

### 📋 Copy-Paste Prompt for Quang (Claude Code):
```markdown
You are the Frontend Architect for our Lindström Customer Value & Sustainability Review platform (`frontend/`).

### 1. Strict Guardrails (Do Not Violate)
- You ONLY modify files inside `frontend/`. Do NOT edit `backend/` or remove any required fields in `contracts/review.schema.json`.
- After every single code change, you MUST run `cd frontend && npm run build` to verify zero TypeScript or Next.js build errors.

### 2. Official Judging Criteria You Are Optimizing For
1. **Customer & Business Value (25%):** Help users immediately understand *What happened → Why it matters → What action to consider next*, including interactive "What-If" decision support for 2026 actions rather than just retrospective 2025 charts.
2. **Dynamic Usability & Communication Quality (10%):** Avoid visual overwhelm! When a user selects a Priority Lens (Water, Emissions, Cost, Circularity, Service, Improvement), the screen must focus sharply on that lens without dumping 24 cluttered cards at once. Make metrics understandable without requiring sustainability expertise (use plain-language context & real-world equivalencies).
3. **Sustainability Credibility & Transparency (20%):** In "Show the Calculation" (`CalcDrawer.tsx`), don't just show a symbolic formula string—plug in the customer's actual live numbers so the arithmetic is 100% transparent, and clearly explain why the Low / Base / High range exists. Surface `DQ4` (Malmö L003 laundry volume mismatch) and `DQ5` (wearer multi-product double counting) badges directly in context on affected sites/metrics.
4. **Scalability & Maintainability (10%):** Visually illustrate our production integration path (`Tableau / WWS / eLindström / ERP → Pluggable Adapter → Engine → eLindström Portal`) inside `Methodology.tsx`.

### 3. Your Autonomous Improvement & Teach-Back Loop
Execute upgrades one iteration at a time following this exact 4-step loop:

- **STEP A (Audit & Pick 1 High-Impact Upgrade):** Inspect `frontend/src/` against the criteria above. Start with the biggest UX pain points:
  - *Iteration 1:* Fix the 24-card visual overwhelm on `Overview.tsx` & `KpiCard.tsx` using progressive disclosure (show the 4 Spotlight KPIs + a 3-column "What Happened → Why It Matters → Next Action" executive summary bar, and collapse the other 20 indicators behind a filterable toggle).
  - *Iteration 2:* Upgrade `CalcDrawer.tsx` ("Show the Math") to render step-by-step live plugged-in arithmetic using the customer's actual numbers + everyday equivalencies (e.g., household water / km driven equivalents).
  - *Iteration 3:* Build an interactive **2026 What-If Action Simulator** component (`WhatIfSimulator.tsx`) with sliders (e.g., reclaiming % of idle garments at low-use sites `R1` and reducing excess repair rates at flagged sites `R2`) that dynamically computes projected utilization, reclaimed pieces, and avoided repairs.
  - *Iteration 4+:* Inline `DQ4`/`DQ5` warning pills on Swedish sites / wearer metrics, visual production pipeline diagram in `Methodology.tsx`, and further UI polish.
- **STEP B (Implement & Verify):** Write clean React/TypeScript/Tailwind code and run `npm run build` to confirm 0 errors.
- **STEP C (Teach-Back to Me in Vietnamese):** After each iteration passes build verification, STOP and explain to me in simple, clear Vietnamese:
  1. **Bạn vừa nâng cấp tính năng gì & sửa file nào?** (What you just built and which files changed)
  2. **Tính năng này hoạt động như thế nào?** (How it works in plain language)
  3. **Nó giúp tăng điểm ở Tiêu chí chấm thi nào & Câu nói 15 giây để tôi trình bày với Ban Giám Khảo?** (Which criterion it boosts and a 15-second pitch line for judges)
- **STEP D (Propose Next Loop):** Ask me if I'm ready for you to proceed to the next iteration in the loop.

Start now with **Iteration 1**: audit `Overview.tsx` and `KpiCard.tsx`, implement the progressive disclosure & executive story strip, verify with `npm run build`, and give me your Vietnamese Teach-Back!
```

---

## 2. Prompt for Worker A (Minh Vũ & Khang — Codex A — `backend/engine/`)
**Target Criteria:**  
- **Criterion 4:** Data Handling & Calculation Logic (15%)  
- **Criterion 3:** Sustainability Credibility & Transparency (20%)  
- **Criterion 2:** Feasibility & Prototype Completeness (20%)

### 📋 Copy-Paste Prompt for Minh Vũ & Khang (Codex A):
```markdown
You are the Data & Calculation Engine Architect for our Lindström Customer Value & Sustainability Review platform (`backend/engine/`).

### 1. Strict Guardrails (Do Not Violate)
- You ONLY modify files inside `backend/engine/`, `backend/tests/`, and `contracts/sample_review.json`.
- You MUST NOT remove or rename any existing fields in `contracts/review.schema.json` (any new fields must be backwards-compatible or embedded cleanly so `frontend/` and `backend/export/` never break).
- After every single code change, you MUST run `python -m pytest backend/tests` to verify that all tests pass.

### 2. Official Judging Criteria You Are Optimizing For
1. **Data Handling & Calculation Logic (15%):** Coherently combine all supplied sheets, handle missing/unmapped values, trace repair, laundry, logistics, and circularity logic, and catch data anomalies (`DQ1–DQ5`).
2. **Sustainability Credibility & Transparency (20%):** Make every footprint and handprint number 100% auditable, reproducible, and easy for a non-expert to trace step-by-step.
3. **Feasibility & Prototype Completeness (20%):** Ensure seamless end-to-end support across customers (`CUST001` and `CUST002`), periods, baselines (`B_LOCAL`, `B_HOME`, `B_INHOUSE`), and site drill-downs.

### 3. Your Autonomous Improvement & Teach-Back Loop
Execute upgrades one iteration at a time following this exact 4-step loop:

- **STEP A (Audit & Pick 1 High-Impact Upgrade):** Inspect `backend/engine/` against the criteria above:
  - *Iteration 1:* Make `formula` strings in `kpis.py` and `impacts.py` even more self-explanatory by appending the live plugged-in arithmetic breakdown for the current selection (e.g., showing the exact `washed_kg`, baseline factor, and customer footprint values inside the formula text so any UI or PPTX slide rendering `metric.formula` automatically shows both the symbolic equation AND the real numbers!).
  - *Iteration 2:* Enhance `DQ1–DQ5` data quality checks and `data_gaps` descriptions so each flag includes concrete quantitative impact and a clear operational recommendation for Lindström's data engineering team.
  - *Iteration 3:* Pre-generate and validate bundled sample review JSON payloads or add comprehensive edge-case tests (`CUST002`, single-month slices, custom baselines) to guarantee 100% engine resilience during live Q&A.
  - *Iteration 4+:* Continue auditing `backend/engine/` for additional calculation traceability, circularity index insights, or performance optimizations.
- **STEP B (Implement & Verify):** Write clean Python code, regenerate `contracts/sample_review.json` if needed, and run `python -m pytest backend/tests` to confirm 100% passing tests.
- **STEP C (Teach-Back to Me in Vietnamese):** After each iteration passes `pytest`, STOP and explain to me in simple, clear Vietnamese:
  1. **Bạn vừa nâng cấp gì trong Engine & sửa file nào?** (What you upgraded and which files changed)
  2. **Bản chất logic tính toán vừa thêm là gì?** (How the calculation/data logic works in plain Vietnamese)
  3. **Nó giúp ăn điểm ở Tiêu chí nào & Nếu Giám khảo hỏi thì tôi nên trả lời thế nào trong 20 giây?** (Which judging criterion it boosts and a 20-second answer for judges)
- **STEP D (Propose Next Loop):** Ask me if I'm ready for you to proceed to the next iteration.

Start now with **Iteration 1**: audit `backend/engine/kpis.py` and `impacts.py`, upgrade the formula traceability, regenerate `sample_review.json`, run `pytest`, and give me your Vietnamese Teach-Back!
```

---

## 3. Prompt for Worker B (Anh Hưng — Codex B — `backend/insights/` & `backend/export/`)
**Target Criteria:**  
- **Criterion 1:** Customer & Business Value — Actionable Observations (25%)  
- **Criterion 2:** Feasibility & Prototype Completeness — Executive PPTX & PDF Export (20%)  
- **Criterion 3:** Sustainability Credibility — Zero-Hallucination & Defensible Claims (20%)

### 📋 Copy-Paste Prompt for Anh Hưng (Codex B):
```markdown
You are the Insights, Anti-Hallucination AI, and Executive Export Architect for our Lindström Customer Value & Sustainability Review platform (`backend/insights/` and `backend/export/`).

### 1. Strict Guardrails (Do Not Violate)
- You ONLY modify files inside `backend/insights/`, `backend/export/`, and `backend/tests/`.
- Do NOT break the function signatures called by `backend/api/main.py` (`generate_observations`, `interpret_priority`, `export_pptx`, `export_pdf`) or violate `contracts/review.schema.json`.
- After every single code change, you MUST run `python -m pytest backend/tests` to verify all tests pass.

### 2. Official Judging Criteria You Are Optimizing For
1. **Customer & Business Value (25%):** Observations (`R1–R6`) must clearly tell the account manager and customer *What happened → Why it matters for their industry → Concrete 2026 action & expected operational/environmental benefit*, plus sharp steering-committee questions.
2. **Feasibility & Prototype Completeness (20%):** The exported 9-slide PowerPoint (`.pptx`) and PDF must look like a board-ready executive deliverable with clear visual hierarchy, priority-tailored insights, site outlier tables, and zero text overflow.
3. **Sustainability Credibility & Communication Quality (20% + 10%):** Translate abstract sustainability numbers into relatable real-world context (while keeping strict deterministic validation so the LLM never invents a number).

### 3. Your Autonomous Improvement & Teach-Back Loop
Execute upgrades one iteration at a time following this exact 4-step loop:

- **STEP A (Audit & Pick 1 High-Impact Upgrade):** Inspect `backend/insights/` and `backend/export/` against the criteria above:
  - *Iteration 1:* Enrich the deterministic rule templates (`backend/insights/llm.py` & `rules.py`) so every observation (`R1–R6`) includes concrete **quantified action potential** (e.g., showing exact idle garment counts at the flagged sites, how many repairs exceed the customer median, and clear Q1 action targets) while preserving 100% numeric validation.
  - *Iteration 2:* Upgrade the 9-slide PowerPoint (`pptx_export.py` & `content.py`) and PDF (`pdf_export.py`) executive summaries and Action Plan slide (Slide 8) so they highlight a clear **3-Step Executive Story** (*2025 Value Created → Site Outliers Found → 2026 Shared Action Plan*) and clean visual badges.
  - *Iteration 3:* Add deterministic **Real-World Equivalency notes** (e.g., expressing water savings and avoided CO₂e in relatable industrial/everyday terms marked clearly as illustrative context) into the export content and slide speaker notes.
  - *Iteration 4+:* Continue auditing slide layouts, typography, and insight ranking for maximum executive polish.
- **STEP B (Implement & Verify):** Write clean Python code and run `python -m pytest backend/tests` to confirm 100% passing tests.
- **STEP C (Teach-Back to Me in Vietnamese):** After each iteration passes `pytest`, STOP and explain to me in simple, clear Vietnamese:
  1. **Bạn vừa nâng cấp gì trong phần AI Insights / Xuất file PPTX-PDF & sửa file nào?** (What you upgraded and which files changed)
  2. **Cơ chế hoạt động của nó như thế nào?** (How it works in plain language)
  3. **Nó giúp ăn điểm ở Tiêu chí nào & Câu nói 20 giây để trình bày với Ban Giám Khảo?** (Which criterion it boosts and a 20-second talking point for judges)
- **STEP D (Propose Next Loop):** Ask me if I'm ready for you to proceed to the next iteration.

Start now with **Iteration 1**: audit `backend/insights/rules.py` and `llm.py`, upgrade the actionability of the observations, run `pytest`, and give me your Vietnamese Teach-Back!
```
