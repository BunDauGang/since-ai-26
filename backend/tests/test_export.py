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
    water = next(m['value']['base'] for m in review['metrics'] if m['id'] == 'water_saving_l')
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
    assert len(reader.pages) == 9
    for page, (title, _) in zip(reader.pages, build_pages(review)):
        text = page.extract_text()
        assert title in text
        assert FOOTER in text
    water = next(m['value']['base'] for m in review['metrics'] if m['id'] == 'water_saving_l')
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
    pages = build_pages(review)
    assert metric in str(pages[2])
    assert 'LOW' in str(pages[2])
    assert len(PdfReader(export_pdf(review, str(tmp_path / (priority + '.pdf')))).pages) == 9


def test_export_never_uses_stale_sample_narratives(review):
    review['observations'][0]['observation'] = 'STALE SAMPLE NARRATIVE 999999'
    assert 'STALE SAMPLE NARRATIVE' not in str(build_pages(review))
    assert 'not supplied' in str(build_pages(review))
