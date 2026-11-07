import copy
import json
from pathlib import Path

import pytest
from pptx import Presentation
from pypdf import PdfReader

from backend.export import export_pptx, export_pdf
from backend.export.content import FOOTER, build_pages

ROOT = Path(__file__).resolve().parents[2]


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
    assert '1,406,482.6' in texts[1]
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
    assert '1,406,482.6' in reader.pages[1].extract_text()
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
    assert metric in str(pages[2])
    assert 'LOW' in str(pages[2])
    assert len(PdfReader(export_pdf(review, str(tmp_path / (priority + '.pdf')))).pages) >= 9


def test_export_never_uses_stale_sample_narratives(review):
    review['observations'][0]['observation'] = 'STALE SAMPLE NARRATIVE 999999'
    assert 'STALE SAMPLE NARRATIVE' not in str(build_pages(review))
    assert 'not supplied' in str(build_pages(review))


def test_spotlight_uses_contract_metric_order_and_reports_unavailable(review):
    ids = ['co2e_saving_kg', 'idle_pieces', 'water_saving_l', 'not_available']
    review['priority_view']['emphasized_metric_ids'] = ids
    spotlight = build_pages(review)[2][1]
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
    text = str(build_pages(review)[5])
    assert 'ZIPPER: 123' in text and 'BUTTON: 456' in text
    assert 'recycling_kg: 987.5' in text and 'reuse_kg: 234.5' in text
    assert 'not supplied' not in text
    del metrics['textile_waste_kg']['breakdown']
    text = str(build_pages(review)[5])
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
    assert [h for h, _ in pages[2][1]][:len(expected)] == [metric_map[i]['label'] for i in expected]
    assert 'not supplied' not in str(pages[5])
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
