"""Additive local evidence records for later lifecycle analysis.

The chart snapshot and four-hour calibration retain their existing schema.
Missing source data stays missing; no score or trade decision is inferred here.
"""

import math
import re
from datetime import timedelta, timezone
from pathlib import Path

from lib.signal_price_levels import _box_timeframe, box_bounds


DUBAI_TZ = timezone(timedelta(hours=4))
LEVEL_KEYS = ("pdh", "pdl", "pwh", "pwl", "pmh", "pml", "pyh", "pyl",
              "pdo", "pdc", "prh", "prl", "dayo", "dayh", "dayl")
TF_PATTERN = re.compile(r"(D1|H4|H1)\s*:\s*([+-]?\d+)(?:/([+-]?\d+))?")


def _number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def _utc_stamp(seconds):
    from datetime import datetime
    return datetime.fromtimestamp(seconds, timezone.utc).isoformat().replace("+00:00", "Z")


def _file_state(directory, name, now, max_age):
    if directory is None:
        return {"available": None, "modified_utc": None, "age_seconds": None, "fresh": None}
    try:
        stamp = (Path(directory) / name).stat().st_mtime
    except OSError:
        return {"available": False, "modified_utc": None, "age_seconds": None, "fresh": False}
    age = round(now.timestamp() - stamp)
    return {"available": True, "modified_utc": _utc_stamp(stamp),
            "age_seconds": age, "fresh": 0 <= age <= max_age}


def _raw_tf(line):
    values = {"D1": [], "H4": [], "H1": []}
    for tf, first, second in TF_PATTERN.findall(line or ""):
        values[tf].extend(int(value) for value in (first, second) if value)
    return values


def _adv_lines(directory, symbol, source_state):
    if directory is None or not source_state["fresh"]:
        return {}
    try:
        lines = (Path(directory) / f"mt4_{symbol}.txt").read_text(encoding="utf-8").splitlines()
    except OSError:
        return {}
    result = {}
    for line in lines:
        match = re.match(r"^ADV\s*:\s*([A-Z]{3})\s*:", line.strip())
        if match and match.group(1) in (symbol[:3], symbol[3:]):
            result[match.group(1)] = line.strip()
    return result


def _tbg_values(directory, symbol, source_state):
    if directory is None or not source_state["fresh"]:
        return {}
    try:
        lines = (Path(directory) / f"tbg_{symbol}.txt").read_text(encoding="utf-8").splitlines()
    except OSError:
        return {}
    values = {}
    for line in lines:
        key, separator, value = line.partition(":")
        if separator:
            values[key.strip().lower()] = value.strip()
    return values


def _session(utc_hour):
    if utc_hour >= 22 or utc_hour < 6:
        return "ASIAN"
    return "LONDON" if utc_hour < 14 else "NEW_YORK"


def _valid_flag(value):
    if isinstance(value, bool):
        return value
    if value is None:
        return None
    return str(value).strip().upper() == "VALID"


def _box_record(parsed, timeframe, price, pip):
    bounds = box_bounds(parsed, timeframe)
    if bounds is None:
        return {"available": False, "low": None, "high": None,
                "low_minus_price_pips": None, "high_minus_price_pips": None}
    source = next((box for box in (parsed.get("boxes") or [])
                   if _box_timeframe(box) == timeframe), {})
    low, high = bounds
    return {"available": True, "name": source.get("name"),
            "start_ts": _number(source.get("start_ts")), "end_ts": _number(source.get("end_ts")),
            "open_price": _number(source.get("open_price")),
            "close_price": _number(source.get("close_price")),
            "low": low, "high": high, "width_pips": round((high - low) / pip, 1),
            "low_minus_price_pips": None if price is None else round((low - price) / pip, 1),
            "high_minus_price_pips": None if price is None else round((high - price) / pip, 1)}


def build_history_observation(snapshot, rows, parsed_map, source_dir, now):
    """Capture all available 21-pair inputs without changing lifecycle decisions."""
    local = now.astimezone(DUBAI_TZ)
    by_symbol = {str(row.get("symbol") or "").upper(): row for row in rows if row.get("symbol")}
    observed = {}
    for symbol, item in snapshot["pairs"].items():
        row = by_symbol.get(symbol) or {}
        parsed = parsed_map.get(symbol) or {}
        price = _number(item.get("price"))
        pip = 0.01 if "JPY" in symbol else 0.0001
        sources = {
            "mt4": _file_state(source_dir, f"mt4_{symbol}.txt", now, 10 * 60),
            "score": _file_state(source_dir, f"panda_score_{symbol}.txt", now, 10 * 60),
            "tbg": _file_state(source_dir, f"tbg_{symbol}.txt", now, 20 * 60),
        }
        tbg = _tbg_values(source_dir, symbol, sources["tbg"])
        adv_lines = _adv_lines(source_dir, symbol, sources["mt4"])

        def source_value(row_key, file_key=None):
            if source_dir is not None and not sources["tbg"]["fresh"]:
                return None
            value = row.get(row_key)
            return value if value is not None else tbg.get(file_key or row_key)

        levels = {}
        for name in LEVEL_KEYS:
            level = _number(source_value(name))
            levels[name.upper()] = {"price": level, "level_minus_price_pips":
                                   None if level is None or price is None else round((level - price) / pip, 1)}
        for name in ("st", "fl"):
            level = _number(source_value(f"pl_{name}", f"tbg_{name}"))
            levels[name.upper()] = {"price": level, "level_minus_price_pips":
                                   None if level is None or price is None else round((level - price) / pip, 1)}

        scores = {}
        for side, currency in (("base", symbol[:3]), ("quote", symbol[3:])):
            raw_line = parsed.get(f"raw_{side}_line") or ""
            raw_adv = adv_lines.get(currency) or ""
            scores[side] = {"currency": currency,
                            "current": {tf: _number(parsed.get(f"{side}_{tf.lower()}"))
                                        for tf in ("D1", "H4", "H1")},
                            "current_components": _raw_tf(raw_line), "raw_line": raw_line,
                            "adv": {tf: _number(parsed.get(f"adv_{side}_{tf.lower()}"))
                                    for tf in ("D1", "H4", "H1")},
                            "adv_components": _raw_tf(raw_adv), "raw_adv_line": raw_adv}

        related = []
        currencies = set((symbol[:3], symbol[3:]))
        for other_symbol, other in snapshot["pairs"].items():
            if other_symbol != symbol and currencies.intersection((other_symbol[:3], other_symbol[3:])):
                related.append({"symbol": other_symbol,
                                "shared_currency": next(iter(currencies.intersection(
                                    (other_symbol[:3], other_symbol[3:])))),
                                "gap": other.get("gap"), "bias": other.get("bias"),
                                "valid": other.get("valid"), "price": other.get("price"),
                                "h1_box_position": (other.get("box_position") or {}).get("H1")})

        observed[symbol] = {
            "price": price, "pip_size": pip, "gap": item.get("gap"), "bias": item.get("bias"),
            "valid": item.get("valid"), "hard_invalid": bool(row.get("hard_invalid")),
            "phase": item.get("phase"), "trend_start_utc": item.get("trend_start_utc"),
            "gap_change_with_bias": item.get("gap_change_with_bias"),
            "price_change_pips": item.get("price_change_pips"),
            "price_change_pips_with_bias": item.get("price_change_pips_with_bias"),
            "box_position": item.get("box_position"), "box_changes": item.get("box_changes"),
            "timeframe_conflicts": item.get("timeframe_conflicts"),
            "box_h1_trend": row.get("box_h1_trend"), "box_h4_trend": row.get("box_h4_trend"),
            "boxes": {tf: _box_record(parsed, tf, price, pip) for tf in ("H1", "H4", "D1")},
            "box_source_count": len(parsed.get("boxes") or []),
            "levels": levels, "nearest_opposing_level": item.get("nearest_opposing_level"),
            "panda_line": {"zone": source_value("pl_zone", "tbg_zone"),
                           "bias": source_value("pl_bias", "tbg_bias"),
                           "g1_valid": _valid_flag(source_value("pl_g1_valid", "tbg_g1")),
                           "bos": source_value("pl_bos", "tbg_bos"),
                           "bos_time": source_value("pl_bos_t", "tbg_bos_t")},
            "scores": scores, "related_pairs": related,
            "base_breadth": item.get("base_breadth"), "quote_breadth": item.get("quote_breadth"),
            "momentum": row.get("momentum"), "execution": row.get("execution"),
            "confidence": row.get("confidence"), "strength": _number(row.get("strength")),
            "gap_deltas": {key: _number(row.get(key)) for key in ("delta_short", "delta_mid", "delta_long")},
            "atr_points": _number(parsed.get("atr_current")),
            "atr_reference_points": _number(parsed.get("atr_reference")),
            "spread_points": _number(parsed.get("spread")),
            "sources": sources,
        }
    return {"version": snapshot["version"], "record_schema": 3,
            "generated_utc": snapshot["generated_utc"],
            "generated_dubai": local.isoformat(), "dubai_date": local.date().isoformat(),
            "dubai_weekday": local.strftime("%A"), "session": _session(now.astimezone(timezone.utc).hour),
            "pairs": observed}
