# Worker B: meeting-led PowerPoint and PDF exports

Run from the repository root with Python 3.10+:

```sh
python -m pip install -r backend/export/requirements.txt
python -m backend.export contracts/sample_review.json --out-dir out
```

Unicode rendering uses DejaVu Sans on Linux or Arial/Segoe UI on Windows and
Arial on macOS. Debian/Ubuntu can install `fonts-dejavu-core`. No Office,
LibreOffice, Gemini key or external conversion service is required.

```python
from backend.export import export_pptx, export_pdf
export_pptx(review, 'out/customer-review.pptx')
export_pdf(review, 'out/customer-review.pdf')
```

Both functions return the written path and create missing parent directories.
They do not mutate the input or recalculate the engine's environmental savings.

## Mentor meeting flow

The deck is paginated, not fixed to nine slides. Its front door follows:

1. Title & basics: customer, period, scale, countries and selected alternative.
2. Executive summary: four KPI tiles and a conversation focus for the persona.
3. Agreement & KPIs: actual service KPIs vs KAM-entered targets; satisfaction input or gap.
4. Peer review: anonymised network context when supplied, plus within-customer sites.
5. Rough calculation: explicit KAM inputs and their supplied euro scenario total.
6. Agreed next steps & open topics: present only when `meeting` exists.

Existing priority, baseline, site, repair, observations, discussion questions and
methodology sections remain as deep-dive appendices. Lindström branding and the
synthetic disclaimer remain on every page. Shared measured layout drives both
formats; long notes continue at a minimum nine-point font rather than clipping.

- `meeting.persona` supports `ceo`, `cfo`, `operations`, `sustainability`;
  absence defaults to CEO. Definitions are shared with the story helper in
  `backend/insights/personas.py`. Appendix spotlight metrics still follow the
  exact `priority_view.emphasized_metric_ids` supplied by the API.
- `meeting.targets` are KAM input, not source SLAs. Service actuals use base-case
  operational KPIs. No customer satisfaction dataset is inferred; an entered
  score requires a valid scale and is labelled KAM input.
- `peer_benchmark` is optional. Network values use anonymous metric summaries.
  Supplied percentiles are retained; local fallback uses ascending zero-based
  midrank/(n-1), with 0.5 for a singleton, matching Worker A. High rank is not
  always better, and the small synthetic cohort is not an industry standard.
- `meeting.rough_calc.result_eur` is displayed only when inputs exist. Its
  arithmetic is supplied by the frontend calculator, not independently recomputed
  here. Prices, boundaries and units need customer review. Every result is
  labelled ROUGH CALCULATION; rental-stock value is not a customer saving.
- Repair types and waste routes use `breakdown.by_repair_type` and `by_route`.
  A section says unavailable only when that section's data is absent.

## Customer packet and provenance

When `meeting` is present, both visible pages and embedded provenance are
customer packets: known internal idle-stock values and synthetic product
purchase costs are removed, unsupported internal meeting keys are dropped, and
peer metadata is restricted to anonymous numeric summaries. Satisfaction and
rough-calculation labels cannot be promoted into measured or approved claims.
Free-text agreed actions and open topics are intentionally customer-shared KAM
notes: review them before export. This filtering is not enterprise access control.

The final PPTX slide's notes and the PDF's `review.json` attachment contain the
same packet. Without `meeting`, legacy source snapshots remain unchanged,
including metric formulas, sources, assumptions, status, confidence and ranges.
Presentation wording is regenerated if supplied observations have stale numeric
evidence; valid observation order is preserved. Export makes no network calls.

## Example and integration

`examples/meeting.example.json` contains rehearsal inputs, not a real agreement:

```python
import json
from backend.export import export_pptx, export_pdf
review = json.load(open('contracts/sample_review.json', encoding='utf-8'))
review['meeting'] = json.load(open('backend/export/examples/meeting.example.json', encoding='utf-8'))
export_pptx(review, 'out/meeting.pptx')
export_pdf(review, 'out/meeting.pdf')
```

The Lead's `/api/export` accepts a complete review with optional `meeting`, and
selection parameters plus `meeting`. A direct-review payload preserves exactly
what the UI displays. No required contract field or exporter signature changed.

Run `python -m pytest backend/tests` with dependencies installed as described in
`backend/insights/README.md`. Set `ENGINE_TEST_WORKBOOK` for real-engine tests.
Coverage includes every persona, the six-step order, backwards compatibility,
customer-source filtering, optional peers, valid zero inputs, long-note retention,
layout bounds, and both file formats through the existing API.

The current frontend meeting payload is also covered: allocation and repair-rate
KAM targets, derived requests per 100 estimated wearers, satisfaction comments,
rough-calculation components/ranges, `next_meeting` and customer-shared `notes`.
The latter two are explicitly shared meeting fields; arbitrary internal note
keys remain excluded. Target comparison directions are explicit for known KPIs;
an unknown target never receives an invented pass/fail judgement.

Small-cohort network medians are retained for this synthetic demonstration only.
A median can equal an individual customer value; name removal is not a privacy
guarantee. Production needs an agreed minimum cohort size and disclosure controls.
