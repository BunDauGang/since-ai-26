"""Adversarial evidence/prose tests for the AI-selects, engine-counts contract."""
from copy import deepcopy
import json
from pathlib import Path
from unittest.mock import patch

import jsonschema
import pytest

from backend.insights import prep

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def review():
    return json.loads((ROOT / 'contracts/sample_review.json').read_text())


def spoken(result):
    return [result['talk_track']['opening'], result['talk_track']['ask'], *result['do_not_say'],
            *(p['text'] for p in result['talk_track']['points']),
            *(a['text'] for a in result['answers']), *(a['text'] for a in result['likely_objections'])]


def assert_references(result):
    catalog = result['evidence_catalog']
    available = {f'{prefix}:{key}' for prefix, plural in [('metric', 'metrics'), ('observation', 'observations'), ('context', 'context')]
                 for key in catalog[plural]}
    for claim in [*result['answers'], *result['talk_track']['points'], *result['likely_objections']]:
        assert set(claim['evidence_ids']) <= available
        for key, plural in [('metric_ids', 'metrics'), ('observation_ids', 'observations'), ('context_ids', 'context')]:
            assert set(claim[key]) <= set(catalog[plural])


def valid_model(template):
    return dict(persona=template['audience_mapping']['persona'], priority=template['audience_mapping']['priority'],
                emphasized_metric_ids=template['audience_mapping']['emphasized_metric_ids'][::-1],
                opening=prep.OPENINGS[1], ask=prep.ASKS[1],
                answers=[{k: deepcopy(a[k]) for k in ('question_id', 'text', 'metric_ids', 'observation_ids', 'context_ids')}
                         for a in template['answers']])


def prior(review):
    p = deepcopy(review)
    p['meta']['period'] = {'from': '2024-01', 'to': '2024-12'}
    return p


@pytest.mark.parametrize('role,persona,priority', [
    ('Head of Procurement', 'cfo', 'cost'), ('Chief Financial Officer', 'cfo', 'cost'),
    ('Plant Manager', 'operations', 'service'), ('ESG Director', 'sustainability', 'emissions'),
    ('CEO', 'ceo', 'improvement'), ('Head of Intergalactic Relations', 'ceo', 'improvement'),
])
def test_free_text_mapping_defaults_and_contract(review, role, persona, priority):
    before = deepcopy(review)
    result = prep.generate_prep(review, audience_role=role, use_llm=False)
    assert (result['audience_mapping']['persona'], result['audience_mapping']['priority']) == (persona, priority)
    assert len(result['answers']) == 5
    assert [a['readiness'] for a in result['answers'][:3]] == ['data_gap'] * 3
    assert all(not prep.UNSAFE.search(t) for t in spoken(result))
    jsonschema.validate(result, json.loads((ROOT / 'contracts/prep.schema.json').read_text()))
    assert_references(result)
    assert review == before
    for key, value in result['evidence_catalog']['metrics'].items():
        assert value == next(m for m in review['metrics'] if m['id'] == key)


def test_no_key_and_disabled_never_request_model(review, monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    with patch.object(prep, '_request_prep', side_effect=AssertionError('network forbidden')):
        assert prep.generate_prep(review)['fallback_reason'] == 'missing_key'
        monkeypatch.setenv('GEMINI_API_KEY', 'test-placeholder')
        assert prep.generate_prep(review, use_llm=False)['fallback_reason'] == 'disabled'


def test_context_comparisons_and_kam_statuses_are_separate(review):
    previous = prior(review)
    current_m = {m['id']: m for m in review['metrics']}
    prev_m = {m['id']: m for m in previous['metrics']}
    prev_m['water_saving_l']['value']['base'] = current_m['water_saving_l']['value']['base'] - 100
    prev_m['on_time_rate']['value']['base'] = .9
    previous_before, current_before = deepcopy(previous), deepcopy(review)
    actions = [{'id': 'allocation', 'text': 'Confirm buffers', 'status': 'completed', 'owner': 'KAM', 'due_date': '2026-12-01'}]
    result = prep.generate_prep(review, previous_review=previous, customer_priorities=['Water efficiency'], previous_actions=actions, use_llm=False)
    context = result['evidence_catalog']['context']
    water = context['comparison.water_saving_l']
    assert water['absolute_change'] == 100
    assert water['relative_change_pct'] == pytest.approx(100 / prev_m['water_saving_l']['value']['base'] * 100)
    rate = context['comparison.on_time_rate']
    assert rate['percentage_point_change'] == pytest.approx((current_m['on_time_rate']['value']['base'] - .9) * 100)
    assert rate['relative_change_pct'] is None
    assert context['previous_actions']['counts_by_status']['completed'] == 1
    assert context['previous_actions']['status'] == 'KAM_INPUT'
    assert context['customer_priorities']['source'] == 'KAM input'
    assert all(a['readiness'] == 'caveat' for a in result['answers'][:3])
    assert 'does not establish causation' in result['answers'][2]['text']
    assert previous == previous_before and review == current_before
    assert_references(result)


@pytest.mark.parametrize('edit', ['overlap', 'future', 'duration', 'baseline', 'case'])
def test_incomparable_reviews_do_not_produce_changes(review, edit):
    previous = prior(review)
    if edit == 'overlap': previous['meta']['period'] = deepcopy(review['meta']['period'])
    if edit == 'future': previous['meta']['period'] = {'from': '2026-01', 'to': '2026-12'}
    if edit == 'duration': previous['meta']['period']['to'] = '2024-03'
    if edit == 'baseline': previous['meta']['baseline_id'] = 'B_HOME'
    if edit == 'case': previous['meta']['sensitivity'] = 'high'
    result = prep.generate_prep(review, previous_review=previous, use_llm=False)
    assert result['context_status']['period_comparison']['status'] == 'not_comparable'
    assert not any(k.startswith('comparison.') for k in result['evidence_catalog']['context'])
    assert result['answers'][0]['readiness'] == 'data_gap'


def test_cross_customer_context_is_rejected(review):
    previous = prior(review)
    previous['meta']['customer_id'] = 'CUST002'
    with pytest.raises(ValueError, match='same customer'):
        prep.generate_prep(review, previous_review=previous)


def test_zero_denominator_and_incompatible_metric_definitions(review):
    previous = prior(review)
    previous_m = {m['id']: m for m in previous['metrics']}
    previous_m['water_saving_l']['value']['base'] = 0
    previous_m['washed_kg']['unit'] = 'other-unit'
    result = prep.generate_prep(review, previous_review=previous, use_llm=False)
    ctx = result['evidence_catalog']['context']
    assert ctx['comparison.water_saving_l']['relative_change_pct'] is None
    assert 'comparison.washed_kg' not in ctx
    assert 'washed_kg' in result['context_status']['period_comparison']['excluded_metric_ids']
    json.dumps(result, allow_nan=False)


def test_arithmetic_overflow_does_not_escape_as_infinity(review):
    previous = prior(review)
    next(m for m in review['metrics'] if m['id'] == 'on_time_rate')['value']['base'] = 1e307
    next(m for m in previous['metrics'] if m['id'] == 'on_time_rate')['value']['base'] = 0
    result = prep.generate_prep(review, previous_review=previous, use_llm=False)
    assert 'comparison.on_time_rate' not in result['evidence_catalog']['context']
    json.dumps(result, allow_nan=False)


def test_empty_context_is_distinct_from_missing_and_not_proof_of_no_actions(review):
    result = prep.generate_prep(review, customer_priorities=[], previous_actions=[], use_llm=False)
    assert result['context_status']['previous_actions']['status'] == 'empty'
    assert result['answers'][2]['readiness'] == 'data_gap'
    assert result['evidence_catalog']['context']['previous_actions']['counts_by_status']['completed'] == 0


@pytest.mark.parametrize('question,kind', [
    ('How much water did we save?', 'metric'), ('How much CO2 did we save?', 'metric'),
    ('What is the on-time rate?', 'metric'), ('How much money will we save?', 'financial'),
    ('Why did repairs increase?', 'unknown'), ('Is the customer satisfied?', 'satisfaction'),
    ('Will water savings increase next year?', 'unknown'), ('What is the weather in Turku?', 'unknown'),
])
def test_custom_questions_are_honest_about_scope(review, question, kind):
    result = prep.generate_prep(review, questions=[question], use_llm=False)
    assert result['answers'][0]['kind'] == kind
    if kind == 'metric':
        assert result['answers'][0]['metric_ids']
    else:
        assert result['answers'][0]['readiness'] == 'data_gap'


def test_accepted_model_selection_preserves_all_evidence(review, monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY', 'test-placeholder')
    base = prep.generate_prep(review, use_llm=False)
    with patch.object(prep, '_request_prep', return_value=valid_model(base)) as request:
        result = prep.generate_prep(review)
    assert result['source'] == 'gemini'
    assert result['fallback_reason'] is None
    assert result['evidence_catalog'] == base['evidence_catalog']
    assert result['talk_track']['opening'].startswith(prep.OPENINGS[1])
    assert prep.PERSONAS[result['audience_mapping']['persona']]['focus'] in result['talk_track']['opening']
    packet = request.call_args.args[0]
    assert set(packet['available_metrics']['water_saving_l']) == {'label', 'unit', 'status'}
    assert 'review' not in packet and 'previous_actions' not in packet
    assert_references(result)


@pytest.mark.parametrize('attack', ['number', 'spelled', 'unicode', 'currency', 'promise', 'metric', 'observation', 'context',
                                  'missing_answer', 'lost_evidence', 'extra', 'role', 'duplicate', 'wrong_question', 'cross_topic'])
def test_model_attacks_fall_back_atomically(review, monkeypatch, attack):
    monkeypatch.setenv('GEMINI_API_KEY', 'test-placeholder')
    questions = ['What is the water saving?'] if attack == 'cross_topic' else None
    base = prep.generate_prep(review, questions=questions, use_llm=False)
    model = valid_model(base)
    if attack == 'number': model['opening'] = 'We saved 999 litres.'
    if attack == 'spelled': model['opening'] = 'We saved twenty million litres.'
    if attack == 'unicode': model['opening'] = 'Savings are ½ litre.'
    if attack == 'currency': model['opening'] = 'Save €lots.'
    if attack == 'promise': model['opening'] = 'All customers are fully satisfied.'
    if attack == 'metric': model['emphasized_metric_ids'] = ['invented_metric']
    if attack == 'observation': model['answers'][-1]['observation_ids'] = ['UNKNOWN_OBS']
    if attack == 'context': model['answers'][0]['context_ids'] = ['comparison.private_customer']
    if attack == 'missing_answer': model['answers'].pop()
    if attack == 'lost_evidence':
        model['answers'][-1].update(metric_ids=[], observation_ids=[], context_ids=[])
    if attack == 'extra': model['evidence_catalog'] = {'water': 999}
    if attack == 'role': model['persona'] = 'administrator'
    if attack == 'duplicate': model['emphasized_metric_ids'] *= 2
    if attack == 'wrong_question': model['answers'][0]['question_id'] = 'Q999'
    if attack == 'cross_topic': model['answers'][0]['metric_ids'] = ['on_time_rate']
    with patch.object(prep, '_request_prep', return_value=model):
        result = prep.generate_prep(review, questions=questions)
    expected = deepcopy(base)
    expected['fallback_reason'] = 'invalid_model_output'
    assert result == expected


@pytest.mark.parametrize('error,reason', [(TimeoutError(), 'timeout'), (OSError(), 'provider_error'), (ValueError(), 'provider_error')])
def test_provider_failures_have_offline_fallback(review, monkeypatch, error, reason):
    monkeypatch.setenv('GEMINI_API_KEY', 'test-placeholder')
    with patch.object(prep, '_request_prep', side_effect=error):
        result = prep.generate_prep(review)
    assert result['source'] == 'template' and result['fallback_reason'] == reason


@pytest.mark.parametrize('bad', ['nan', 'duplicate', 'bad_sites', 'bad_month'])
def test_invalid_source_snapshots_reject_before_model(review, bad):
    if bad == 'nan': review['metrics'][0]['value']['base'] = float('nan')
    if bad == 'duplicate': review['metrics'].append(deepcopy(review['metrics'][0]))
    if bad == 'bad_sites': review['sites'][0]['metrics'] = []
    if bad == 'bad_month': review['meta']['period']['from'] = '2025-99'
    with patch.object(prep, '_request_prep', side_effect=AssertionError('network forbidden')):
        with pytest.raises(ValueError):
            prep.generate_prep(review)


def test_oversized_integer_is_validation_error_not_server_failure(review):
    review['metrics'][0]['value']['base'] = 10 ** 400
    with pytest.raises(ValueError, match='finite'):
        prep.generate_prep(review, use_llm=False)
    from fastapi.testclient import TestClient
    from backend.api.main import app
    with TestClient(app) as client:
        response = client.post('/api/prep', json={'review': review, 'use_llm': False})
    assert response.status_code == 422


def test_context_priors_and_action_text_are_not_sent_to_provider(review, monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY', 'test-placeholder')
    kwargs = dict(customer_priorities=['PRIVATE_PRIORITY'], previous_actions=[{
        'id': 'action_private', 'text': 'PRIVATE_ACTION_TEXT', 'status': 'in_progress'}])
    base = prep.generate_prep(review, use_llm=False, **kwargs)
    with patch.object(prep, '_request_prep', return_value=valid_model(base)) as request:
        result = prep.generate_prep(review, **kwargs)
    model_data = json.dumps(request.call_args.args[0])
    assert 'PRIVATE_PRIORITY' not in model_data and 'PRIVATE_ACTION_TEXT' not in model_data
    assert 'PRIVATE_PRIORITY' in json.dumps(result['evidence_catalog']['context'])
    assert_references(result)



def test_procurement_talk_track_has_distinct_grounded_talking_points(review):
    result = prep.generate_prep(review, audience_role='Head of Procurement', use_llm=False)
    texts = [p['text'] for p in result['talk_track']['points']]
    assert len(texts) == len(set(texts)) == 3
    assert 'buffers' in texts[0] and 'assumption-led' in texts[2]
    assert 'pricing assumptions' in result['talk_track']['ask']
    assert all(not prep.UNSAFE.search(text) for text in texts)


@pytest.mark.parametrize('question,expected', [
    ('What is the on-time rate?', ['on_time_rate']),
    ('How much water did we save?', ['water_saving_l']),
    ('How many repairs were completed?', ['repairs_total']),
    ('How many repairs per 1,000 washes?', ['repair_rate_per_1000']),
    ('What are service requests per wearer?', []),
    ('How many deliveries were made?', []),
    ('How many unique wearers are there?', []),
])
def test_exact_kpi_and_missing_denominator_questions(review, question, expected):
    result = prep.generate_prep(review, questions=[question], use_llm=False)
    assert result['answers'][0]['metric_ids'] == expected
    if not expected:
        assert result['answers'][0]['readiness'] == 'data_gap'


def test_existing_but_wrong_service_metric_is_rejected(review, monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY', 'test-placeholder')
    base = prep.generate_prep(review, questions=['What is the on-time rate?'], use_llm=False)
    model = valid_model(base)
    model['answers'][0]['metric_ids'] = ['service_requests']
    with patch.object(prep, '_request_prep', return_value=model):
        result = prep.generate_prep(review, questions=['What is the on-time rate?'])
    assert result['fallback_reason'] == 'invalid_model_output'
    assert result['answers'][0]['metric_ids'] == ['on_time_rate']


def test_procurement_next_steps_prioritise_allocation_evidence(review):
    result = prep.generate_prep(review, audience_role='Head of Procurement', use_llm=False)
    answer = result['answers'][-1]
    first = result['evidence_catalog']['observations'][answer['observation_ids'][0]]
    assert 'allocation_use_rate' in first['metric_ids'] or 'idle_pieces' in first['metric_ids']


def test_period_question_cannot_substitute_current_or_unrelated_metric(review):
    question = 'Compare water savings with last year'
    missing = prep.generate_prep(review, questions=[question], use_llm=False)['answers'][0]
    assert missing['readiness'] == 'data_gap' and missing['metric_ids'] == []
    answer = prep.generate_prep(review, previous_review=prior(review), questions=[question], use_llm=False)['answers'][0]
    assert answer['context_ids'] == ['comparison.water_saving_l']


def test_frontend_steering_questions_route_to_relevant_evidence(review):
    result = prep.generate_prep(review, questions=[
        'What outcomes has the customer achieved since the last steering committee, and how are they measured?',
        'Which delivery issues, risks or unresolved commitments need steering-level intervention?',
    ], use_llm=False)
    assert result['answers'][0]['kind'] == 'period_change'
    assert result['answers'][0]['readiness'] == 'data_gap'
    assert result['answers'][1]['kind'] == 'delivery_risks'
    assert result['answers'][1]['metric_ids'] == ['on_time_rate', 'median_cycle_hours', 'service_requests']


def test_finite_inputs_with_overflowing_derived_rule_facts_reject(review):
    metric = next(m for m in review['metrics'] if m['id'] == 'on_time_rate')
    metric['value']['base'] = 1e308
    for site in review['sites']:
        site['metrics']['on_time_rate'] = 0
    with patch.object(prep, '_request_prep', side_effect=AssertionError('network forbidden')):
        with pytest.raises(ValueError, match='finite|numeric bounds'):
            prep.generate_prep(review, use_llm=False)
