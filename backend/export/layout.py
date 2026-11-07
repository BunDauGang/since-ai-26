"""Measured, lossless card pagination shared by PDF and editable PowerPoint.

All dimensions are points on a 16:9 page (1152 x 648, origin bottom-left as in PDF).
The frame follows Lindström's managerial dashboard mockups: a white top bar with the
logo, a large title and subtitle, a row of KPI tiles, then white module cards.
Long content continues at a readable minimum font size instead of crashing,
clipping, or disappearing from the deck.
"""
import math
from dataclasses import dataclass
from xml.sax.saxutils import escape
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from .fonts import review_font


@dataclass
class Card:
    x: float
    top: float
    width: float
    height: float
    text: str
    size: int
    # {'chart': 'column'|'bar', 'categories': [...], 'series': [(name, [values])], 'unit': str}
    chart: dict | None = None
    # {'kpi': True, 'value': '1.41M L', 'detail': '...', 'range': '...', 'status': '...'}
    kpi: dict | None = None


# Frame geometry shared by both renderers.
LEFT, CONTENT_WIDTH = 40, 1072
CONTENT_TOP, CONTENT_BOTTOM = 506, 50
KPI_HEIGHT, GAP = 92, 12


@dataclass
class Page:
    title: str
    cards: list[Card]


def paragraph(text, size):
    lines = text.split('\n', 1)
    markup = '<font color="#003F72">' + escape(lines[0]) + '</font>'
    if len(lines) > 1:
        markup += '<br/>' + escape(lines[1]).replace('\n', '<br/>')
    return Paragraph(markup, ParagraphStyle(
        'card', fontName=review_font(), fontSize=size, leading=size * 1.35,
        textColor=HexColor('#1E293B'), splitLongWords=True,
    ))


def _height(text, size, width):
    return paragraph(text, size).wrap(width, 1000000)[1]


def _chunks(text, width, height):
    for size in (12, 11, 10, 9):
        if _height(text, size, width) <= height:
            return [(text, size)]
    chunks = []
    remaining = text
    while remaining:
        prefix = 'Continued\n\n' if chunks else ''
        lo, hi = 0, len(remaining)
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if _height(prefix + remaining[:mid], 9, width) <= height:
                lo = mid
            else:
                hi = mid - 1
        # Every grid reserves ample space for at least one line.
        if lo == 0:
            raise ValueError('Card layout has no room for a line of text')
        end = lo
        if end < len(remaining):
            boundary = max(remaining.rfind('\n', 0, end), remaining.rfind(' ', 0, end))
            if boundary > 0:
                end = boundary + 1
        chunks.append((prefix + remaining[:end], 9))
        remaining = remaining[end:]
    return chunks


def kpi_text(heading, kpi):
    """Text form of a KPI tile (notes, text extraction, fit check); the renderers draw it as a tile."""
    return '\n'.join(x for x in (heading, f"{kpi['value']} | {kpi['detail']}", kpi.get('range', '')) if x)


def layout_pages(pages):
    result = []
    for title, blocks in pages:
        kpis = [(h, b) for h, b in blocks if isinstance(b, dict) and b.get('kpi')]
        rest = [(h, b) for h, b in blocks if not (isinstance(b, dict) and b.get('kpi'))]
        tiles, band = [], 0
        if kpis:
            per_row = len(kpis) if len(kpis) <= 4 else (3 if len(kpis) in (5, 6) else 4)
            rows = math.ceil(len(kpis) / per_row)
            width = CONTENT_WIDTH / per_row
            for i, (heading, kpi) in enumerate(kpis):
                tiles.append(Card(LEFT + i % per_row * width, CONTENT_TOP - i // per_row * (KPI_HEIGHT + GAP),
                                  width - 13, KPI_HEIGHT, kpi_text(heading, kpi), 9, None, kpi))
            band = rows * (KPI_HEIGHT + GAP)
        top, area = CONTENT_TOP - band, CONTENT_TOP - band - CONTENT_BOTTOM
        if not rest:
            result.append(Page(title, tiles))
            continue
        capacity = min(len(rest), 8) or 1
        cols = 4 if capacity > 6 else (3 if capacity in (3, 5, 6) else 2)
        rows = (capacity + cols - 1) // cols
        # Cap row height so a single row of cards does not stretch to the footer.
        width, height = CONTENT_WIDTH / cols, min(area / rows, 280)
        entries = []
        for heading, body in rest:
            if isinstance(body, dict) and body.get('chart'):
                entries.append((heading, 12, body))  # charts keep one card; the renderer draws them
            else:
                entries.extend((text, size, None) for text, size in _chunks(heading + '\n\n' + body, width - 37, height - 36))
        for offset in range(0, max(1, len(entries)), capacity):
            cards = list(tiles) if offset == 0 else []  # KPI tiles only on the first page of a section
            for i, (text, size, chart) in enumerate(entries[offset:offset + capacity]):
                cards.append(Card(LEFT + i % cols * width, top - i // cols * height,
                                  width - 13, height - 12, text, size, chart))
            result.append(Page(title + (' (continued)' if offset else ''), cards))
    return result
