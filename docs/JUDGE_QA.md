# Hackathon Judge Q&A — Lindström Customer Value & Sustainability Review Generator

Use these concise answers during the hackathon presentation. The NorthStar example is synthetic demonstration data, not verified customer performance.

## 1. What problem does the application solve?

It helps Lindström account managers prepare customer reviews more efficiently by bringing operational and sustainability indicators together, highlighting what matters to each customer, and generating a customer-ready review.

## 2. How is this different from Power BI or Excel?

Power BI and Excel are useful for storing, analysing and visualising data. Our prototype adds a review workflow: it connects the indicators to customer priorities, explains the findings, suggests improvement actions and exports a tailored presentation.

## 3. Who benefits from the solution?

Key Account Managers can reduce manual review preparation and communicate findings more consistently. Customers get a clearer view of service performance, environmental estimates and opportunities to improve.

## 4. Where does the data come from?

The prototype uses a structured synthetic dataset representing textile usage, laundry, deliveries, repairs, reuse, resource use and environmental indicators. A production version could ingest validated data from Lindström's operational systems.

## 5. Are the environmental savings verified?

No. The current figures are synthetic demonstration outputs and estimates based on stated assumptions and comparison baselines. They are not audited disclosures or verified customer savings. A live review would require validated operational data, approved emission factors and an agreed calculation boundary.

## 6. Why do you show low, base and high scenarios?

A single estimate can create false precision. Scenario ranges make uncertainty visible and help users understand how assumptions affect the result.

## 7. What does the AI actually do?

The calculation engine produces the numerical KPIs deterministically. The AI layer helps explain those results in plain language, connect them to customer priorities and draft recommendations. It is not the source of the KPI calculations.

## 8. How do you prevent AI hallucinations?

The AI is grounded in the structured review data and approved evidence. Numerical claims are checked against calculated values, while predefined rules identify observations and data-quality warnings. The output should not introduce unsupported metrics.

## 9. Could this integrate with Lindström's existing systems?

The architecture is designed around structured data ingestion, so integration is technically possible. A production deployment would still require access to approved data sources, API or database integration, security review and data-governance decisions.

## 10. What is the biggest limitation of the current prototype?

It uses synthetic rather than live customer data. It demonstrates the workflow and technical feasibility, but it does not prove real-world impact or the accuracy of customer-specific sustainability results.

## 11. What would you improve next?

First, connect validated operational data. Then strengthen data-quality checks and sustainability methodology, pilot the review with account managers, and use their feedback to improve the recommendations and export.

## 12. How would you measure success?

We would measure preparation time saved for account managers, accuracy and traceability of reported figures, customer satisfaction, usefulness of recommendations, and the number of agreed improvement actions that are completed.

---

## Questions our team can ask the judges

1. Which part of the customer review process currently takes the most time for account managers?
2. Which capability would create the greatest value: automated reporting, AI-generated explanations and recommendations, or sustainability analysis?
3. What would be a realistic first step for piloting this workflow with validated customer data?

## Three messages to reinforce

- **Automation:** reduce repetitive manual reporting and presentation work.
- **Intelligence:** turn operational data into understandable, customer-priority-driven insights.
- **Transparency:** make calculations, baselines, assumptions, uncertainty and data gaps visible.

## Presenter reminder

When discussing the NorthStar example, call it a synthetic demonstration scenario. Say “the sample data shows” or “the model estimates”; do not describe the figures as verified customer results, audited savings or actual Lindström performance.
