"""One presentation model shared by the PowerPoint and PDF renderers."""
import re
from backend.insights.generate import generate_observations
from backend.insights.formatting import fmt

FOOTER = 'Synthetic, illustrative data. Not audited. Not an approved Lindström claim.'
def metric_block(metric, case='base'):
    v = metric['value']
    return (metric['label'],
            f"{fmt(v[case])} {metric['unit']} | {case.upper()}\n"
            f"Low / Base / High: {fmt(v['low'])} / {fmt(v['base'])} / {fmt(v['high'])}\n"
            f"{metric['status']} | Confidence: {metric['confidence']}\n"
            f"{metric['id']}\nFormula: {metric['formula']}\n"
            f"Sources: {', '.join(metric['sources'])}\nAssumptions: {', '.join(metric['assumptions']) or 'None listed'}")


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
    if len(supplied) == len(observations) and all(
        all(isinstance(a.get(k), str) for k in ('id', 'title', 'observation', 'recommended_action', 'steering_question', 'owner', 'status', 'confidence'))
        and a.get('metric_ids') == b['metric_ids'] and a.get('site_ids') == b['site_ids']
        and tokens(a) == tokens(b) for a, b in zip(supplied, observations)
    ):
        observations = supplied
    pages = []
    def page(title, blocks):
        pages.append((title, blocks))
    def blocks(ids):
        return [metric_block(metrics[i], case) for i in ids if i in metrics]
    page('Customer value & sustainability review', [
        (meta['customer_name'], f"{meta['industry']}\n{meta['period']['from']} to {meta['period']['to']}\n"
         f"Baseline: {meta.get('baseline_name', meta['baseline_id'])}\nPriority: {meta['priority'].title()}\nSensitivity: {case}"),
        ('SYNTHETIC DATA – PROTOTYPE', 'A decision-support demonstration using illustrative inputs.\n'
         'Base case and uncertainty remain visible.\nCost values are illustrative, not promised savings.\n'
         'Full source review and provenance: PowerPoint methodology notes / PDF review.json attachment.')])
    page('Executive summary', blocks(['delivery_sites', 'wearers_min_est', 'washed_kg', 'repairs_total', 'water_saving_l', 'co2e_saving_kg']))
    priority = meta['priority']
    emphasized = list(dict.fromkeys(review.get('priority_view', {}).get('emphasized_metric_ids', [])))
    spotlight = blocks(emphasized)
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
        for key, unit in [('water_saving_l', 'L'), ('energy_saving_kwh', 'kWh'), ('co2e_saving_kg', 'kgCO2e')]:
            if key in b:
                v = b[key]
                lines.append(f"{key} ({unit})\nLow {fmt(v['low'])} | Base {fmt(v['base'])} | High {fmt(v['high'])}")
        baseline_blocks.append((b['name'], '\n'.join(lines) + '\nALLOCATED_ESTIMATE | Confidence: Low-Medium'))
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
            text.append(f"{s['site_name']} ({s['site_id']})\nOn time: {fmt(sm.get('on_time_rate', 'N/A'))} | Allocation use: {fmt(sm.get('allocation_use_rate', 'N/A'))}\nWashed kg: {fmt(sm.get('washed_kg', 'N/A'))}")
        site_blocks.append((country + ' | lowest / highest on-time rate', '\n\n'.join(text) + '\nSynthetic site inputs; rates calculated.'))
    page('Multi-site performance', site_blocks + [('Read the outliers', 'Site selection uses on-time rate within each country. Rates are fractions of one.\n'
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
    page('Circularity & repair handprint', blocks(['repairs_total', 'replacements_postponed', 'avoided_product_co2e_kg', 'textile_waste_kg', 'circular_waste_share']) + [
        ('Repair types & waste routes', '\n'.join(breakdown_lines))])
    page('Observations & recommended next actions', [(o['title'], o['observation'] + '\nAction: ' + o['recommended_action'] +
         '\nOwner: ' + o['owner'] + '\nReferences: ' + ', '.join(o['metric_ids'] + o['site_ids'][:3]) +
         (f" (+{len(o['site_ids']) - 3} more sites in source review)" if len(o['site_ids']) > 3 else '') + '\n' + o['status']) for o in observations])
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
