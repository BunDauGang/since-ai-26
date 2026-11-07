# Demo script: from data to a trusted customer conversation

**3 minutes · NorthStar Foods Group · synthetic 2025 data · base case vs outsourced local laundry**

Each scene has **SAY** (read aloud, about 430 words, under 3 minutes) and **DO** (clicks for the person driving the screen). Every number below was checked against the running product on the default settings.

---

## Before you start (5 minutes before)

1. Backend running (`uvicorn backend.api.main:app --port 8000`) and dashboard running (`cd frontend && npm start`).
2. Open http://localhost:3000. The sidebar must say **Live engine (FastAPI)** (green dot).
3. Start a clean meeting: open the browser console and run `localStorage.clear()`, then hard refresh (Cmd+Shift+R).
4. Leave the Sensitivity case on **Base** and the baseline on **Outsourced local laundry**.
5. Optional: with a Gemini key in `.env`, test **Polish wording with AI** once. If Google is busy, the product shows the templates with an honest note; the demo does not depend on it.

---

## Scene 1: The problem (0:00–0:20)

**SAY:**
"Meet Laura, a Key Account Manager at Lindström. Tomorrow she has a one-hour steering committee with NorthStar Foods Group: 24 sites in three countries. Her data sits in operations, repairs and sustainability reports, and her customer has no time for a wall of KPIs. She needs a story she can trust."

**DO:** Show the **Customer meeting** home screen, step 1 (Welcome): customer name, 24 sites, 9,607+ wearers, the 60-minute agenda.

---

## Scene 2: Prepare for whoever is in the room (0:20–0:55)

**SAY:**
"This time Laura meets the Head of Procurement. She types the role, and the platform picks the closest story: value for money, stock and contract terms. Meeting Prep AI then answers the five questions a steering committee must answer, from the review's own evidence. The AI may only choose wording; every number comes from the data, and if a question can't be answered, it says so instead of guessing."

**DO:**
1. Click **Meeting prep AI** (top right).
2. In "Who are you meeting?" type `Head of Procurement` and click **Use**. It shows "closest story is the CFO story".
3. Scroll through the 5 answers. Point at the badges (**Answer ready / Answer with caveats / Ask the customer**) and the amber "Still open" lines.
4. Optional: click **Polish wording with AI** and point at the ✨ framing lines.
5. Close the drawer.

---

## Scene 3: The year, and what changed since last time (0:55–1:25)

**SAY:**
"In the meeting, Laura starts with the big picture for this audience. Fifteen thousand repairs postponed garment purchases, 83.5% of garments are in circulation, and 98.3% of laundry cycles came back on time. And because this is a steering committee, she shows what changed since the last one: on-time delivery held steady, repairs per thousand washes improved slightly, and garments in circulation dipped from 84.4 to 83.5%. That's the honest conversation starter."

**DO:**
1. Click step **2 (The year)**. The four big numbers lead with the CFO story.
2. Scroll to **Since the last steering committee** (last meeting: Jun 25). Point at the arrows: on-time stable, repairs better, garments in circulation worse.
3. Click any big number, for example **83.5%**, to show **Show the calculation** (formula, source, range), then close it.

---

## Scene 4: Agreement, priorities and peers (1:25–1:55)

**SAY:**
"Next, the agreement: three of five service KPIs are on target, and the customer ranks their priorities for the next year: cost first, then service reliability. Then the peer review. Against a pan-European and a Nordic rental competitor, a local laundry and washing in-house, Lindström leads on all six measurable comparisons, and it's the only provider here that repairs and tracks every garment. The competitor figures are clearly marked as illustrative."

**DO:**
1. Click step **3 (Agreement)**: "3 of 5 service KPIs on target".
2. At the bottom, click **Cost**, then **Service reliability** (rank numbers 1 and 2 appear).
3. Click step **4 (Peers)**: the competitor table, then the **Why Lindström stands out** cards. Point at the "MOCK COMPETITOR DATA" label.

---

## Scene 5: Value in euros, only at agreed prices (1:55–2:20)

**SAY:**
"The CFO asks what it's worth in euros. Laura doesn't show a number until they agree the prices together: water, energy and the cost of a replacement garment. Then the rough calculation appears, clearly labelled as a rough calculation and not a quote. It excludes the service fee and the customer's own staff time, so it's a conversation starter, not a promise."

**DO:**
1. Click step **5 (Rough calc)**. Point out: "No euro value yet".
2. Click **We agree these prices: calculate**. At the example prices it shows roughly **€356,597 a year**, with a range and the **ROUGH CALCULATION · KAM ASSUMPTIONS · NOT A QUOTE** label.

---

## Scene 6: Decisions, commitments and the deck (2:20–2:50)

**SAY:**
"Finally, decisions. Laura brings back last meeting's commitments: one is overdue, so it goes straight to the steering committee for a new owner or date. She ticks today's agreed action with its owner and downloads the customer deck: the meeting story, the agreed KPIs, the rough calculation and the next steps. In Customer view, her internal prep tools disappear, so she can share her screen safely."

**DO:**
1. Click step **6 (Next steps)**, then **Load an example previous meeting (demo)**. A red box shows "Needs a steering decision: 1 overdue commitment".
2. Tick the first action under **Today's actions**.
3. Click **Download for customer (PPTX)**. Open the file and show slides 1–6 (title → executive summary → agreement → peers → rough calculation → agreed next steps).
4. Click **Customer view** at the top: the Meeting prep AI button disappears.

---

## Close (2:50–3:00)

**SAY:**
"Laura walks in prepared for anyone in the room, with numbers she can defend and a clear next step. We don't just turn data into a report: we turn it into a conversation the customer can trust."

---

## If something goes wrong

| Problem | What to do or say |
|---|---|
| Sidebar says "Bundled sample review.json" | The backend is down. The demo still works on the sample, but "Since the last steering committee" uses monthly totals only. Restart the backend if there's time. |
| "AI wording not available (…)" | Say: "The AI is optional; the answers come from the evidence either way." Continue. |
| Download doesn't start | Use the **PDF** button, or open a ready-made deck from `deliverables/`. |
| Old meeting data shows up (euro value already visible, actions ticked) | `localStorage.clear()` in the console, then hard refresh. |

## Likely judge questions (short answers)

- **"Is the AI making up numbers?"** No. It can only pick approved, number-free sentences; numbers are filled in from the engine's review, and unmatched questions get "I won't guess".
- **"Are the competitor numbers real?"** No. They're anonymised archetypes. Local and in-house figures come from the data pack's baselines; the rest is marked mock and would be replaced by market data.
- **"Is €356,597 a saving?"** No. It's a rough value at prices the customer agrees, excluding the service fee; every euro line shows its assumption.
- **"Where does 'since the last meeting' come from?"** The engine recalculates both periods (Jan–Jun and Jul–Dec 2025) from the data pack.
- **"How would this go to production?"** The engine reads through a swappable adapter (Excel today; Tableau, WWS and eLindström later), and every part talks through one shared data contract (`contracts/review.schema.json`).

> All figures are synthetic and illustrative. Nothing here is an audited or approved Lindström or customer claim.
