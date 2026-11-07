# Lindström — Customer Value & Sustainability Review Generator

> **Since AI Hackathon 2026** · Challenge Partner: **Lindström Group**

## 1. What We Are Building (In One Sentence)

A web application where a Lindström Key Account Manager selects a multi-site customer and their priority (`Water`, `Emissions`, `Cost`, `Circularity`, `Service performance`, or `Next-year improvement`), explores an interactive dashboard with transparent, auditable calculations and site drill-down, and exports a customer-ready **PowerPoint (`.pptx`) / PDF** review deck for the annual steering-committee meeting.

---

## Innovative Ideas and Future Improvements

Our core product is an AI-powered web application for Lindström's Key Account Managers (KAMs). PowerPoint/PDF reviews are outputs of that application. The goal is to demonstrate customer value, strengthen relationships and retention, improve operations, and identify potential service and revenue opportunities.

**Status:** All five ideas below are proposals, in priority order. They are not implemented features. They build on the existing review workflow: deterministic calculations, evidence-linked observations, priority views, and report exports. The current prototype uses synthetic data; future business or environmental benefits require appropriate evidence.

### 1. Customer Value Improvement Journey — From Insights to Business Impact

**Problem:** Customer reviews can identify issues without helping Lindström decide what to tackle first, which team should investigate, or whether an action worked. KAMs must then spend time prioritizing recommendations and coordinating departments manually.

**Proposed solution:** Combine Next Best Action and Improvement Tracking into an internal customer improvement plan. After generating a review, the platform would:

1. Identify improvement opportunities from customer data.
2. Rank actions by potential business impact, implementation effort, customer priorities, and confidence in the supporting data.
3. Explain the ranking, including why one action comes before another and what evidence is missing.
4. Suggest a responsible function, such as logistics, service operations, or account management.
5. Let the KAM confirm the recommendation, assign an owner, set a deadline, and track progress.
6. Link each action to its original insight, supporting KPI, and measurable business objective.
7. Compare the KPI before and after implementation when new data becomes available, accounting for changes in reporting periods, activity, and assumptions. A change alone would not prove that the action caused it.

**Simple example:** A factory has unusually low garment utilization. The platform suggests reviewing garment allocation and explains that the action may reduce unnecessary inventory and improve resource efficiency. It proposes service operations for investigation, subject to the KAM's confirmation. The KAM checks staffing and garment-availability needs, approves the action, assigns an owner, and tracks progress. With updated data, the platform compares utilization before and after the allocation change without assuming a financial saving.

**Users and access:** This would be an internal Lindström tool, primarily for KAMs. Customers would receive reviews, discuss proposed improvements, and approve relevant service changes without needing access to internal action tracking. Customer confidentiality and role-based permissions would govern which accounts, evidence, and actions each employee can see.

Every action would originate from a customer insight and remain connected to a business objective. The scope would stay focused on customer-value improvement rather than general-purpose task management.

**Business value for Lindström:** Less time spent analyzing and prioritizing issues; clearer coordination with internal teams; opportunities to improve service quality and response times; and a continuous-improvement record that supports trust, customer retention, and long-term customer value. Service optimization could reveal potential revenue opportunities over time, but revenue growth would not be guaranteed.

**Implementation feasibility:** Start with transparent scoring rules over existing observations and KPIs, with the KAM confirming effort estimates, priority, and team suggestions. Add persistent action records, ownership, deadlines, permissions, and a history of comparable review snapshots. Approved operational data and repeated measurements would be needed to assess outcomes; the synthetic prototype can demonstrate the workflow, not establish business impact.

> **From Data → To Decisions → To Measurable Business Impact.**

### 2. Customer Objection Simulator — AI Meeting Preparation

**Problem:** KAMs need time to prepare for difficult questions about sustainability claims, costs, service performance, calculation methods, and data reliability.

**Proposed solution:** Use the customer review to generate likely meeting questions and draft responses grounded in its metrics, assumptions, and limitations. Responses would link back to evidence and explicitly flag questions the data cannot answer.

**Simple example:** For “How reliable is this water-saving estimate?”, show the selected baseline, allocation method, low/base/high range, and missing production evidence instead of offering an unsupported assurance.

**Business value for Lindström:** Reduce preparation time, improve KAM confidence, and support transparent conversations that strengthen customer trust, relationships, and retention.

**Implementation feasibility:** Build on the existing structured review and optional narrative-generation integration. Start with question templates and evidence retrieval, retain an offline fallback, and require KAM review before using answers with customers. AI would explain supplied numbers rather than calculate or invent them.

### 3. Data Trust Passport — Transparent and Explainable Metrics

**Problem:** KAMs and customers need to understand why a KPI or recommendation deserves confidence without reconstructing its evidence manually.

**Proposed solution:** Extend the existing “Show the Calculation” concept into a consistent evidence summary for important KPIs and recommendations. Include source data, calculation method, assumptions, comparison baseline, uncertainty range, limitations, and evidence status. Recommendations would link to the same KPI explanations rather than duplicate them.

**Simple example:** A repair-handprint recommendation would show its repair count, replacement-factor assumption, synthetic product footprint, and uncertainty before it is discussed with a customer.

**Business value for Lindström:** Improve credibility, reduce time spent explaining calculations, support transparent sustainability communication, and strengthen long-term customer trust.

**Implementation feasibility:** Reuse the provenance fields already carried by `review.json`. Add recommendation-to-evidence links and a consistent presentation of missing or outdated sources. Approved production sources would be required before using prototype estimates as customer claims.

### 4. What-if Scenario Simulator — Explore Business Decisions

**Problem:** A historical review does not show how a possible service change might affect supported indicators.

**Proposed solution:** Let KAMs explore hypothetical garment-allocation changes or sustainability baselines using explicit assumptions and deterministic calculations. Display scenarios separately from observed results, retaining synthetic and estimated labels where applicable.

**Simple example:** Explore a lower allocation level while holding other inputs constant. Show the resulting allocation-use ratio and illustrative stock value, while explaining that garment availability, costs, and service effects need additional evidence.

**Business value for Lindström:** Support better customer discussions, demonstrate proactive service optimization, and identify potential opportunities to improve customer value and retention. Do not promise cost savings or service improvements without sufficient data.

**Implementation feasibility:** Extend existing baseline and sensitivity calculations with clearly bounded scenario inputs. Start with indicators whose relationships are supported by the data; add pricing, service-capacity, or other models only when suitable evidence is available. A scenario would be an exploration, not a prediction or a measured outcome.

### 5. Peer Benchmarking — Learn from Comparable Sites

**Problem:** A site's repair rate or garment utilization can be hard to interpret without a suitable comparison group.

**Proposed solution:** Compare similar sites or customer groups only when enough comparable data exists. Explain how peers were selected, including factors such as industry, site type, product mix, reporting period, and service conditions.

**Simple example:** Compare garment utilization at factories with similar products and operating conditions to identify sites worth discussing with operations teams, without treating a difference as proof of poor performance.

**Business value for Lindström:** Identify best practices, support operational improvements, and develop stronger recommendations that reinforce long-term customer relationships and retention.

**Implementation feasibility:** The current synthetic dataset cannot establish reliable industry-wide benchmarks. A future pilot would require sufficient historical data, consistent metric definitions, appropriate permissions, minimum comparison-group sizes, and privacy safeguards that prevent disclosure of another customer's confidential performance.

---

## 2. 10-Minute Reading Order for Teammates

0. **[`docs/TEAM_STUDY_GUIDE.md`](./docs/TEAM_STUDY_GUIDE.md)** — **START HERE FOR TOMORROW'S MEETING:** Plain-English walkthrough of what each person's code actually does, which 3 files to open, your 3-minute script to explain your part to the team, and the exact judge Q&A answers for your seat.
1. **[`docs/PROJECT_OVERVIEW.md`](./docs/PROJECT_OVERVIEW.md)** — Plain-English summary, the 7-step demo flow, and how the parts connect.
2. **[`docs/WORKSTREAMS.md`](./docs/WORKSTREAMS.md)** — **Who builds what**, folder ownership, and the **copy-paste prompt brief** for your tool (Codex / Claude Code / Antigravity).
3. **[`docs/IMPLEMENTATION_GUIDE.md`](./docs/IMPLEMENTATION_GUIDE.md)** — Verified formulas, rules `R1–R6`, dashboard screens, 9-slide export layout, and data-quality flags.
4. **[`contracts/sample_review.json`](./contracts/sample_review.json)** — Ready-to-use sample output for `CUST001` (`NorthStar Foods Group`, 24 sites) so everyone can build in parallel immediately.
5. **[`docs/CHALLENGE_BRIEF.md`](./docs/CHALLENGE_BRIEF.md)** — Official judging criteria (with % weights) and required deliverables.

---

## 3. Team Division & Strict Folder Ownership

To avoid Git merge conflicts, each seat owns separate folders and works on their own branch:

| Seat | Tool | Branch | Owned Folders | Mission |
| :--- | :--- | :--- | :--- | :--- |
| **Lead** | Antigravity | `main` / `feat/api` | `contracts/`, `backend/api/`, `docs/` | Shared `review.json` contract, FastAPI integration server, methodology & data-readiness notes, pitch |
| **Worker A** | Codex | `feat/engine` | `backend/engine/`, `backend/tests/test_engine.py`, `scripts/` | Excel adapter, data-quality checks (`DQ1–DQ4`), operational KPIs, footprint/handprint, low/base/high ranges |
| **Worker B** | Codex | `feat/insights-export` | `backend/insights/`, `backend/export/`, `backend/tests/test_insights.py`, `backend/tests/test_export.py` | Rules `R1–R6` + Gemini LLM observation generator (with offline fallback) + 9-slide PPTX/PDF exporter |
| **Worker C** | Claude Code | `feat/frontend` | `frontend/` | Next.js interactive dashboard: setup controls, KPI cards with *"Show the Calculation"* drawer, priority switcher, 24-site drill-down, export buttons |

---

## 4. Data Setup (Local Only)

The synthetic Excel data pack is excluded from Git via `.gitignore`.
Drop `Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx` into [`data/`](./data/) when running the Python calculation engine locally.
**Frontend (`Worker C`) and Insights/Exporter (`Worker B`) do not need the Excel file to start** — they can build and test directly against [`contracts/sample_review.json`](./contracts/sample_review.json).

---

## 5. Run It Locally

**Requirements:** Python 3.11+ and Node.js 20+.

```bash
# 1. Backend: engine + insights + export behind FastAPI (http://localhost:8000)
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.api.main:app --port 8000

# 2. Frontend dashboard (http://localhost:3000), in a second terminal
cd frontend
npm install
npm run dev
```

- With the Excel pack in `data/`, the API calculates live reviews for CUST001–CUST003. Without it, the API serves `contracts/sample_review.json`.
- The dashboard also runs **without the backend**, using its bundled copy of `contracts/sample_review.json`. The sidebar shows which data source is active. Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` if the API is not on `localhost:8000`.
- **Tests:** `python -m pytest backend/tests`
- **Regenerate the shared sample** after engine changes: `python scripts/build_review.py --source data/Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx --out contracts/sample_review.json`, then `cd frontend && npm run sync-contract`.
- **Export from the command line:** `python -m backend.export --help`
