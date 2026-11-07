"""Validate review snapshots and build deterministic optional meeting evidence."""
from copy import deepcopy
from datetime import date
import json
from math import isfinite
from pathlib import Path
import re

from jsonschema import Draft202012Validator

_SCHEMA = json.loads((Path(__file__).resolve().parents[2] / 'contracts/review.schema.json').read_text())
_VALIDATOR = Draft202012Validator(_SCHEMA)
ACTION_STATUSES = ('open', 'in_progress', 'completed', 'blocked', 'deferred')


def finite(value):
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        return isfinite(value)
    except (OverflowError, TypeError, ValueError):
        return False


def month_index(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', value) or value.startswith('0000'):
        raise ValueError('Review periods must use valid YYYY-MM months')
    return int(value[:4]) * 12 + int(value[5:]) - 1


def _check_finite(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool) and not finite(value):
        raise ValueError('Review and context values must be finite')
    if isinstance(value, dict):
        for item in value.values():
            _check_finite(item)
    elif isinstance(value, list):
        for item in value:
            _check_finite(item)


def validate_review(review):
    if not isinstance(review, dict):
        raise ValueError('review must be a full review object')
    error = next(_VALIDATOR.iter_errors(review), None)
    if error:
        path = '.'.join(str(p) for p in error.absolute_path) or 'review'
        raise ValueError(f'Invalid review contract at {path}')
    _check_finite(review)
    period = review['meta']['period']
    if month_index(period['from']) > month_index(period['to']):
        raise ValueError('Review period start must not exceed its end')
    for key, id_key in [('metrics', 'id'), ('sites', 'site_id'), ('observations', 'id')]:
        ids = []
        for row in review[key]:
            identity = row.get(id_key)
            if not isinstance(identity, str) or not identity.strip():
                raise ValueError(f'{key} requires nonblank string IDs')
            ids.append(identity)
        if len(ids) != len(set(ids)):
            raise ValueError(f'Duplicate {key} IDs are ambiguous')
    for metric in review['metrics']:
        if not all(finite(metric['value'].get(case)) for case in ('low', 'base', 'high')):
            raise ValueError('Metric ranges must contain finite numbers')
    for site in review['sites']:
        if not isinstance(site.get('metrics'), dict):
            raise ValueError('Site metrics must be an object')
        if not all(value is None or finite(value) for value in site['metrics'].values()):
            raise ValueError('Site metrics must contain numeric or null values')
    return review


def normalize_context(priorities, actions):
    if priorities is not None:
        if not isinstance(priorities, list) or len(priorities) > 10 or any(
            not isinstance(s, str) or not s.strip() or len(s) > 500 for s in priorities):
            raise ValueError('customer_priorities must be a bounded list of nonblank text')
        priorities = [s.strip() for s in priorities]
    if actions is not None:
        if not isinstance(actions, list) or len(actions) > 50:
            raise ValueError('previous_actions must be a bounded list')
        ids, clean = [], []
        for action in actions:
            if not isinstance(action, dict):
                raise ValueError('Previous actions must be objects')
            if set(action) - {'id', 'text', 'status', 'owner', 'due_date'}:
                raise ValueError('Unknown previous action field')
            for key, limit in [('id', 80), ('text', 1000)]:
                value = action.get(key)
                if not isinstance(value, str) or not value.strip() or len(value) > limit:
                    raise ValueError('Previous actions require bounded nonblank IDs and text')
            if action.get('status') not in ACTION_STATUSES:
                raise ValueError('Unknown previous action status')
            owner = action.get('owner')
            if owner is not None and (not isinstance(owner, str) or len(owner) > 120):
                raise ValueError('Invalid action owner')
            due = action.get('due_date')
            if due is not None:
                if not isinstance(due, str):
                    raise ValueError('Action due_date must use ISO YYYY-MM-DD')
                try:
                    if date.fromisoformat(due).isoformat() != due:
                        raise ValueError('Noncanonical date')
                except ValueError as exc:
                    raise ValueError('Action due_date must use ISO YYYY-MM-DD') from exc
            ids.append(action['id'].strip())
            clean.append({**deepcopy(action), 'id': action['id'].strip(), 'text': action['text'].strip()})
        if len(set(ids)) != len(ids):
            raise ValueError('Duplicate previous action IDs')
        actions = clean
    return priorities, actions


def comparison_context(current, previous):
    if previous is None:
        return {}, {'status': 'missing', 'reasons': ['No previous review supplied.']}
    validate_review(previous)
    cm, pm = current['meta'], previous['meta']
    if cm['customer_id'] != pm['customer_id']:
        raise ValueError('previous_review must belong to the same customer')
    reasons = []
    cstart, cend = (month_index(cm['period'][key]) for key in ('from', 'to'))
    pstart, pend = (month_index(pm['period'][key]) for key in ('from', 'to'))
    if pend >= cstart:
        reasons.append('Previous review must be earlier and non-overlapping.')
    if cend - cstart != pend - pstart:
        reasons.append('Review durations differ; totals are not compared.')
    if cm['baseline_id'] != pm['baseline_id']:
        reasons.append('Comparison baselines differ.')
    if cm['sensitivity'] != pm['sensitivity']:
        reasons.append('Sensitivity cases differ.')
    if reasons:
        return {}, {'status': 'not_comparable', 'reasons': reasons}
    previous_metrics = {m['id']: m for m in previous['metrics']}
    evidence, excluded = {}, []
    case = cm['sensitivity']
    for metric in current['metrics']:
        key = metric['id']
        if key == 'idle_value_eur' or key not in previous_metrics:
            continue
        other = previous_metrics[key]
        if metric['unit'] != other['unit'] or metric['category'] != other['category'] or (
            metric['formula'].split(' | Live arithmetic')[0].strip() != other['formula'].split(' | Live arithmetic')[0].strip()):
            excluded.append(key)
            continue
        before, after = other['value'][case], metric['value'][case]
        change = after - before
        relative = change / before * 100 if before > 0 and metric['unit'] != 'ratio' else None
        pp_change = change * 100 if metric['unit'] == 'ratio' else None
        # Reject arithmetic overflow as unavailable evidence, not JSON Infinity.
        if not finite(change) or (relative is not None and not finite(relative)) or (pp_change is not None and not finite(pp_change)):
            excluded.append(key)
            continue
        evidence['comparison.' + key] = dict(
            id='comparison.' + key, kind='period_comparison', metric_id=key, unit=metric['unit'],
            current_value=after, previous_value=before, absolute_change=change,
            percentage_point_change=pp_change,
            relative_change_pct=relative, case=case,
            current_period=deepcopy(cm['period']), previous_period=deepcopy(pm['period']),
            current_status=metric['status'], previous_status=other['status'], status='CALCULATED',
            formula='current - previous; ratios also show delta × 100 percentage points; relative change only for positive previous values',
            sources=['current_review.metrics.' + key, 'previous_review.metrics.' + key],
            current_evidence=deepcopy(metric), previous_evidence=deepcopy(other),
            limitations=['Different source quality, seasonality or scope may affect comparability; change does not establish causation.'])
    return evidence, {'status': 'available' if evidence else 'not_comparable',
                      'reasons': [] if evidence else ['No comparable metric definitions supplied.'],
                      'excluded_metric_ids': excluded}


def context_catalog(review, previous_review, priorities, actions):
    evidence, period = comparison_context(review, previous_review)
    state = {'period_comparison': period}
    for key, value in [('customer_priorities', priorities), ('previous_actions', actions)]:
        state[key] = {'status': 'missing' if value is None else 'available' if value else 'empty', 'source': 'KAM input'}
        if value is not None:
            evidence[key] = dict(id=key, kind=key, value=deepcopy(value), source='KAM input', status='KAM_INPUT')
    if actions is not None:
        evidence['previous_actions']['counts_by_status'] = {status: sum(a['status'] == status for a in actions) for status in ACTION_STATUSES}
        evidence['previous_actions']['limitations'] = ['Recorded status is KAM input, not proof of task completion or of caused KPI improvement.']
    return evidence, state
