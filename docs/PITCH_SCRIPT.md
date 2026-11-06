# Pitch & Demo Script (3-Minute Stage Flow)

> **Deliverable D5** · Aligned with Judging Criteria Weights (Customer Value 25%, Completeness 20%, Credibility 20%, Data Logic 15%, Dynamic Usability 10%, Scalability 10%)

---

## 1. 3-Minute Stage Pitch & Live Demo

### 0:00 – 0:30 | The Customer Problem (25% Business Value)
- **Hook:** *"Every year, Lindström Key Account Managers sit down with enterprise customers like NorthStar Foods Group—24 sites across Finland, Sweden, and Poland—to answer one question: **What value did our circular workwear service actually create, and what should we improve next?**"*
- **Pain:** *"Today, that evidence sits across fragmented laundry, scan, repair, and sustainability reports. Turning it into a static slide deck takes hours—and worse, customers question whether sustainability numbers are just greenwashing, while operations managers only care about idle stock and delivery reliability."*

### 0:30 – 1:15 | Live Demo Part 1: Priority Personalization & "Show the Math" (20% Credibility + 10% Usability)
- **Action on screen:** Select **NorthStar Foods Group (`CUST001`)**, Priority = **Water Efficiency**, Baseline = **Outsourced Local Laundry**.
- **Point out:**
  1. *"Because NorthStar is in Food & Beverage, the dashboard immediately highlights hygiene continuity (`98.3%` on-time across `11,371` cycles) and water savings (`1.41 million litres` saved in 2025)."*
  2. *"Notice every single metric carries an explicit provenance badge—`SYNTHETIC`, `CALCULATED`, `ALLOCATED_ESTIMATE`, or `ESTIMATE`—plus a conservative Low/Base/High range instead of false precision."*
  3. **Click the Water Saving KPI card** to open the **"Show the Calculation" Drawer**: *"Any customer CFO or sustainability auditor can click a number and see the exact formula, source tables, and assumptions (`A001`, `A003`, `T002`)."*

### 1:15 – 2:00 | Live Demo Part 2: Priority Switch, Site Drill-Down & Actionable Observations (25% Value + 15% Data Logic)
- **Action on screen:** Switch Priority to **Cost & Allocation Efficiency** (or type `"Which sites have the greatest allocation optimization potential?"`).
- **Point out:**
  1. *"Instantly, the view shifts to garment utilization: `31,743` allocated pieces in December, with `88.5%` active scan utilization and `3,646` idle garments."*
  2. **Click into Site Drill-Down:** *"We drill down from customer roll-up to the 24 sites and spot the 5 lowest-utilization sites flagged by Rule `R1`, alongside the top-repair production plants flagged by Rule `R2` (`15,233` total repairs postponing new garment purchases)."*
  3. **Show Observations & Actions panel:** *"Our deterministic rules extract the facts first, and the AI turns them into concrete actions and steering-committee questions—never inventing a single number."*

### 2:00 – 2:35 | Live Demo Part 3: Data-Quality Audit & One-Click PowerPoint/PDF Export (20% Completeness + 15% Data Handling)
- **Action on screen:** Open the **Data Quality & Readiness** tab, then click **Export PPTX**.
- **Point out:**
  1. *"Credibility means showing boundaries and catching bad data. Our engine automatically caught two real issues in the starter pack: first, Swedish laundry `L003` reports `2,500 kg` total volume while customer rows sum to `28,000 kg` (`~1,000%` share)—flagged as `DQ4`. Second, active wearers summed across product rows (`28,367`) double-counts multi-garment wearers, so we compute a deduplicated minimum estimate (`12,078`) alongside it."*
  2. *"Finally, with one click, the KAM exports a customer-ready 9-slide PowerPoint or PDF generated from the exact same `review.json`—complete with sensitivity ranges, steering questions, and mandatory disclaimers."*

### 2:35 – 3:00 | Path to Production in eLindström (10% Scalability)
- **Close:** *"Only one adapter file in our codebase touches Excel. Tomorrow, we swap `excel_adapter.py` for Lindström's validated Tableau and eLindström exports (`Allocated pieces`, `Washing %`, `Repairs table`, `WWS Washed Kg`), plug in approved LCA factors, and deploy this directly as a customer decision-maker module inside **eLindström**."*

---

## 2. Pre-Pitch Backup Checklist
- [ ] Keep a pre-exported `Lindstrom_Value_Review_CUST001.pptx` and `.pdf` open on the desktop so you can show the slides immediately after clicking Export.
- [ ] Record a 2-minute screen capture video as a fail-safe in case venue Wi-Fi drops.
