# Hackathon Task: Lindström Customer Value & Sustainability Review Generator

## Objective

Build a customer-facing review tool that helps Lindström account managers turn operational and sustainability data into a clear annual customer review. The tool should answer three questions:

1. What value does the customer receive from the textile service?
2. How does the circular service model compare with relevant alternatives?
3. What should Lindström and the customer improve next?

## Intended users

- **Key Account Managers (KAMs):** prepare customer reviews faster, identify issues and communicate value consistently.
- **Customer stakeholders:** understand service performance, environmental impact, circularity and improvement opportunities.
- **Decision-makers:** connect operational outcomes to business priorities and agree on next steps.

## Expected product

The prototype should provide:

- A customer overview with key operational and sustainability indicators.
- Site-level drill-down to identify differences and improvement opportunities.
- Customer-priority views, such as water, emissions, cost, circularity and service performance.
- Comparisons against clearly defined alternatives and baselines.
- Low/base/high scenarios that communicate uncertainty.
- Evidence-backed observations and practical recommendations.
- A customer-ready annual review export in PowerPoint and/or PDF.
- Transparent calculation details, assumptions, data provenance and data-quality warnings.

## Data and calculation principles

- Use the supplied synthetic Excel data pack and the repository's sample contract as demonstration inputs.
- Keep numerical calculations deterministic and reproducible in the calculation engine.
- Use AI to explain validated results, interpret customer priorities and draft recommendations—not to invent or independently calculate KPI values.
- Every comparison must state its baseline, scope, assumptions and relevant limitations.
- Distinguish measured data, estimates, scenarios and public reference values.
- Never present synthetic or illustrative data as actual Lindström or customer performance, audited sustainability disclosures, or verified savings.
- Show uncertainty and data gaps rather than hiding them.

## Suggested workflow

1. Select a customer, reporting period, priority and comparison baseline.
2. Ingest and validate the structured data.
3. Calculate operational, financial and environmental indicators.
4. Identify site-level outliers and opportunities using transparent rules.
5. Generate grounded explanations and recommendations.
6. Let the user inspect calculations, assumptions and evidence.
7. Export a tailored customer review.

## Success criteria

The prototype should demonstrate:

- Clear customer and business value.
- A working end-to-end review workflow.
- Credible, traceable sustainability calculations.
- Reliable handling of missing, uncertain and synthetic data.
- Useful customer-specific insights and recommendations.
- A polished, understandable and exportable review.
- An architecture that could later connect to validated operational systems.

## Demo limitations

This repository's demo figures are synthetic and illustrative unless explicitly marked otherwise. The prototype demonstrates a possible workflow and technical approach; it does not establish real-world customer impact or verified Lindström performance. A production deployment would require approved data integrations, validated calculation factors, governance, security and customer review.

## Related documentation

- [Challenge brief](CHALLENGE_BRIEF.md)
- [Project overview](PROJECT_OVERVIEW.md)
- [Data readiness](DATA_READINESS.md)
- [Methodology](METHODOLOGY.md)
- [Implementation guide](IMPLEMENTATION_GUIDE.md)
