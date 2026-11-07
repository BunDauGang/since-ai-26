# AGENTS.md — Rules for coding agents (Codex, Claude Code, Antigravity)

## 1. What we are building
**Customer Value & Sustainability Review Studio** for **Lindström** (Since AI Hackathon 2026): a KAM tool that turns multi-site operational and sustainability data into a story-first customer meeting, a steering-committee prep and a customer-ready PowerPoint/PDF review. Start with [`README.md`](./README.md).

## 2. Read first
1. [`README.md`](./README.md): what the product does, how to run it, architecture.
2. [`contracts/review.schema.json`](./contracts/review.schema.json) and [`contracts/sample_review.json`](./contracts/sample_review.json): the shared data contract. [`contracts/prep.schema.json`](./contracts/prep.schema.json) for meeting prep.
3. [`docs/METHODOLOGY.md`](./docs/METHODOLOGY.md): formulas, baselines, ranges and limitations.
4. [`docs/CHALLENGE_BRIEF.md`](./docs/CHALLENGE_BRIEF.md): the challenge and judging criteria.

## 3. Non-negotiable rules
1. **Folder ownership (avoid merge conflicts):**
   - **Engine (Codex A):** `backend/engine/`, `backend/tests/test_engine*.py`, `scripts/`.
   - **Insights & export (Codex B):** `backend/insights/`, `backend/export/`, `backend/tests/test_insights.py`, `backend/tests/test_export.py`, `backend/tests/test_prep.py`.
   - **Frontend (Claude Code):** `frontend/`.
   - **Lead (Antigravity):** `contracts/`, `backend/api/`, `docs/`, root files.
   - Change another owner's folder only when the user asks, and say so.
2. **One shared data contract (`review.json`):** never invent ad-hoc field names. Use the metric IDs and structure in `contracts/review.schema.json` and `contracts/sample_review.json`; new fields are optional and go into the schema first.
3. **Credibility and evidence labels:**
   - Every metric keeps its `status` (`MEASURED`, `CALCULATED`, `ALLOCATED_ESTIMATE`, `ESTIMATE`, `SYNTHETIC`, `PUBLIC_REFERENCE`), `formula`, `sources`, `assumptions`, `confidence` and `{low, base, high}` values.
   - Never use the words "audited", "verified" or "certified" for synthetic outputs.
   - Never let an LLM calculate or invent numbers; all numbers come from deterministic code. AI wording must pass the number-free validators in `backend/insights/llm.py` and `backend/insights/prep.py`.
   - Never name real competitors with invented figures; competitor comparisons use anonymised archetypes marked as mock.
4. **No raw data or secrets in Git:** keep `data/*.xlsx` and `.env` out of Git (`.gitignore` is configured). Use `.env.example` for setting names only.
5. **Before pushing:** `python -m pytest -q backend` passes and `cd frontend && npm run build` has 0 errors.
