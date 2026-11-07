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


def test_powerpoint_has_nine_slides_evidence_and_source_notes(review, tmp_path):
    before = copy.deepcopy(review)
    path = export_pptx(review, str(tmp_path / 'nested/review.pptx'))
    deck = Presentation(path)
    assert len(deck.slides) == 9
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
    assert len(reader.pages) == 9
    for page, (title, _) in zip(reader.pages, build_pages(review)):
        text = page.extract_text()
        assert title in text
        assert FOOTER in text
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
    assert len(PdfReader(export_pdf(review, str(tmp_path / (priority + '.pdf')))).pages) == 9


def test_export_never_uses_stale_sample_narratives(review):
    review['observations'][0]['observation'] = 'STALE SAMPLE NARRATIVE 999999'
    assert 'STALE SAMPLE NARRATIVE' not in str(build_pages(review))
    assert 'not supplied' in str(build_pages(review))



def test_spotlight_uses_supplied_ids_in_order_without_local_priority_map(review):
    review['priority_view']['emphasized_metric_ids'] = ['co2e_saving_kg', 'idle_pieces', 'water_saving_l']
    m = {m['id']: m for m in review['metrics']}
    spotlight = build_pages(review)[2][1]
    assert [h for h, _ in spotlight[:-1]] == [m[i]['label'] for i in review['priority_view']['emphasized_metric_ids']]
    assert m['customer_water_l']['label'] not in [h for h, _ in spotlight]


def test_missing_emphasis_is_explicit_without_inventing_kpis(review):
    review['priority_view']['emphasized_metric_ids'] = []
    assert 'No emphasized metric IDs supplied' in str(build_pages(review)[2])
    review['priority_view']['emphasized_metric_ids'] = ['missing_metric']
    assert 'Unavailable spotlight indicators' in str(build_pages(review)[2])
    assert 'missing_metric' in str(build_pages(review)[2])


@pytest.mark.parametrize('repair_present,route_present', [(True, True), (True, False), (False, True), (False, False)])
def test_breakdown_availability_is_checked_independently(review, repair_present, route_present):
    before = copy.deepcopy(review)
    metrics = {m['id']: m for m in review['metrics']}
    if repair_present:
        metrics['repairs_total']['breakdown'] = {'by_repair_type': [{'repair_type': 'ZIPPER', 'value': 123}]}
    if route_present:
        metrics['textile_waste_kg']['breakdown'] = {'by_route': [{'route': 'recycling_kg', 'value': 987.5}]}
    expected = copy.deepcopy(review)
    text = str(build_pages(review)[5])
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
    assert [h for h, _ in pages[2][1]][:len(ids)] == [metrics[i]['label'] for i in ids]
    assert 'not supplied' not in str(pages[5])
    pdf = PdfReader(export_pdf(review, str(tmp_path / 'real.pdf')))
    deck = Presentation(export_pptx(review, str(tmp_path / 'real.pptx')))
    assert len(pdf.pages) == len(deck.slides) == 9
    pdf_spotlight = pdf.pages[2].extract_text()
    ppt_spotlight = '\n'.join(s.text for s in deck.slides[2].shapes if s.has_text_frame)
    for text in (pdf_spotlight, ppt_spotlight):
        assert all(i in text for i in ids)
    repair = metrics['repairs_total']['breakdown']['by_repair_type'][0]
    route = metrics['textile_waste_kg']['breakdown']['by_route'][0]
    for text in (pdf.pages[5].extract_text(), '\n'.join(s.text for s in deck.slides[5].shapes if s.has_text_frame)):
        assert repair['repair_type'] in text and fmt(repair['value']) in text
        assert route['route'] in text and fmt(route['value']) in text
        assert 'not supplied' not in text
    assert json.loads(pdf.attachments['review.json'][0]) == review
    assert review == before
