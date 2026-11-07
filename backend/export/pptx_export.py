"""Editable presentation with the same measured pagination as the PDF."""
import json
from pathlib import Path
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Inches, Pt
from .content import build_pages, FOOTER
from .fonts import font_family
from .layout import layout_pages

RED = 'E30613'
SLATE = '1E293B'


def _text(slide, x, y, width, height, text, size=14, color=SLATE, bold=False, card=False):
    frame = slide.shapes.add_textbox(Pt(x), Pt(y), Pt(width), Pt(height)).text_frame
    frame.word_wrap = True
    frame.margin_left = frame.margin_right = frame.margin_top = frame.margin_bottom = 0
    for i, line in enumerate(text.split('\n')):
        p = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
        p.text = line
        p.font.name = font_family()
        p.font.size = Pt(size)
        p.font.bold = bold
        p.font.color.rgb = RGBColor.from_string(RED if card and i == 0 else color)
        p.space_before = p.space_after = Pt(0)
        p.line_spacing = Pt(size * 1.35)
    return frame


def export_pptx(review: dict, out_path: str) -> str:
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(16), Inches(9)
    for index, page in enumerate(layout_pages(build_pages(review)), 1):
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        slide.background.fill.solid()
        slide.background.fill.fore_color.rgb = RGBColor.from_string('F1F5F9')
        _text(slide, 40, 20, 1072, 44, page.title, 24, bold=True)
        _text(slide, 40, 65, 1072, 24, 'LINDSTRÖM / CUSTOMER REVIEW / SYNTHETIC DATA – PROTOTYPE', 10, RED, True)
        for card in page.cards:
            y = 648 - card.top
            shape = slide.shapes.add_shape(1, Pt(card.x), Pt(y), Pt(card.width), Pt(card.height))
            shape.fill.solid(); shape.fill.fore_color.rgb = RGBColor(255, 255, 255)
            shape.line.fill.background()
            _text(slide, card.x + 12, y + 12, card.width - 24, card.height - 24,
                  card.text, card.size, card=True)
        _text(slide, 40, 615, 1000, 20, FOOTER, 8)
        _text(slide, 1085, 615, 27, 20, str(index), 8)
        slide.notes_slide.notes_text_frame.text = page.title + '\n' + '\n\n'.join(c.text for c in page.cards)
    # Provenance belongs to the final rendered slide, including continuation pages.
    if len(prs.slides):
        prs.slides[-1].notes_slide.notes_text_frame.text += (
            '\n\nSOURCE REVIEW (complete provenance, unchanged):\n'
            + json.dumps(review, ensure_ascii=False, indent=2))
    path = Path(out_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(path))
    return str(path)
