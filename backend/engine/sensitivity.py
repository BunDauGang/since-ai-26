"""Deterministic scenario assumptions; keep footprint fixed across baselines."""

import math


TEAM_ASSUMPTIONS = [
    {
        "id": "T001", "assumption": "Repair-factor sensitivity",
        "value_or_rule": "low=0.5; base=1.0; high=1.0",
        "rationale": "Illustrative range; requires challenge-contact confirmation.",
        "category": "repair", "confidence": "Low", "source": "Team assumption",
    },
    {
        "id": "T002", "assumption": "Baseline-factor sensitivity",
        "value_or_rule": "low=0.8 × baseline; base=baseline; high=1.2 × baseline",
        "rationale": "Illustrative range; requires challenge-contact confirmation.",
        "category": "baseline", "confidence": "Low", "source": "Team assumption",
    },
]


def _finite(*values: float) -> None:
    if not all(math.isfinite(value) for value in values):
        raise ValueError("Scenario inputs must be finite numbers")


def baseline_range(washed_kg: float, factor_per_kg: float, footprint: float) -> dict[str, float]:
    """Vary the baseline factors, NOT the net savings (guide §6.5)."""
    _finite(washed_kg, factor_per_kg, footprint)
    return {case: washed_kg * factor_per_kg * multiplier - footprint
            for case, multiplier in (("low", 0.8), ("base", 1.0), ("high", 1.2))}


def repair_range(repair_count: float, product_footprint: float = 1.0) -> dict[str, float]:
    _finite(repair_count, product_footprint)
    return {case: repair_count * factor * product_footprint
            for case, factor in (("low", 0.5), ("base", 1.0), ("high", 1.0))}
