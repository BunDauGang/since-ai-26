"""PDF export with measured continuation pages and lossless source attachment."""
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
from .fonts import review_font as _font
from .layout import layout_pages, paragraph


SERIES_COLORS = ['#93A8C2', '#003F72', '#5B7FA6']  # low / base / high


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
            para = paragraph(card.text if not card.chart else card.text.split('\n')[0], card.size)
            _, height = para.wrap(card.width - 24, card.height - 24)
            para.drawOn(c, card.x + 12, card.top - 12 - height)
            if card.chart:
                _chart(c, card, font)
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
