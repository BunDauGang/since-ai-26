"""PDF export with measured continuation pages and lossless source attachment.

Same frame as the PowerPoint (Lindström managerial dashboard mockups): white top bar with
the logo, large title and subtitle, KPI tiles and white rounded module cards.
"""
import io
import json
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.graphics import renderPDF
from reportlab.graphics.charts.barcharts import HorizontalBarChart, VerticalBarChart
from reportlab.graphics.shapes import Drawing, Rect, String
from pypdf import PdfReader, PdfWriter
from .content import build_pages, FOOTER
from .meeting import prepare_export_review
from .fonts import review_font as _font
from .layout import layout_pages, paragraph
from .pptx_export import LOGO, STATUS_COLORS, subtitle

SERIES_COLORS = ['#93A8C2', '#003F72', '#5B7FA6']  # low / base / high
INK, MUTED, LINE, CANVAS, RED = '#1E293B', '#64748B', '#DDE3EA', '#F3F5F8', '#E30613'


def _chart(c, card, font):
    spec = card.chart
    w, h = card.width - 24, card.height - 48
    d = Drawing(w, h)
    horizontal = spec['chart'] == 'bar'
    chart = HorizontalBarChart() if horizontal else VerticalBarChart()
    pad_left = 120 if horizontal else 40
    chart.x, chart.y = pad_left, 28
    chart.width, chart.height = w - pad_left - 12, h - 40
    chart.data = [values for _, values in spec['series']]
    chart.categoryAxis.categoryNames = [str(n)[:28] for n in spec['categories']]
    for axis in (chart.categoryAxis, chart.valueAxis):
        axis.labels.fontName, axis.labels.fontSize = font, 7
    chart.valueAxis.valueMin = 0
    single = len(spec['series']) == 1
    for i in range(len(spec['series'])):
        chart.bars[i].fillColor = HexColor('#003F72' if single else SERIES_COLORS[i % 3])
        chart.bars[i].strokeColor = None
    if single:
        chart.barLabelFormat = '%.1f'
        chart.barLabels.fontName, chart.barLabels.fontSize = font, 7
        chart.barLabels.boxAnchor = 'w' if horizontal else 's'
        chart.barLabels.dx, chart.barLabels.dy = (3, 0) if horizontal else (0, 3)
    d.add(chart)
    if not single:
        for i, (name, _) in enumerate(spec['series']):
            d.add(Rect(pad_left + i * 70, 4, 8, 8, fillColor=HexColor(SERIES_COLORS[i % 3]), strokeColor=None))
            d.add(String(pad_left + i * 70 + 12, 5, name, fontName=font, fontSize=8))
    renderPDF.draw(d, c, card.x + 12, card.top - card.height + 8)


def _card(c, card):
    c.setFillColor(HexColor('#FFFFFF')); c.setStrokeColor(HexColor(LINE)); c.setLineWidth(0.75)
    c.roundRect(card.x, card.top - card.height, card.width, card.height, 7, fill=1, stroke=1)


def _pill(c, x_right, y, text, fill, color, font, size=7, outline=None):
    width = c.stringWidth(text, font, size) + 12
    c.setFillColor(HexColor(fill))
    c.setStrokeColor(HexColor(outline or fill)); c.setLineWidth(0.75)
    c.roundRect(x_right - width, y, width, size + 7, (size + 7) / 2, fill=1, stroke=1)
    c.setFillColor(HexColor(color)); c.setFont(font, size)
    c.drawCentredString(x_right - width / 2, y + 4, text)


def _kpi(c, card, font):
    k = card.kpi
    _card(c, card)
    x, top = card.x + 14, card.top
    c.setFillColor(HexColor(MUTED)); c.setFont(font, 10); c.drawString(x, top - 20, card.text.split('\n')[0][:48])
    c.setFillColor(HexColor(INK)); c.setFont(font, 22); c.drawString(x, top - 46, k['value'])
    c.setFillColor(HexColor(MUTED)); c.setFont(font, 8)
    c.drawString(x, top - 62, k['detail'])
    c.drawString(x, top - 76, k.get('range', ''))
    fill, color = STATUS_COLORS.get(k.get('status', ''), ('E2E8F0', '334155'))
    _pill(c, card.x + card.width - 12, top - card.height + 8, k.get('status', '').replace('_', ' '), '#' + fill, '#' + color, font)


def export_pdf(review: dict, out_path: str) -> str:
    review = prepare_export_review(review)
    font = _font()
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(1152, 648))
    c.setTitle(review['meta']['customer_name'] + ' | Synthetic customer review')
    pages = layout_pages(build_pages(review))
    sub = subtitle(review)
    for index, page in enumerate(pages, 1):
        c.setFillColor(HexColor(CANVAS)); c.rect(0, 0, 1152, 648, fill=1, stroke=0)
        # Top bar with logo and synthetic-data pill
        c.setFillColor(HexColor('#FFFFFF')); c.rect(0, 592, 1152, 56, fill=1, stroke=0)
        c.setStrokeColor(HexColor(LINE)); c.setLineWidth(0.75); c.line(0, 592, 1152, 592)
        if LOGO.is_file():
            c.drawImage(str(LOGO), 32, 607, height=26, width=26 * 2130 / 455, mask='auto')
        _pill(c, 1112, 610, 'SYNTHETIC DATA · PROTOTYPE', '#FFFFFF', RED, font, size=8, outline=RED)
        # Title and subtitle
        c.setFillColor(HexColor(INK)); c.setFont(font, 26); c.drawString(40, 548, page.title)
        c.setFillColor(HexColor(MUTED)); c.setFont(font, 11); c.drawString(40, 524, sub)
        for card in page.cards:
            if card.kpi:
                _kpi(c, card, font)
                continue
            _card(c, card)
            para = paragraph(card.text if not card.chart else card.text.split('\n')[0], card.size)
            _, height = para.wrap(card.width - 24, card.height - 24)
            para.drawOn(c, card.x + 12, card.top - 12 - height)
            if card.chart:
                _chart(c, card, font)
        c.setFillColor(HexColor(MUTED)); c.setFont(font, 8)
        c.drawString(40, 21, FOOTER); c.drawRightString(1112, 21, f"{index} / {len(pages)}")
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
