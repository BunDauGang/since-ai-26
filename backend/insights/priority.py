"""Shared deterministic topic resolution for engine defaults and user prompts."""
import re

# The ONE priority -> emphasized metric map. Engine priority_view, API and export read it from here;
# frontend/src/lib/config.ts mirrors it for offline mode (keep the two in sync).
PRIORITY_EMPHASIS = {
    "water": ["water_saving_l", "customer_water_l", "washed_kg", "co2e_saving_kg"],
    "emissions": ["co2e_saving_kg", "customer_co2e_kg", "avoided_product_co2e_kg"],
    "cost": ["idle_value_eur", "idle_pieces", "allocation_use_rate", "replacements_postponed"],
    "circularity": ["repairs_total", "replacements_postponed", "circular_waste_share", "textile_waste_kg"],
    "service": ["on_time_rate", "median_cycle_hours", "service_requests", "allocation_use_rate"],
    "improvement": ["allocation_use_rate", "water_saving_l", "repairs_total", "on_time_rate"],
}


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
