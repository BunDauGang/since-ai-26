# AGENTS.md — Instructions for Coding Agents (Codex, Claude Code, Antigravity)

## 1. What We Are Building
**Customer Value & Sustainability Review Generator** for **Lindström** (Since AI Hackathon 2026).
An end-to-end prototype that consolidates multi-site customer operational and sustainability data into a dynamic dashboard and exports a customer-ready PowerPoint/PDF review.

## 2. Read First
1. [`docs/PROJECT_OVERVIEW.md`](./docs/PROJECT_OVERVIEW.md) — Plain-English explanation of the 5-step flow and architecture.
2. [`docs/WORKSTREAMS.md`](./docs/WORKSTREAMS.md) — Folder ownership, shared `review.json` contract, function signatures, and worker briefs.
3. [`docs/IMPLEMENTATION_GUIDE.md`](./docs/IMPLEMENTATION_GUIDE.md) — Verified formulas, rules R1–R6, UI screens, and 9-slide export spec.
4. [`contracts/review.schema.json`](./contracts/review.schema.json) & [`contracts/sample_review.json`](./contracts/sample_review.json) — The shared data contract.

## 3. Non-Negotiable Rules
1. **Strict Folder Ownership (No Merge Conflicts):**
   - **Worker A (Codex A):** Only edit `backend/engine/`, `backend/tests/test_engine.py`, `scripts/`.
   - **Worker B (Codex B):** Only edit `backend/insights/`, `backend/export/`, `backend/tests/test_insights.py`, `backend/tests/test_export.py`.
   - **Worker C (Claude Code):** Only edit `frontend/`.
   - **Lead (Antigravity):** Owns `contracts/`, `backend/api/`, `docs/`, root configs.
2. **One Shared Data Contract (`review.json`):**
   - Never invent ad-hoc field names. Use the exact metric IDs and structure in `contracts/sample_review.json` and `docs/WORKSTREAMS.md` §2.2.
3. **Credibility & Evidence Labels:**
   - Every metric must retain its `status` (`MEASURED`, `CALCULATED`, `ALLOCATED_ESTIMATE`, `ESTIMATE`, `SYNTHETIC`, `PUBLIC_REFERENCE`), `formula`, `sources`, `assumptions`, `confidence`, and `{low, base, high}` values.
   - Never use the words "audited", "verified", or "certified" for synthetic outputs.
   - Never let an LLM calculate or invent numbers; all numbers come from deterministic code.
4. **Do Not Commit Raw Excel Data or Secrets:**
   - Keep `data/*.xlsx` and `.env` out of Git (`.gitignore` is configured).
