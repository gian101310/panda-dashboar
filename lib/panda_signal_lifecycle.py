"""Read-only, explainable lifecycle context for the 21 Panda forex pairs.

This module consumes completed engine rows. It never changes scores or eligibility.
"""

import json
import math
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from lib.signal_price_levels import box_bounds


MAX_PREVIOUS_AGE_SECONDS = 20 * 60


def _number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def _box_position(price, bounds):
    if price is None or not bounds:
        return "UNKNOWN"
    if price > bounds[1]:
        return "ABOVE"
    if price < bounds[0]:
        return "BELOW"
    return "INSIDE"


def _currency_read(rows, parsed_map, prior_rows, symbol, currency, wanted):
    """Each related pair contributes once to one currency's breadth."""
    agreeing, opposing, box_confirmed, price_confirmed, examples = 0, 0, 0, 0, []
    for other, row in rows.items():
        if other == symbol or row.get("hard_invalid") or row.get("bias") not in ("BUY", "SELL"):
            continue
        if currency not in (other[:3], other[3:]):
            continue
        direction = 1 if (row["bias"] == "BUY") == (other[:3] == currency) else -1
        if direction == wanted:
            agreeing += 1
            examples.append(f"{other} {row['gap']:+g}")
            price = _number(row.get("pl_price"))
            expected = "ABOVE" if row["bias"] == "BUY" else "BELOW"
            box_confirmed += _box_position(price, box_bounds(parsed_map.get(other) or {}, "H1")) == expected
            old_price = _number((prior_rows.get(other) or {}).get("price"))
            pip = 0.01 if "JPY" in other else 0.0001
            if price is not None and old_price is not None:
                price_confirmed += (price - old_price) * (1 if row["bias"] == "BUY" else -1) >= pip
        else:
            opposing += 1
    return {"agree": agreeing, "oppose": opposing, "box_confirmed": box_confirmed,
            "price_advancing": price_confirmed, "examples": examples[:3]}


def build_lifecycle_snapshot(rows, parsed_map, previous=None, now=None):
    now = now or datetime.now(timezone.utc)
    by_symbol = {str(r.get("symbol") or "").upper(): r for r in rows if r.get("symbol")}
    previous = previous or {}
    previous_time = previous.get("generated_utc")
    try:
        age = (now - datetime.fromisoformat(previous_time.replace("Z", "+00:00"))).total_seconds()
        prior_rows = previous.get("pairs") if 0 < age <= MAX_PREVIOUS_AGE_SECONDS else {}
    except (AttributeError, TypeError, ValueError):
        prior_rows = {}
    prior_rows = prior_rows or {}
    results = {}
    for symbol, row in by_symbol.items():
        if len(symbol) != 6:
            continue
        bias = str(row.get("bias") or "WAIT").upper()
        gap = _number(row.get("gap")) or 0
        price = _number(row.get("pl_price"))
        prior = prior_rows.get(symbol) or {}
        trend_start = (prior.get("trend_start_utc") if
                       prior.get("bias") == bias and prior.get("valid") is not False else None)
        try:
            trend_age_hours = (now - datetime.fromisoformat(trend_start.replace("Z", "+00:00"))).total_seconds() / 3600
            if trend_age_hours < 0:
                trend_start, trend_age_hours = None, None
        except (AttributeError, TypeError, ValueError):
            trend_age_hours = None
        trend_start = trend_start or now.isoformat().replace("+00:00", "Z")
        prior_price = _number(prior.get("price"))
        prior_gap = _number(prior.get("gap"))
        side = 1 if bias == "BUY" else -1
        target_position = "ABOVE" if side == 1 else "BELOW"
        parsed = parsed_map.get(symbol) or {}
        positions = {tf: _box_position(price, box_bounds(parsed, tf)) for tf in ("H1", "H4", "D1")}
        base = _currency_read(by_symbol, parsed_map, prior_rows, symbol, symbol[:3], side)
        quote = _currency_read(by_symbol, parsed_map, prior_rows, symbol, symbol[3:], -side)
        support = base["agree"] + quote["agree"]
        conflict = base["oppose"] + quote["oppose"]
        related_confirmed = (base["box_confirmed"] + quote["box_confirmed"] >= 2 or
                             base["price_advancing"] + quote["price_advancing"] >= 2)
        gap_change = side * (gap - prior_gap) if prior_gap is not None else None
        price_change_pips = (side * (price - prior_price) / (0.01 if "JPY" in symbol else 0.0001)
                             if price is not None and prior_price is not None else None)
        aligned_boxes = sum(positions[tf] == target_position for tf in ("H1", "H4"))
        opposing_boxes = sum(positions[tf] == ("BELOW" if side == 1 else "ABOVE") for tf in ("H1", "H4"))
        pip = 0.01 if "JPY" in symbol else 0.0001
        opposing_levels = []
        if price is not None:
            for level_name in ("pdh", "pdl", "pwh", "pwl", "pmh", "pml"):
                level = _number(row.get(level_name))
                if level is not None:
                    distance = side * (level - price) / pip
                    if 0 <= distance <= 30:
                        opposing_levels.append((distance, level_name.upper()))
        nearest_level = min(opposing_levels) if opposing_levels else None
        valid = not row.get("hard_invalid") and ((bias == "BUY" and gap >= 5) or (bias == "SELL" and gap <= -5))
        reasons = []
        if valid:
            reasons.append(f"Panda {bias} gap {gap:g}")
            if gap_change is not None and abs(gap_change) >= 1:
                reasons.append("gap rising" if gap_change > 0 else "gap fading")
            if price_change_pips is not None and abs(price_change_pips) >= 1:
                reasons.append("price advancing" if price_change_pips > 0 else "price retreating")
            if aligned_boxes:
                reasons.append(f"price beyond {aligned_boxes}/2 H1-H4 boxes with bias")
            if opposing_boxes:
                reasons.append(f"price beyond {opposing_boxes}/2 H1-H4 boxes against bias")
            if support or conflict:
                reasons.append(f"related pairs {support} agree / {conflict} oppose")
                reasons.append(f"related H1 boxes {base['box_confirmed'] + quote['box_confirmed']} confirm; "
                               f"prices {base['price_advancing'] + quote['price_advancing']} advancing")
            if row.get("pl_zone") == target_position:
                reasons.append("Panda Line zone agrees")
            elif row.get("pl_zone") in ("ABOVE", "BELOW", "BETWEEN"):
                reasons.append("Panda Line zone unconfirmed")
            if nearest_level:
                reasons.append(f"{nearest_level[1]} {nearest_level[0]:.1f} pips ahead")
        if not valid:
            phase = "NO VALID SIGNAL"
        elif ((gap_change is not None and gap_change <= -2) or
              (price_change_pips is not None and price_change_pips <= -3)) and (conflict >= support or opposing_boxes):
            phase = "WEAKENING / POSSIBLE END"
        elif prior_gap is None:
            phase = "BASELINE / UNCONFIRMED"
        elif prior.get("bias") != bias or prior.get("valid") is False:
            phase = "STARTING / UNCONFIRMED"
        elif (aligned_boxes == 2 and base["agree"] >= 1 and quote["agree"] >= 1 and
              support >= 3 and support > conflict and related_confirmed and
              gap_change is not None and gap_change >= 0 and
              (price_change_pips is None or price_change_pips >= 0)):
            phase = "STRONG CONTINUATION"
        elif (gap_change is not None and gap_change > 0) or (price_change_pips is not None and price_change_pips > 1):
            phase = "STRENGTHENING"
        elif trend_age_hours is not None and trend_age_hours >= 4 and (gap_change <= 0 or conflict >= support):
            phase = "MATURE / MIXED"
        elif gap_change is not None and gap_change < 0 or conflict > support:
            phase = "MIXED / SLOWING"
        else:
            phase = "CONTINUING / UNCONFIRMED"
        results[symbol] = {
            "bias": bias, "gap": gap, "price": price, "phase": phase, "valid": valid,
            "trend_start_utc": trend_start,
            "box_position": positions, "gap_change_with_bias": gap_change,
            "nearest_opposing_level": (None if nearest_level is None else
                                       {"name": nearest_level[1], "distance_pips": round(nearest_level[0], 1)}),
            "price_change_pips_with_bias": round(price_change_pips, 1) if price_change_pips is not None else None,
            "base_breadth": base, "quote_breadth": quote, "reasons": reasons,
        }
    return {"version": 1, "generated_utc": now.isoformat().replace("+00:00", "Z"), "pairs": results}


def export_lifecycle_snapshot(rows, parsed_map, target=None, now=None, price_source_dir=None):
    target = Path(target or (Path.home() / "Documents" / "cAlgo" / "Data" / "Indicators" /
                             "Panda Signal Lifecycle" / "panda_lifecycle_snapshot.json"))
    previous = None
    try:
        previous = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    if price_source_dir is not None:
        current_rows = []
        for row in rows:
            current = dict(row)
            symbol = str(row.get("symbol") or "").upper()
            source = Path(price_source_dir) / f"tbg_{symbol}.txt"
            try:
                fresh = 0 <= time.time() - source.stat().st_mtime <= MAX_PREVIOUS_AGE_SECONDS
            except OSError:
                fresh = False
            if not fresh:
                current["pl_price"] = None
                current["pl_zone"] = None
            current_rows.append(current)
        rows = current_rows
    snapshot = build_lifecycle_snapshot(rows, parsed_map, previous, now)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + ".tmp")
    try:
        temporary.write_text(json.dumps(snapshot, separators=(",", ":")), encoding="utf-8")
        os.replace(temporary, target)
    finally:
        if temporary.exists():
            temporary.unlink()
    # Local observations for later four-hour outcome calibration. No Supabase writes.
    history_dir = target.parent / "history"
    history_dir.mkdir(exist_ok=True)
    history_file = history_dir / (snapshot["generated_utc"][:10] + ".jsonl")
    observation = {"generated_utc": snapshot["generated_utc"], "pairs": {
        symbol: {"price": item["price"], "gap": item["gap"], "bias": item["bias"],
                 "valid": item["valid"],
                 "phase": item["phase"], "box_position": item["box_position"],
                 "nearest_opposing_level": item["nearest_opposing_level"],
                 "base_breadth": item["base_breadth"], "quote_breadth": item["quote_breadth"]}
        for symbol, item in snapshot["pairs"].items()
    }}
    with history_file.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(observation, separators=(",", ":")) + "\n")
    return len(snapshot["pairs"])
