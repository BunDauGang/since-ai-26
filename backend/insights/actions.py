"""Grounded action scope. A review opportunity is never a promised saving."""
from math import isfinite


def valid(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value) and value >= 0


def enrich_facts(facts, review):
    sites = {s['site_id']: s.get('metrics', {}) for s in review.get('sites', [])}
    industry = review.get('meta', {}).get('industry', '')
    relevance = {
        'Food & Beverage': 'Food & Beverage teams need reliable garment availability for hygiene workflows.',
        'Healthcare': 'Healthcare teams need service continuity and garment traceability.',
        'Manufacturing': 'Manufacturing teams need stock efficiency and garment availability for production.',
    }.get(industry, 'Account teams need dependable service and transparent resource planning.')
    for fact in facts:
        rule = fact['rule_id']
        selected = [sites[s] for s in fact['site_ids'] if s in sites]
        scope = dict(flagged_sites=len(selected))
        def aggregate(key, label):
            values = [s.get(key) for s in selected]
            if values and all(valid(v) for v in values):
                scope[label] = sum(values)
        if rule == 'R1':
            aggregate('idle_pieces', 'idle_pieces_in_scope')
        elif rule == 'R2':
            aggregate('repairs_total', 'reported_repairs_in_scope')
            mid = fact['numbers']['customer_site_median']
            scope['max_rate_gap_per_1000'] = max(s['repair_rate_per_1000'] - mid for s in selected)
        elif rule == 'R3':
            avg = fact['numbers']['customer_on_time_rate']
            scope['max_gap_percentage_points'] = max(avg - s['on_time_rate'] for s in selected) * 100
        elif rule == 'R4':
            aggregate('service_requests', 'requests_in_scope')
            mid = fact['numbers']['customer_site_median']
            scope['max_request_rate_gap_per_1000'] = max(fact['numbers'][s] - mid for s in fact['site_ids'])
        elif rule == 'R5':
            aggregate('washed_kg', 'priority_site_washed_kg')
        elif rule == 'R6':
            scope.update(data_gap_count=len(fact.get('data_gaps', [])),
                         finding_count=len(fact.get('data_quality', [])),
                         distinct_check_count=len({q['check_id'] for q in fact.get('data_quality', [])}))
        fact['action_scope'] = scope
        fact['industry_relevance'] = relevance
    return facts


def action_text(fact):
    s = fact['action_scope']
    def fmt(value):
        return f'{value:,.2f}'.rstrip('0').rstrip('.') if isinstance(value, float) else f'{value:,}'
    rule = fact['rule_id']
    count = s['flagged_sites']
    if rule == 'R1':
        scope = (fmt(s['idle_pieces_in_scope']) + ' reported idle pieces' if 'idle_pieces_in_scope' in s
                 else 'idle-piece count unavailable; obtain allocation counts')
        text = f'Review {count} flagged sites: {scope}. Confirm shift buffers before any rebalance; this is investigation scope, not removable stock.'
        benefit = 'Potential benefit: better stock utilization while maintaining availability; no cost saving is established.'
    elif rule == 'R2':
        repairs = (fmt(s['reported_repairs_in_scope']) + ' reported repairs in scope' if 'reported_repairs_in_scope' in s
                   else 'repair count unavailable')
        text = (f'Inspect repair causes at {count} flagged sites; {repairs}. Maximum gap above site median: '
                f"{fmt(s['max_rate_gap_per_1000'])} repairs per 1,000 washed pieces. "
                'Exact excess repair counts are unavailable without unrounded wash denominators; do not infer avoidable repairs.')
        benefit = 'Potential benefit: longer garment life if preventable causes are confirmed; repairs also provide useful lifetime extension.'
    elif rule == 'R3':
        text = (f'Review pickup schedules at {count} flagged sites. Maximum benchmark gap: '
                f"{fmt(s['max_gap_percentage_points'])} percentage points. Propose closing the gap to the customer benchmark, subject to feasibility; late-cycle counts are unavailable.")
        benefit = 'Potential benefit: more dependable garment availability; improvement is not guaranteed.'
    elif rule == 'R4':
        requests = fmt(s['requests_in_scope']) + ' reported requests' if 'requests_in_scope' in s else 'request count unavailable'
        text = (f'Classify {requests} at {count} flagged sites. Maximum gap above site median: '
                f"{fmt(s['max_request_rate_gap_per_1000'])} requests per 1,000 estimated wearers. Validate wearer denominators before setting reduction targets.")
        benefit = 'Potential benefit: address recurring service issues; counts alone cannot establish causes or response times.'
    elif rule == 'R5':
        kg = fmt(s['priority_site_washed_kg']) + ' kg' if 'priority_site_washed_kg' in s else 'volume unavailable'
        text = f'Validate water intensity and the selected baseline at {count} highest-volume sites covering {kg}. Set an improvement target only after source validation.'
        benefit = 'Potential benefit: better water-efficiency decisions; the existing baseline saving is not additional future saving.'
    elif rule == 'R6':
        text = (f'Triage {s["data_gap_count"]} data gaps and {s["finding_count"]} finding records across '
                f'{s["distinct_check_count"]} distinct checks. Assign source owners and agree evidence acceptance criteria before external claims.')
        benefit = 'Potential benefit: more defensible customer discussions; finding records can repeat the same issue across months.'
    else:
        text = 'Confirm source completeness and agree a comparable measurement period before setting an improvement target.'
        benefit = 'Potential benefit: a clearer baseline for the next customer review.'
    return ('Proposed Q1 2026 planning scenario (KAM must confirm or reschedule): ' + text + ' ' + benefit)
