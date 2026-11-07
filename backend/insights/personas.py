"""Shared persona lenses for meeting summaries and deterministic talk tracks."""
PERSONAS = {
    'ceo': {
        'name': 'CEO', 'metric_ids': ['delivery_sites', 'on_time_rate', 'co2e_saving_kg', 'wearers_min_est'],
        'focus': 'Start with service continuity and the scale of the relationship, then discuss estimated environmental value.',
        'ask': 'Which shared service priority should we take into the next customer review?',
    },
    'cfo': {
        'name': 'CFO', 'metric_ids': ['repairs_total', 'idle_pieces', 'allocation_use_rate', 'garments_allocated'],
        'focus': 'Discuss repair activity and allocation opportunities. Stock belongs to the rental service; its illustrative purchase value is not a customer saving.',
        'ask': 'Which allocation investigation and pricing assumptions should we validate together before a financial decision?',
    },
    'operations': {
        'name': 'Operations', 'metric_ids': ['median_cycle_hours', 'on_time_rate', 'service_requests', 'allocation_use_rate'],
        'focus': 'Discuss garment availability, cycle time and recurring requests. Agree an investigation before assigning causes.',
        'ask': 'Which site and service issue should operations investigate first, and who will bring the follow-up evidence?',
    },
    'sustainability': {
        'name': 'Sustainability', 'metric_ids': ['water_saving_l', 'co2e_saving_kg', 'circular_waste_share', 'customer_water_l'],
        'focus': 'Name the selected alternative, quote the uncertainty range and separate allocated savings from repair handprint.',
        'ask': 'Which baseline and approved source data should we confirm before communicating these estimates externally?',
    },
}


def persona_config(persona='ceo'):
    if persona not in PERSONAS:
        raise ValueError('Unknown meeting persona; choose ceo, cfo, operations or sustainability')
    return PERSONAS[persona]
