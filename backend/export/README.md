# Worker B: PowerPoint and PDF exports

Install from the repository root:

```sh
python -m pip install -r backend/export/requirements.txt
python -m backend.export contracts/sample_review.json --out-dir out
```

PDF rendering requires DejaVu Sans at
`/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf` (Debian/Ubuntu:
`fonts-dejavu-core`). The cloud environment already provides it. No Office,
LibreOffice, Gemini key or external conversion service is required.

```python
from backend.export import export_pptx, export_pdf
export_pptx(review, 'out/customer-review.pptx')
export_pdf(review, 'out/customer-review.pdf')
```

Both functions return the written path and create missing parent directories.
They never change the input review or recompute engine savings. They generate
nine pages: title, executive summary, priority, baseline comparison, site
performance, circularity, actions, steering questions, and methodology/data gaps.
This follows the explicit Worker B brief's slide order. Every page carries the
required synthetic disclaimer. Ratios retain their contract units (site rates
are fractions); rule prose converts allocation/on-time rates to percentages.

One shared content builder drives both outputs. PowerPoint elements remain
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

Repair-type and individual waste-route splits are absent from the current
shared contract. Slide six explicitly labels them unavailable, showing existing
repair, avoided-footprint and circular-share metrics instead. Worker A/Lead must
provide an agreed breakdown contract before those splits can be rendered.

Run tests using the installation and commands in `backend/insights/README.md`.
The tests check actual PPTX/PDF content, all six priority variants, source
attachments, schema validity, nonmutation, and repeat exports. PDF layout is
validated during rendering; exceptionally long arbitrary source labels can
exceed nine-page capacity and raise a clear error rather than silently truncate.
