"""Transport and integration checks for the isolated KAM prep endpoint."""
from copy import deepcopy
import json
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import backend.api.main as api
import backend.api.prep as prep_api

client = TestClient(api.app)
ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def review():
    return json.loads((ROOT / 'contracts/sample_review.json').read_text(encoding='utf-8'))


@pytest.fixture
def capture(monkeypatch):
    calls = []
    def generate(**kwargs):
        calls.append(deepcopy(kwargs))
        return {'source': 'template', 'kam_only': True, 'received_role': kwargs['audience_role']}
    monkeypatch.setattr(prep_api, '_generate_prep', generate)
    return calls


def test_direct_review_and_audience_alias_do_not_recalculate(review, capture, monkeypatch):
    before = deepcopy(review)
    def forbidden(_):
        raise AssertionError('Direct review must not recalculate')
    monkeypatch.setattr(api, '_compute_full_review', forbidden)
    review['meta']['customer_id'] = 'CUST002'
    response = client.post('/api/prep', json={'review': review, 'audience': 'Head of Procurement', 'use_llm': False})
    assert response.status_code == 200
    assert response.headers['x-review-source'] == 'provided'
    assert capture[0]['audience_role'] == 'Head of Procurement'
    assert capture[0]['review'] == review
    assert capture[0]['questions'] is None
    assert capture[0]['previous_review'] is None
    assert capture[0]['previous_actions'] is None
    assert capture[0]['use_llm'] is False
    assert before['metrics'] == review['metrics']


@pytest.mark.parametrize('selector,value', [
    ('customer_id', 'CUST002'), ('period_from', '2025-02'), ('period_to', '2025-11'),
    ('baseline_id', 'B_HOME'), ('sensitivity', 'high'), ('priority', 'cost'),
])
def test_explicit_selection_cannot_relabel_a_review(review, capture, selector, value):
    # Make this test independent of future changes to the bundled sample metadata.
    if selector in ('period_from', 'period_to'):
        old = review['meta']['period']['from' if selector == 'period_from' else 'to']
    else:
        old = review['meta'].get(selector)
    assert value != old
    response = client.post('/api/prep', json={'review': review, selector: value})
    assert response.status_code == 422
    assert 'conflicts' in response.json()['detail']
    assert capture == []


@pytest.mark.parametrize('payload', [
    {'audience_role': ''}, {'audience_role': ' '}, {'audience_role': 'x' * 121},
    {'minutes': 0}, {'minutes': 121}, {'minutes': True}, {'minutes': 1.5}, {'minutes': '15'},
    {'questions': ['']}, {'questions': ['x'] * 11}, {'questions': ['x' * 1001]},
    {'customer_priorities': [' ']}, {'customer_priorities': ['x'] * 11},
    {'goal': 'x' * 2001}, {'use_llm': 'yes'}, {'unexpected': True},
    {'previous_actions': [{'id': 'a', 'text': 'Task', 'status': 'invented'}]},
    {'previous_actions': [{'id': 'a', 'text': 'Task'}]},
    {'previous_actions': [{'id': 'a', 'text': 'Task', 'status': 'completed', 'due_date': '2025-02-30'}]},
    {'previous_actions': [{'id': 'a', 'text': 'Task', 'status': 'open'}] * 2},
    {'period_from': '2025-13'}, {'period_from': '2025-12', 'period_to': '2025-01'},
])
def test_invalid_request_is_422_before_work(payload, capture, monkeypatch):
    def forbidden(_):
        raise AssertionError('Invalid request must not calculate')
    monkeypatch.setattr(api, '_compute_full_review', forbidden)
    response = client.post('/api/prep', json=payload)
    assert response.status_code == 422
    assert capture == []


def test_selection_reuses_review_cache_but_never_caches_prep_context(review, capture, monkeypatch):
    calculations = []
    def build(**kwargs):
        calculations.append(kwargs)
        return deepcopy(review)
    monkeypatch.setattr(api, '_REVIEW_CACHE', {})
    monkeypatch.setattr(api, 'build_review', build)
    monkeypatch.setattr(api, 'annotate_site_flags', lambda _: None)
    monkeypatch.setattr(api, 'generate_observations', lambda r, use_llm: r['observations'])
    monkeypatch.setattr(api, '_pack_version', lambda: ('test-pack',))
    first = client.post('/api/prep', json={'customer_priorities': ['Water'], 'use_llm': True})
    second = client.post('/api/prep', json={'customer_priorities': ['Availability'], 'use_llm': False})
    assert first.status_code == second.status_code == 200
    assert len(calculations) == 1
    assert capture[0]['customer_priorities'] == ['Water']
    assert capture[1]['customer_priorities'] == ['Availability']
    assert capture[0]['use_llm'] is True and capture[1]['use_llm'] is False
    assert capture[0]['review'] == capture[1]['review']
    assert first.headers['x-review-source'] == 'engine'
    assert all('customer_priorities' not in cached for cached in api._REVIEW_CACHE.values())


def test_engine_errors_are_not_disguised_as_success(capture, monkeypatch):
    def failing(_):
        raise HTTPException(status_code=503, detail='Required workbook unavailable')
    monkeypatch.setattr(api, '_compute_full_review', failing)
    response = client.post('/api/prep', json={})
    assert response.status_code == 503
    assert response.json()['detail'] == 'Required workbook unavailable'
    assert capture == []


def test_core_validation_failure_is_422(review, monkeypatch):
    def invalid(**_):
        raise ValueError('previous_review must belong to the same customer')
    monkeypatch.setattr(prep_api, '_generate_prep', invalid)
    response = client.post('/api/prep', json={'review': review})
    assert response.status_code == 422
    assert 'same customer' in response.json()['detail']


def test_context_and_action_status_are_forwarded_without_invention(review, capture):
    action = {'id': 'ACTION_A', 'text': 'Investigate allocation', 'status': 'in_progress',
              'owner': 'Customer', 'due_date': '2026-12-01'}
    response = client.post('/api/prep', json={
        'review': review, 'questions': ['What progress was recorded?'], 'previous_actions': [action],
        'customer_priorities': [], 'minutes': 20, 'goal': 'Confirm next steps',
    })
    assert response.status_code == 200
    assert capture[0]['previous_actions'] == [action]
    assert capture[0]['customer_priorities'] == []
    assert capture[0]['minutes'] == 20
    assert capture[0]['questions'] == ['What progress was recorded?']


def test_real_prep_endpoint_is_offline_and_preserves_review_evidence(review, monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    before = deepcopy(review)
    response = client.post('/api/prep', json={'review': review, 'audience_role': 'Head of Procurement', 'use_llm': False})
    assert response.status_code == 200
    result = response.json()
    assert result['source'] == 'template' and result['kam_only'] is True
    assert result['audience_mapping']['persona'] == 'cfo'
    assert len(result['answers']) == 5
    metric = next(m for m in review['metrics'] if m['id'] == 'water_saving_l')
    assert result['evidence_catalog']['metrics']['water_saving_l'] == metric
    assert review == before


def test_malformed_direct_review_is_not_an_internal_server_error():
    response = client.post('/api/prep', json={'review': {'meta': {}, 'metrics': 'bad'}})
    assert response.status_code == 422


def test_openapi_exposes_bounded_prep_contract():
    schema = client.get('/openapi.json').json()
    assert '/api/prep' in schema['paths']
    request = schema['components']['schemas']['PrepRequest']
    assert request['additionalProperties'] is False
    assert request['properties']['minutes']['minimum'] == 1
    assert request['properties']['minutes']['maximum'] == 120


STEERCO = [
    {'id': 'q1', 'text': 'What outcomes has the customer achieved since the last steering committee, and how are they measured?'},
    {'id': 'q2', 'text': "What are the customer's most important business and sustainability priorities for the next 6–12 months?"},
    {'id': 'q3', 'text': 'Which delivery issues, risks or unresolved commitments need steering-level intervention?'},
    {'id': 'q4', 'text': 'Which improvements or expansion opportunities offer the strongest value (cost, sustainability, operations)?'},
    {'id': 'q5', 'text': 'What decisions are needed today, who owns each action, and by when?'},
]


def frontend_payload(review):
    return dict(
        review=review, audience='Head of Procurement', questions=deepcopy(STEERCO),
        template=[dict(question_id=q['id'], answer='CLIENT_TEMPLATE_ONLY 999999',
                       points=[{'text': 'CLIENT_NUMERIC_FACT 12345', 'metric_ids': ['water_saving_l']}],
                       gap='CLIENT_GAP_ONLY') for q in STEERCO],
        context=dict(priorities=['Water', 'Service reliability'],
                     previous_actions=[dict(id='a1', text='Review allocation', status='done', owner='', due='')],
                     comparison=[dict(id='water_saving_l', label='Water saving', before=999999, after=1,
                                      unit='L', better='higher', perMonth=True)]),
    )


def test_literal_current_frontend_payload_is_accepted_offline(review, monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    payload = frontend_payload(review)
    before = deepcopy(payload)
    response = client.post('/api/prep', json=payload)
    assert response.status_code == 200
    data = response.json()
    assert set(data) == {'answers', 'source', 'fallback_reason', 'prep'}
    assert data['source'] == 'template' and data['answers'] == []
    assert len(data['prep']['answers']) == 5
    assert data['prep']['context_status']['period_comparison']['status'] == 'missing'
    actions = data['prep']['evidence_catalog']['context']['previous_actions']['value']
    assert actions == [{'id': 'a1', 'text': 'Review allocation', 'status': 'completed'}]
    assert data['prep']['evidence_catalog']['context']['customer_priorities']['value'] == ['Water', 'Service reliability']
    assert 'CLIENT_TEMPLATE_ONLY' not in json.dumps(data)
    assert 'CLIENT_NUMERIC_FACT' not in json.dumps(data)
    assert not any(k.startswith('comparison.') for k in data['prep']['evidence_catalog']['context'])
    assert payload == before


def test_frontend_inputs_are_normalized_but_untrusted_summary_never_reaches_core(review, capture):
    payload = frontend_payload(review)
    payload['context']['previous_actions'][0].update(owner='Account team', due='2026-12-01')
    response = client.post('/api/prep', json=payload)
    assert response.status_code == 200
    call = capture[0]
    assert call['questions'] == [q['text'] for q in STEERCO]
    assert call['previous_actions'] == [{'id': 'a1', 'text': 'Review allocation', 'status': 'completed',
                                         'owner': 'Account team', 'due_date': '2026-12-01'}]
    assert 'template' not in call and 'context' not in call and 'comparison' not in call
    assert 'CLIENT_TEMPLATE_ONLY' not in json.dumps(call)
    assert 'CLIENT_NUMERIC_FACT' not in json.dumps(call)


def test_frontend_gemini_envelope_maps_ids_and_uses_only_source_metric_tokens(review, monkeypatch):
    from backend.insights.prep import generate_prep
    result = generate_prep(review, questions=['How much water was saved?'], use_llm=False)
    result['source'] = 'gemini'
    result['fallback_reason'] = None
    monkeypatch.setattr(prep_api, '_generate_prep', lambda **_: deepcopy(result))
    response = client.post('/api/prep', json={'review': review, 'audience': 'CFO',
                          'questions': [{'id': 'free', 'text': 'How much water was saved?'}]})
    assert response.status_code == 200
    data = response.json()
    assert data['answers'][0]['question_id'] == 'free'
    assert data['answers'][0]['answer'] == result['answers'][0]['text']
    point = data['answers'][0]['points'][0]
    assert point == {'text': 'Linked review indicator: {{water_saving_l}}.', 'metric_ids': ['water_saving_l']}
    assert data['prep'] == result


def test_frontend_low_case_never_formats_a_base_value_as_selected_case(review, monkeypatch):
    from backend.insights.prep import generate_prep
    review['meta']['sensitivity'] = 'low'
    result = generate_prep(review, questions=['How much water was saved?'], use_llm=False)
    result.update(source='gemini', fallback_reason=None)
    monkeypatch.setattr(prep_api, '_generate_prep', lambda **_: deepcopy(result))
    response = client.post('/api/prep', json={'review': review, 'questions': [{'id': 'free', 'text': 'How much water was saved?'}]})
    data = response.json()
    assert data['answers'] and '{{' not in json.dumps(data['answers'])
    assert 'selected sensitivity' in data['answers'][0]['points'][0]['text']


def test_frontend_data_gap_answer_is_not_ai_replacement(review, monkeypatch):
    from backend.insights.prep import generate_prep
    result = generate_prep(review, questions=['What changed since the previous review?'], use_llm=False)
    assert result['answers'][0]['readiness'] == 'data_gap'
    result.update(source='gemini', fallback_reason=None)
    monkeypatch.setattr(prep_api, '_generate_prep', lambda **_: deepcopy(result))
    response = client.post('/api/prep', json={'review': review, 'questions': [{'id': 'q1', 'text': 'What changed since the previous review?'}]})
    assert response.json()['answers'] == []


@pytest.mark.parametrize('extra', [
    {'questions': [{'id': 'q1', 'text': 'Water?'}, 'Mixed question']},
    {'questions': [{'id': 'q1', 'text': 'Water?'}, {'id': 'q1', 'text': 'Cost?'}]},
    {'customer_priorities': ['Cost'], 'context': {'priorities': ['Water']}},
    {'previous_actions': [], 'context': {'previous_actions': []}},
    {'context': {'previous_actions': [{'id': 'a', 'text': 'Do it', 'status': 'done', 'due': '2026-02-30'}]}},
    {'context': {'previous_actions': [{'id': 'a', 'text': 'Do it', 'status': 'done'}] * 2}},
    {'template': [{'question_id': 'q1', 'answer': 'x' * 4001}]},
    {'context': {'comparison': [dict(id='x', label='x', before=1, after=2, unit='L', better='higher', perMonth=True)] * 101}},
])
def test_frontend_adapter_remains_bounded_and_unambiguous(review, capture, extra):
    response = client.post('/api/prep', json={'review': review, **extra})
    assert response.status_code == 422
    assert capture == []
