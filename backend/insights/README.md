# Worker B: rules and observations

Run from the repository root with Python 3.10+:

```sh
python -m venv .venv
.venv/bin/python -m pip install -r backend/insights/requirements-dev.txt
.venv/bin/python -m pytest backend/tests/test_insights.py backend/tests/test_export.py -q
```

```python
from backend.insights import generate_observations, interpret_prompt
review['observations'] = generate_observations(review, use_llm=False)
priority = interpret_prompt('Focus on water for the food sites', review['meta']['industry'])
```

`generate_observations` does not mutate the review. It returns three to five
observations when sufficient evidence exists; an empty/partial review never
gets fabricated findings just to reach a count. References use existing metric
and site IDs. Assign its result to `review['observations']` in the API.

## Deterministic definitions

- R1: lowest `ceil(20% × valid site count)` allocation-use sites; ties by site ID.
- R2: repair rate strictly greater than 1.5 × median valid site rate.
- R3: site on-time rate below the aggregate customer base-case rate. If absent,
  use the unweighted valid site mean (cycle counts are not in this contract).
- R4: requests / estimated minimum wearers × 1,000 strictly greater than 1.5 ×
  the site median. This threshold is a prototype choice because the brief does
  not define "high". Exclude missing/nonpositive wearer denominators. Annual
  requests divided by the supplied wearer estimate are not a person-year rate.
- R5: water priority only; copy supplied savings ranges and top three sites by kg.
- R6: supplied quality flags and data gaps. Reserve a place for this warning when
  selecting five observations. Missing repair anomalies are never invented.

The selected priority leads. Remaining findings follow the rank-ordered
`priority_view.industry_rules` from the shared contract, with documented industry
fallbacks. If needed, factual context observations supplement sparse outliers.
Unknown prompts use service for Food & Beverage/Healthcare, cost for
Manufacturing, and improvement otherwise. Multiple explicit topics use the
first mentioned topic. Prompt interpretation is offline and deterministic. Engine defaults use the
same resolver in `backend/insights/priority.py`, so the same topic text cannot
select a different priority merely because it came from the customer master.

## Optional Gemini

Set `GEMINI_API_KEY` securely in the process environment; never commit it.
`GEMINI_MODEL` defaults to `gemini-2.5-flash`. The only remote destination is
`generativelanguage.googleapis.com`. No key is required for offline operation.
No workbook, full review, arbitrary user prompt, or secrets are sent in the
model's facts payload. Requests have a ten-second timeout. The API key travels
in a header, never a URL. Failures are logged without response/exception details.

Gemini selects approved introductory wording for observations, actions and
questions. It cannot replace the deterministic action plan, references, evidence,
industry relevance or limitations. Any wording outside the approved set, numeric
text, malformed response or timeout returns the offline template. This is a
bounded wording selector, not unrestricted prose generation. Live API access
requires a key; tests mock valid, invalid and failed responses.

## Persona Story Assistant and Lead integration

```python
from backend.insights import generate_story
story = generate_story(review, persona='cfo', goal='Discuss allocation and pricing',
                       minutes=15, use_llm=False)
```

The response carries `opening`, three `points` (with `id`, `headline`, `text`,
`detail`, `metric_ids`, full `evidence` and `status`), `likely_objections` (also
aliased as `objections`), `ask`, customer identity, persona, goal, minutes and
`source`. A missing KPI is a DATA_GAP, never a zero. Duration is a KAM preference
from 1 to 120 minutes. Goal text changes metric emphasis but is never copied
into spoken text as a factual claim. Financial benefits are not inferred.

`use_llm=False` is fully offline. With `use_llm=True`, Gemini only selects approved
non-numeric opening/ask phrasing. Python retains every evidence value, range,
status, limitation, objection and action. Responses outside the approved choices,
new numbers, malformed data and timeouts all return the deterministic template.
Only persona, goal, minutes and compact metric facts are sent; never the workbook,
site records, meeting notes or complete review. No raw key or response is logged.

The Lead endpoint currently looks for
`backend.insights.llm.story_talk_track(review, persona, goal, minutes, fallback)`.
That hook is provided and tested through `/api/story` with `use_llm=True`; it
works offline too when no key exists. It builds a grounded template rather than
trusting the adapter's supplied fallback.

**Integration note:** the explicit `use_llm=False` API path uses the Lead's own
updated template, while the default path discovers the guarded hook above and
works offline when no key is set. Both are covered by backend tests. The shared
`generate_story(...)` helper remains available to unify these paths in a later
cleanup; no claim is made that duplicate payload fields or recalculation work
has been removed.
