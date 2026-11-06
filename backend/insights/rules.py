"""Deterministic findings. No workbook access or language-model arithmetic."""
from math import ceil, isfinite
from statistics import median

PRIORITY_RULES = {
    'water': ['R5', 'R3', 'R4', 'R1', 'R2', 'R6'],
    'emissions': ['R2', 'R1', 'R3', 'R4', 'R6'],
    'cost': ['R1', 'R4', 'R2', 'R3', 'R6'],
    'circularity': ['R2', 'R1', 'R3', 'R4', 'R6'],
    'service': ['R3', 'R4', 'R1', 'R2', 'R6'],
    'improvement': ['R6', 'R1', 'R3', 'R4', 'R2'],
}
INDUSTRY_RULES = {
    'Food & Beverage': ['R3', 'R5', 'R4', 'R1', 'R2', 'R6'],
    'Manufacturing': ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'],
    'Healthcare': ['R3', 'R4', 'R6', 'R1', 'R2', 'R5'],
}


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value)


def evaluate_rules(review: dict) -> list[dict]:
    sites = review.get('sites', [])
    metrics = {m['id']: m for m in review.get('metrics', [])}
    facts = []

    def candidates(key):
        return [s for s in sites if number(s.get('metrics', {}).get(key))]

    def add(rule, title, ids, selected, numbers, severity='info', **extra):
        facts.append(dict(rule_id=rule, title=title, metric_ids=[i for i in ids if i in metrics],
                          site_ids=[s['site_id'] for s in selected], numbers=numbers,
                          severity=severity, **extra))

    rows = sorted(candidates('allocation_use_rate'), key=lambda s: (s['metrics']['allocation_use_rate'], s['site_id']))
    if rows:
        chosen = rows[:ceil(len(rows) * .2)]
        add('R1', 'Review allocation at the lowest-use sites', ['allocation_use_rate', 'idle_pieces'], chosen,
            {s['site_id']: {'allocation_use_rate': s['metrics']['allocation_use_rate']} for s in chosen}, 'warning')
    rows = candidates('repair_rate_per_1000')
    if rows:
        mid = median(s['metrics']['repair_rate_per_1000'] for s in rows)
        chosen = sorted((s for s in rows if s['metrics']['repair_rate_per_1000'] > 1.5 * mid), key=lambda s: s['site_id'])
        if chosen:
            add('R2', 'Investigate elevated repair rates', ['repair_rate_per_1000', 'repairs_total'], chosen,
                {'customer_site_median': mid, **{s['site_id']: s['metrics']['repair_rate_per_1000'] for s in chosen}}, 'warning')
    rows = candidates('on_time_rate')
    avg = metrics.get('on_time_rate', {}).get('value', {}).get('base')
    if rows:
        if not number(avg):
            avg = sum(s['metrics']['on_time_rate'] for s in rows) / len(rows)
        chosen = sorted((s for s in rows if s['metrics']['on_time_rate'] < avg), key=lambda s: (s['metrics']['on_time_rate'], s['site_id']))
        if chosen:
            add('R3', 'Review service continuity at late-cycle sites', ['on_time_rate'], chosen,
                {'customer_on_time_rate': avg, **{s['site_id']: s['metrics']['on_time_rate'] for s in chosen}}, 'warning')
    rows = [s for s in candidates('service_requests') if number(s['metrics'].get('wearers_min_est')) and s['metrics']['wearers_min_est'] > 0]
    rates = {s['site_id']: s['metrics']['service_requests'] / s['metrics']['wearers_min_est'] * 1000 for s in rows}
    if rates:
        mid = median(rates.values())
        chosen = sorted((s for s in rows if rates[s['site_id']] > 1.5 * mid), key=lambda s: (-rates[s['site_id']], s['site_id']))
        if chosen:
            add('R4', 'Investigate high service-request intensity', ['service_requests', 'wearers_min_est'], chosen,
                {'customer_site_median': mid, **{s['site_id']: rates[s['site_id']] for s in chosen}}, 'warning')
    if review['meta'].get('priority') == 'water' and 'water_saving_l' in metrics:
        chosen = sorted(candidates('washed_kg'), key=lambda s: (-s['metrics']['washed_kg'], s['site_id']))[:3]
        add('R5', 'Water value against the selected baseline', ['water_saving_l', 'washed_kg'], chosen,
            {'water_saving_l': metrics['water_saving_l']['value'], **{s['site_id']: s['metrics']['washed_kg'] for s in chosen}})
    gaps = review.get('data_gaps', [])
    quality = review.get('data_quality', [])
    if gaps or quality:
        add('R6', 'Resolve evidence gaps before external reporting', ['wearers_min_est', 'service_requests', 'customer_water_l'], [], {}, 'warning',
            data_gaps=gaps, data_quality=quality)
    # Supply useful factual context if fewer than three outlier rules trigger.
    for key, title in [('repairs_total', 'Repair activity and lifetime assumptions'),
                       ('washed_kg', 'Service activity in the reporting period'),
                       ('delivery_sites', 'Customer footprint across delivery sites')]:
        if len(facts) >= 3:
            break
        if key in metrics:
            add('CONTEXT', title, [key], [], {key: metrics[key]['value']})
    priority = PRIORITY_RULES.get(review['meta'].get('priority'), PRIORITY_RULES['improvement'])
    industry = INDUSTRY_RULES.get(review['meta'].get('industry'), [])
    # Consume rank-ordered contract industry rules when present (the workbook is Worker A's responsibility).
    text = ' '.join(review.get('priority_view', {}).get('industry_rules', [])).lower()
    if text:
        topics = [('hygiene', 'R3'), ('allocation', 'R1'), ('water', 'R5'), ('repair', 'R2'), ('traceability', 'R6'), ('service', 'R4')]
        industry = [r for _, r in sorted((text.index(word), r) for word, r in topics if word in text)] or industry
    def rank(f):
        rule = f['rule_id']
        return (0 if rule == priority[0] else 1,
                industry.index(rule) if rule in industry else 99,
                priority.index(rule) if rule in priority else 99, rule)
    return sorted(facts, key=rank)
