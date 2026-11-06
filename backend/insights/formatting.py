"""Consistent deterministic display of numbers in observations and exports."""


def fmt(value):
    if isinstance(value, (int, float)):
        return f'{value:,.2f}'.rstrip('0').rstrip('.') if isinstance(value, float) else f'{value:,}'
    return str(value)
