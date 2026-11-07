"""Allocate resource intensity and waste routes, independent of reference output."""

from .kpis import number, total, ratio, display_number
from .sensitivity import baseline_range, repair_range


ROUTES = ("recycling_kg", "reuse_kg", "energy_recovery_kg", "incineration_kg")


def index_unique(rows, keys):
    result = {}
    for row in rows:
        key = tuple(row.get(k) for k in keys)
        if key in result:
            raise ValueError(f"Duplicate lookup key {keys}: {key}")
        result[key] = row
    return result


def allocate_rows(activity, resources, waste):
    resource_index = index_unique(resources, ("laundry_id", "month"))
    waste_index = index_unique(waste, ("laundry_id", "month"))
    output = []
    for row in activity:
        key = row["laundry_id"], row["month"]
        resource, routing = resource_index.get(key, {}), waste_index.get(key, {})
        kg = row.get("customer_washed_kg")
        share = ratio(kg, resource.get("washed_kg"))
        out = dict(row)
        for target, source in (("customer_water_l", "fresh_water_l"), ("customer_energy_kwh", "process_energy_kwh"),
                               ("customer_process_kgco2e", "process_emissions_kgco2e"),
                               ("customer_delivery_kgco2e", "delivery_emissions_kgco2e")):
            value = resource.get(source)
            out[target] = share * value if number(share) and number(value) else None
        p, d = out["customer_process_kgco2e"], out["customer_delivery_kgco2e"]
        out["customer_co2e_kg"] = p + d if number(p) and number(d) else None
        factor = routing.get("waste_kg_per_washed_kg")
        attributed = kg * factor if number(kg) and number(factor) else None
        out["textile_waste_kg"] = attributed
        for route in ROUTES:
            route_share = ratio(routing.get(route), routing.get("textile_waste_total_kg"))
            out[route] = attributed * route_share if number(attributed) and number(route_share) else None
        output.append(out)
    return output


def savings(rows, baseline):
    kg = total(rows, "customer_washed_kg")
    factors = {
        "water_saving_l": ("water_l_per_kg", "customer_water_l"),
        "energy_saving_kwh": ("energy_kwh_per_kg", "customer_energy_kwh"),
        "co2e_saving_kg": (None, "customer_co2e_kg"),
    }
    result = {}
    for metric, (factor, footprint_field) in factors.items():
        if factor:
            f = baseline.get(factor)
        else:
            p, d = baseline.get("process_kgco2e_per_kg"), baseline.get("delivery_kgco2e_per_kg")
            f = p + d if number(p) and number(d) else None
        footprint = total(rows, footprint_field)
        result[metric] = baseline_range(kg, f, footprint) if all(number(v) for v in (kg, f, footprint)) else None
    return result


def environmental(rows, repairs, products, baseline):
    result = {key: total(rows, key) for key in ("customer_water_l", "customer_energy_kwh", "customer_co2e_kg", "textile_waste_kg")}
    recycling, reuse = total(rows, "recycling_kg"), total(rows, "reuse_kg")
    result["circular_waste_share"] = ratio(recycling + reuse, result["textile_waste_kg"]) if number(recycling) and number(reuse) else None
    count = total(repairs, "repair_count")
    result["replacements_postponed"] = repair_range(count) if number(count) else None
    avoided = []
    for row in repairs:
        footprint = products.get(row["product_id"], {}).get("synthetic_product_footprint_kgco2e")
        count = row.get("repair_count")
        avoided.append(count * footprint if number(count) and number(footprint) else None)
    result["avoided_product_co2e_kg"] = repair_range(sum(avoided)) if all(number(v) for v in avoided) else None
    result.update(savings(rows, baseline))
    return result


def environmental_traces(rows, repairs, products, baseline, sensitivity, *, values=None):
    """Show live operands, with process/logistics and scenarios kept explicit."""
    f = display_number
    if values is None:
        values = environmental(rows, repairs, products, baseline)
    kg = total(rows, "customer_washed_kg")
    traces = {}
    for key in ("customer_water_l", "customer_energy_kwh", "textile_waste_kg"):
        value = values[key]
        effective = ratio(value, kg)
        if number(effective):
            traces[key] = (f"{f(kg)} kg * {f(effective)} effective weighted amount/kg = {f(value)}; "
                           "effective intensity is derived from the sum of row allocations, not a uniform source factor")
        elif number(value):
            traces[key] = f"SUM({key}) over {len(rows)} row allocations = {f(value)}; effective amount/kg unavailable when washed kg is zero"
    process, delivery = total(rows, "customer_process_kgco2e"), total(rows, "customer_delivery_kgco2e")
    traces["customer_co2e_kg"] = f"{f(process)} allocated process kgCO2e + {f(delivery)} allocated delivery kgCO2e = {f(values['customer_co2e_kg'])}"
    recycling, reuse = total(rows, "recycling_kg"), total(rows, "reuse_kg")
    traces["circular_waste_share"] = f"({f(recycling)} recycling kg + {f(reuse)} reuse kg) / {f(values['textile_waste_kg'])} attributed waste kg = {f(values['circular_waste_share'])}"
    repair_factor = {"low": 0.5, "base": 1.0, "high": 1.0}[sensitivity]
    traces["replacements_postponed"] = f"{f(total(repairs, 'repair_count'))} repairs * {f(repair_factor)} repair factor"
    product_terms = []
    for pid in sorted({r["product_id"] for r in repairs}):
        count = total([r for r in repairs if r["product_id"] == pid], "repair_count")
        factor = products.get(pid, {}).get("synthetic_product_footprint_kgco2e")
        product_terms.append(f"{pid}: {f(count)} repairs * {f(factor)} kgCO2e/product")
    traces["avoided_product_co2e_kg"] = "(" + (" + ".join(product_terms) or "0; no selected repairs") + f") * {f(repair_factor)} repair factor"
    multiplier = {"low": 0.8, "base": 1.0, "high": 1.2}[sensitivity]
    for key, factor_key, footprint_key in (("water_saving_l", "water_l_per_kg", "customer_water_l"),
                                            ("energy_saving_kwh", "energy_kwh_per_kg", "customer_energy_kwh"),
                                            ("co2e_saving_kg", None, "customer_co2e_kg")):
        factor_text = f(baseline.get(factor_key)) if factor_key else (
            f"({f(baseline.get('process_kgco2e_per_kg'))} process + {f(baseline.get('delivery_kgco2e_per_kg'))} delivery)")
        traces[key] = f"{f(kg)} kg * {factor_text} baseline/kg * {f(multiplier)} baseline multiplier - {f(values[footprint_key])} customer footprint"
    for key in ("replacements_postponed", "avoided_product_co2e_kg", "water_saving_l", "energy_saving_kwh", "co2e_saving_kg"):
        value = values[key]
        if value is not None:
            traces[key] += f" = {f(value[sensitivity])}; scenario={sensitivity}; baseline={baseline['baseline_id']}"
    return {key: text for key, text in traces.items() if values[key] is not None}
