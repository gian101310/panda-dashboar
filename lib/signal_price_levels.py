"""Read-only price-level context for existing Signal-group alerts."""

import math


NEAR_PIPS = 15


def _number(value):
    try:
        number = float(value)
        return number if math.isfinite(number) and number > 0 else None
    except (TypeError, ValueError):
        return None


def _box_timeframe(box):
    start, end = _number(box.get("start_ts")), _number(box.get("end_ts"))
    if start is None or end is None or end <= start:
        return None
    days = (end - start) / 86400
    if 0.5 <= days <= 5:
        return "H1"
    if 5 < days <= 30:
        return "H4"
    if 30 < days <= 100:
        return "D1"
    return None


def describe_price_levels(symbol, parsed, pl, bias, previous_price=None):
    """Describe nearby obstacles and sampled box crossings without changing scores."""
    price = _number((pl or {}).get("pl_price"))
    if price is None or bias not in ("BUY", "SELL"):
        return ""
    pip = 0.01 if "JPY" in symbol.upper() else 0.0001
    levels = []
    boxes = {}
    for box in (parsed or {}).get("boxes") or []:
        tf = _box_timeframe(box)
        first, second = _number(box.get("open_price")), _number(box.get("close_price"))
        if not tf or first is None or second is None or first == second or tf in boxes:
            continue
        low, high = sorted((first, second))
        boxes[tf] = (low, high)
        levels.extend(((high, f"{tf} box top"), (low, f"{tf} box bottom")))
    for key, label in (("pdh", "PDH"), ("pdl", "PDL"), ("pwh", "PWH"), ("pwl", "PWL")):
        level = _number((pl or {}).get(key))
        if level is not None:
            levels.append((level, label))

    above = sorted(((round((level - price) / pip, 1), label) for level, label in levels
                    if price < level and (level - price) / pip <= NEAR_PIPS))
    below = sorted(((round((price - level) / pip, 1), label) for level, label in levels
                    if price > level and (price - level) / pip <= NEAR_PIPS))
    # A price exactly on a level is relevant to both directions.
    on_level = [(0.0, label) for level, label in levels if abs(level - price) < pip / 10]
    above = sorted(on_level + above)
    below = sorted(on_level + below)
    def line(side, nearby, caution):
        if not nearby:
            return ""
        names = ", ".join(f"{label} {distance:g}p" for distance, label in nearby[:3])
        extra = f" (+{len(nearby) - 3} more)" if len(nearby) > 3 else ""
        prefix = "Caution" if caution else "Context"
        return f"{prefix}: {len(nearby)} nearby {side} level{'s' if len(nearby) != 1 else ''} ({names}{extra})."

    result = []
    obstacle = line("resistance", above, True) if bias == "BUY" else line("support", below, True)
    favorable = line("support", below, False) if bias == "BUY" else line("resistance", above, False)
    if obstacle:
        result.append(obstacle)
    if favorable:
        result.append(favorable)

    previous = _number(previous_price)
    for tf in ("D1", "H4", "H1"):
        if tf not in boxes:
            continue
        low, high = boxes[tf]
        if price > high and previous is not None and previous <= high:
            result.append(f"{tf} box: live price above top by {(price - high) / pip:.1f}p; break unconfirmed by candle close.")
        elif price < low and previous is not None and previous >= low:
            result.append(f"{tf} box: live price below bottom by {(low - price) / pip:.1f}p; break unconfirmed by candle close.")
        if len(result) >= 3:
            break
    return "\n".join(result[:3])
