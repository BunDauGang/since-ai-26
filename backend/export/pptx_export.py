"""Nine-slide editable executive deck, with complete provenance in slide notes."""
import json
from pathlib import Path
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Inches, Pt
from .content import build_pages, FOOTER

RED = 'E30613'
SLATE = '1E293B'


def _text(slide, x, y, width, height, text, size=14, color=SLATE, bold=False):
    frame = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(width), Inches(height)).text_frame
    frame.word_wrap = True
    for i, line in enumerate(text.split('\n')):
        p = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
        p.text = line
        p.font.name = 'DejaVu Sans'
        p.font.size = Pt(size)
        p.font.bold = bold
        p.font.color.rgb = RGBColor.from_string(color)
        p.space_after = Pt(4)
    return frame


def export_pptx(review: dict, out_path: str) -> str:
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(16), Inches(9)
    pages = build_pages(review)
    for index, (title, blocks) in enumerate(pages, 1):
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        slide.background.fill.solid()
        slide.background.fill.fore_color.rgb = RGBColor.from_string('F1F5F9')
        _text(slide, .55, .25, 14.8, .65, title, 27, bold=True)
        _text(slide, .55, 1, 14.8, .35, 'LINDSTRÖM  /  CUSTOMER REVIEW  /  SYNTHETIC DATA – PROTOTYPE', 11, RED, True)
        n = len(blocks)
        cols = 3 if n in (3, 5, 6) else 2
        rows = (n + cols - 1) // cols
        width = 14.8 / cols
        height = 6.65 / max(rows, 1)
        for i, (heading, body) in enumerate(blocks):
            x, y = .55 + (i % cols) * width, 1.55 + (i // cols) * height
            card = slide.shapes.add_shape(1, Inches(x), Inches(y), Inches(width - .18), Inches(height - .2))
            card.fill.solid(); card.fill.fore_color.rgb = RGBColor(255, 255, 255)
            card.line.fill.background()
            _text(slide, x + .16, y + .12, width - .5, .55, heading, 13, RED, True)
            # Estimate wrapped lines, reducing font only for dense methodology panels.
            size = 13
            import textwrap
            while size > 8:
                lines = sum(max(1, len(textwrap.wrap(line, width=max(20, int((width - .5) * 72 / (size * .53)))))) for line in body.split('\n'))
                if lines * (size * 1.3 + 4) <= (height - 1) * 72:
                    break
                size -= 1
            _text(slide, x + .16, y + .8, width - .5, height - 1, body, size)
        _text(slide, .55, 8.55, 14, .25, FOOTER, 9)
        _text(slide, 15, 8.55, .5, .25, str(index), 9)
        slide.notes_slide.notes_text_frame.text = (f'{title}\n' + '\n\n'.join(h + '\n' + b for h, b in blocks))
        if index == 9:
            slide.notes_slide.notes_text_frame.text += '\n\nSOURCE REVIEW (complete provenance, unchanged):\n' + json.dumps(review, ensure_ascii=False, indent=2)
    path = Path(out_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(path))
    return str(path)
