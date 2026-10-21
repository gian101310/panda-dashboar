"""Pure filtering and formatting for the dedicated Signal Telegram group."""

import hashlib
import html


PRIORITY = {"structure": 0, "gold": 0, "gap_zone": 1, "early_entry": 2, "momentum": 3}
SURGE_MIN_MAGNITUDE_GAIN = 3


def classify_gap_move(previous_gap, current_gap, bias):
    """Classify only a real increase between consecutive engine scores."""
    if bias not in ("BUY", "SELL") or abs(current_gap) < 5:
        return None
    if (bias == "BUY" and current_gap <= 0) or (bias == "SELL" and current_gap >= 0):
        return None
    previous = previous_gap or 0
    same_direction = previous == 0 or (previous > 0) == (current_gap > 0)
    gain = abs(current_gap) - abs(previous)
    if same_direction and gain >= SURGE_MIN_MAGNITUDE_GAIN:
        return "GAP SURGE"
    if abs(previous) < 5:
        return "GAP CROSSOVER"
    return None


class RecoveryGate:
    """Require two consecutive valid engine cycles after boot or invalid input."""

    def __init__(self):
        self._valid_cycles = {}
        self._last_cycle = {}

    def mark(self, symbol, valid, cycle_at=None):
        if not valid:
            self._valid_cycles[symbol] = 0
            self._last_cycle.pop(symbol, None)
            return False
        if cycle_at is not None and self._last_cycle.get(symbol) == cycle_at:
            return self._valid_cycles.get(symbol, 0) >= 2
        self._last_cycle[symbol] = cycle_at
        count = self._valid_cycles.get(symbol, 0) + 1
        self._valid_cycles[symbol] = count
        return count >= 2


def consolidate_candidates(candidates):
    by_pair = {}
    for item in candidates:
        key = (item["cycle_at"], item["symbol"])
        by_pair.setdefault(key, []).append(item)
    result = []
    for _, items in sorted(by_pair.items()):
        items.sort(key=lambda item: (PRIORITY.get(item["alert_type"], 99), item.get("event_id", "")))
        primary = dict(items[0])
        primary_bias = primary.get("bias")
        conflicting = bool(primary_bias and any(
            item.get("bias") and item["bias"] != primary_bias for item in items[1:]
        ))
        for field in ("gap", "bias"):
            if primary.get(field) is None:
                primary[field] = next((item[field] for item in items
                                       if item.get(field) is not None and
                                       (not primary_bias or not item.get("bias") or item["bias"] == primary_bias)), None)
        primary["conflict"] = conflicting
        primary["evidence"] = [
            {"type": item["alert_type"], "detail": item.get("detail") or ""}
            for item in items if not primary_bias or not item.get("bias") or item["bias"] == primary_bias
        ]
        result.append(primary)
    result.sort(key=lambda item: (PRIORITY.get(item["alert_type"], 99), item["symbol"]))
    return result


def build_idempotency_key(candidate):
    stable = candidate.get("event_id") or candidate["cycle_at"]
    material = "|".join((candidate["symbol"], candidate["alert_type"], str(stable)))
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def render_immediate_message(rows):
    """Render one compact group post; rows have already been prioritized."""
    labels = {
        "structure": "Structure change", "gold": "Gold flip",
        "gap_zone": "Confirmed gap zone", "early_entry": "Gap change",
        "momentum": "Momentum watch",
    }
    lines = ["🐼 <b>PANDA SIGNAL UPDATE</b>"]
    for row in rows:
        symbol = html.escape(str(row.get("symbol") or "?"))
        kind = html.escape(labels.get(row.get("alert_type"), "Market update"))
        bias = "MIXED" if row.get("conflict") else html.escape(str(row.get("bias") or ""))
        detail = html.escape(str(row.get("detail") or ""))
        gap = row.get("gap")
        gap_text = f" | gap {gap:+.0f}" if isinstance(gap, (int, float)) else ""
        level_priority = row.get("level_priority") if not row.get("conflict") else None
        level_tag = " · LOW PRIORITY: LEVELS" if level_priority == "LOW PRIORITY" else " · LEVEL REVIEW" if level_priority in ("CAUTION", "REVIEW") else ""
        lines.append(f"\n<b>{symbol}</b> · {kind} · {bias}{gap_text}{level_tag}")
        if detail:
            lines.append(detail)
        if row.get("price_context") and not row.get("conflict"):
            lines.append("Levels at detection: " + html.escape(str(row["price_context"])))
        if row.get("conflict"):
            lines.append("Mixed directional evidence; verify the chart before drawing a setup conclusion.")
        supporting = [e["detail"] for e in row.get("evidence", [])
                      if e.get("type") != row.get("alert_type") and e.get("detail")]
        if supporting:
            lines.append("Also: " + html.escape("; ".join(dict.fromkeys(supporting))))
    lines.append("\nObserved setup state; confirm on chart before acting.")
    return "\n".join(lines)
