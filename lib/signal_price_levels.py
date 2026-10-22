"""Read-only price-level context for existing Signal-group alerts."""

import math


NEAR_PIPS = 15
DISPLAY_NEAR_PIPS = 30


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


def box_bounds(parsed, timeframe):
    """Read a drawn box by its exported time span; missing timeframes stay missing."""
    for box in (parsed or {}).get("boxes") or []:
        if _box_timeframe(box) != timeframe:
            continue
        first, second = _number(box.get("open_price")), _number(box.get("close_price"))
        if first is not None and second is not None and first != second:
            return tuple(sorted((first, second)))
    return None


def h4_box_position(parsed, pl):
    bounds = box_bounds(parsed, "H4")
    price = _number((pl or {}).get("pl_price"))
    if not bounds or price is None:
        return None
    if price > bounds[1]:
        return "ABOVE"
    if price < bounds[0]:
        return "BELOW"
    return "INSIDE"


def related_h4_breadth(symbol, bias, parsed_map, pl_map):
    """Count fresh related pairs beyond H4 in the strong currency's direction."""
    if len(symbol) != 6 or bias not in ("BUY", "SELL"):
        return None
    currency = symbol[:3] if bias == "BUY" else symbol[3:]
    available = matched = 0
    for other, parsed in (parsed_map or {}).items():
        if other == symbol or len(other) != 6 or currency not in (other[:3], other[3:]):
            continue
        position = h4_box_position(parsed, (pl_map or {}).get(other))
        if position is None:
            continue
        available += 1
        expected = "ABOVE" if other[:3] == currency else "BELOW"
        matched += position == expected
    if available < 3:
        return None
    return {"currency": currency, "matched": matched, "available": available}


def summarize_nearby_levels(symbol, parsed, pl):
    """Return concise, price-relative level context without changing alert priority."""
    price = _number((pl or {}).get("pl_price"))
    if price is None:
        return {"label": "", "names": ""}
    pip = 0.01 if "JPY" in symbol.upper() else 0.0001
    levels = []
    for tf in ("D1", "H4", "H1"):
        bounds = box_bounds(parsed, tf)
        if bounds:
            levels.extend(((bounds[0], f"{tf} box"), (bounds[1], f"{tf} box")))
    for key in ("pdh", "pdl", "pwh", "pwl"):
        level = _number((pl or {}).get(key))
        if level is not None:
            levels.append((level, key.upper()))

    support, resistance = [], []
    for level, name in levels:
        distance = abs(level - price) / pip
        if distance > DISPLAY_NEAR_PIPS:
            continue
        if level < price:
            support.append((distance, name))
        elif level > price:
            resistance.append((distance, name))
        else:
            support.append((0.0, name))
            resistance.append((0.0, name))
    support.sort()
    resistance.sort()
    if support and resistance:
        return {"label": "BETWEEN SUPPORT AND RESISTANCE", "names": ""}
    nearby = support or resistance
    if not nearby:
        return {"label": "", "names": ""}
    stack = len(nearby) > 1 and nearby[1][0] - nearby[0][0] <= 10
    side = "SUPPORT" if support else "RESISTANCE"
    return {
        "label": f"{'STACKED' if stack else 'NEAR'} {side}",
        "names": " + ".join(name for _, name in nearby[:2 if stack else 1]),
    }


def assess_price_levels(symbol, parsed, pl, bias, gap=None, momentum=None,
                        previous_price=None, h4_breadth=None):
    """Classify alert display context; never block or modify a trade signal."""
    price = _number((pl or {}).get("pl_price"))
    if price is None or bias not in ("BUY", "SELL"):
        return {"priority": "NORMAL", "text": "", "opposing_levels": 0}
    pip = 0.01 if "JPY" in symbol.upper() else 0.0001
    levels = []
    boxes = {}
    for tf in ("D1", "H4", "H1"):
        bounds = box_bounds(parsed, tf)
        if not bounds:
            continue
        low, high = bounds
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
    def line(side, nearby, prefix):
        if not nearby:
            return ""
        names = ", ".join(f"{label} {distance:g}p" for distance, label in nearby[:3])
        extra = f" (+{len(nearby) - 3} more)" if len(nearby) > 3 else ""
        return f"{prefix}: {len(nearby)} nearby {side} level{'s' if len(nearby) != 1 else ''} ({names}{extra})."

    result = []
    opposing = above if bias == "BUY" else below
    supporting = below if bias == "BUY" else above
    strong = (isinstance(gap, (int, float)) and abs(gap) >= 9) or momentum in ("SPARK", "BUILDING", "STRONG")
    priority = "LOW PRIORITY" if len(opposing) >= 2 and not strong else "CAUTION" if len(opposing) >= 2 else "REVIEW" if opposing else "NORMAL"
    obstacle = line("resistance" if bias == "BUY" else "support", opposing,
                    "Low-priority review" if priority == "LOW PRIORITY" else "Caution" if priority == "CAUTION" else "Review")
    favorable = line("support" if bias == "BUY" else "resistance", supporting, "Context")
    if obstacle:
        result.append(obstacle)
    if favorable:
        result.append(favorable)

    h4_position = h4_box_position(parsed, pl)
    if h4_position:
        label = {"ABOVE": "above", "BELOW": "below", "INSIDE": "inside"}[h4_position]
        suffix = "; nearby levels alone do not cancel the bias" if opposing else ""
        result.append(f"H4 box: price {label} range{suffix}.")
    if opposing and strong:
        result.append("Strong gap or momentum present; review the level on chart before deciding.")

    expected_h4 = "ABOVE" if bias == "BUY" else "BELOW"
    if h4_position == expected_h4 and h4_breadth and h4_breadth["matched"] >= 3 and h4_breadth["matched"] / h4_breadth["available"] >= 0.75:
        result.append(f"H4 breadth: {h4_breadth['matched']}/{h4_breadth['available']} fresh {h4_breadth['currency']} pairs beyond box in matching direction; possible wider alignment, not a score change.")

    previous = _number(previous_price)
    for tf in ("D1", "H4", "H1"):
        if tf not in boxes:
            continue
        low, high = boxes[tf]
        if price > high and previous is not None and previous <= high:
            result.append(f"{tf} box: live price above top by {(price - high) / pip:.1f}p; break unconfirmed by candle close.")
        elif price < low and previous is not None and previous >= low:
            result.append(f"{tf} box: live price below bottom by {(low - price) / pip:.1f}p; break unconfirmed by candle close.")
    return {"priority": priority, "text": "\n".join(result[:5]), "opposing_levels": len(opposing)}


def describe_price_levels(symbol, parsed, pl, bias, previous_price=None):
    """Backward-compatible text view for callers without bias-strength context."""
    return assess_price_levels(symbol, parsed, pl, bias, previous_price=previous_price)["text"]
