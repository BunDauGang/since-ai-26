"""Shared deterministic topic resolution for engine defaults and user prompts."""
import re


def interpret_prompt(text: str, industry: str) -> str:
    """First explicit topic wins; unknown text uses the industry's top priority."""
    aliases = {
        'water': r'water|litres?|liters?|freshwater',
        'emissions': r'emissions?|carbon|co2e?|climate|ghg',
        'cost': r'costs?|price|pricing|budget|money|allocation',
        'circularity': r'circularity|circular|repairs?|reuse|recycling|waste|lifetime',
        'service': r'service|hygiene|delivery|deliveries|reliability|turnaround|on.time',
        'improvement': r'improvement|improve|next.year|optimi[sz]ation',
    }
    matches = [(m.start(), key) for key, pattern in aliases.items() if (m := re.search(r'\b(?:' + pattern + r')\b', text.lower()))]
    if matches:
        return min(matches)[1]
    return {'Food & Beverage': 'service', 'Healthcare': 'service', 'Manufacturing': 'cost'}.get(industry, 'improvement')
