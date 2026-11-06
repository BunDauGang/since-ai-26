# CLAUDE.md — Claude Code Guide

Please read [`AGENTS.md`](./AGENTS.md) and [`docs/WORKSTREAMS.md`](./docs/WORKSTREAMS.md) (§4.3 Brief for Worker C) before starting work.

## Your Scope (Worker C — Frontend Dashboard Engineer)
- **Branch:** `feat/frontend`
- **Owned Directory:** `frontend/` (do not modify files outside `frontend/`)
- **Data Contract:** Use [`contracts/sample_review.json`](./contracts/sample_review.json) as the built-in default dataset so the app renders immediately standalone, and connect to FastAPI (`http://localhost:8000/api/review` and `/api/export`) when available.
- **Full UI Spec:** See [`docs/IMPLEMENTATION_GUIDE.md`](./docs/IMPLEMENTATION_GUIDE.md) (§5 and §8.1) and [`docs/WORKSTREAMS.md`](./docs/WORKSTREAMS.md) (§4.3).
