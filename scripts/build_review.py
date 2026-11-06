"""Run from any directory: python scripts/build_review.py --source PACK.xlsx."""

import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.engine.build_review import build_review


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source")
    parser.add_argument("--customer", default="CUST001")
    parser.add_argument("--from-month", default="2025-01")
    parser.add_argument("--to-month", default="2025-12")
    parser.add_argument("--baseline", default="B_LOCAL", choices=["B_LOCAL", "B_HOME", "B_INHOUSE"])
    parser.add_argument("--sensitivity", default="base", choices=["low", "base", "high"])
    parser.add_argument("--priority", choices=["water", "emissions", "cost", "circularity", "service", "improvement"])
    parser.add_argument("--out", type=Path, help="Output path (otherwise writes JSON to stdout)")
    args = parser.parse_args()
    review = build_review(args.customer, args.from_month, args.to_month, args.baseline,
                          args.sensitivity, args.priority, args.source)
    payload = json.dumps(review, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(payload, encoding="utf-8")
    else:
        print(payload, end="")


if __name__ == "__main__":
    main()
