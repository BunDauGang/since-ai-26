"""Usage: python -m backend.export contracts/sample_review.json --out-dir out"""
import argparse
import json
from pathlib import Path
from . import export_pdf, export_pptx


def main():
    parser = argparse.ArgumentParser(description='Export a synthetic customer review offline')
    parser.add_argument('review', type=Path)
    parser.add_argument('--out-dir', type=Path, default=Path('out'))
    args = parser.parse_args()
    review = json.loads(args.review.read_text(encoding='utf-8'))
    for extension, exporter in [('pptx', export_pptx), ('pdf', export_pdf)]:
        print(exporter(review, str(args.out_dir / f'review.{extension}')))


if __name__ == '__main__':
    main()
