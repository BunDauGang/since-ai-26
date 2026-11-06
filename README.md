# Lindström — Customer Value & Sustainability Review Generator

> **Since AI Hackathon 2026** · Challenge Partner: **Lindström Group**

## 1. What We Are Building (In One Sentence)

A web application where a Lindström Key Account Manager selects a multi-site customer and their priority (`Water`, `Emissions`, `Cost`, `Circularity`, `Service performance`, or `Next-year improvement`), explores an interactive dashboard with transparent, auditable calculations and site drill-down, and exports a customer-ready **PowerPoint (`.pptx`) / PDF** review deck for the annual steering-committee meeting.

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
