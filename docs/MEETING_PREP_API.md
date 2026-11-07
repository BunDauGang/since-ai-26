# Meeting Prep AI: frontend and API handoff

`POST /api/prep` prepares a KAM conversation without changing the existing six-step customer meeting. The rule is **AI selects evidence; the application displays the numbers**. Quang owns the frontend panel; this endpoint supplies its preparation data.

The panel is intended for KAM use. `kam_only: true` is a presentation hint, not authentication, authorisation or protection of confidential data. Do not treat the freely entered audience role as an access-control role.

## Request

Supply either the full review already displayed by the dashboard, or the normal review-selection fields. A supplied review avoids recalculation and retains the dashboard's metric values. Explicit selection fields must agree with a supplied review; default selection values do not relabel it.

```json
{
  "customer_id": "CUST001",
  "period_from": "2025-01",
  "period_to": "2025-12",
  "baseline_id": "B_LOCAL",
  "sensitivity": "base",
  "audience_role": "Head of Procurement",
  "goal": "Prepare for a renewal discussion about allocation and service value",
  "minutes": 15,
  "use_llm": false
}
```

For a displayed review, replace the selection fields with `"review": currentReview`. The preferred free-text field is `audience_role`; `audience` is accepted as an input alias.

| Field | Purpose and limits |
| --- | --- |
| `audience_role` | Free-text title, such as Head of Procurement; nonblank, at most 120 characters. Mapped to an existing persona and priority lens. |
| `goal` | KAM meeting goal, at most 2,000 characters. It is context, not a factual claim or an instruction to override validation. |
| `minutes` | Integer from 1 to 120. A KAM preference, not operational evidence. |
| `questions` | Optional custom question strings, at most 10, each nonblank and at most 1,000 characters. Omission or an empty list uses the default five below. |
| `review` | Optional complete current review, validated against the shared review contract and finite-number checks. |
| `previous_review` | Optional complete earlier review for the same customer. Comparability is checked before any change is calculated. |
| `customer_priorities` | Optional KAM-input strings, at most 10, each nonblank and at most 500 characters. Missing priorities remain a data gap. |
| `previous_actions` | Optional KAM-recorded action objects, at most 50; format below. Recorded status does not prove an action caused a KPI change. |
| `use_llm` | Optional wording/evidence selection. `false` runs deterministically; a missing key, timeout or rejected model result uses the same offline fallback. |

Action format:

```json
{
  "id": "allocation-investigation",
  "text": "Confirm site buffer requirements before reallocation",
  "status": "in_progress",
  "owner": "Customer site operations",
  "due_date": "2026-12-01"
}
```

`id`, `text` and `status` are required. IDs are unique within the request, nonblank and at most 80 characters; text is nonblank and at most 1,000 characters. Status is exactly one of `open`, `in_progress`, `completed`, `blocked`, `deferred`. `owner` is optional text of at most 120 characters and `due_date` is an optional ISO date. These records are labelled **KAM input**, not engine-measured progress.

Unknown canonical request fields are rejected, helping catch frontend spelling or shape errors. The existing frontend compatibility shape below is also explicitly supported; its template/comparison summaries do not become evidence.

## Default steering questions

When no custom questions are supplied, the endpoint prepares these topics:

1. What has changed since the previous review?
2. What matters most to this customer?
3. What progress was recorded on the previous actions?
4. What value does the review show against the selected alternative?
5. Which actions and decisions should we agree next?

Missing prior-period data, stated priorities or action records produce an honest `data_gap` answer. An unfamiliar custom question also remains a gap when the supplied evidence cannot answer it. It must not be given a confident answer just because a metric exists.

## Canonical response contract

The standalone response schema is [`contracts/prep.schema.json`](../contracts/prep.schema.json). It accepts either the canonical response described here or the frontend compatibility envelope described below. Neither renames or removes required `review.json` fields.

| Field | Frontend use |
| --- | --- |
| `schema_version` | Response contract version, currently `1.0`. |
| `kam_only` | KAM-panel visibility hint. |
| `audience_role` | The KAM's entered title. |
| `audience_mapping` | Bounded `persona`, `priority`, ordered `emphasized_metric_ids`, mapping `source`, and explanation `reason`. Confirm the chosen lens visibly; do not change review numbers. |
| `answers` | Ordered answers with `question_id`, original `question`, classified `kind`, number-free `text`, `readiness`, references and `limitations`. |
| `talk_track` | An `opening`, evidence-linked `points`, and an `ask`. |
| `likely_objections` | Likely customer questions with grounded, evidence-linked responses. |
| `do_not_say` | Deterministic communication limits, such as avoiding promised financial savings or synthetic competitor claims. |
| `evidence_catalog` | Immutable metric, observation and context facts. Build evidence chips and figures from this catalog, not from AI prose. |
| `context_status` | Availability/comparability of optional prior-period, priority and action context. |
| `review_meta` | Metadata identifying the current customer, period, baseline and sensitivity. |
| `source`, `fallback_reason` | Whether the response used accepted Gemini selection or the template. Fallback reasons are `disabled`, `missing_key`, `no_evidence`, `timeout`, `provider_error`, or `invalid_model_output`; accepted model output has `null`. |
| `goal`, `minutes` | Echoed KAM preferences. They are not claims about operational performance. |

Every answer and talk-track point references `metric_ids`, `observation_ids`, `context_ids` and `evidence_ids`. The latter use explicit namespaces: `metric:<id>`, `observation:<id>` and `context:<id>`.

**Resolve the returned catalog, not incoming observation IDs.** Observation facts are regenerated deterministically without a network call, because incoming review narratives may contain stale numbers. Their IDs/order can therefore differ from `review.observations`. Metric entries are exact source copies except that the internal financial metric `idle_value_eur` is excluded from preparation. Its exclusion does not turn other indicators into proof of financial saving. Never invent a number when a referenced item is absent.

Readiness is `evidence`, `caveat`, or `data_gap`. “Evidence” means that the supplied records support the limited answer; it does not turn synthetic source data into real or approved customer claims.

## Safe rendering and number handling

- Render preparation text as plain text. Do not interpret model text as HTML, executable instructions or a number template.
- Render values separately from `evidence_catalog.metrics[id]`, retaining units, low/base/high range, status, formula, sources, assumptions and confidence.
- Observation IDs and other references legitimately contain digits. Validate IDs against the explicit catalog separately from the prohibition on numeric model prose.
- The model may select only allowed evidence and approved phrasing. An invalid ID, invented number, unsupported wording, malformed response or partial response rejects the entire model result and uses the deterministic fallback.
- `None`/omission and an empty list have different context states: `missing` means no source was supplied; `empty` means an empty KAM record was supplied; `available` means usable entries were supplied. Neither missing nor empty records prove that the customer has no priorities or that no actions exist. Display the state and the requested source instead.
- For comparisons, show the actual prior/current periods. Reviews must belong to the same customer; a cross-customer `previous_review` is rejected. The earlier period must not overlap the current period and must contain the same number of months. Baseline and sensitivity must match. Metric ID, unit, category and formula rule must also match; the varying ` | Live arithmetic` suffix is ignored when comparing the formula rule.
- Comparable metrics produce `comparison.<metric_id>` facts with `current_value`, `previous_value`, `absolute_change`, `percentage_point_change`, `relative_change_pct`, periods, source statuses and both full metric records. `absolute_change` is current minus previous. Ratios show percentage-point changes and omit relative percent changes. Other metrics have a relative percent change only when the previous value is positive; zero and negative prior values return `null` for that field. Incompatible metrics are excluded and identified in `excluded_metric_ids`; incompatible periods produce `not_comparable` context rather than invented deltas.
- A recorded completed action and an improved metric are separate facts, not proof of causation.

The model receives descriptors, available IDs, approved wording and availability states, plus the bounded audience/goal/question preferences. **Source metric values, comparison deltas and action counts are not sent to Gemini.** The workbook, full observation narratives, arbitrary internal meeting notes and complete reviews are also excluded. The supplied meeting duration is a KAM preference, not a source metric.

No live Gemini connection is required for the demo. Unrecognised audience titles default transparently to CEO/improvement, while an explicit recognised goal can change the priority lens. The KAM can correct the mapping. An accepted AI result may choose another bounded existing persona/lens and available evidence IDs; it never changes the catalog.

## Existing MeetingPrepAI frontend compatibility

The current `frontend/src/lib/prep.ts` caller already sends object questions, a local template and a context wrapper. It does not have to be rewritten to use the endpoint:

```ts
const request = {
  review: currentReview,
  audience: "Head of Procurement",
  questions: [{ id: "q1", text: "What outcomes have changed since the last steering committee?" }],
  template: localTemplate,
  context: {
    priorities: meeting.priorities,
    previous_actions: meeting.previousActions,
    comparison: localComparison.items,
  },
};
```

- Object questions retain their original unique IDs in frontend answers; IDs inside the nested canonical `prep` remain `Q1`, `Q2`, and so on. Question lists must be homogeneous: use all strings or all `{id, text}` objects, never a mixture.
- `context.priorities` is KAM-entered priority data. `context.previous_actions` accepts the frontend's `done` status as `completed`, and its `due` date alias as `due_date`; empty owner/date strings are omitted. Other action validation and provenance rules still apply. Do not also supply the corresponding canonical `customer_priorities` or `previous_actions` field: conflicting duplicate sources are rejected as ambiguous, rather than silently choosing one.
- `template` is accepted only for transport compatibility. Its prose, figures and action claims are not trusted as evidence or forwarded to Gemini. The backend never replays a submitted template as a validated answer.
- `context.comparison` summaries are untrusted browser calculations, not full earlier review snapshots. They are not used to manufacture period-change facts. Supply a valid canonical `previous_review` to support server-side comparison; otherwise the canonical comparison remains a gap.

The existing caller currently omits `goal`, `minutes` and `use_llm`; server defaults apply until those UI controls are connected. The endpoint supports explicit values in either request shape.

The compatibility response is a separate envelope:

```ts
type ExistingUiAnswer = {
  question_id: string;
  answer: string;
  points?: { text: string; metric_ids?: string[] }[];
  gap?: string | null;
};
type FrontendPrepEnvelope = {
  answers: ExistingUiAnswer[];
  source: "template" | "gemini";
  fallback_reason: string | null;
  prep: PrepResponse; // the complete canonical result and its evidence catalog
};
```

For template/offline output, invalid model output or provider failure, top-level `answers` is empty. The existing UI then keeps its richer local fallback. The canonical result, explicit gaps and evidence remain available under `prep`. Accepted Gemini output populates only evidence-backed answers; canonical `data_gap` answers are omitted from the compatibility replacement list because the old UI retains its local readiness badge.

Canonical `text` never contains numeric substitution templates. Only the compatibility adapter may construct known `{{metric_id}}` tokens from validated, server-selected current metric IDs. These tokens are not free-form model output. The existing frontend resolves them from its review; an unknown token or raw digit outside a token is rejected by that frontend. Metric IDs themselves may legitimately contain digits.

**Selected-case caveat:** the current frontend token filler formats a metric's base value by default. Compatibility replacements must not imply that such a token is a low/high value. This adapter emits tokens only for base-case reviews; non-base replacements use safe prose without tokens. The canonical evidence catalog always retains every case for a newer renderer.

Frontend follow-up: propagate canonical readiness when moving to the canonical response, and resolve regenerated observations through `prep.evidence_catalog`. The compatibility adapter deliberately avoids replacing a local answer with a canonical data gap, but KAM-input action statuses still do not prove completion or causal improvement.

## Typed frontend integration sketch

This is a handoff example, not an implementation of the frontend panel. The existing customer meeting remains unchanged.

```ts
import type { Metric, Observation, Review } from "./types";

type PrepRefs = {
  metric_ids: string[];
  observation_ids: string[];
  context_ids: string[];
  evidence_ids: string[];
};
type PrepClaim = PrepRefs & { text: string };
type PrepResponse = {
  schema_version: "1.0";
  kam_only: true;
  audience_role: string;
  audience_mapping: {
    persona: "ceo" | "cfo" | "operations" | "sustainability";
    priority: "water" | "emissions" | "cost" | "circularity" | "service" | "improvement";
    emphasized_metric_ids: string[];
    source: "template" | "gemini";
    reason: string;
  };
  answers: (PrepClaim & {
    question_id: string;
    question: string;
    kind: string;
    readiness: "evidence" | "caveat" | "data_gap";
    limitations: string[];
  })[];
  talk_track: { opening: string; points: PrepClaim[]; ask: string };
  likely_objections: (PrepClaim & { question: string; readiness: string })[];
  do_not_say: string[];
  evidence_catalog: {
    metrics: Record<string, Metric>;
    observations: Record<string, Observation>;
    context: Record<string, Record<string, unknown>>;
  };
  context_status: Record<string, unknown>;
  review_meta: Review["meta"];
  source: "template" | "gemini";
  fallback_reason: string | null;
};

async function prepareMeeting(apiUrl: string, review: Review): Promise<PrepResponse> {
  const response = await fetch(`${apiUrl}/api/prep`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      review,
      audience_role: "Head of Procurement",
      goal: "Discuss allocation and renewal",
      minutes: 15,
      questions: [],
      // Omit these until the KAM supplies them; do not silently substitute [].
      // previous_review: earlierReview,
      // customer_priorities: statedPriorities,
      // previous_actions: recordedActions,
      use_llm: false,
    }),
  });
  if (!response.ok) {
    // Surface the API validation/calculation error; do not relabel another customer's sample.
    throw new Error(`Meeting preparation failed: ${response.status}`);
  }
  return response.json() as Promise<PrepResponse>;
}
// Render answer.text as plain text. Build separate evidence chips from
// prep.evidence_catalog.metrics[id] or prep.evidence_catalog.observations[id].
```

For a local smoke test, save the request example above as `prep-request.json`, start the existing API, and run:

```sh
curl -sS http://localhost:8000/api/prep \
  -H "Content-Type: application/json" \
  --data-binary @prep-request.json
python -m pytest backend/tests
```

A selection-based request reuses the API's deterministic review computation/cache. Preparation and KAM context are not cached across requests. Errors in requested customer/period calculations remain errors; invalid submitted reviews/context return validation errors rather than unhandled server failures.
