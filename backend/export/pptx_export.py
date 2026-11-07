"""Editable presentation with the same measured pagination as the PDF.

Visual frame follows Lindström's managerial dashboard mockups: white top bar with the
logo, a large dark title with a grey subtitle, KPI tiles and white rounded module cards.
"""
import json
from pathlib import Path
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt
from .content import build_pages, FOOTER
from .meeting import prepare_export_review
from .fonts import font_family
from .layout import layout_pages

RED = 'E30613'
NAVY = '003F72'
INK = '1E293B'
MUTED = '64748B'
LINE = 'DDE3EA'
CANVAS = 'F3F5F8'
SERIES_COLORS = ['93A8C2', '003F72', '5B7FA6']  # low / base / high (navy family)
LOGO = Path(__file__).with_name('assets') / 'lindstrom-logo.png'
H = 648  # page height in points; layout uses PDF (bottom-left) coordinates

# Evidence status -> (fill, text) for the small pills on KPI tiles.
STATUS_COLORS = {
    'CALCULATED': ('DBEAFE', '1D4ED8'),
    'ALLOCATED_ESTIMATE': ('EDE9FE', '6D28D9'),
    'ESTIMATE': ('FEF3C7', '92400E'),
    'SYNTHETIC': ('E2E8F0', '334155'),
    'MEASURED': ('CCFBF1', '0F766E'),
    'PUBLIC_REFERENCE': ('D1FAE5', '047857'),
}


def subtitle(review):
    meta = review['meta']
    return (f"{meta['customer_name']} · {meta['industry']} · {meta['period']['from']} to {meta['period']['to']} · "
            f"vs {meta.get('baseline_name', meta['baseline_id']).lower()} · {meta['priority'].title()} lens · {meta.get('sensitivity', 'base')} case")


def _text(slide, x, y, width, height, text, size=14, color=INK, bold=False, card=False, align=None, anchor=None):
    frame = slide.shapes.add_textbox(Pt(x), Pt(y), Pt(width), Pt(height)).text_frame
    frame.word_wrap = True
    frame.margin_left = frame.margin_right = frame.margin_top = frame.margin_bottom = 0
    if anchor:
        frame.vertical_anchor = anchor
    for i, line in enumerate(text.split('\n')):
        p = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
        p.text = line
        p.font.name = font_family()
        p.font.size = Pt(size)
        p.font.bold = bold or (card and i == 0)
        p.font.color.rgb = RGBColor.from_string(NAVY if card and i == 0 else color)
        p.space_before = p.space_after = Pt(0)
        p.line_spacing = Pt(size * 1.35)
        if align:
            p.alignment = align
    return frame


def _box(slide, x, y, w, h, fill='FFFFFF', line=LINE, radius=0.06, shape=MSO_SHAPE.ROUNDED_RECTANGLE):
    box = slide.shapes.add_shape(shape, Pt(x), Pt(y), Pt(w), Pt(h))
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        box.adjustments[0] = radius
    box.fill.solid()
    box.fill.fore_color.rgb = RGBColor.from_string(fill)
    if line:
        box.line.color.rgb = RGBColor.from_string(line)
        box.line.width = Pt(0.75)
    else:
        box.line.fill.background()
    box.shadow.inherit = False
    return box


def _pill(slide, x, y, text, fill, color, size=8, outline=None):
    width = 9 + len(text) * size * 0.56
    pill = _box(slide, x, y, width, size + 8, fill=fill, line=outline, radius=0.5)
    frame = pill.text_frame
    frame.margin_left = frame.margin_right = frame.margin_top = frame.margin_bottom = 0
    frame.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = frame.paragraphs[0]
    p.text, p.alignment = text, PP_ALIGN.CENTER
    p.font.name, p.font.size, p.font.bold = font_family(), Pt(size), True
    p.font.color.rgb = RGBColor.from_string(color)
    return width


def _frame(slide, title, sub, index, total):
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = RGBColor.from_string(CANVAS)
    _box(slide, 0, 0, 1152, 56, line=None, shape=MSO_SHAPE.RECTANGLE)
    _box(slide, 0, 56, 1152, 0.75, fill=LINE, line=None, shape=MSO_SHAPE.RECTANGLE)
    if LOGO.is_file():
        slide.shapes.add_picture(str(LOGO), Pt(32), Pt(15), height=Pt(26))
    _pill(slide, 1112 - 9 - len('SYNTHETIC DATA · PROTOTYPE') * 8 * 0.56, 19, 'SYNTHETIC DATA · PROTOTYPE', 'FFFFFF', RED, outline=RED)
    _text(slide, 40, 74, 1072, 36, title, 26, INK, bold=True)
    _text(slide, 40, 112, 1072, 18, sub, 11, MUTED)
    _text(slide, 40, 618, 900, 16, FOOTER, 8, MUTED)
    _text(slide, 1012, 618, 100, 16, f"{index} / {total}", 8, MUTED, align=PP_ALIGN.RIGHT)


def _kpi(slide, card, y):
    k = card.kpi
    _box(slide, card.x, y, card.width, card.height)
    heading = card.text.split('\n')[0]
    _text(slide, card.x + 14, y + 10, card.width - 28, 16, heading, 10, MUTED)
    _text(slide, card.x + 14, y + 26, card.width - 28, 30, k['value'], 22, INK, bold=True)
    _text(slide, card.x + 14, y + 56, card.width - 28, 14, k['detail'], 8, MUTED)
    _text(slide, card.x + 14, y + 70, card.width - 120, 14, k.get('range', ''), 8, MUTED)
    fill, color = STATUS_COLORS.get(k.get('status', ''), ('E2E8F0', '334155'))
    label = k.get('status', '').replace('_', ' ')
    _pill(slide, card.x + card.width - 14 - (9 + len(label) * 7 * 0.56), y + 69, label, fill, color, size=7)


def _chart(slide, card, y):
    spec = card.chart
    data = CategoryChartData()
    data.categories = spec['categories']
    for name, values in spec['series']:
        data.add_series(name, values)
    kind = XL_CHART_TYPE.COLUMN_CLUSTERED if spec['chart'] == 'column' else XL_CHART_TYPE.BAR_CLUSTERED
    frame = slide.shapes.add_chart(kind, Pt(card.x + 8), Pt(y + 34), Pt(card.width - 16), Pt(card.height - 42), data)
    chart = frame.chart
    chart.font.size = Pt(9)
    chart.font.name = font_family()
    chart.has_legend = len(spec['series']) > 1
    if chart.has_legend:
        chart.legend.position = XL_LEGEND_POSITION.BOTTOM
        chart.legend.include_in_layout = False
    single = len(spec['series']) == 1
    for i, series in enumerate(chart.series):
        series.format.fill.solid()
        series.format.fill.fore_color.rgb = RGBColor.from_string(NAVY if single else SERIES_COLORS[i % 3])
    plot = chart.plots[0]
    plot.has_data_labels = single
    if single:
        plot.data_labels.font.size = Pt(8)
        plot.data_labels.number_format = '0.0'
        plot.data_labels.number_format_is_linked = False
    chart.value_axis.has_major_gridlines = False
    chart.value_axis.tick_labels.font.size = Pt(8)
    chart.category_axis.tick_labels.font.size = Pt(8)


def export_pptx(review: dict, out_path: str) -> str:
    review = prepare_export_review(review)
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(16), Inches(9)
    pages = layout_pages(build_pages(review))
    sub = subtitle(review)
    for index, page in enumerate(pages, 1):
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        _frame(slide, page.title, sub, index, len(pages))
        for card in page.cards:
            y = H - card.top
            if card.kpi:
                _kpi(slide, card, y)
                continue
            _box(slide, card.x, y, card.width, card.height)
            if card.chart:
                _text(slide, card.x + 14, y + 12, card.width - 28, 20, card.text, 12, card=True)
                _chart(slide, card, y)
            else:
                _text(slide, card.x + 14, y + 12, card.width - 28, card.height - 24, card.text, card.size, card=True)
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
