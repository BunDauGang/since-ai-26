"""PDF export with measured continuation pages and lossless source attachment."""
import io
import json
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from pypdf import PdfReader, PdfWriter
from .content import build_pages, FOOTER
from .fonts import review_font as _font
from .layout import layout_pages, paragraph


def export_pdf(review: dict, out_path: str) -> str:
    font = _font()
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(1152, 648))
    c.setTitle(review['meta']['customer_name'] + ' | Synthetic customer review')
    for index, page in enumerate(layout_pages(build_pages(review)), 1):
        c.setFillColor(HexColor('#F1F5F9')); c.rect(0, 0, 1152, 648, fill=1, stroke=0)
        c.setFillColor(HexColor('#1E293B')); c.setFont(font, 24); c.drawString(40, 603, page.title)
        c.setFillColor(HexColor('#E30613')); c.setFont(font, 10)
        c.drawString(40, 573, 'LINDSTRÖM / CUSTOMER REVIEW / SYNTHETIC DATA – PROTOTYPE')
        for card in page.cards:
            c.setFillColor(HexColor('#FFFFFF'))
            c.rect(card.x, card.top - card.height, card.width, card.height, fill=1, stroke=0)
            para = paragraph(card.text, card.size)
            _, height = para.wrap(card.width - 24, card.height - 24)
            para.drawOn(c, card.x + 12, card.top - 12 - height)
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
