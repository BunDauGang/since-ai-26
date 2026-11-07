"""Story-first meeting sections, using only optional contract fields and supplied KPIs."""
from copy import deepcopy
from math import isfinite
from backend.insights.personas import persona_config
from backend.insights.formatting import fmt

INTERNAL = {'idle_value_eur', 'synthetic_purchase_cost_eur'}
PEER_METRICS = {'on_time_rate', 'allocation_use_rate', 'repair_rate_per_1000', 'median_cycle_hours',
                'service_requests_per_wearer', 'service_requests_per_1000_wearers'}
PEER_SCOPE = 'Lindström network (synthetic, anonymised)'


def numeric(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value)


def mapping(value):
    return value if isinstance(value, dict) else {}


def prepare_export_review(review):
    """Meeting packets are customer-facing, including their source attachment/notes.

    Older exports without meeting retain their original provenance unchanged.
    Free-text actions/topics are intentionally customer-shared KAM input.
    """
    if 'meeting' not in review and 'peer_benchmark' not in review:
        return review
    if 'meeting' in review and not isinstance(review['meeting'], dict):
        raise ValueError('meeting must be an object')
    def clean(value):
        if isinstance(value, dict):
            return {k: clean(v) for k, v in value.items() if k not in INTERNAL}
        if isinstance(value, list):
            return [clean(v) for v in value if not (isinstance(v, dict) and v.get('id') in INTERNAL)
                    and not (isinstance(v, str) and v in INTERNAL)]
        return value
    packet = clean(deepcopy(review)) if 'meeting' in review else deepcopy(review)
    if 'meeting' in packet:
        packet['meeting'] = {k: v for k, v in packet['meeting'].items()
                             if k in ('persona', 'targets', 'satisfaction', 'rough_calc', 'agreed_actions', 'open_topics')}
        if isinstance(packet['meeting'].get('satisfaction'), dict):
            packet['meeting']['satisfaction']['source'] = 'KAM input'
    packet['observations'] = [o for o in packet.get('observations', [])
                              if not (set(o.get('metric_ids', [])) & INTERNAL)]
    peer = mapping(packet.get('peer_benchmark'))
    if peer:
        site_ids = {s['site_id'] for s in packet.get('sites', [])}
        packet['peer_benchmark'] = {
            'scope': PEER_SCOPE,
            'customer': {k: {field: v for field, v in mapping(row).items()
                             if field in ('network_median', 'percentile') and numeric(v)}
                         for k, row in mapping(peer.get('customer')).items() if k in PEER_METRICS},
            'sites': {sid: {k: v for k, v in mapping(row).items() if k in PEER_METRICS and numeric(v)}
                      for sid, row in mapping(peer.get('sites')).items() if sid in site_ids},
        }
    return packet


def display(value, unit=''):
    if not numeric(value):
        return 'Not available'
    return f'{value * 100:.1f}%' if unit == 'ratio' else f'{fmt(value)} {unit}'.strip()


def agreement_blocks(review):
    meeting = mapping(review.get('meeting'))
    targets = mapping(meeting.get('targets'))
    metrics = {m['id']: m for m in review['metrics']}
    blocks = []
    for key in ('on_time_rate', 'median_cycle_hours', 'service_requests'):
        metric = metrics.get(key)
        actual = metric['value']['base'] if metric else None
        unit = metric['unit'] if metric else ('ratio' if key == 'on_time_rate' else '')
        target = targets.get(key)
        valid_target = numeric(target) and target >= 0 and (key != 'on_time_rate' or target <= 1)
        comparison = ''
        if valid_target and numeric(actual):
            met = actual >= target if key == 'on_time_rate' else actual <= target
            comparison = '\nAt/within proposed target.' if met else '\nDiscuss the gap; investigate causes before changing service.'
        blocks.append((metric['label'] if metric else key.replace('_', ' ').title(),
            f'Actual: {display(actual, unit)} (base case)\n'
            f"{metric['status'] if metric else 'DATA GAP'} | source: review.metrics.{key}\n"
            + (f'KAM input target: {display(target, unit)}' if valid_target else 'KAM input target: not supplied or invalid; no SLA is inferred.')
            + comparison))
    sat = mapping(meeting.get('satisfaction'))
    score, scale = sat.get('score'), sat.get('scale')
    valid_score = numeric(score) and numeric(scale) and scale > 0 and 0 <= score <= scale
    blocks.append(('Customer satisfaction',
                   f'{fmt(score)} / {fmt(scale)} | KAM input, not measured satisfaction data.' if valid_score
                   else 'DATA GAP: no customer satisfaction dataset is supplied. The KAM may record a meeting score with its scale.'))
    return blocks


def peer_blocks(review):
    from .content import pct
    peer = mapping(review.get('peer_benchmark'))
    metrics = {m['id']: m for m in review['metrics']}
    network = []
    for key, row in mapping(peer.get('customer')).items():
        if key not in PEER_METRICS:
            continue
        row = mapping(row)
        median, percentile = row.get('network_median'), row.get('percentile')
        if not numeric(median):
            continue
        metric = metrics.get(key)
        label = metric['label'] if metric else key.replace('_', ' ').title()
        unit = metric['unit'] if metric else ('requests/wearer' if key == 'service_requests_per_wearer' else '')
        actual = display(metric['value']['base'], unit) if metric else 'Not supplied'
        rank = f'; percentile {percentile * 100:.1f}%' if numeric(percentile) and 0 <= percentile <= 1 else ''
        network.append(f'{label}: customer {actual}; Lindström network median {display(median, unit)}{rank}')
    blocks = [('Anonymised network context', '\n'.join(network) + '\nSYNTHETIC | not an industry benchmark.' if network else
               'Network benchmark not supplied. Show within-customer site peers only; no industry-wide comparison can be established.')]
    sites = [s for s in review.get('sites', []) if numeric(s.get('metrics', {}).get('allocation_use_rate'))]
    values = [s['metrics']['allocation_use_rate'] for s in sites]
    rows = []
    for site in sorted(sites, key=lambda s: (s['metrics']['allocation_use_rate'], s['site_id']))[:5]:
        rate = site['metrics']['allocation_use_rate']
        supplied = mapping(mapping(peer.get('sites')).get(site['site_id'])).get('allocation_use_rate')
        percentile = supplied if numeric(supplied) and 0 <= supplied <= 1 else (
            sum(v < rate for v in values) + .5 * sum(v == rate for v in values)) / len(values)
        rows.append(f"{site['site_name']}: use {pct(rate)}; within-customer percentile {percentile * 100:.1f}%")
    blocks.append(('Sites to discuss', '\n'.join(rows) if rows else 'Site allocation data unavailable.'))
    blocks.append(('Interpret the comparison', 'Percentiles show position, not performance quality. Compare product mix, site type and period before drawing conclusions. '
                   'Site ranks use a midrank for ties when no supplied percentile exists. High repair activity is not automatically poor service.'))
    return blocks


def rough_blocks(review):
    from .content import baseline_name
    rough = mapping(mapping(review.get('meeting')).get('rough_calc'))
    inputs = mapping(rough.get('inputs'))
    lines = []
    for key, value in inputs.items():
        if key in INTERNAL:
            continue
        if numeric(value):
            lines.append(f'{key}: {fmt(value)} | KAM assumption')
        elif isinstance(value, str):
            lines.append(f'{key}: {value} | KAM assumption')
    result = rough.get('result_eur')
    result_text = (f'€{fmt(result)} | supplied KAM scenario estimate' if lines and numeric(result) else
                   'Not calculated: enter prices and assumptions in Meeting mode. No financial result is inferred.')
    alternatives = []
    for b in review.get('baseline_comparison', []):
        water, energy = mapping(b.get('water_saving_l')), mapping(b.get('energy_saving_kwh'))
        alternatives.append(f"{baseline_name(b.get('baseline_id'), b.get('name', 'Alternative'))}: "
                            f"water {display(water.get('base'), 'L')}; energy {display(energy.get('base'), 'kWh')} (base estimates)")
    return [('ROUGH CALCULATION · KAM ASSUMPTIONS', result_text + '\n' + ('\n'.join(lines) if lines else 'No KAM price inputs supplied.')),
            ('Comparison with alternatives', '\n'.join(alternatives) or 'No baseline comparison supplied.'),
            ('Decision boundary', 'The displayed euro result is supplied by the meeting calculator; it is not independently recomputed in the exporter. '
             'Check units, scope and prices with the customer. Rental stock value is not their saving. '
             'Repair handprint and process savings can overlap commercially; do not add them without a stated boundary. '
             'These are rough estimates, not promised savings or forecasts.')]


def next_steps_blocks(meeting):
    def recorded(key, empty):
        rows = meeting.get(key)
        selected = [x for x in rows if isinstance(x, str) and x.strip()] if isinstance(rows, list) else []
        return '\n'.join('• ' + x for x in selected) if selected else empty
    return [('Agreed actions | KAM meeting record', recorded('agreed_actions', 'No actions recorded yet; confirm an owner and follow-up date together.')),
            ('Open topics | continue the conversation', recorded('open_topics', 'No open topics recorded.')),
            ('Confirm before sharing', 'These are KAM-entered meeting notes, not automatically completed tasks. '
             'Confirm customer agreement, ownership and timing. Share only customer-approved notes.')]


def build_meeting_pages(review, details):
    from .content import kpi_block, baseline_name
    meeting = mapping(review.get('meeting'))
    config = persona_config(meeting.get('persona', 'ceo'))
    metrics = {m['id']: m for m in review['metrics']}
    case = review['meta'].get('sensitivity', 'base')
    def tiles(ids):
        return [kpi_block(metrics[key], case) for key in ids if key in metrics]
    countries = {s.get('country') for s in review.get('sites', []) if s.get('country')}
    meta = review['meta']
    pages = [
        ('Title & basics', tiles(['delivery_sites', 'wearers_min_est', 'garments_allocated']) + [
            (meta['customer_name'], f"{len(countries)} countries | {meta['period']['from']} to {meta['period']['to']}\n"
             f"Persona: {config['name']} | {case} sensitivity case\nAlternative: {baseline_name(meta['baseline_id'], meta.get('baseline_name', ''))}\n"
             'Synthetic prototype evidence. Start with the relationship, then agree what matters in this meeting.')]),
        ('Executive summary', tiles(config['metric_ids']) + [('Conversation focus | ' + config['name'], config['focus']),
                                                           ('The ask', config['ask'])]),
        ('Agreement & KPIs', agreement_blocks(review)),
        ('Peer review', peer_blocks(review)),
        ('Rough calculation', rough_blocks(review)),
    ]
    if 'meeting' in review:
        pages.append(('Agreed next steps & open topics', next_steps_blocks(meeting)))
    # Retain existing evidence/calculation views as optional deep-dive appendix sections.
    pages.extend(details[2:])
    return pages
