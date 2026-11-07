"""Regenerate the bundled demo from source, without stale hand-written prose.

Run from the repository root: python -m backend.engine.sample_review
This optional command invokes the insights observation generator. Core engine
calculations use the shared priority helper, but need no LLM or export service.
"""

import argparse
import json
from pathlib import Path

from .build_review import build_review


ROOT = Path(__file__).resolve().parents[2]


def build_sample(source_path=None):
    from backend.insights.generate import generate_observations
    from backend.insights.rules import evaluate_rules
    import jsonschema

    review = build_review(source_path=source_path)
    flag_map = {"R1": "R1_LOW_ALLOCATION_USE", "R2": "R2_HIGH_REPAIR_RATE",
                "R3": "R3_LATE_CYCLES", "R4": "R4_SERVICE_REQUESTS"}
    sites = {site["site_id"]: site for site in review["sites"]}
    for fact in evaluate_rules(review):
        flag = flag_map.get(fact.get("rule_id"))
        if flag:
            for site_id in fact.get("site_ids", []):
                if site_id in sites and flag not in sites[site_id]["flags"]:
                    sites[site_id]["flags"].append(flag)
    review["observations"] = generate_observations(review, use_llm=False)
    schema = json.loads((ROOT / "contracts/review.schema.json").read_text(encoding="utf-8"))
    jsonschema.validate(review, schema)
    # Fail before overwriting the bundle if any non-finite number survived.
    json.dumps(review, allow_nan=False)
    return review


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", help="Workbook path; defaults to the pack in data/")
    args = parser.parse_args()
    review = build_sample(args.source)
    target = ROOT / "contracts/sample_review.json"
    target.write_text(json.dumps(review, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"Updated {target}: {len(review['metrics'])} metrics, {len(review['sites'])} sites, {len(review['observations'])} observations")


if __name__ == "__main__":
    main()
