import copy
import json
from pathlib import Path

import pytest
from pptx import Presentation
from pypdf import PdfReader

from backend.export import export_pptx, export_pdf
from backend.export.content import FOOTER, build_pages

ROOT = Path(__file__).resolve().parents[2]


def section(review, title):
    return next(p for p in build_pages(review) if p[0].startswith(title))


def pdf_section(reader, title):
    return next(p for p in reader.pages if any(line.startswith(title) for line in p.extract_text().splitlines()))


def deck_section(deck, title):
    return next(s for s in deck.slides if any(x.has_text_frame and x.text.startswith(title) for x in s.shapes))



@pytest.fixture
def review():
    return json.loads((ROOT / 'contracts/sample_review.json').read_text())


def test_powerpoint_has_core_sections_evidence_and_source_notes(review, tmp_path):
    before = copy.deepcopy(review)
    path = export_pptx(review, str(tmp_path / 'nested/review.pptx'))
    deck = Presentation(path)
    assert len(deck.slides) >= 9
    texts = ['\n'.join(s.text for s in slide.shapes if s.has_text_frame) for slide in deck.slides]
    assert all(FOOTER in t for t in texts)
    water = next(m['value']['base'] for m in review['metrics'] if m['id'] == 'co2e_saving_kg')
    assert f'{water:,.2f}'.rstrip('0').rstrip('.') in texts[1]
    assert 'R1' not in texts[1]  # summary uses metrics, not existing observation prose
    assert 'L003' in texts[-1]
    assert '0.5' in texts[-1]
    assert 'SYNTHETIC DATA' in texts[0]
    assert 'SOURCE REVIEW' in deck.slides[-1].notes_slide.notes_text_frame.text
    assert '"formula"' in deck.slides[-1].notes_slide.notes_text_frame.text
    assert review == before
    assert export_pptx(review, path) == path


def test_pdf_has_matching_pages_footer_and_lossless_source(review, tmp_path):
    before = copy.deepcopy(review)
    path = export_pdf(review, str(tmp_path / 'nested/review.pdf'))
    reader = PdfReader(path)
    assert len(reader.pages) >= 9
    texts = [p.extract_text() for p in reader.pages]
    for title, _ in build_pages(review):
        assert any(title in text for text in texts)
    assert all(FOOTER in text for text in texts)
    water = next(m['value']['base'] for m in review['metrics'] if m['id'] == 'co2e_saving_kg')
    assert f'{water:,.2f}'.rstrip('0').rstrip('.') in reader.pages[1].extract_text()
    assert 'L003' in reader.pages[-1].extract_text()
    assert json.loads(reader.attachments['review.json'][0]) == review
    assert review == before
    assert export_pdf(review, path) == path


@pytest.mark.parametrize('priority,metric', [
    ('water', 'water_saving_l'), ('emissions', 'co2e_saving_kg'),
    ('cost', 'idle_value_eur'), ('circularity', 'repairs_total'),
    ('service', 'on_time_rate'), ('improvement', 'allocation_use_rate'),
])
def test_all_priority_spotlights(review, tmp_path, priority, metric):
    review['meta']['priority'] = priority
    review['meta']['sensitivity'] = 'low'
    review['priority_view']['priority'] = priority
    review['priority_view']['emphasized_metric_ids'] = [metric]
    pages = build_pages(review)
    assert metric in str(section(review, 'Priority spotlight'))
    assert 'LOW' in str(section(review, 'Priority spotlight'))
    assert len(PdfReader(export_pdf(review, str(tmp_path / (priority + '.pdf')))).pages) >= 9


def test_export_never_uses_stale_sample_narratives(review):
    review['observations'][0]['observation'] = 'STALE SAMPLE NARRATIVE 999999'
    for metric in review['metrics']:
        if metric['id'] in ('repairs_total', 'textile_waste_kg'):
            metric.pop('breakdown', None)
    assert 'STALE SAMPLE NARRATIVE' not in str(build_pages(review))
    assert 'not supplied' in str(build_pages(review))


def test_spotlight_uses_contract_metric_order_and_reports_unavailable(review):
    ids = ['co2e_saving_kg', 'idle_pieces', 'water_saving_l', 'not_available']
    review['priority_view']['emphasized_metric_ids'] = ids
    spotlight = section(review, 'Priority spotlight')[1]
    metrics = {m['id']: m for m in review['metrics']}
    assert [h for h, _ in spotlight[:3]] == [metrics[i]['label'] for i in ids[:3]]
    assert 'not_available' in str(spotlight)
    assert metrics['customer_water_l']['label'] not in [heading for heading, _ in spotlight]


def test_breakdowns_render_when_present_and_missing_only_when_absent(review):
    metrics = {m['id']: m for m in review['metrics']}
    metrics['repairs_total']['breakdown'] = {'by_repair_type': [
        {'repair_type': 'ZIPPER', 'value': 123}, {'repair_type': 'BUTTON', 'value': 456}]}
    metrics['textile_waste_kg']['breakdown'] = {'by_route': [
        {'route': 'recycling_kg', 'value': 987.5}, {'route': 'reuse_kg', 'value': 234.5}]}
    text = str(section(review, 'Circularity'))
    assert 'ZIPPER: 123' in text and 'BUTTON: 456' in text
    assert 'recycling_kg: 987.5' in text and 'reuse_kg: 234.5' in text
    assert 'not supplied' not in text
    del metrics['textile_waste_kg']['breakdown']
    text = str(section(review, 'Circularity'))
    assert 'ZIPPER: 123' in text and 'Waste routes: not supplied' in text
    assert 'Repair types: not supplied' not in text


def test_long_content_continues_losslessly_in_both_formats(review, tmp_path):
    from backend.export.layout import layout_pages, paragraph
    # A long unique paragraph reproduces overflow without relying on current pack size.
    long_gap = ' '.join(f'OverflowEvidence{i:04d}' for i in range(450))
    review['data_gaps'].append({'gap': long_gap, 'impact': 'Test overflow', 'future_source': 'FINAL_SOURCE_MARKER'})
    prepared = layout_pages(build_pages(review))
    assert len(prepared) > 9
    assert all(card.size >= 9 for page in prepared for card in page.cards)
    for page in prepared:
        for card in page.cards:
            assert paragraph(card.text, card.size).wrap(card.width - 24, card.height - 24)[1] <= card.height - 24
    pdf = PdfReader(export_pdf(review, str(tmp_path / 'overflow.pdf')))
    deck = Presentation(export_pptx(review, str(tmp_path / 'overflow.pptx')))
    assert len(pdf.pages) == len(deck.slides) == len(prepared)
    pdf_text = '\n'.join(p.extract_text() for p in pdf.pages)
    pptx_text = '\n'.join(s.text for slide in deck.slides for s in slide.shapes if s.has_text_frame)
    for text in (pdf_text, pptx_text):
        assert all(f'OverflowEvidence{i:04d}' in text for i in range(450))
        assert 'FINAL_SOURCE_MARKER' in text
        assert text.count(FOOTER) == len(prepared)
    assert json.loads(pdf.attachments['review.json'][0]) == review
    assert 'SOURCE REVIEW' in deck.slides[-1].notes_slide.notes_text_frame.text
    assert not any('SOURCE REVIEW' in s.notes_slide.notes_text_frame.text for s in list(deck.slides)[:-1])


def test_source_notes_follow_actual_slide_count(review, tmp_path, monkeypatch):
    import backend.export.pptx_export as module
    # Explicitly exercise fewer than nine conceptual slides, independently of overflow.
    monkeypatch.setattr(module, 'build_pages', lambda r: [('Only slide', [('Card', 'Body')])])
    deck = Presentation(module.export_pptx(review, str(tmp_path / 'one.pptx')))
    assert len(deck.slides) == 1
    assert 'SOURCE REVIEW' in deck.slides[0].notes_slide.notes_text_frame.text


@pytest.mark.parametrize('font_path', [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    'C:/Windows/Fonts/arial.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
])
def test_cross_platform_font_discovery(font_path, monkeypatch):
    from backend.export import fonts
    from unittest.mock import Mock
    monkeypatch.setattr(fonts.pdfmetrics, 'getRegisteredFontNames', lambda: [])
    monkeypatch.setattr(fonts.Path, 'is_file', lambda p: str(p) == font_path)
    constructor = Mock(return_value=object())
    monkeypatch.setattr(fonts, 'TTFont', constructor)
    register = Mock()
    monkeypatch.setattr(fonts.pdfmetrics, 'registerFont', register)
    assert fonts.review_font() == 'ReviewSans'
    constructor.assert_called_once_with('ReviewSans', font_path)
    register.assert_called_once()


@pytest.fixture(scope='module')
def workbook_tables():
    import os
    from backend.engine.adapters.excel_adapter import DEFAULT_SOURCE, load_tables
    source = Path(os.environ.get('ENGINE_TEST_WORKBOOK', DEFAULT_SOURCE))
    if not source.is_file():
        pytest.skip('Set ENGINE_TEST_WORKBOOK to test real-engine exports')
    return load_tables(source)


@pytest.mark.parametrize('customer', ['CUST001', 'CUST002', 'CUST003'])
@pytest.mark.parametrize('priority,baseline,case', [
    ('water', 'B_LOCAL', 'base'), ('emissions', 'B_HOME', 'low'),
    ('cost', 'B_INHOUSE', 'high'), ('circularity', 'B_LOCAL', 'low'),
    ('service', 'B_HOME', 'high'), ('improvement', 'B_INHOUSE', 'base'),
])
def test_real_engine_exports_all_customer_priority_paths(workbook_tables, monkeypatch, tmp_path, customer, priority, baseline, case):
    import importlib
    from backend.insights import generate_observations
    module = importlib.import_module('backend.engine.build_review')
    monkeypatch.setattr(module, 'load_tables', lambda _: workbook_tables)
    review = module.build_review(customer_id=customer, priority=priority, baseline_id=baseline, sensitivity=case)
    review['observations'] = generate_observations(review, use_llm=False)
    before = copy.deepcopy(review)
    pages = build_pages(review)
    expected = review['priority_view']['emphasized_metric_ids']
    metric_map = {m['id']: m for m in review['metrics']}
    assert [h for h, _ in section(review, 'Priority spotlight')[1]][:len(expected)] == [metric_map[i]['label'] for i in expected]
    assert 'not supplied' not in str(section(review, 'Circularity'))
    assert {q['severity'] for q in review['data_quality']} <= {'warning', 'info', 'error'}
    pdf = PdfReader(export_pdf(review, str(tmp_path / 'engine.pdf')))
    deck = Presentation(export_pptx(review, str(tmp_path / 'engine.pptx')))
    assert len(pdf.pages) == len(deck.slides) >= 9
    text = '\n'.join(p.extract_text() for p in pdf.pages)
    assert 'L003' in text
    assert 'by_route' in deck.slides[-1].notes_slide.notes_text_frame.text
    assert json.loads(pdf.attachments['review.json'][0]) == review
    assert review == before


def test_api_exports_use_actual_workbook_without_sample_fallback(tmp_path, monkeypatch):
    import os
    from backend.engine.adapters.excel_adapter import DEFAULT_SOURCE
    from backend.api import main as api
    from fastapi.testclient import TestClient
    source = Path(os.environ.get('ENGINE_TEST_WORKBOOK', DEFAULT_SOURCE))
    if not source.is_file():
        pytest.skip('Set ENGINE_TEST_WORKBOOK for real-workbook API export tests')
    monkeypatch.setattr(api, 'DEFAULT_DATA_PATH', source)
    monkeypatch.setattr(api, '_ACTIVE_DATA_PATH', source)
    monkeypatch.setattr(api, '_REVIEW_CACHE', {})
    def forbidden_fallback():
        raise AssertionError('Real-workbook test must not silently use the sample')
    monkeypatch.setattr(api, '_load_sample_review', forbidden_fallback)
    payload = dict(customer_id='CUST001', priority='water', use_llm=False)
    with TestClient(api.app) as client:
        response = client.post('/api/review', json=payload)
        assert response.status_code == 200
        review = response.json()
        metrics = {m['id']: m for m in review['metrics']}
        assert metrics['water_saving_l']['value']['base'] == pytest.approx(1406620.29, abs=.01)
        assert all(q['severity'] == q['severity'].lower() for q in review['data_quality'])
        for fmt in ('pdf', 'pptx'):
            response = client.post('/api/export?format=' + fmt, json=payload)
            assert response.status_code == 200
            path = tmp_path / ('api.' + fmt)
            path.write_bytes(response.content)
            if fmt == 'pdf':
                pdf = PdfReader(path)
                assert len(pdf.pages) >= 9
                embedded = json.loads(pdf.attachments['review.json'][0])
            else:
                deck = Presentation(path)
                assert len(deck.slides) >= 9
                notes = deck.slides[-1].notes_slide.notes_text_frame.text
                embedded = json.loads(notes.split('SOURCE REVIEW (complete provenance, unchanged):\n', 1)[1])
            assert embedded['metrics'] == review['metrics']
            assert embedded['priority_view'] == review['priority_view']


def test_spotlight_uses_supplied_ids_in_order_without_local_priority_map(review):
    review['priority_view']['emphasized_metric_ids'] = ['co2e_saving_kg', 'idle_pieces', 'water_saving_l']
    m = {m['id']: m for m in review['metrics']}
    spotlight = section(review, 'Priority spotlight')[1]
    assert [h for h, _ in spotlight[:-1]] == [m[i]['label'] for i in review['priority_view']['emphasized_metric_ids']]
    assert m['customer_water_l']['label'] not in [h for h, _ in spotlight]


def test_missing_emphasis_is_explicit_without_inventing_kpis(review):
    review['priority_view']['emphasized_metric_ids'] = []
    assert 'No emphasized metric IDs supplied' in str(section(review, 'Priority spotlight'))
    review['priority_view']['emphasized_metric_ids'] = ['missing_metric']
    assert 'Unavailable spotlight indicators' in str(section(review, 'Priority spotlight'))
    assert 'missing_metric' in str(section(review, 'Priority spotlight'))


@pytest.mark.parametrize('repair_present,route_present', [(True, True), (True, False), (False, True), (False, False)])
def test_breakdown_availability_is_checked_independently(review, repair_present, route_present):
    before = copy.deepcopy(review)
    metrics = {m['id']: m for m in review['metrics']}
    metrics['repairs_total'].pop('breakdown', None)
    metrics['textile_waste_kg'].pop('breakdown', None)
    if repair_present:
        metrics['repairs_total']['breakdown'] = {'by_repair_type': [{'repair_type': 'ZIPPER', 'value': 123}]}
    if route_present:
        metrics['textile_waste_kg']['breakdown'] = {'by_route': [{'route': 'recycling_kg', 'value': 987.5}]}
    expected = copy.deepcopy(review)
    text = str(section(review, 'Circularity'))
    assert ('ZIPPER: 123' in text) == repair_present
    assert ('recycling_kg: 987.5' in text) == route_present
    assert ('Repair types: not supplied' in text) == (not repair_present)
    assert ('Waste routes: not supplied' in text) == (not route_present)
    assert review == expected


@pytest.fixture(scope='module')
def real_tables():
    import os
    from backend.engine.adapters.excel_adapter import DEFAULT_SOURCE, load_tables
    source = Path(os.environ.get('ENGINE_TEST_WORKBOOK', DEFAULT_SOURCE))
    if not source.is_file():
        pytest.skip('Set ENGINE_TEST_WORKBOOK for real engine/export coverage')
    return load_tables(source)


@pytest.mark.parametrize('customer', ['CUST001', 'CUST002', 'CUST003'])
@pytest.mark.parametrize('priority,baseline,case', [
    ('water', 'B_LOCAL', 'base'), ('emissions', 'B_HOME', 'low'),
    ('cost', 'B_INHOUSE', 'high'), ('circularity', 'B_LOCAL', 'low'),
    ('service', 'B_HOME', 'high'), ('improvement', 'B_INHOUSE', 'base'),
])
def test_engine_spotlight_and_breakdowns_in_both_exports(real_tables, monkeypatch, tmp_path, customer, priority, baseline, case):
    import importlib
    from backend.export.content import fmt
    module = importlib.import_module('backend.engine.build_review')
    monkeypatch.setattr(module, 'load_tables', lambda _: real_tables)
    review = module.build_review(customer_id=customer, priority=priority, baseline_id=baseline, sensitivity=case)
    before = copy.deepcopy(review)
    pages = build_pages(review)
    metrics = {m['id']: m for m in review['metrics']}
    ids = review['priority_view']['emphasized_metric_ids']
    assert [h for h, _ in section(review, 'Priority spotlight')[1]][:len(ids)] == [metrics[i]['label'] for i in ids]
    assert 'not supplied' not in str(section(review, 'Circularity'))
    pdf = PdfReader(export_pdf(review, str(tmp_path / 'real.pdf')))
    deck = Presentation(export_pptx(review, str(tmp_path / 'real.pptx')))
    assert len(pdf.pages) == len(deck.slides) >= 9
    pdf_spotlight = pdf_section(pdf, 'Priority spotlight').extract_text()
    ppt_spotlight = '\n'.join(s.text for s in deck_section(deck, 'Priority spotlight').shapes if s.has_text_frame)
    for text in (pdf_spotlight, ppt_spotlight):
        assert all(i in text for i in ids)
    repair = metrics['repairs_total']['breakdown']['by_repair_type'][0]
    route = metrics['textile_waste_kg']['breakdown']['by_route'][0]
    for text in (pdf_section(pdf, 'Circularity').extract_text(), '\n'.join(s.text for s in deck_section(deck, 'Circularity').shapes if s.has_text_frame)):
        assert repair['repair_type'] in text and fmt(repair['value']) in text
        assert route['route'] in text and fmt(route['value']) in text
        assert 'not supplied' not in text
    assert json.loads(pdf.attachments['review.json'][0]) == review
    assert review == before


@pytest.fixture
def meeting_review(review):
    review['meeting'] = {
        'persona': 'cfo', 'targets': {'on_time_rate': .99, 'median_cycle_hours': 80, 'service_requests': 500},
        'satisfaction': {'score': 8, 'scale': 10, 'source': 'KAM input'},
        'rough_calc': {'inputs': {'water_eur_per_m3': 3, 'energy_eur_per_kwh': .2}, 'result_eur': 1234.5, 'label': 'ROUGH CALCULATION'},
        'agreed_actions': ['Review allocation at Kotka and Helsinki'], 'open_topics': ['Repair causes and follow-up ownership'],
    }
    return review


@pytest.mark.parametrize('persona', ['ceo', 'cfo', 'operations', 'sustainability'])
def test_meeting_flow_and_persona_summaries(meeting_review, persona):
    from backend.insights.personas import PERSONAS
    import jsonschema
    meeting_review['meeting']['persona'] = persona
    jsonschema.validate(meeting_review, json.loads((ROOT / 'contracts/review.schema.json').read_text()))
    before = copy.deepcopy(meeting_review)
    pages = build_pages(meeting_review)
    assert [p[0] for p in pages[:6]] == ['Title & basics', 'Executive summary', 'Agreement & KPIs', 'Peer review',
                                       'Rough calculation', 'Agreed next steps & open topics']
    tiles = [b['id'] for _, b in pages[1][1] if isinstance(b, dict) and b.get('kpi')]
    assert tiles == PERSONAS[persona]['metric_ids']
    assert 'idle_value_eur' not in str(pages)
    assert meeting_review == before


def test_meeting_block_is_optional_and_no_agreement_is_invented(review):
    pages = build_pages(review)
    assert not any(p[0] == 'Agreed next steps & open topics' for p in pages)
    text = str(section(review, 'Agreement & KPIs'))
    assert 'no SLA is inferred' in text and 'DATA GAP' in text
    review['meeting'] = {}
    assert 'No actions recorded yet' in str(section(review, 'Agreed next steps'))


def test_targets_satisfaction_and_rough_values_are_kam_input(meeting_review):
    text = str(section(meeting_review, 'Agreement & KPIs'))
    assert '99.0%' in text and 'KAM input target' in text
    assert '8 / 10 | KAM input, not measured' in text
    text = str(section(meeting_review, 'Rough calculation'))
    assert '€1,234.5' in text and 'ROUGH CALCULATION' in text
    assert 'KAM assumption' in text and 'not promised savings' in text
    meeting_review['meeting']['rough_calc']['result_eur'] = 0
    assert '€0 | supplied KAM scenario' in str(section(meeting_review, 'Rough calculation'))
    meeting_review['meeting']['rough_calc']['inputs'] = {}
    assert 'No financial result is inferred' in str(section(meeting_review, 'Rough calculation'))


@pytest.mark.parametrize('score,scale', [(None, 10), (11, 10), (-1, 10), (8, 0), (True, 10)])
def test_invalid_satisfaction_is_a_gap(meeting_review, score, scale):
    meeting_review['meeting']['satisfaction'] = {'score': score, 'scale': scale}
    assert 'DATA GAP: no customer satisfaction dataset' in str(section(meeting_review, 'Agreement & KPIs'))


def test_anonymised_peers_and_customer_provenance(meeting_review, tmp_path):
    from backend.export.meeting import prepare_export_review
    meeting_review['meeting']['internal_notes'] = 'PRIVATE_KAM_NOTE'
    meeting_review['peer_benchmark'] = {
        'scope': 'Apex Industrial Systems',
        'customer': {'allocation_use_rate': {'network_median': .86, 'percentile': .35, 'customer_name': 'Mediora Health Network'}},
        'sites': {'ANOTHER_CUSTOMER_SITE': {'allocation_use_rate': .01}},
    }
    meeting_review['products'][0]['synthetic_purchase_cost_eur'] = 42
    before = copy.deepcopy(meeting_review)
    text = str(section(meeting_review, 'Peer review'))
    assert '86.0%' in text and '35.0%' in text and 'Lindström network median' in text
    assert 'Apex Industrial' not in text and 'Mediora' not in text
    pdf = PdfReader(export_pdf(meeting_review, str(tmp_path / 'customer.pdf')))
    deck = Presentation(export_pptx(meeting_review, str(tmp_path / 'customer.pptx')))
    snapshot = json.loads(pdf.attachments['review.json'][0])
    notes = deck.slides[-1].notes_slide.notes_text_frame.text
    source = json.loads(notes.split('SOURCE REVIEW (complete provenance, unchanged):\n')[1])
    assert snapshot == source == prepare_export_review(meeting_review)
    for serialized in (json.dumps(snapshot), notes):
        assert 'Apex Industrial Systems' not in serialized and 'Mediora Health Network' not in serialized
        assert 'PRIVATE_KAM_NOTE' not in serialized and 'ANOTHER_CUSTOMER_SITE' not in serialized
        assert 'idle_value_eur' not in serialized and 'synthetic_purchase_cost_eur' not in serialized
    assert meeting_review == before


def test_missing_network_does_not_invent_a_benchmark(meeting_review):
    peer = str(section(meeting_review, 'Peer review'))
    assert 'Network benchmark not supplied' in peer
    assert 'within-customer percentile' in peer


def test_long_meeting_notes_survive_both_exports(meeting_review, tmp_path):
    notes = [f'Confirm task marker TASK_{i:03d} with a customer-approved owner and follow-up date.' for i in range(65)]
    meeting_review['meeting']['agreed_actions'] = notes
    pdf = PdfReader(export_pdf(meeting_review, str(tmp_path / 'notes.pdf')))
    deck = Presentation(export_pptx(meeting_review, str(tmp_path / 'notes.pptx')))
    assert len(pdf.pages) == len(deck.slides)
    texts = ('\n'.join(p.extract_text() for p in pdf.pages),
             '\n'.join(s.text for slide in deck.slides for s in slide.shapes if s.has_text_frame))
    for text in texts:
        assert all(f'TASK_{i:03d}' in text for i in range(65))
        assert 'Repair causes and follow-up ownership' in text
        assert text.count(FOOTER) == len(pdf.pages)
    assert json.loads(pdf.attachments['review.json'][0])['meeting']['agreed_actions'] == notes


def test_meeting_payload_reaches_export_through_existing_api(meeting_review, tmp_path):
    from fastapi.testclient import TestClient
    from backend.api.main import app
    with TestClient(app) as client:
        for fmt in ('pdf', 'pptx'):
            response = client.post('/api/export?format=' + fmt, json=meeting_review)
            assert response.status_code == 200
            path = tmp_path / ('meeting.' + fmt)
            path.write_bytes(response.content)
            text = ('\n'.join(p.extract_text() for p in PdfReader(path).pages) if fmt == 'pdf' else
                    '\n'.join(s.text for slide in Presentation(path).slides for s in slide.shapes if s.has_text_frame))
            assert 'Review allocation at Kotka and Helsinki' in text
            assert 'Agreed next steps & open topics' in text
