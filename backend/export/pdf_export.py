"""Matching nine-page PDF, with original review.json embedded for traceability."""
import io
import json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader, PdfWriter
from .content import build_pages, FOOTER


def _font():
    if 'ReviewSans' not in pdfmetrics.getRegisteredFontNames():
        path = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
        if not path.exists():
            raise RuntimeError('Install DejaVu Sans fonts for Unicode PDF output')
        pdfmetrics.registerFont(TTFont('ReviewSans', str(path)))
    return 'ReviewSans'


def export_pdf(review: dict, out_path: str) -> str:
    font = _font()
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(1152, 648))
    c.setTitle(review['meta']['customer_name'] + ' | Synthetic customer review')
    for index, (title, blocks) in enumerate(build_pages(review), 1):
        c.setFillColor(HexColor('#F1F5F9')); c.rect(0, 0, 1152, 648, fill=1, stroke=0)
        c.setFillColor(HexColor('#1E293B')); c.setFont(font, 24); c.drawString(40, 603, title)
        c.setFillColor(HexColor('#E30613')); c.setFont(font, 10)
        c.drawString(40, 573, 'LINDSTRÖM / CUSTOMER REVIEW / SYNTHETIC DATA – PROTOTYPE')
        cols = 3 if len(blocks) in (3, 5, 6) else 2
        rows = (len(blocks) + cols - 1) // cols
        width, height = 1072 / cols, 477 / max(rows, 1)
        for i, (heading, body) in enumerate(blocks):
            x = 40 + i % cols * width
            top = 551 - i // cols * height
            c.setFillColor(HexColor('#FFFFFF')); c.rect(x, top - height + 12, width - 13, height - 12, fill=1, stroke=0)
            combined = '<font color="#E30613">' + escape(heading) + '</font><br/><br/>' + escape(body).replace('\n', '<br/>')
            for size in range(12, 5, -1):
                para = Paragraph(combined, ParagraphStyle('card', fontName=font, fontSize=size, leading=size * 1.35, textColor=HexColor('#1E293B')))
                _, h = para.wrap(width - 37, height - 36)
                if h <= height - 36:
                    break
            if h > height - 36:
                raise ValueError('Report content exceeds page capacity; shorten source labels or extend the layout')
            para.drawOn(c, x + 12, top - 12 - h)
        c.setFillColor(HexColor('#1E293B')); c.setFont(font, 8)
        c.drawString(40, 21, FOOTER); c.drawRightString(1112, 21, str(index))
        c.showPage()
    c.save()
    writer = PdfWriter()
    writer.append(PdfReader(buffer))
    writer.add_attachment('review.json', json.dumps(review, ensure_ascii=False, indent=2).encode())
    path = Path(out_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('wb') as output:
        writer.write(output)
    return str(path)
