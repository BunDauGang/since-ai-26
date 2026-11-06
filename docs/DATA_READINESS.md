# Data-Readiness & Production Integration Note

> **Deliverable D7** · Lindström Challenge · Since AI Hackathon 2026  
> Maps prototype data fields to candidate Lindström production systems and documents the key data gaps to close for an enterprise rollout in **eLindström**.

---

## 1. Architecture for Swapping Synthetic Data with Approved Sources

Our backend isolates all file ingestion inside a single adapter layer (`backend/engine/adapters/`).
- **Today (Hackathon Prototype):** `excel_adapter.py` reads the 19 sheets of `Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx`.
- **Tomorrow (Pilot & Production):** Adding a `tableau_adapter.py`, `powerbi_adapter.py`, or `elindstrom_api_adapter.py` feeds the exact same downstream calculation engine (`kpis.py`, `impacts.py`, `sensitivity.py`), insights engine (`backend/insights/`), Next.js dashboard (`frontend/`), and PowerPoint exporter (`backend/export/`) **with zero changes to the user experience**.

---

## 2. Field-Level Mapping to Candidate Lindström Production Sources

Based on the challenge brief and data-pack provenance notes, each synthetic table maps directly to validated internal Lindström reporting structures:

| Prototype Sheet & Key Fields | Current Data Status | Candidate Lindström Production Source | Integration Readiness |
| :--- | :--- | :--- | :--- |
| **`Customers` & `Sites`**<br>`customer_id`, `site_id`, `industry`, `country`, `primary_laundry_id` | `SYNTHETIC` (High structural confidence) | **Lindström ERP / Customer Master Data** (`Account Top Level` → `Delivery Customer` hierarchy) | Needs enterprise master-data mapping between parent key accounts and delivery customer IDs. |
| **`Service_Activity` (Allocation)**<br>`allocated_pieces`, `active_assets_scanned`, `active_wearers` | `SYNTHETIC_STRUCTURAL` (Medium) | **Tableau Report:** `Allocated pieces Tableau.xlsx` & **eLindström** locker/wearer roster | Validated structure; production rollout needs unique `wearer_id` deduplication across product lines. |
| **`Service_Activity` (Washing)**<br>`washed_pieces`, `packed_pieces`, `washing_pct`, `customer_washed_kg` | `SYNTHETIC_STRUCTURAL` (Medium) | **Tableau / WWS Reports:** `Washing %.xlsx` & `WWS Washed Kg 2025.xlsx` | Ready for direct tabular export ingestion by `Delivery Customer × Product Code × Month`. |
| **`Service_Cycles`**<br>`asset_id`, `pickup_timestamp`, `in_laundry_timestamp`, `delivered_timestamp`, `cycle_hours`, `performance_flag` | `SYNTHETIC_STRUCTURAL` (Medium) | **Tableau Report:** `End to end delivery Tableau report.xlsx` (UHF/RFID scan log aggregation) | High readiness; anonymize or aggregate at `site_id × product_id × week/month` to avoid PII and reduce payload volume. |
| **`Repairs`**<br>`month`, `customer_id`, `site_id`, `product_id`, `laundry_id`, `repair_type`, `repair_count` | `SYNTHETIC_STRUCTURAL` (Medium — validated by latest Lindström data discovery) | **Internal Repairs Table (`Repairs table.xlsx`):** confirmed granularity by `Account Top Level`, `Delivery Customer`, `Product Code`, `Laundry`, and `Repair Name` | **Validated Ready:** Brief confirms this exact 5-dimension granularity is available in Lindström's internal repair data source. |
| **`Laundry_Resources` & `Baselines`**<br>`energy_kwh_per_kg`, `fresh_water_l_per_kg`, `process_emissions_kgco2e`, `delivery_emissions_kgco2e` | `SYNTHETIC_FACTOR` (Medium) | **Sustainability Calculator:** `Workwear laundry Environmental Impact Comparison (T2 2026).xlsx` & plant utility meters | Requires formal governance sign-off from Lindström Sustainability (`Angad Roy` / ESG team) on country grid factors and baseline bands. |
| **`Waste_Circularity`**<br>`recycling_kg`, `reuse_kg`, `energy_recovery_kg`, `incineration_kg` | `SYNTHETIC_STRUCTURAL` (Medium) | **WWS Waste Report:** `Textile Waste kg.xlsx` | Laundry-level treatment route shares are available; customer attribution remains a weight-allocated estimate (`A003`). |
| **`Products`**<br>`avg_weight_kg`, `synthetic_product_footprint_kgco2e`, `synthetic_purchase_cost_eur` | `SYNTHETIC` (Low — placeholder values `A005`) | **Product Master / Approved LCA Database** & commercial contract pricing | Must replace synthetic `kgCO2e` and `EUR` placeholders with verified cradle-to-gate LCA factors before external customer use. |

---

## 3. Prioritized Production Data Gaps & Remediation Roadmap

Our prototype surfaces missing production evidence as an explicit output (`review.json -> data_gaps[]`):

| Priority | Identified Data Gap | Impact on Customer Review | Required Production Fix |
| :---: | :--- | :--- | :--- |
| **P1** | **Parent Account → Delivery Site Hierarchy (`A006`)** | Multi-country key accounts often have fragmented `Delivery Customer` IDs across ERP instances, preventing automatic roll-up. | Introduce an approved `Account Top Level` mapping table maintained by Key Account Management. |
| **P1** | **Approved Product LCA & Baseline Uncertainty Bands (`A005`, `T002`)** | Product footprints (`8.2–29.0 kgCO2e`) and single-point baselines are illustrative placeholders. | Connect approved figures from Lindström's *Workwear Environmental Impact Comparison* model with region-specific grid factors. |
| **P1** | **Laundry vs. Customer Washed-Kg Reconciliation (`DQ4` — Laundry `L003`)** | In the starter pack, customer washed kg at Malmö (`L003`) exceeds total laundry washed kg (`~1,000%` share sum). | Enforce automated pre-ingestion reconciliation between `WWS Washed Kg` plant totals and customer-attributed billing/scan weights. |
| **P2** | **Unique Wearer Deduplication (`DQ5`)** | `active_wearers` is summed per product row (`28,367` assignments vs `12,078` minimum wearers in Dec 2025). | Export `COUNT(DISTINCT wearer_id)` per site and customer from eLindström alongside product-level assignments. |
| **P2** | **Service-Request Root Causes & SLA Timestamps** | `Service_Activity` only includes monthly request counts (`515` in 2025), hiding *why* requests occurred (sizing, damage, missing delivery) and *service-request-free days*. | Add a service-ticket summary feed (`site_id`, `month`, `request_category`, `days_without_incident`, `median_resolution_hours`). |
| **P3** | **Commercial Cost & Time-Saved Evidence** | Financial optimization claims require contract-specific rental rates, replacement fee structures, and customer handling-time benchmarks. | Make financial ROI an optional module unlocked when the KAM inputs customer-approved unit rates during review setup. |
| **P3** | **Curated `Public_References` & Regulatory Context** | The brief notes a `Public_References` sheet (absent from the xlsx file) for approved Lindström corporate facts and industry regulations. | Maintain a centrally curated, compliance-approved markdown/JSON reference store managed by Lindström Marketing & Sustainability. |
