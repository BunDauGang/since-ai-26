# Worker B: PowerPoint and PDF exports

Install from the repository root:

```sh
python -m pip install -r backend/export/requirements.txt
python -m backend.export contracts/sample_review.json --out-dir out
```

Unicode rendering and layout measurement use DejaVu Sans on Linux or Arial/Segoe UI
on Windows, and Arial on macOS. Debian/Ubuntu can install `fonts-dejavu-core`.
The cloud environment already provides DejaVu Sans. No Office,
LibreOffice, Gemini key or external conversion service is required.

```python
from backend.export import export_pptx, export_pdf
export_pptx(review, 'out/customer-review.pptx')
export_pdf(review, 'out/customer-review.pdf')
```

Both functions return the written path and create missing parent directories.
They never change the input review or recompute engine savings. They normally generate
nine pages: title, executive summary, priority, baseline comparison, site
performance, circularity, actions, steering questions, and methodology/data gaps.
This follows the explicit Worker B brief's slide order. Every page carries the
required synthetic disclaimer. Ratios retain their contract units (site rates
are fractions); rule prose converts allocation/on-time rates to percentages.

One shared content builder and measured layout drive both outputs. Spotlight
metrics follow `priority_view.emphasized_metric_ids` in the supplied order.
Missing IDs are labeled unavailable. Oversized cards continue on additional
pages at a minimum nine-point font; neither format discards overflowing text.
Repeated monthly quality findings are summarized, with full records retained in
the embedded source review. PowerPoint elements remain
editable. Complete, unchanged `review.json` is retained in the last slide's
speaker notes and as an embedded PDF attachment, including formulas, sources,
assumptions, statuses, confidence, ranges, and all sites. Visible cards include
provenance for displayed aggregate metrics. Generated files are gitignored.

The shipped sample contains stale observation numbers and differences between
metric and baseline-comparison totals. Exports regenerate deterministic
observations unless supplied observation references and numeric evidence match
current rule output. Valid generated Gemini prose is retained under this same
check; no network call occurs during export. Source registries and comparison
rows are retained as supplied, with visible caveats; source-data inconsistencies
must be fixed by the contract/data owners, not silently rewritten by exports.

Repair types are rendered from `repairs_total.breakdown.by_repair_type` and
waste routes from `textile_waste_kg.breakdown.by_route`. Each section says
unavailable only when its own data is absent (as in the shipped sample). Values,
units, evidence status and confidence are copied from the supplied metrics.

Run tests using the installation and commands in `backend/insights/README.md`.
The tests check actual PPTX/PDF content, all six priority variants, source
attachments, schema validity, nonmutation, and repeat exports. Layout is measured before rendering in both formats. Continuation pages retain
long source text, with provenance in the last rendered slide regardless of page
count. Set `ENGINE_TEST_WORKBOOK` to exercise real-engine and API export paths;
those tests explicitly skip if the workbook is unavailable.
