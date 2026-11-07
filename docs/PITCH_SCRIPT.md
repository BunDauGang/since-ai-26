# Pitch & Demo Script (3-Minute Stage Flow)

> **Deliverable D5.** Weighted to the judging criteria: Customer Value 25%, Completeness 20%, Credibility 20%, Data Logic 15%, Dynamic Usability 10%, Scalability 10%.
>
> **Every number below was checked against the live engine** (`CUST001`, full year 2025, baseline `B_LOCAL`, Base case). If you change the data pack, re-check them in the dashboard before you present. Never quote a number the screen does not show.

---

## 1. The 3-Minute Pitch & Live Demo

### 0:00 – 0:25 | The problem (Customer & Business Value)
- *"Once a year, a Lindström Key Account Manager sits down with a customer like NorthStar Foods Group: 24 sites in Finland, Sweden and Poland. The customer asks three questions: **What value did we get? How does this compare with the alternative? What should we improve next year?**"*
- *"Today the answers are spread across laundry, scan, repair and sustainability reports. And the KAM's biggest fear is saying a number in that meeting that later turns out to be wrong."*

### 0:25 – 1:05 | Demo 1: the story in one screen (Value 25% + Usability 10%)
- **Screen:** Executive overview, NorthStar, priority **Water**, baseline **Outsourced local laundry**.
- **Say:**
  1. *"The screen tells one story, not 24 charts: **what happened, why it matters, and the next action.**"* (point at the 3-column strip)
  2. *"What happened: **1.41 million litres** of water saved against outsourced local laundry. Notice it is a **range, 0.45 to 2.36 million**, and labelled an allocated estimate. We never show only the biggest number."*
  3. **Switch the lens to Cost**: *"The same data now answers a manufacturing-style question: **83.5%** of allocated garments are in active use, and **5,230** are idle."*
  4. **Type in the prompt box:** `How are our Swedish production plants doing on water?` *"Plain language works: it picks the Water lens and the scope (Swedish production plants), and the site views filter to them. KPIs stay customer totals, and the screen says so."*

### 1:05 – 1:40 | Demo 2: every number can be proven (Credibility 20% + Data Logic 15%)
- **Click the Water saving card** → *Show the calculation*:
  - *"Step by step with NorthStar's own numbers: 502,075 kg washed, times 9.5 litres per kg for local laundry, minus what Lindström's laundries actually used. The browser re-plays the formula and only shows this ✓ when it matches the engine exactly."*
  - *"The range is not decoration: the baseline factors are tested at ±20%, and the drawer says so. In everyday terms that is the household water of about 32 people for a year."*
- **Point at the amber DQ4 pill on the Swedish sites:** *"We also found an error in the data pack. The Malmö laundry reports about **2,500 kg** a month, but customer rows add up to about **28,000 kg**, over **1,000%**. The warning sits on exactly the 6 affected sites and on every number they influence. And 28,367 'active wearers' double-counts people with several garments: the real minimum is **9,607**."*

### 1:40 – 2:25 | Demo 3: meeting prep and 2026 decisions (Value 25%)
- **Open Meeting prep:**
  1. **Talking points:** *"This is what the KAM can safely say. Each sentence is built from the data and phrased with the **Low case**, so it stays true: 'at least 453 m³ less fresh water than local laundry'. Numbers with a data-quality issue get their caveat written in, and things like '€ saved' or 'verified CO₂ reduction' are on a **never say** list."*
  2. **2026 what-if:** move the slider to 50%. *"What if we reclaim half the idle garments at the five low-use sites? **719 garments**, and utilisation goes from **83.5% to 85.5%**. Closing half the gap to the median repair rate at 12 sites means about **265 fewer repairs**. Clearly labelled as a scenario, with the assumptions listed."*
  3. *"Five rule-based observations, each with an owner and a steering-committee question."*
- **Toggle Customer view:** *"The same screen without the KAM-internal parts: a preview of a decision-maker module in eLindström."*

### 2:25 – 2:45 | Demo 4: the customer-ready deck (Completeness 20%)
- **Click Download PPTX** and open it:
  - *"One click gives a 9-slide steering-committee deck from the exact same review.json. Slide 1 tells the same story; charts show the baseline comparison with its range; every slide carries the synthetic-data footer."*

### 2:45 – 3:00 | Path to production (Scalability 10%)
- **Methodology → integration diagram:** *"Only one file reads Excel. Swap that adapter for Tableau, WWS Washed Kg and eLindström, and the engine, dashboard and deck stay the same. Each future source on this diagram shows which data gap it closes."*
- **Close:** *"Most tools show big numbers. Ours tells a KAM which numbers are safe to say, proves every one, and turns outliers into next year's plan."*

---

## 2. Design choices to defend (judge Q&A)

| Question | Answer |
|---|---|
| "Where is the AI?" | AI never calculates or invents a number. Deterministic rules (R1–R6) find the facts; the wording layer can use Gemini (`backend/insights/llm.py`) and is rejected if it adds any number. Without a key, the same facts render from templates. The prompt box maps plain language to a priority and a site scope. |
| "Why a range instead of one number?" | The pack gives one factor per baseline. We test ±20% (T002) and a 0.5 repair factor (T001), and lead with Base. Judges asked us not to oversell savings. |
| "How do you know the maths is right?" | The engine reproduces Lindström's reference values (water 1,406,620 L, CO₂e 255,074 kg, 15,233 repairs). 177 automated tests. The dashboard's step-by-step view only shows ✓ when it matches the engine. |
| "What about bad data?" | DQ1–DQ5 checks run on every load, nothing is deleted. L003 is flagged where it matters; missing site data is shown as missing, not zero. |
| "Is the cost number a saving?" | No. Idle stock value is illustrative capital (T003), hidden in the customer view, and listed under "never say". |
| "How does it scale?" | One adapter per source; one versioned review.json contract; customer view as the eLindström module preview. Data gaps are mapped to future Lindström sources in DATA_READINESS.md. |

## 3. Pre-pitch checklist
- [ ] API running with the Excel pack in `data/` (sidebar shows "Live engine (FastAPI)"). Without it the dashboard still runs on the bundled sample.
- [ ] Check the numbers above against the screen once on the demo laptop.
- [ ] Keep an exported `.pptx` and `.pdf` open in case the network fails.
- [ ] Record a 2-minute screen capture as a fallback.
- [ ] Reset the what-if sliders and the audience toggle (KAM view) before you start.
