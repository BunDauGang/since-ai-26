"""Public API for rule-backed executive observations and priority interpretation."""
import re
from .rules import evaluate_rules, INDUSTRY_RULES
from .actions import action_text

COPY = {
    'R1': ('Lowest-use sites warrant an allocation review; unscanned stock is not proof of waste.', 'Review locker buffers and shift requirements before rebalancing garments.', 'Customer', 'Where can we pilot an allocation review while maintaining garment availability?'),
    'R2': ('Repair intensity exceeds the customer site median threshold.', 'Inspect garment specifications and work conditions; confirm causes before changing products.', 'Both', 'Which repair causes should we investigate with site operations?'),
    'R3': ('These sites fall below the customer on-time benchmark.', 'Review pickup schedules and late-cycle causes with the service team.', 'Lindström', 'Which schedule changes could improve service continuity?'),
    'R4': ('Service requests per estimated minimum wearer exceed the site-median threshold. The denominator is an estimate.', 'Obtain request categories and resolution times before assigning causes.', 'Both', 'Which request categories should the teams address first?'),
    'R5': ('Water savings are allocated estimates against the selected baseline, with low/base/high uncertainty.', 'Validate laundry intensity and the comparison baseline before external use.', 'Both', 'Which baseline best represents the customer alternative?'),
    'R6': ('Data-quality warnings and missing production sources limit the conclusions.', 'Reconcile laundry volumes and link approved wearer and service-request sources.', 'Both', 'Which missing production source should we connect first?'),
    'CONTEXT': ('Reported activity is synthetic prototype evidence, not a production outcome.', 'Review the source and assumptions with the account team.', 'Both', 'What evidence is needed to use this indicator in the next review?'),
}


def _evidence(fact):
    """Render only deterministic numbers with metric/site references."""
    def fmt(v):
        return f'{v:,.2f}'.rstrip('0').rstrip('.') if isinstance(v, float) else f'{v:,}'
    rule = fact['rule_id']
    values = fact['numbers']
    if rule == 'R5':
        v = values['water_saving_l']
        sites = [(k, n) for k, n in values.items() if k != 'water_saving_l']
        return (f"water_saving_l: Low {fmt(v['low'])} / Base {fmt(v['base'])} / High {fmt(v['high'])} L. "
                + 'Highest washed_kg: ' + '; '.join(f'{k}: {fmt(n)} kg' for k, n in sites))
    if rule == 'CONTEXT':
        return '; '.join(f"{k}: {fmt(v['base'])} (base)" for k, v in values.items())
    key = {'R1': 'allocation_use_rate', 'R2': 'repair_rate_per_1000', 'R3': 'on_time_rate', 'R4': 'service_requests per 1,000 wearers'}[rule]
    benchmarks = [(k, v) for k, v in values.items() if k.startswith('customer_')]
    selected = [(k, v) for k, v in values.items() if not k.startswith('customer_')][:3]
    def display(v):
        if isinstance(v, dict):
            v = v['allocation_use_rate']
        return f'{v * 100:.2f}%' if rule in ('R1', 'R3') else fmt(v)
    return (key + ': ' + '; '.join(f'{k}: {display(v)}' for k, v in selected)
            + ('. Benchmark: ' + '; '.join(f'{k}: {display(v)}' for k, v in benchmarks) if benchmarks else ''))



def render_fact(fact, index):
    observation, action, owner, question = COPY[fact['rule_id']]
    if fact['numbers']:
        observation += ' Evidence: ' + _evidence(fact) + '.'
    if fact['rule_id'] == 'R6':
        # Retain exact source messages without turning known inconsistent registry prose into computed claims.
        observation += ' Sources to resolve: ' + '; '.join(g['gap'] for g in fact.get('data_gaps', [])) + '.'
        observation += ' Checks: ' + ', '.join(q['check_id'] for q in fact.get('data_quality', [])) + '.'
    observation += ' Why it matters: ' + fact['industry_relevance']
    action = action_text(fact)
    question = 'Which site/source owner will confirm this scope, the proposed benefit and a comparable follow-up measure? ' + question
    return dict(id=f'OBS{index}', title=fact['title'], observation=observation,
                recommended_action=action, owner=owner, steering_question=question,
                metric_ids=fact['metric_ids'], site_ids=fact['site_ids'],
                status='RULE_GENERATED_FROM_CALCULATED_DATA', confidence='Low-Medium')


def generate_observations(review: dict, use_llm: bool = True) -> list[dict]:
    facts = evaluate_rules(review)
    if len(facts) > 5:
        gap = next((f for f in facts if f['rule_id'] == 'R6'), None)
        facts = facts[:4] + [gap] if gap and gap not in facts[:5] else facts[:5]
    else:
        facts = facts[:5]
    fallback = [render_fact(f, i + 1) for i, f in enumerate(facts)]
    if use_llm:
        from .llm import polish
        return polish(facts, fallback)
    return fallback


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
    first = INDUSTRY_RULES.get(industry, ['R6'])[0]
    return {'R3': 'service', 'R1': 'cost'}.get(first, 'improvement')


# Compatibility name requested by integration callers; retain interpret_prompt too.
interpret_priority = interpret_prompt
