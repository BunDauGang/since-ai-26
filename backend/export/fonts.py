"""Shared Unicode font discovery for PDF measurement and both renderers."""
from pathlib import Path
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONT_PATHS = (
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    'C:/Windows/Fonts/DejaVuSans.ttf',
    'C:/Windows/Fonts/arial.ttf',
    'C:/Windows/Fonts/segoeui.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
)


def review_font():
    if 'ReviewSans' not in pdfmetrics.getRegisteredFontNames():
        for candidate in FONT_PATHS:
            if Path(candidate).is_file():
                pdfmetrics.registerFont(TTFont('ReviewSans', candidate))
                break
        else:
            raise RuntimeError('Install DejaVu Sans or Arial fonts for Unicode PDF output')
    return 'ReviewSans'


def font_family():
    family = pdfmetrics.getFont(review_font()).face.familyName
    return family.decode('utf-8') if isinstance(family, bytes) else family
