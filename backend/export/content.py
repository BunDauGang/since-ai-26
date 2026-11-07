"""One presentation model shared by the PowerPoint and PDF renderers."""
import re
from backend.insights.generate import generate_observations
from backend.insights.formatting import fmt

FOOTER = 'Synthetic, illustrative data. Not audited. Not an approved Lindström claim.'
def compact(value, unit):
    """Big-number form for KPI tiles; the exact value stays on the tile's detail line."""
    if unit == 'ratio':
        return f"{value * 100:.1f}%"
    if unit == 'kgCO2e' and abs(value) >= 1000:  # tonnes read better on a tile (display only)
        return f"{value / 1000:,.1f} t CO2e"
    a = abs(value)
    number = (f"{value / 1e6:.2f}M" if a >= 1e6 else f"{value / 1e3:.1f}k" if a >= 1e4
              else f"{value:,.0f}" if a >= 100 else fmt(value))
    return f"€{number}" if unit == 'EUR' else f"{number} {unit}"


def kpi_block(metric, case='base'):
    """A KPI tile in the style of the managerial dashboard mockups."""
    v, unit = metric['value'], metric['unit']
    exact = f"{v[case] * 100:.2f}%" if unit == 'ratio' else f"{fmt(v[case])} {unit}"
    return (metric['label'], {
        'kpi': True, 'id': metric['id'],
        'value': compact(v[case], unit),
        'detail': f"{exact} | {case.upper()} case | {metric['id']}",
        'range': (f"Range {compact(v['low'], unit)} to {compact(v['high'], unit)}" if v['high'] > v['low'] else 'Single value'),
        'status': metric['status'], 'confidence': metric['confidence'],
    })


def pct(value):
    return f"{value * 100:.1f}%" if isinstance(value, (int, float)) else 'N/A'


def rule_only(formula):
    """The engine appends a long worked example after ' | Live arithmetic'; cards show the rule only."""
    return formula.split(' | Live arithmetic')[0].strip()


def metric_block(metric, case='base'):
    """A customer-readable KPI card: value, range, evidence label. Full formulas live in the provenance."""
    v = metric['value']
    spread = (f"Range (Low / Base / High): {fmt(v['low'])} / {fmt(v['base'])} / {fmt(v['high'])}"
              if v['high'] > v['low'] else 'Single value: no assumption changes it')
    return (metric['label'],
            f"{fmt(v[case])} {metric['unit']} | {case.upper()} case\n{spread}\n"
            f"{metric['status']} | Confidence: {metric['confidence']}\n"
            f"How: {rule_only(metric['formula'])}\n"
            f"{metric['id']} | {', '.join(metric['sources'])} | {', '.join(metric['assumptions']) or 'no assumptions'}")


def worked_example(metric):
    """Readable version of the engine's ' | Live arithmetic' trace, e.g. 'a kg * 9.5 ... = b'."""
    formula = metric.get('formula', '')
    at = formula.find(' | Live arithmetic')
    if at < 0:
        return None
    rest = formula[at + 3:]
    colon = rest.find('): ')
    rest = rest[colon + 3:] if colon >= 0 else rest
    expr = '; '.join(p.strip() for p in rest.split(';') if not re.match(r'\s*(scenario|baseline)=', p))
    expr = re.sub(r'(\d[\d,]*\.\d{2})\d+', r'\1', expr)  # 6 display decimals -> 2
    expr = re.sub(r'\s\*\s', ' × ', expr).replace(' - ', ' − ')
    return f"{metric['label']}\n{expr} {metric['unit']}\nRule: {rule_only(formula)}"


def _split_observation(o):
    text = o.get('observation', '')
    why_at, ev_at = text.find('Why it matters:'), text.find('Evidence:')
    why = text[why_at + len('Why it matters:'):].strip() if why_at >= 0 else ''
    head = text[:why_at] if why_at >= 0 else text
    finding = (head[:ev_at] if 0 <= ev_at < len(head) else head).strip()
    return finding, why


def _split_action(text):
    m = re.match(r'^Proposed (.+?) planning scenario \((.+?)\):\s*', text or '', re.I)
    tag = f"Proposed for {m.group(1)}, KAM to confirm" if m else ''
    rest = text[m.end():] if m else (text or '')
    at = rest.find('Potential benefit:')
    return tag, (rest[:at] if at >= 0 else rest).strip(), (rest[at + len('Potential benefit:'):].strip() if at >= 0 else '')


def story_blocks(observations, metrics, emphasized, case):
    """What happened -> Why it matters -> Next action, sliced from the review (same as the dashboard strip)."""
    lead = next((metrics[i] for i in emphasized if i in metrics), None)
    top = observations[0] if observations else None
    finding, why = _split_observation(top) if top else ('', '')
    blocks = []
    if lead:
        v = lead['value']
        rng = f"\nRange {fmt(v['low'])} to {fmt(v['high'])} {lead['unit']}" if v['high'] > v['low'] else ''
        blocks.append(('1 | What happened', f"{lead['label']}: {fmt(v[case])} {lead['unit']} ({case} case){rng}\n"
                       f"{lead['status']}" + (f"\n{finding}" if finding else '')))
    if why:
        blocks.append(('2 | Why it matters', why))
    if top:
        tag, action, benefit = _split_action(top.get('recommended_action', ''))
        blocks.append(('3 | Next action to consider', (tag + '\n' if tag else '') + action + f"\nOwner: {top.get('owner', '')}"
                       + (f"\nPotential benefit: {benefit}" if benefit else '')))
    return blocks


def build_pages(review):
    meta = review['meta']
    metrics = {m['id']: m for m in review['metrics']}
    case = meta.get('sensitivity', 'base')
    # Accept generated observations only when references and numerical evidence match
    # current deterministic findings. The shipped sample prose is known to be stale.
    observations = generate_observations(review, use_llm=False)
    supplied = review.get('observations', [])
    def tokens(o):
        return re.findall(r'\d+(?:[,.]\d+)*', ' '.join(o.get(k, '') for k in
                          ('title', 'observation', 'recommended_action', 'steering_question')))
    # Match by evidence (metric_ids + site_ids), not position: the dashboard re-orders observations for the
    # active priority lens, and the deck should follow that order. Wording may be edited; numbers may not.
    required = ('id', 'title', 'observation', 'recommended_action', 'steering_question', 'owner', 'status', 'confidence')
    def key(o):
        return (tuple(o.get('metric_ids') or []), tuple(o.get('site_ids') or []))
    current = {}
    for o in observations:
        current.setdefault(key(o), []).append(o)
    def accepted(a):
        if not all(isinstance(a.get(k), str) for k in required):
            return False
        candidates = current.get(key(a), [])
        match = next((b for b in candidates if tokens(a) == tokens(b)), None)
        if match is not None:
            candidates.remove(match)  # each current finding can back one supplied observation
        return match is not None
    if len(supplied) == len(observations) and all(accepted(a) for a in supplied):
        observations = supplied
    pages = []
    def page(title, blocks):
        pages.append((title, blocks))
    def blocks(ids):
        return [metric_block(metrics[i], case) for i in ids if i in metrics]
    def tiles(ids):
        return [kpi_block(metrics[i], case) for i in ids if i in metrics]
    emphasized_ids = list(dict.fromkeys(review.get('priority_view', {}).get('emphasized_metric_ids', [])))
    # Slide 1 is an executive one-pager: who/what/which baseline, then the three-step story.
    # Headline tiles, then the three-step story (customer, period and baseline sit in the subtitle).
    page('Customer value & sustainability review',
         tiles(['washed_kg', 'water_saving_l', 'co2e_saving_kg', 'repairs_total'])
         + story_blocks(observations, metrics, emphasized_ids, case))
    page('Executive summary', tiles(['delivery_sites', 'wearers_min_est', 'washed_kg', 'repairs_total', 'water_saving_l', 'co2e_saving_kg']) + [
        ('How to read these numbers', 'Every value carries its evidence status. SYNTHETIC: taken from the data pack. '
         'CALCULATED: computed directly from source rows. ALLOCATED_ESTIMATE: laundry-level use shared by your washed kg. '
         'ESTIMATE: depends on a stated assumption.\nSavings show the Base case with a Low to High range; quote Base and name the comparison baseline.\n'
         'Wearers are a minimum estimate: per-product counts double-count people with several garments.')])
    priority = meta['priority']
    # Shared contract is authoritative for both dashboard and deck.
    emphasized = list(dict.fromkeys(review.get('priority_view', {}).get('emphasized_metric_ids', [])))
    spotlight = tiles(emphasized)
    unavailable = [i for i in emphasized if i not in metrics]
    if unavailable:
        spotlight.append(('Unavailable spotlight indicators', ', '.join(unavailable) + '\nNo value supplied; see data gaps.'))
    if not emphasized:
        spotlight.append(('Priority indicators', 'No emphasized metric IDs supplied in priority_view.'))
    page(f'Priority spotlight | {priority.title()}', spotlight + [
        ('Industry context', '\n'.join(review.get('priority_view', {}).get('industry_rules', [])) +
         ('\nIllustrative capital value only; no demonstrated cost saving.' if priority == 'cost' else '\nIndustry context guides emphasis; it is not compliance advice.'))])
    baseline_blocks = []
    for b in review.get('baseline_comparison', []):
        lines = []
        for key, name, unit in [('water_saving_l', 'Water saving', 'L'), ('energy_saving_kwh', 'Energy saving', 'kWh'),
                                ('co2e_saving_kg', 'CO2e saving', 'kgCO2e')]:
            if key in b:
                v = b[key]
                lines.append(f"{name}: Base {fmt(v['base'])} {unit}\n  range {fmt(v['low'])} to {fmt(v['high'])}")
        baseline_blocks.append((b['name'], '\n'.join(lines) + '\nALLOCATED_ESTIMATE | Confidence: Low-Medium'))
    comparison = [b for b in review.get('baseline_comparison', []) if 'water_saving_l' in b]
    if comparison:
        baseline_blocks.insert(0, ('Water saving by alternative (m³): Low / Base / High', {
            'chart': 'column', 'unit': 'm³',
            'categories': [b['name'] for b in comparison],
            'series': [(case_name.title(), [round(b['water_saving_l'][case_name] / 1000, 1) for b in comparison])
                       for case_name in ('low', 'base', 'high')],
        }))
    example = next((worked_example(metrics[i]) for i in ('water_saving_l', 'co2e_saving_kg') if i in metrics and worked_example(metrics[i])), None)
    if example:
        baseline_blocks.append(('How the saving is calculated (selected baseline)', example))
    page('Baseline comparison | uncertainty matters', baseline_blocks + [
        ('Comparison boundary', 'Process and delivery impacts against each alternative. Repair handprint is separate; do not add it to service savings.\n'
         'Ranges are supplied by the engine; exports never recalculate or reconcile them.\n'
         'Small differences between baseline rows and metric totals can exist in the illustrative sample.')])
    sites = review.get('sites', [])
    site_blocks = []
    for country in sorted({s['country'] for s in sites}):
        rows = [s for s in sites if s['country'] == country]
        rows.sort(key=lambda s: s['metrics'].get('on_time_rate', -1))
        chosen = list({s['site_id']: s for s in [rows[0], rows[-1]]}.values())
        text = []
        for s in chosen:
            sm = s['metrics']
            text.append(f"{s['site_name']} ({s['site_id']})\nOn time: {pct(sm.get('on_time_rate'))} | Allocation use: {pct(sm.get('allocation_use_rate'))}\nWashed: {fmt(sm.get('washed_kg', 'N/A'))} kg")
        site_blocks.append((country + ' | lowest / highest on-time rate', '\n\n'.join(text) + '\nSynthetic site inputs; rates calculated.'))
    rated = sorted((s for s in sites if isinstance(s['metrics'].get('allocation_use_rate'), (int, float))),
                   key=lambda s: s['metrics']['allocation_use_rate'])[:8]
    if rated:
        site_blocks.insert(0, ('Allocation use by site: lowest 8 (%)', {
            'chart': 'bar', 'unit': '%',
            'categories': [s['site_name'] for s in rated][::-1],
            'series': [('Allocation use', [round(s['metrics']['allocation_use_rate'] * 100, 1) for s in rated][::-1])],
        }))
    page('Multi-site performance', site_blocks + [('Read the outliers', 'Sites shown have the lowest and highest on-time rate in each country.\n'
         'Source: review.sites; service-cycle and allocation data.\nInvestigate causes before attributing responsibility.')])
    breakdown_lines = []
    for metric_id, key, dimension, label in [
        ('repairs_total', 'by_repair_type', 'repair_type', 'Repair types'),
        ('textile_waste_kg', 'by_route', 'route', 'Waste routes'),
    ]:
        metric = metrics.get(metric_id, {})
        entries = metric.get('breakdown', {}).get(key)
        if not entries:
            breakdown_lines.append(label + ': not supplied in this review.')
            continue
        breakdown_lines.append(label + ' (' + metric.get('unit', '') + '): ' +
                               '; '.join(str(row[dimension]) + ': ' + fmt(row['value']) for row in entries))
        breakdown_lines.append(metric['status'] + ' | Confidence: ' + metric['confidence'])
    breakdown_lines.append('Repair effects are estimates; no avoided purchase is established. Circular share covers reuse + recycling.')
    page('Circularity & repair handprint', tiles(['repairs_total', 'replacements_postponed', 'avoided_product_co2e_kg', 'textile_waste_kg', 'circular_waste_share']) + [
        ('Repair types & waste routes', '\n'.join(breakdown_lines))])
    def observation_card(o):
        # Customer-readable: finding, its evidence, the action and its owner. The industry context is on slide 1,
        # and the full prose stays in the embedded source review.
        text = o['observation']
        why_at = text.find(' Why it matters:')
        body = (text[:why_at] if why_at >= 0 else text).strip()
        tag, action, _ = _split_action(o['recommended_action'])
        refs = ', '.join(o['metric_ids'] + o['site_ids'][:3]) + (f" (+{len(o['site_ids']) - 3} sites)" if len(o['site_ids']) > 3 else '')
        return (o['title'], f"{body}\nAction{(' (' + tag + ')') if tag else ''}: {action}\nOwner: {o['owner']} | {refs}")
    page('Observations & recommended next actions', [observation_card(o) for o in observations])
    page('Steering-committee discussion', [(o['title'], o['steering_question'] + '\nDecision owner: ' + o['owner']) for o in observations])
    methodology = [('Calculation boundaries', 'All values are synthetic. Footprint uses laundry intensity × customer washed kg.\n'
                    'Handprint is the selected alternative minus the allocated service footprint.\n'
                    'Wearers are minimum estimates; wearer-product assignments are not unique people.\n'
                    'Full metric formulas, sources and uncertainty are retained in the embedded source review.\n'
                    'Registry prose is supplied context and may conflict with metric totals; use structured metrics for current values.')]
    methodology.append(('Assumption registry', '\n'.join(f"{a['id']}: {a['value_or_rule']} [{a['confidence']}]" for a in review.get('assumptions', []))))
    methodology.append(('Data-quality flags', summarize_quality(review.get('data_quality', []))))
    methodology.append(('Production data gaps', '\n'.join(f"{g['gap']} → {g['future_source']}" for g in review.get('data_gaps', [])) or 'No gaps supplied.'))
    page('Methodology, assumptions & data readiness', methodology)
    return pages


def summarize_quality(findings):
    """Summarize repeated findings; preserve full messages/treatments in provenance."""
    groups = {}
    for finding in findings:
        match = re.search(r'\bLaundry\s+([A-Za-z0-9_-]+)', finding.get('message', ''), re.I)
        laundry = finding.get('laundry_id') or (match.group(1) if match else '')
        key = (finding['check_id'], finding['severity'].lower(), laundry)
        groups.setdefault(key, []).append(finding)
    lines = []
    ordered = sorted(groups.items(), key=lambda item: (item[0][0] != 'DQ4', item[0][1] == 'info', item[0]))
    for (check, severity, laundry), rows in ordered:
        first = rows[0]
        datasets = ', '.join(dict.fromkeys(r['dataset'] for r in rows))
        heading = f"{check} [{severity}] / {len(rows)} finding(s)"
        if laundry:
            heading += ' / ' + laundry
        # This is an explicit preview; source facts are never rewritten or discarded.
        preview = first['message']
        if len(preview) > 130:
            preview = preview[:127].rsplit(' ', 1)[0] + '…'
        lines.append(heading + ': ' + preview + '\nSources: ' + datasets)
    if findings:
        lines.append('Summarized findings. Full messages, affected rows and treatments: embedded source review.')
    return '\n'.join(lines) or 'No flags supplied.'
