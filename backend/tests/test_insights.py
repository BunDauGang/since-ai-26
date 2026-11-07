import copy
import json
from pathlib import Path
from unittest.mock import patch

import jsonschema
import pytest

from backend.insights.generate import generate_observations, interpret_prompt
from backend.insights.rules import evaluate_rules
from backend.insights import llm

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def review():
    return json.loads((ROOT / 'contracts/sample_review.json').read_text())


def test_sample_observations_match_contract_without_mutation(review):
    before = copy.deepcopy(review)
    result = generate_observations(review, False)
    assert 3 <= len(result) <= 5
    assert result == generate_observations(review, False)
    assert review == before
    review['observations'] = result
    jsonschema.validate(review, json.loads((ROOT / 'contracts/review.schema.json').read_text()))
    assert all(set(o['metric_ids']) <= {m['id'] for m in review['metrics']} for o in result)
    assert all(set(o['site_ids']) <= {s['site_id'] for s in review['sites']} for o in result)
    assert all(o['owner'] in ('Customer', 'Lindström', 'Both') for o in result)
    assert '1,406,482.6' in result[0]['observation']
    assert not any('12,078' in o['observation'] for o in result)


def test_rule_thresholds_and_zero_wearers(review):
    review['sites'] = []
    for i in range(10):
        review['sites'].append({'site_id': f'S{i}', 'metrics': {
            'allocation_use_rate': .5 + i / 100, 'repair_rate_per_1000': 10 if i < 9 else 16,
            'on_time_rate': .9 if i == 0 else .99, 'service_requests': 1 if i < 9 else 10,
            'wearers_min_est': 100 if i else 0, 'washed_kg': i}})
    facts = {f['rule_id']: f for f in evaluate_rules(review)}
    assert facts['R1']['site_ids'] == ['S0', 'S1']
    assert facts['R2']['site_ids'] == ['S9']
    assert facts['R3']['site_ids'] == ['S0']
    assert facts['R4']['site_ids'] == ['S9']
    assert facts['R5']['site_ids'] == ['S9', 'S8', 'S7']
    assert facts['R6']['data_quality'] == review['data_quality']
    review['sites'][-1]['metrics']['repair_rate_per_1000'] = 15
    assert 'R2' not in {f['rule_id'] for f in evaluate_rules(review)}


def test_missing_site_metrics_do_not_create_false_outliers(review):
    review['sites'] = [{'site_id': 'missing', 'metrics': {}}]
    assert not {'R1', 'R2', 'R3', 'R4'} & {f['rule_id'] for f in evaluate_rules(review)}


def test_priority_and_industry_order(review):
    assert evaluate_rules(review)[0]['rule_id'] == 'R5'
    review['meta']['priority'] = 'cost'
    assert evaluate_rules(review)[0]['rule_id'] == 'R1'
    assert 'R5' not in {f['rule_id'] for f in evaluate_rules(review)}
    review['meta']['priority'] = 'emissions'
    review['meta']['industry'] = 'Healthcare'
    review['priority_view']['industry_rules'] = []
    rules = [f['rule_id'] for f in evaluate_rules(review)]
    assert rules.index('R3') < rules.index('R1')


@pytest.mark.parametrize('text,industry,want', [
    ('Focus on water and carbon', 'Manufacturing', 'water'),
    ('Reduce CO2 emissions', '', 'emissions'), ('Budget efficiency', '', 'cost'),
    ('Repair and reuse', '', 'circularity'), ('Delivery reliability', '', 'service'),
    ('Next-year improvement', '', 'improvement'), ('', 'Food & Beverage', 'service'),
    ('something vague', 'Manufacturing', 'cost'), ('unknown', '', 'improvement'),
])
def test_interpret(text, industry, want):
    assert interpret_prompt(text, industry) == want


def test_no_key_never_calls_network(review, monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    with patch.object(llm, '_request', side_effect=AssertionError('network forbidden')):
        assert generate_observations(review) == generate_observations(review, False)


@pytest.mark.parametrize('failure', [TimeoutError(), ValueError(), KeyError(), OSError()])
def test_api_failure_falls_back(review, monkeypatch, failure):
    monkeypatch.setenv('GEMINI_API_KEY', 'test-placeholder')
    with patch.object(llm, '_request', side_effect=failure):
        assert generate_observations(review) == generate_observations(review, False)


def llm_rows(facts):
    return [dict(rule_id=f['rule_id'], observation='Review the supplied evidence with the account team.',
                 recommended_action='Confirm the source with the site team.',
                 steering_question='Which action should the account team prioritize?') for f in facts]


@pytest.mark.parametrize('bad_text', ['Savings are 999 litres.', 'Savings are twenty million litres.', 'These are certified results.'])
def test_invented_numbers_and_claims_rejected(review, monkeypatch, bad_text):
    monkeypatch.setenv('GEMINI_API_KEY', 'test-placeholder')
    rows = llm_rows(evaluate_rules(review)[:5])
    rows[0]['observation'] = bad_text
    with patch.object(llm, '_request', return_value=rows):
        assert generate_observations(review) == generate_observations(review, False)


def test_valid_llm_words_retain_deterministic_evidence(review, monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY', 'test-placeholder')
    rows = llm_rows(evaluate_rules(review)[:5])
    with patch.object(llm, '_request', return_value=rows):
        outputs = generate_observations(review)
    assert outputs[0]['status'] == 'AI_GENERATED_FROM_CALCULATED_DATA'
    assert '1,406,482.6' in outputs[0]['observation']
    assert outputs[0]['metric_ids'] == generate_observations(review, False)[0]['metric_ids']


def test_gemini_request_uses_only_facts_and_bounded_timeout():
    import io
    facts = [{'rule_id': 'R5', 'numbers': {'water_saving_l': 12}}]
    reply = {'candidates': [{'content': {'parts': [{'text': '[]'}]}}]}
    with patch('urllib.request.urlopen', return_value=io.BytesIO(json.dumps(reply).encode())) as call:
        assert llm._request(facts, 'test-placeholder') == []
    request = call.call_args.args[0]
    payload = json.loads(request.data)
    assert json.loads(payload['contents'][0]['parts'][0]['text']) == facts
    assert 'test-placeholder' not in request.full_url
    assert call.call_args.kwargs['timeout'] == 10



def test_quantified_action_scope_and_no_invented_repair_counts(review):
    from backend.insights.generate import render_fact, interpret_priority
    assert interpret_priority('water', '') == interpret_prompt('water', '')
    # Known unrounded fixture: rates flag repair intensity but cannot determine
    # avoidable repairs without actual wash denominators.
    review['sites'] = [dict(site_id=f'S{i}', metrics=dict(
        allocation_use_rate=.5 + i / 100, idle_pieces=10 + i,
        repair_rate_per_1000=10 if i < 9 else 16, repairs_total=100 + i,
        on_time_rate=.9 if i == 0 else .99, service_requests=1 if i < 9 else 10,
        wearers_min_est=100, washed_kg=1000 + i)) for i in range(10)]
    facts = {f['rule_id']: f for f in evaluate_rules(review)}
    assert facts['R1']['action_scope']['idle_pieces_in_scope'] == 21
    assert facts['R2']['action_scope']['reported_repairs_in_scope'] == 109
    assert facts['R2']['action_scope']['max_rate_gap_per_1000'] == 6
    assert facts['R4']['action_scope']['requests_in_scope'] == 10
    assert facts['R3']['action_scope']['max_gap_percentage_points'] == pytest.approx(8.33)
    assert facts['R5']['action_scope']['priority_site_washed_kg'] == 3024
    assert facts['R6']['action_scope']['data_gap_count'] == len(review['data_gaps'])
    for rule in ('R1', 'R2', 'R3', 'R4', 'R5', 'R6'):
        o = render_fact(facts[rule], 1)
        assert 'Why it matters:' in o['observation'] and 'Food & Beverage' in o['observation']
        assert 'Q1 2026' in o['recommended_action']
        assert 'Potential benefit:' in o['recommended_action']
    assert 'Exact excess repair counts are unavailable' in render_fact(facts['R2'], 1)['recommended_action']


def test_missing_idle_counts_are_not_reported_as_zero(review):
    for site in review['sites']:
        site['metrics'].pop('idle_pieces', None)
    f = next(f for f in evaluate_rules(review) if f['rule_id'] == 'R1')
    assert 'idle_pieces_in_scope' not in f['action_scope']
    from backend.insights.generate import render_fact
    assert 'count unavailable' in render_fact(f, 1)['recommended_action']


def test_llm_cannot_drop_action_targets_or_industry_context(review, monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY', 'test-placeholder')
    base = generate_observations(review, False)
    rows = llm_rows(evaluate_rules(review)[:5])
    with patch.object(llm, '_request', return_value=rows):
        result = generate_observations(review)
    for actual, expected in zip(result, base):
        assert expected['recommended_action'] in actual['recommended_action']
        assert expected['observation'] in actual['observation']
        assert expected['steering_question'] in actual['steering_question']


@pytest.mark.parametrize('claim', ['Savings are ninety-nine litres.', 'Savings are quatre litres.',
                                  'Savings are ½ litre.', 'All idle stock can safely be removed.'])
def test_unapproved_model_claims_fail_closed(review, monkeypatch, claim):
    monkeypatch.setenv('GEMINI_API_KEY', 'test-placeholder')
    rows = llm_rows(evaluate_rules(review)[:5])
    rows[0]['observation'] = claim
    with patch.object(llm, '_request', return_value=rows):
        assert generate_observations(review) == generate_observations(review, False)
