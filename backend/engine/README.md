# `backend/engine/` — Data & Calculation Engine (Owned by Worker A / Codex A)

See [`docs/WORKSTREAMS.md`](../../docs/WORKSTREAMS.md) (§4.1) and [`docs/IMPLEMENTATION_GUIDE.md`](../../docs/IMPLEMENTATION_GUIDE.md) (§6) for full specifications.

## Run

From the repository root, with Python 3.10+:

```bash
python -m pip install -r backend/engine/requirements.txt
python scripts/build_review.py --source /path/to/Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx --out out/review.json
ENGINE_TEST_WORKBOOK=/path/to/Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx python -m pytest backend/tests/test_engine.py -q
```

Without `--source`, the engine uses the workbook path documented in `data/README.md`.
The workbook is local data and must stay out of Git. No workbook, output, or API key
is embedded in the engine. Integration tests explicitly skip when the workbook
is unavailable; the smaller adapter/scenario/quality tests still run.

```python
from backend.engine.build_review import build_review
review = build_review(customer_id="CUST001", baseline_id="B_HOME",
                      priority="water", sensitivity="base", source_path="/path/to/pack.xlsx")
```

## Calculation boundaries

- Only `adapters/excel_adapter.py` reads Excel. Cover-page `README` is skipped;
  tabular sheet records and missing cells are preserved. Timestamp serials use
  the workbook's own date epoch. `Customer_Impacts` and `Sample_Output` are never
  inputs to calculations.
- Reporting periods are inclusive months. Cycles are assigned by pickup month.
  Stock, allocation use, idle stock, and wearer counts use `period_to`; no stale
  stock is substituted when the requested final month is absent. Wash frequency
  is the ratio of period totals, weighted by monthly active-asset counts.
- Wearers use the sum of each site's maximum product wearer count in the final
  month, a minimum estimate rather than a deduplicated person count. The pack
  gives **9,607** for December CUST001; the sample JSON's DQ5 text contains a
  conflicting 12,078. The engine uses the calculated value.
- Resource footprint uses reported resource totals divided by laundry washed kg.
  Reference impact rows have rounded factors/values. CUST001 water savings are
  approximately **1,406,620.29 L** versus reference **1,406,482.6 L**; CO2e savings
  are **255,073.68 kg** versus **255,073.1 kg**. Each of the 1,248 reference rows
  agrees within the specified 1% tolerance. No reference totals are copied or
  used to adjust calculations.
- DQ4 is calculated across all customers before selecting a review. L003's
  over-allocation is disclosed; resource allocation is not capped or rescaled.
  Missing/unmapped rows remain in source tables. Rows without valid ownership,
  date, or dimension mappings are counted and excluded from review aggregates.
  Missing numeric inputs propagate to unavailable metrics, which are omitted
  with explicit `data_gaps` rather than replaced with invented zeros.
- Baseline ranges vary baseline factors ±20% while keeping footprint fixed;
  negative savings are retained. Repair factors are 0.5/1/1. `T001` and `T002`
  disclose these team assumptions. `T003` discloses illustrative idle stock
  valuation with no unsupported cost-savings or cost-uncertainty claim.
- Metric values always retain all scenarios. Site/product/time-series values
  use the selected scenario. Metric breakdowns include site/product/month;
  textile waste also includes `by_route`, and repairs include `by_repair_type`.
  Environmental savings and avoided product emissions are separate, never added.
- Observations remain empty for Worker B's rules/LLM integration. Rule outlier
  flags belong to Worker B; site flags here carry applicable data-quality IDs.

All outputs describe synthetic prototype data, with source, formula, status,
assumption IDs, and confidence. Shared contracts, API code, and root dependency
configuration are left to the lead.

## Review regression fixes

- Optional/reference sheets with blank or duplicate headers are excluded with a
  lowercase `warning` finding (`DQ_HEADER`) instead of aborting calculations.
  Ambiguous headers in required calculation sheets remain explicit input errors;
  guessing those mappings would risk incorrect calculations.
- DQ1–DQ4 findings use lowercase contract severity. DQ4 includes exact structured
  `laundry_id` and `month` targets; site flags use these targets, with token-exact
  matching for older text-only findings. `laundry_id` is supported when
  `primary_laundry_id` is absent.
- Engine defaults and user prompts share `backend.insights.priority.interpret_prompt`:
  the first explicit topic wins, with the same industry fallback for empty text.

## Quantitative quality findings and demo edge cases

DQ1 counts missing/non-finite cells by column. DQ2 lists orphan IDs, and DQ3
counts ownership conflicts. Each finding records its scope and
`quantitative_impact`: known affected kg, unknown-kg row count and whether a kg
field exists. Master-data rows without a kg field report an unavailable amount,
not zero. Different checks and sheets overlap; never add their affected volumes.
DQ4 reports each laundry/month's known customer kg, laundry kg, excess kg and
share; zero laundry kg has an undefined share, not Infinity. Its scope is the
whole workbook across customers, while the L003 data gap separately shows the
selected customer's kg. None of these volumes is a quantified footprint error.

DQ5 uses only the selected customer's last reporting month. It reports
assignments, the sum of site maxima, and their difference. That difference is
not a count of duplicate people. Its recommendation is to join pseudonymous
wearer IDs and count distinct active people. Every finding includes a source
reconciliation recommendation; missing-metric gaps name unavailable inputs,
factors or denominators rather than inventing an impact estimate.

The self-contained `backend/tests/test_engine_edges.py` suite needs no workbook.
It covers CUST002, single-month selection, all three baselines/scenarios,
custom source baseline factors within the existing baseline-ID enum, negative
savings, zero denominators/washed kg, absent repairs/cycles, missing final-month
stock, missing laundry-month joins, non-finite input, ownership/unmapped rows,
duplicate allocation keys, and input immutability. Duplicate laundry/month keys
raise an explicit ValueError rather than silently picking a row or double-counting.
The integration tests in `test_engine.py` additionally use the actual challenge
workbook and check all 1,248 Customer_Impacts rows within the specified tolerance.

Rollups index records once per request by site/product/month, preserving source
row order and sum order. Trace builders reuse calculated totals. There is no
shared cache in this engine, so subsequent requests use current factors/rows.
Six CUST001/CUST002 low/base/high outputs were exactly equal before and after
indexing, excluding generated_at. A local seven-run median for preloaded data
was approximately 155 ms before and 139 ms after; this excludes workbook I/O
and is not an end-to-end latency guarantee.

To refresh the shared bundled demo from the actual workbook and regenerate
observations without any LLM/network call, run:

```bash
python -m backend.engine.sample_review --source /path/to/pack.xlsx
python -m pytest backend/tests
```

The bundler validates the existing shared schema and finite JSON before writing
`contracts/sample_review.json`; it does not modify the schema, frontend bundle,
API or exporters. Frontend's separate `npm run sync-contract` remains a task for
the frontend owner after a contract sample update.

## Peer review contract (Codex A / final meeting-mode plan)

`build_review` additionally emits the optional `peer_benchmark` block. Its
`customer` map contains `on_time_rate`, `allocation_use_rate`,
`repair_rate_per_1000`, `median_cycle_hours`, `service_requests_per_wearer`.
Each available KPI contains `network_median`, `percentile` (0–1) and
`sample_size`. The population is all eligible workbook customers, including
the selected one, in the same reporting period. Each customer contributes one
operational aggregate; sites/cycles are not pooled across customers. Selection
uses the same valid customer/site/product/laundry keys and pickup-month rule
as the review. Missing/non-finite values are excluded separately per KPI.

`sites[site_id][kpi]` is the site's percentile among the selected customer's
sites. Rank = (number strictly below + (number equal − 1)/2)/(n − 1).
Ties share rank; a singleton receives neutral 0.5. Rank is ascending numerical
position, not a performance score. The `methodology.preferred_direction` map
marks higher/lower preferences; repair-rate comparisons are investigation
signals, not proof of poor service. Requests per wearer = requests in the
reporting period divided by final-month minimum wearer estimate, not unique
people or a month-normalised rate. Missing/zero wearer denominators are omitted.

The block discloses its synthetic, small-cohort limitations and contains no
other customer names, IDs or individual values. It is not an industry standard.
Baseline/sensitivity changes do not affect these operational comparisons.

`products[].synthetic_purchase_cost_eur` exposes the source synthetic unit
purchase cost (not the rental price, not a cost saving). Zero is valid; absent,
non-finite or negative costs omit this optional field. All existing metric and
product fields remain intact. Schema/API/frontend/export updates remain with
their owners; no shared schema or bundled frontend data is changed here.
