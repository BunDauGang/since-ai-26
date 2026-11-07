"""Bounded transport contract for KAM meeting preparation.

The insights helper owns evidence and wording. This router reuses the existing
review resolver, never caches meeting context, and does not imply authentication.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import date
import re
from typing import Annotated, Callable, Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, StrictBool, StrictInt, StringConstraints, field_validator, model_validator

Nonblank = Annotated[str, StringConstraints(strict=True, strip_whitespace=True, min_length=1)]
Month = Annotated[str, StringConstraints(strict=True, pattern=r'^\d{4}-(0[1-9]|1[0-2])$')]


class PreviousAction(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: Annotated[Nonblank, Field(max_length=80)]
    text: Annotated[Nonblank, Field(max_length=1000)]
    status: Literal['open', 'in_progress', 'completed', 'blocked', 'deferred']
    owner: Annotated[str, StringConstraints(strict=True, strip_whitespace=True, max_length=120)] | None = None
    due_date: Annotated[str, StringConstraints(strict=True, pattern=r'^\d{4}-\d{2}-\d{2}$')] | None = None

    @field_validator('due_date')
    @classmethod
    def valid_date(cls, value):
        if value is not None:
            date.fromisoformat(value)
        return value


class FrontendQuestion(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: Annotated[Nonblank, Field(max_length=80)]
    text: Annotated[Nonblank, Field(max_length=1000)]


class FrontendTemplatePoint(BaseModel):
    model_config = ConfigDict(extra='forbid')
    text: Annotated[str, StringConstraints(strict=True, max_length=4000)]
    metric_ids: Annotated[list[Annotated[Nonblank, Field(max_length=120)]], Field(max_length=50)] = Field(default_factory=list)


class FrontendTemplateAnswer(BaseModel):
    model_config = ConfigDict(extra='forbid')
    question_id: Annotated[Nonblank, Field(max_length=80)]
    answer: Annotated[str, StringConstraints(strict=True, max_length=4000)]
    points: Annotated[list[FrontendTemplatePoint], Field(max_length=100)] = Field(default_factory=list)
    gap: Annotated[str, StringConstraints(strict=True, max_length=4000)] | None = None


class FrontendAction(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: Annotated[Nonblank, Field(max_length=80)]
    text: Annotated[Nonblank, Field(max_length=1000)]
    status: Literal['open', 'in_progress', 'done', 'completed', 'blocked', 'deferred']
    owner: Annotated[str, StringConstraints(strict=True, strip_whitespace=True, max_length=120)] | None = None
    due: Annotated[str, StringConstraints(strict=True, strip_whitespace=True, max_length=10)] | None = None

    @field_validator('due')
    @classmethod
    def valid_due(cls, value):
        if value:
            if date.fromisoformat(value).isoformat() != value:
                raise ValueError('due must use ISO YYYY-MM-DD')
        return value

    def canonical(self):
        result = dict(id=self.id, text=self.text, status='completed' if self.status == 'done' else self.status)
        if self.owner:
            result['owner'] = self.owner
        if self.due:
            result['due_date'] = self.due
        return result


class FrontendComparison(BaseModel):
    """Bounded client summary, never a reviewed snapshot or model evidence."""
    model_config = ConfigDict(extra='forbid')
    id: Annotated[Nonblank, Field(max_length=120)]
    label: Annotated[Nonblank, Field(max_length=200)]
    before: Annotated[float, Field(strict=True, allow_inf_nan=False)] | None
    after: Annotated[float, Field(strict=True, allow_inf_nan=False)] | None
    unit: Literal['ratio', 'hours', 'rate', 'kg', 'L', 'kgCO2e', 'count']
    better: Literal['higher', 'lower'] | None
    perMonth: StrictBool


class FrontendContext(BaseModel):
    model_config = ConfigDict(extra='forbid')
    priorities: Annotated[list[Annotated[Nonblank, Field(max_length=500)]], Field(max_length=10)] | None = None
    previous_actions: Annotated[list[FrontendAction], Field(max_length=50)] | None = None
    comparison: Annotated[list[FrontendComparison], Field(max_length=100)] | None = None


class PrepRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    customer_id: Annotated[Nonblank, Field(max_length=100)] = 'CUST001'
    period_from: Month = '2025-01'
    period_to: Month = '2025-12'
    baseline_id: Literal['B_LOCAL', 'B_HOME', 'B_INHOUSE'] = 'B_LOCAL'
    sensitivity: Literal['low', 'base', 'high'] = 'base'
    priority: Literal['water', 'emissions', 'cost', 'circularity', 'service', 'improvement'] | None = None
    review: dict | None = None
    audience_role: Annotated[Nonblank, Field(max_length=120)] = Field(default='CEO', validation_alias=AliasChoices('audience_role', 'audience'))
    goal: Annotated[str, StringConstraints(strict=True, strip_whitespace=True, max_length=2000)] = ''
    minutes: Annotated[StrictInt, Field(ge=1, le=120)] = 15
    questions: Annotated[list[Annotated[Nonblank, Field(max_length=1000)] | FrontendQuestion], Field(max_length=10)] | None = None
    template: Annotated[list[FrontendTemplateAnswer], Field(max_length=10)] | None = None
    context: FrontendContext | None = None
    previous_review: dict | None = None
    customer_priorities: Annotated[list[Annotated[Nonblank, Field(max_length=500)]], Field(max_length=10)] | None = None
    previous_actions: Annotated[list[PreviousAction], Field(max_length=50)] | None = None
    use_llm: StrictBool = True

    @model_validator(mode='after')
    def validate_context(self):
        if self.period_from > self.period_to:
            raise ValueError('period_from must not exceed period_to')
        if self.questions:
            objects = [isinstance(q, FrontendQuestion) for q in self.questions]
            if any(objects) and not all(objects):
                raise ValueError('questions must be all strings or all id/text objects')
            if all(objects):
                ids = [q.id for q in self.questions]
                if len(ids) != len(set(ids)):
                    raise ValueError('questions must have unique IDs')
        if self.context is not None:
            if self.customer_priorities is not None and self.context.priorities is not None:
                raise ValueError('Choose customer_priorities or context.priorities, not both')
            if self.previous_actions is not None and self.context.previous_actions is not None:
                raise ValueError('Choose previous_actions or context.previous_actions, not both')
            if self.context.previous_actions is not None:
                ids = [a.id for a in self.context.previous_actions]
                if len(ids) != len(set(ids)):
                    raise ValueError('context.previous_actions must have unique IDs')
        if self.previous_actions is not None:
            ids = [a.id for a in self.previous_actions]
            if len(ids) != len(set(ids)):
                raise ValueError('previous_actions must have unique IDs')
        return self


def _generate_prep(**kwargs):
    # Lazy import keeps the API independent of helper import order.
    from backend.insights.prep import generate_prep
    return generate_prep(**kwargs)


def _check_explicit_selection(req: PrepRequest):
    """A direct review wins over defaults; contradictory explicit selectors do not."""
    meta = req.review.get('meta')
    if not isinstance(meta, dict):
        raise ValueError('review.meta must be an object')
    period = meta.get('period') if isinstance(meta.get('period'), dict) else {}
    values = dict(customer_id=meta.get('customer_id'), baseline_id=meta.get('baseline_id'),
                  sensitivity=meta.get('sensitivity'), priority=meta.get('priority'),
                  period_from=period.get('from'), period_to=period.get('to'))
    for field, expected in values.items():
        if field in req.model_fields_set and getattr(req, field) is not None and getattr(req, field) != expected:
            raise ValueError(f'{field} conflicts with supplied review metadata')


_SAFE_METRIC = re.compile(r'^[a-z0-9_]+$')


def _frontend_response(result, question_ids):
    """Only validated Gemini wording replaces local templates in the current UI.

    The current client labels replacements as AI and keeps local readiness. Keep
    its offline template intact on fallback, and never upgrade data-gap answers.
    Only the frontend may fill numeric metric placeholders from its review.
    """
    compatible = []
    if result.get('source') == 'gemini':
        catalog = result.get('evidence_catalog', {})
        metrics = catalog.get('metrics', {})
        observations = catalog.get('observations', {})
        base_case = result.get('review_meta', {}).get('sensitivity') == 'base'
        for original_id, answer in zip(question_ids, result.get('answers', [])):
            if answer.get('readiness') == 'data_gap':
                continue
            refs = list(answer.get('metric_ids', []))
            for oid in answer.get('observation_ids', []):
                refs.extend(observations.get(oid, {}).get('metric_ids', []))
            refs = list(dict.fromkeys(key for key in refs if key in metrics and _SAFE_METRIC.fullmatch(key)))
            points = [dict(text='Linked review indicator: {{' + key + '}}.' if base_case else
                           'See the linked indicator and selected sensitivity case in the dashboard.', metric_ids=[key])
                      for key in refs[:4]]
            # A nonempty safe point prevents the UI restoring client-authored
            # numerical template points after accepting this server answer.
            if not points:
                points = [dict(text='Use the linked context and confirm its limitations with the customer.', metric_ids=[])]
            limitations = answer.get('limitations', [])
            gap = ' '.join(limitations)
            if re.search(r'\d', gap):
                gap = 'Confirm the missing source and its limitations with the customer.'
            compatible.append(dict(question_id=original_id, answer=answer['text'], points=points, gap=gap))
    return dict(answers=compatible, source=result['source'], fallback_reason=result.get('fallback_reason'), prep=result)


def create_prep_router(resolve_review: Callable[[dict], tuple[dict, dict[str, str]]]) -> APIRouter:
    router = APIRouter()

    @router.post('/api/prep', summary='Prepare an evidence-linked KAM conversation',
                 description='KAM-only presentation data; kam_only is a UI hint, not authentication or authorisation. '
                             'Use an exact review snapshot or review-selection parameters. Missing prior context remains a data gap.')
    def prepare_meeting(req: PrepRequest) -> JSONResponse:
        headers = {}
        try:
            if req.review is not None:
                _check_explicit_selection(req)
                review = deepcopy(req.review)
                headers['X-Review-Source'] = 'provided'
            else:
                selection = req.model_dump(include={'customer_id', 'period_from', 'period_to', 'baseline_id', 'sensitivity', 'priority'})
                # Preparing wording must not trigger a second model call in observations.
                selection['use_llm'] = False
                review, headers = resolve_review(selection)
            object_questions = bool(req.questions) and isinstance(req.questions[0], FrontendQuestion)
            questions = [q.text for q in req.questions] if object_questions else req.questions
            priorities = req.customer_priorities
            actions = [a.model_dump(exclude_none=True) for a in req.previous_actions] if req.previous_actions is not None else None
            if req.context is not None:
                if req.context.priorities is not None:
                    priorities = req.context.priorities
                if req.context.previous_actions is not None:
                    actions = [a.canonical() for a in req.context.previous_actions]
            result = _generate_prep(
                review=review, audience_role=req.audience_role, goal=req.goal, minutes=req.minutes,
                questions=questions, previous_review=deepcopy(req.previous_review),
                customer_priorities=deepcopy(priorities), previous_actions=deepcopy(actions),
                use_llm=req.use_llm,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if object_questions:
            result = _frontend_response(result, [q.id for q in req.questions])
        return JSONResponse(content=result, headers=headers)

    return router
