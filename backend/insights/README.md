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
first mentioned topic. Prompt interpretation is offline and deterministic.

## Optional Gemini

Set `GEMINI_API_KEY` securely in the process environment; never commit it.
`GEMINI_MODEL` defaults to `gemini-2.5-flash`. The only remote destination is
`generativelanguage.googleapis.com`. No key is required for offline operation.
No workbook, full review, arbitrary user prompt, or secrets are sent in the
model's facts payload. Requests have a ten-second timeout. The API key travels
in a header, never a URL. Failures are logged without response/exception details.

Gemini can rephrase observations, actions and questions. It cannot change
references, owners or evidence values. Responses containing numeric digits,
common spelled-out numbers or unsupported assurance claims are rejected.
The application appends deterministic numerical evidence after accepting prose;
malformed responses, timeouts and missing keys use templates. Semantic truth of
free prose cannot be guaranteed by numeric validation: use `use_llm=False` for
strictly deterministic customer-facing output. Live API access requires a key;
tests mock both valid and invalid model responses.
