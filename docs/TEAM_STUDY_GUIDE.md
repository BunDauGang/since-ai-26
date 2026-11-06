# Team Study & "Teach-Back" Guide

> **Why this file exists:** We used AI tools (Antigravity, Codex, Claude Code) to build our 4 parts fast. Now, **every human on the team needs to understand their own part** so we can explain it to each other tomorrow morning—and answer any judge question with confidence.

---

## How Tomorrow's 15-Minute "Teach-Back" Meeting Works

Tomorrow morning, we sit together for 15 minutes. Each person takes **3 minutes** to explain their part to the rest of the team by answering 4 simple questions:
1. **Input → Output:** What goes into my part, and what comes out of it?
2. **Key Files:** Which 3 files in my folder do the real work?
3. **Our Secret Sauce:** What is the smartest design choice in my part?
4. **Judge Q&A:** If a judge asks me how my part works, what do I say?

Find your section below, read it tonight (takes 10 minutes), and open the files mentioned so you can see how they work.

---

# Seat 1: Lead (You) — The Connector API & Methodology

### 1. Input → Output (In Plain English)
- **What your code is:** The **waiter** (`backend/api/main.py`) that sits between Worker C's website and Worker A & B's Python code, plus the **shared menu** (`contracts/sample_review.json`) and **methodology notes** (`docs/METHODOLOGY.md`, `docs/DATA_READINESS.md`).
- **Input:** A request from the website, like *"Give me NorthStar Foods (`CUST001`), Priority = Water, Baseline = Outsourced Local Laundry."*
- **Output:** The complete `review.json` package (or a `.pptx` / `.pdf` file when the user clicks Export).

### 2. Your Key Files (Open These & Look Inside)
| File | What It Does |
| :--- | :--- |
| **[`backend/api/main.py`](../backend/api/main.py)** | Your FastAPI server. Look at `_compute_full_review()` (lines 125–183): it runs 3 steps in order: **(1)** figures out the priority, **(2)** calls Worker A's `build_review()` to calculate numbers, and **(3)** calls Worker B's `evaluate_rules()` and `generate_observations()` to attach site flags (`R1–R4`) and AI/rule recommendations. |
| **[`contracts/sample_review.json`](../contracts/sample_review.json)** | The "golden example" of our shared data contract for `NorthStar Foods Group`. Even if the backend server is turned off, the website can load this file and still work! |
| **[`docs/METHODOLOGY.md`](../docs/METHODOLOGY.md) & [`docs/DATA_READINESS.md`](../docs/DATA_READINESS.md)** | The two written reports required by the brief: explains our formulas, the data-quality bugs we caught in Lindström's Excel file, and how to connect real Lindström data later. |

### 3. What to Say to Your Team Tomorrow (Your 3-Minute Script)
> *"My part is the glue that connects everyone's work. First, I defined `contracts/sample_review.json`—that's the shared JSON structure containing `meta`, `metrics`, `sites`, `products`, `timeseries`, `baseline_comparison`, `observations`, `data_quality`, `assumptions`, and `data_gaps`. Because we agreed on this structure first, all 4 of us could build at the same time without waiting.*
>
> *Second, I built `backend/api/main.py`. It exposes 4 endpoints: `/api/customers` (lists customers and baselines), `/api/interpret` (turns a typed question into a priority), `/api/review` (calls Worker A's engine + Worker B's insights and returns the JSON), and `/api/export` (calls Worker B's PowerPoint/PDF generator). It also has a smart fallback: if anything fails, it falls back to `sample_review.json` so our demo can never crash."*

### 4. Judge Questions You Will Answer
- **Q: "How do the dashboard and the PowerPoint stay consistent?"**
  - **Your Answer:** *"Both the website and the PowerPoint exporter read the exact same `review.json` payload returned by `/api/review`. When you click Export on the website, the browser sends the exact `review.json` you are looking at to `/api/export`, so a number on a slide can never disagree with a number on the screen."*

---

# Seat 2: Worker A (Codex A) — Data & Calculation Engine

### 1. Input → Output (In Plain English)
- **What your code is:** The **calculator** (`backend/engine/`) that reads the raw 19-sheet Excel file, checks for data errors, and calculates every operational and sustainability number.
- **Input:** `data/Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx` + user choices (`customer_id`, `period`, `baseline_id`, `sensitivity`, `priority`).
- **Output:** The calculated `review` dictionary (24 metrics with Low/Base/High ranges, 24 site breakdowns, 6 product breakdowns, 12 monthly trends, 3 baseline comparisons, and data-quality flags).

### 2. Your Key Files (Open These & Look Inside)
| File | What It Does |
| :--- | :--- |
| **[`backend/engine/adapters/excel_adapter.py`](../backend/engine/adapters/excel_adapter.py)** | **The only file that touches Excel.** Reads the sheets and converts Excel serial dates (like `45668`) into real dates (`2025-01`). Why is it separate? So in production, Lindström can swap Excel for Tableau or eLindström without changing any math! |
| **[`backend/engine/validate.py`](../backend/engine/validate.py)** | Checks the raw data before calculating: **`DQ1`** checks for blank cells, **`DQ2`** checks for unknown IDs, **`DQ3`** checks site-to-customer mapping, and **`DQ4`** checks if customer shares of a laundry exceed 100%. |
| **[`backend/engine/kpis.py`](../backend/engine/kpis.py)** | Calculates operational numbers: active wearers, allocated garments, utilization rate (`scanned ÷ allocated`), idle garments, wash frequency, on-time cycle rate, median cycle hours, and repair rate. |
| **[`backend/engine/impacts.py`](../backend/engine/impacts.py) & [`sensitivity.py`](../backend/engine/sensitivity.py)** | Calculates water, energy, and CO₂e footprint (using laundry intensity per kg × customer washed kg), savings against the 3 baselines (`Outsourced local laundry`, `Home washing`, `In-house laundry`), repair handprint, and the **Low / Base / High** uncertainty ranges. |
| **[`backend/engine/build_review.py`](../backend/engine/build_review.py)** | Puts it all together and attaches the `formula`, `sources`, `status` badge, and `assumptions` to every single metric. |

### 3. What to Say to Your Team Tomorrow (Your 3-Minute Script)
> *"My part (`backend/engine/`) turns the raw Excel file into verified numbers. First, `excel_adapter.py` loads the sheets, and `validate.py` checks for bad data. In fact, our validator caught two real traps in Lindström's Excel file:*
> 1. *For Swedish laundry `L003` (Malmö), the laundry sheet says the plant washed ~2,500 kg/month, but the customer rows at `L003` add up to ~28,000 kg/month—over 1,000%! Instead of crashing or hiding it, we calculate customer footprint using the laundry's per-kg water/energy intensity (which matches `Customer_Impacts` to within 1%) and flag `L003` as `DQ4`.*
> 2. *In `Service_Activity`, `active_wearers` is listed per product row. Adding them up gives 28,367 in December, which counts a worker wearing both a jacket and trousers twice. So `kpis.py` calculates both `wearer_product_assignments` (28,367) and `wearers_min_est` (12,078, taking the largest product per site).*
>
> *Finally, `impacts.py` and `sensitivity.py` compute the Low/Base/High range (±20% on baseline factors, and 0.5 to 1.0 postponed replacements per repair) so we never show false precision."*

### 4. Judge Questions Worker A Will Answer
- **Q: "How did you calculate water and CO₂e savings when the user switches baselines?"**
  - **Your Answer:** *"Each laundry has a monthly water, energy, and CO₂e intensity per washed kg. Multiplying that by the customer's washed kg gives the allocated service footprint. Then we multiply the customer's washed kg by the selected baseline factor (`9.5 L/kg` for local laundry, `20 L/kg` for home washing, `12.5 L/kg` for in-house) and subtract the service footprint. We verified our formula against all 1,248 rows in `Customer_Impacts` and matched 100% of them."*

---

# Seat 3: Worker B (Codex B) — Insights Engine & PPTX/PDF Exporter

### 1. Input → Output (In Plain English)
- **What your code is:** Two things:
  1. **The Analyst (`backend/insights/`):** Finds outlier sites using strict math rules (`R1–R6`) and turns them into 3–5 readable observations, recommended actions, and steering-committee questions.
  2. **The Publisher (`backend/export/`):** Takes `review.json` and builds a 9-slide PowerPoint (`.pptx`) and 9-page PDF (`.pdf`).

### 2. Your Key Files (Open These & Look Inside)
| File | What It Does |
| :--- | :--- |
| **[`backend/insights/rules.py`](../backend/insights/rules.py)** | Runs 6 deterministic rules on the numbers: **`R1`** finds sites in the lowest 20% of garment utilization; **`R2`** finds sites with repair rate > 1.5× median; **`R3`** finds sites with below-average on-time delivery; **`R4`** finds sites with high service requests per 1,000 wearers; **`R5`** highlights water savings; **`R6`** flags data gaps and `DQ` warnings. |
| **[`backend/insights/llm.py`](../backend/insights/llm.py) & [`generate.py`](../backend/insights/generate.py)** | Sends the rule facts to Gemini (if an API key is set) and **checks every number in the AI's reply**. If the AI invents a single number not in the facts—or if there is no internet—it automatically uses our deterministic template (`render_fact()`). |
| **[`backend/export/content.py`](../backend/export/content.py)** | Builds the exact text and card blocks for the 9 pages so the PowerPoint and the PDF have identical content. |
| **[`backend/export/pptx_export.py`](../backend/export/pptx_export.py) & [`pdf_export.py`](../backend/export/pdf_export.py)** | Draws the 9-slide widescreen PowerPoint and 9-page PDF in Lindström colors (`#E30613` red, `#1E293B` slate), puts the mandatory synthetic disclaimer footer on every page, and **embeds the full `review.json` inside slide 9's speaker notes and as a PDF file attachment** for 100% auditability! |

### 3. What to Say to Your Team Tomorrow (Your 3-Minute Script)
> *"My part covers Stage 3 (Generate Insights) and Stage 4b (Export PowerPoint/PDF). In `backend/insights/rules.py`, we never let an AI guess what is happening in the data. Instead, 6 deterministic rules scan all 24 sites to find real outliers—like which sites are in the bottom 20% for garment use (`R1`) or above 1.5× the median for repairs (`R2`)—and sort them by the customer's industry and chosen priority.*
>
> *Then `llm.py` has a strict anti-hallucination guard: if the LLM writes any number that wasn't in our rule facts, we reject it and fall back to our verified rule templates. And in `backend/export/`, `pptx_export.py` and `pdf_export.py` build a 9-page deck where the full `review.json` source data is embedded right inside the PowerPoint notes and PDF attachments so every claim is traceable."*

### 4. Judge Questions Worker B Will Answer
- **Q: "How do you prevent the AI from hallucinating sustainability claims?"**
  - **Your Answer:** *"First, the AI never sees raw tables or performs math—deterministic rules in `rules.py` compute the exact outlier facts and numbers. Second, `llm.py` extracts every numeric token from the AI's output and verifies that every number exists verbatim in the input facts. If any number is altered or invented, it rejects the LLM response and uses our deterministic template."*

---

# Seat 4: Worker C (Claude Code) — Interactive Website (`frontend/`)

### 1. Input → Output (In Plain English)
- **What your code is:** The **interactive web dashboard** (`frontend/`) where the account manager and customer explore the data live during the meeting.
- **Input:** `review.json` (fetched live from `/api/review`, or loaded from the built-in `frontend/src/data/sample_review.json` if the backend is offline).
- **Output:** 5 interactive views (`Overview`, `Sites`, `Baselines`, `Observations`, `Methodology`) + 2 slide-over inspector drawers (`Show the Calculation` and `Site Drill-Down`) + export buttons.

### 2. Your Key Files (Open These & Look Inside)
| File | What It Does |
| :--- | :--- |
| **[`frontend/src/app/page.tsx`](../frontend/src/app/page.tsx)** | Main layout: top synthetic-data warning banner, left Lindström navigation sidebar, top control bar, active view tab, and the two inspector drawers. |
| **[`frontend/src/lib/useReview.ts`](../frontend/src/lib/useReview.ts) & [`api.ts`](../frontend/src/lib/api.ts)** | Manages the user's selections (`customer_id`, `priority`, `baseline_id`, `sensitivity`, `period`). Calls the FastAPI backend when online, and seamlessly switches to offline mode if the backend isn't running. |
| **[`frontend/src/components/ControlBar.tsx`](../frontend/src/components/ControlBar.tsx)** | Customer dropdown, Priority lens buttons, Baseline selector, `Low / Base / High` sensitivity toggle, free-text prompt bar (with clickable suggested prompt chips), and `Export PPTX / PDF` buttons. |
| **[`frontend/src/components/CalcDrawer.tsx`](../frontend/src/components/CalcDrawer.tsx)** | **"Show the Calculation" drawer:** opens whenever you click any KPI card, showing the Low/Base/High range bar, exact formula, source tables, linked assumptions (`A001–T003`), and status badge. |
| **[`frontend/src/components/views/Sites.tsx`](../frontend/src/components/views/Sites.tsx) & [`SiteDrawer.tsx`](../frontend/src/components/SiteDrawer.tsx)** | Country roll-up cards (Finland, Sweden, Poland), allocation-vs-repair scatter plot, sortable 24-site table with `R1–R4` outlier chips, and the slide-over drawer comparing any clicked site against the customer median. |

### 3. What to Say to Your Team Tomorrow (Your 3-Minute Script)
> *"My part (`frontend/`) is the Next.js dashboard that replaces static slides during the customer meeting. At the top (`ControlBar.tsx`), the KAM selects the customer, baseline, sensitivity (`Low/Base/High`), and priority—or clicks a prompt like 'Which sites have the greatest allocation optimization potential?'.*
>
> *When the priority changes, `Overview.tsx` re-orders the hero KPI cards to match what that stakeholder and industry care about. Every KPI card has an evidence badge (`SYNTHETIC`, `CALCULATED`, `ALLOCATED_ESTIMATE`, `ESTIMATE`) and a visual Low–Base–High range bar. Clicking any card opens `CalcDrawer.tsx` ('Show the Calculation'), which shows the exact formula and assumptions. And in `Sites.tsx`, you can filter by country, see outlier sites on a scatter plot, and click any site to open `SiteDrawer.tsx` to compare it against the customer average."*

### 4. Judge Questions Worker C Will Answer
- **Q: "How does a KAM tailor the discussion for different stakeholders (e.g., Sustainability vs. Operations vs. Procurement)?"**
  - **Your Answer:** *"They can either click one of the 6 priority lenses in the top bar (`Water`, `Emissions`, `Cost`, `Circularity`, `Service`, `Improvement`) or type a natural-language question into the prompt bar. The dashboard immediately re-ranks both the hero KPI cards and the observations to put that stakeholder's metrics first, while keeping the industry context visible."*
