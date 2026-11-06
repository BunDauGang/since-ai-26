# Methodology Note — Customer Value & Sustainability Review Generator

> **Deliverable D6** · Lindström Challenge · Since AI Hackathon 2026  
> **Important Notice:** All customer, site, operational, baseline, and factor figures in this prototype are **100% synthetic and illustrative** unless explicitly marked `PUBLIC_REFERENCE`. Outputs must not be presented as audited sustainability disclosures or verified Lindström/customer claims.

---

## 1. Calculation Architecture & Principles

Our prototype separates **deterministic calculation logic** from **AI narrative generation**:
1. **Deterministic Calculation Engine (`backend/engine/`):** Every KPI, environmental footprint, circular handprint saving, and sensitivity range is computed reproducibly in Python from the tabular data pack.
2. **Evidence & Provenance Tagging:** Every metric carries an explicit `status` badge (`MEASURED`, `CALCULATED`, `ALLOCATED_ESTIMATE`, `ESTIMATE`, `SYNTHETIC`, or `PUBLIC_REFERENCE`), its exact `formula`, source sheets (`sources[]`), assumption IDs (`assumptions[]`), and `confidence` level.
3. **Zero-Hallucination AI Layer (`backend/insights/`):** Deterministic rules (`R1–R6`) extract outlier facts first. The LLM only translates those verified facts into plain-language observations and steering-committee questions, with an automatic validator that rejects any text containing numbers not present in the facts.

---

## 2. Comparison Baselines

The user can compare Lindström's circular workwear rental model against three configurable baselines defined in the `Baselines` sheet:

| Baseline ID | Baseline Name | Default Role | Water (`L/kg`) | Energy (`kWh/kg`) | Process CO₂e (`kg/kg`) | Delivery CO₂e (`kg/kg`) | Baseline Waste Assumption |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **`B_LOCAL`** | Outsourced local laundry | **Default** | `9.50` | `1.05` | `0.620` | `0.035` | 100% mixed waste; no systematic repair |
| **`B_HOME`** | Home washing | Option | `20.00` | `1.18` | `0.780` | `0.000` | 53% load utilization; no centralized delivery; no systematic repair |
| **`B_INHOUSE`** | In-house customer laundry | Option | `12.50` | `1.12` | `0.680` | `0.015` | Customer-operated laundry; no systematic repair |

---

## 3. Footprint & Handprint Formulas

We validated the formulas below across all **1,248 site-product-month rows** in `Customer_Impacts` (0% mismatch against the starter pack).

### 3.1 Allocated Customer Footprint (`ALLOCATED_ESTIMATE`)
Laundry resource consumption is measured at the laundry-month level (`Laundry_Resources`) and allocated to each customer site by washed textile weight (`customer_washed_kg`):

$$\text{Customer Water (L)} = \sum_{m, s, p} \text{customer\_washed\_kg}_{m,s,p} \times \text{fresh\_water\_l\_per\_kg}_{m,l}$$

$$\text{Customer Energy (kWh)} = \sum_{m, s, p} \text{customer\_washed\_kg}_{m,s,p} \times \text{energy\_kwh\_per\_kg}_{m,l}$$

$$\text{Customer CO}_2\text{e (kg)} = \sum_{m, s, p} \left(\text{allocated\_process\_kgco2e}_{m,s,p} + \text{allocated\_delivery\_kgco2e}_{m,s,p}\right)$$

### 3.2 Operational Handprint Savings vs. Selected Baseline $B$ (`ALLOCATED_ESTIMATE`)
For any selected baseline $B \in \{\text{B\_LOCAL}, \text{B\_HOME}, \text{B\_INHOUSE}\}$:

$$\text{Water Saving vs } B\text{ (L)} = \left(\text{customer\_washed\_kg} \times B.\text{water\_l\_per\_kg}\right) - \text{Customer Water (L)}$$

$$\text{Energy Saving vs } B\text{ (kWh)} = \left(\text{customer\_washed\_kg} \times B.\text{energy\_kwh\_per\_kg}\right) - \text{Customer Energy (kWh)}$$

$$\text{CO}_2\text{e Saving vs } B\text{ (kg)} = \text{customer\_washed\_kg} \times \left(B.\text{process\_kgco2e\_per\_kg} + B.\text{delivery\_kgco2e\_per\_kg}\right) - \text{Customer CO}_2\text{e (kg)}$$

### 3.3 Circular Repair Handprint (`ESTIMATE` — Assumption `A002`)
Under prototype assumption `A002`, completed garment repairs extend textile lifetime and postpone replacement purchases:

$$\text{Replacements Postponed} = \text{repair\_count} \times k_{\text{repair}}$$

$$\text{Avoided New-Garment CO}_2\text{e (kg)} = \sum_{p} \text{Replacements Postponed}_p \times \text{synthetic\_product\_footprint\_kgco2e}_p$$

where $k_{\text{repair}} = 1.0$ in the base case and $0.5$ in the conservative low case (`T001`). We report repair-avoided product CO₂e **separately** from laundry process/delivery CO₂e savings so users never conflate operational laundry efficiency with avoided manufacturing assumptions.

### 3.4 Textile Waste & Circular Routing (`ALLOCATED_ESTIMATE` — Assumptions `A003`, `A004`)
Laundry-level textile waste (`Waste_Circularity`) is attributed to customers via `waste_kg_per_washed_kg`:

$$\text{Customer Textile Waste (kg)} = \sum_{m,s,p} \text{customer\_washed\_kg}_{m,s,p} \times \text{waste\_kg\_per\_washed\_kg}_{m,l}$$

$$\text{Circular Waste Share} = \frac{\text{recycling\_kg} + \text{reuse\_kg}}{\text{textile\_waste\_total\_kg}}$$

---

## 4. Sensitivity Analysis & Uncertainty Handling (Low / Base / High)

To avoid false precision on estimated and allocated indicators, every estimated metric is computed as a `{low, base, high}` band:

| Parameter | Low Case (Conservative) | Base Case (Pack Default) | High Case (Upper Band) | Assumption ID |
| :--- | :---: | :---: | :---: | :---: |
| **Repair replacement factor ($k_{\text{repair}}$)** | `0.5` replacements / repair | `1.0` replacement / repair | `1.0` replacement / repair | `A002`, `T001` |
| **Baseline water, energy & CO₂e intensities** | `-20%` vs baseline factor | `100%` of pack factor | `+20%` vs baseline factor | `A001`, `T002` |
| **Idle garment stock capital value** | `-20%` unit cost | `synthetic_purchase_cost_eur` | `+20%` unit cost | `T002` |

---

## 5. Data-Quality Audit Findings in the Starter Pack

Our automated validation pipeline (`DQ1–DQ5`) uncovered two important structural findings in the supplied dataset that we surface directly to the user:

1. **`DQ4` — Laundry `L003` (Nordic Malmö WWS) Volume Reconciliation Warning:**
   - In `Laundry_Resources`, `L003` reports ~`2,300–2,840 kg` of total washed laundry per month.
   - However, in `Service_Activity` and `Customer_Impacts`, the Swedish customer sites served by `L003` (`S013–S018` for `CUST001` and `S025–S030` for `CUST002`) wash ~`25,000–30,500 kg` per month, causing `share_of_laundry_washed_kg` to sum to **~960%–1,258%**.
   - **Our Treatment:** We compute customer footprint using the laundry's per-kg resource intensity (`fresh_water_l_per_kg`, `energy_kwh_per_kg`, etc.) multiplied by `customer_washed_kg` (which reproduces the exact numbers in `Customer_Impacts`), and display a prominent `DQ4` reconciliation flag recommending verification against the production `WWS Washed Kg` feed.
2. **`DQ5` — Active Wearers Multi-Product Double Counting:**
   - `Service_Activity` reports `active_wearers` per `site_id × product_id × month`. Summing across product rows in December 2025 yields `28,367` (`Sample_Output`), which counts a worker wearing both a jacket and trousers twice.
   - **Our Treatment:** We expose **both** `wearer_product_assignments` (`28,367`, exact sum) and `wearers_min_est` (`12,078`, sum across sites of the maximum `active_wearers` in a single product category) and flag unique wearer deduplication as a Phase 2 data requirement.

---

## 6. Boundaries & Limitations

- **Not an audited LCA or CSRD report:** Product carbon footprints (`A005`), baseline factors (`A001`), and repair replacement ratios (`A002`) are synthetic placeholders designed to demonstrate methodology transparency.
- **Laundry-level allocation (`A003`):** Water, energy, and waste are metered at the laundry level and allocated by washed weight rather than per-batch customer sub-metering.
- **Illustrative financial figures:** Idle garment stock values use `synthetic_purchase_cost_eur` for operational prioritization only and do not represent contract billing savings.
- **No legal compliance advice (`A007`):** Industry priority rules guide visual emphasis (e.g., highlighting hygiene and water for Food & Beverage) without making regulatory compliance claims.
