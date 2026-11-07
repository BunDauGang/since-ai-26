"""Persona talk tracks with immutable evidence and an offline-first public API."""
from copy import deepcopy
from math import isfinite
from .personas import persona_config
from .priority import PRIORITY_EMPHASIS, interpret_prompt
from .formatting import fmt

POINT_CONTEXT = {
    'delivery_sites': 'Use the scale of the relationship to agree shared priorities.',
    'on_time_rate': 'Discuss availability and any gaps; this is not proof of customer satisfaction.',
    'co2e_saving_kg': 'This is a baseline-dependent allocated estimate, separate from repair handprint.',
    'wearers_min_est': 'This is a minimum estimate, not a deduplicated person count.',
    'repairs_total': 'Completed repairs support a lifetime discussion, but do not prove avoided customer purchases.',
    'idle_pieces': 'Unscanned pieces can include operational buffers; investigate before reducing stock.',
    'allocation_use_rate': 'Agree a site investigation while protecting garment availability.',
    'garments_allocated': 'This is rental stock, not the customer capital released or a financial saving.',
    'median_cycle_hours': 'Discuss service flow with operations; confirm causes before changing schedules.',
    'service_requests': 'Counts do not identify request causes, satisfaction or resolution times.',
    'water_saving_l': 'Name the selected alternative and show uncertainty before external communication.',
    'circular_waste_share': 'Allocated recycling and reuse share is not proof of avoided virgin production.',
    'customer_water_l': 'Laundry-level intensity allocates this footprint; it is not site-level metering.',
}


def _valid(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value)


def _display(value, unit):
    if not _valid(value):
        return 'unavailable'
    if unit == 'ratio':
        return f'{value * 100:.1f}%'
    if unit == 'kgCO2e' and abs(value) >= 1000:
        return f'{value / 1000:,.1f} t CO2e'
    return f'{fmt(value)} {unit}'.strip()


def build_story_template(review: dict, persona='ceo', goal='', minutes=15) -> dict:
    config = persona_config(persona)
    if not isinstance(goal, str) or len(goal) > 2000:
        raise ValueError('goal must be text of at most 2000 characters')
    if isinstance(minutes, bool) or not isinstance(minutes, int) or not 1 <= minutes <= 120:
        raise ValueError('minutes must be an integer from 1 to 120')
    metrics = {m['id']: m for m in review.get('metrics', [])}
    ids = list(config['metric_ids'][:3])
    theme = interpret_prompt(goal, '') if goal.strip() else 'improvement'
    if any(word in goal.lower() for word in ('cheaper', 'cheap alternative')):
        theme = 'cost'
    # An explicit goal changes emphasis, not the underlying evidence.
    if goal.strip() and theme != 'improvement':
        preferred = [key for key in PRIORITY_EMPHASIS[theme] if key in metrics and key != 'idle_value_eur']
        ids = list(dict.fromkeys(preferred[:1] + ids))[:3]
    case = review.get('meta', {}).get('sensitivity', 'base')
    if case not in ('low', 'base', 'high'):
        raise ValueError('Unknown review sensitivity')
    points = []
    for key in ids:
        metric = metrics.get(key)
        values = metric.get('value', {}) if metric else {}
        if not metric or not _valid(values.get(case)):
            points.append(dict(id=key, title='Evidence gap', headline='Evidence gap',
                               text=f'{key}: data unavailable; obtain the source before making a claim.',
                               detail=f'{key}: unavailable', metric_ids=[], evidence=[], status='DATA_GAP'))
            continue
        evidence = deepcopy(metric)
        value = _display(values[case], metric['unit'])
        text = f"{metric['label']}: {value} ({case} case). {POINT_CONTEXT.get(key, 'Review the source and limitations before using this indicator.')}"
        if all(_valid(values.get(c)) for c in ('low', 'high')) and values['low'] != values['high']:
            text += f" Range: {_display(values['low'], metric['unit'])} to {_display(values['high'], metric['unit'])}."
        text += f" {metric['status']}; confidence: {metric['confidence']}."
        points.append(dict(id=key, title=metric['label'], headline=f"{metric['label']}: {value}",
                           text=text, detail=text, metric_ids=[key], evidence=[evidence], status=metric['status']))
    def references(ids):
        return [key for key in ids if key in metrics]
    objections = [
        dict(id='pricing', question='What financial saving can we promise?',
             answer='The data cannot establish that. Use a rough calculation with explicit KAM price assumptions and agree its boundary. Rental stock value is not a customer saving.',
             readiness='gap', needs='Approved pricing, invoices and customer-specific cost evidence.', metric_ids=[]),
        dict(id='credibility', question='Can these estimates support external sustainability claims?',
             answer='Not on their own. Review sources, baseline, uncertainty and allocation limits, then obtain approved production evidence before external use.',
             readiness='caveat', needs='Approved baseline factors and production sources.',
             metric_ids=references(['water_saving_l', 'co2e_saving_kg'])),
        dict(id='availability', question='Are unscanned garments necessarily waste?',
             answer='No. They can include shift or seasonal buffers. Confirm site requirements and scan completeness before reallocation.',
             readiness='caveat', needs='Site buffer requirements and scan-completeness evidence.',
             metric_ids=references(['idle_pieces', 'allocation_use_rate'])),
    ]
    meta = review.get('meta', {})
    return dict(customer_id=meta.get('customer_id', ''), customer_name=meta.get('customer_name', ''),
                persona=persona, goal=goal.strip(), minutes=minutes,
                opening=f"Let us use this {minutes}-minute {config['name']} conversation to agree what matters for {meta.get('customer_name', 'this customer')}. {config['focus']}",
                points=points, likely_objections=objections, objections=deepcopy(objections), ask=config['ask'],
                source='template', status='TEMPLATE_FROM_REVIEW',
                limitations='Synthetic prototype evidence. Goals and duration are KAM preferences, not measured outcomes. No financial or service improvement is guaranteed.')


def generate_story(review: dict, persona='ceo', goal='', minutes=15, use_llm=False) -> dict:
    template = build_story_template(review, persona, goal, minutes)
    if not use_llm:
        return template
    from .llm import _polish_story_template
    return _polish_story_template(template)
