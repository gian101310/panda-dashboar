"""Read the current Panda Gold MT4 indicator state from Common Files.

The indicator owns the signal decision. This module only validates its export;
it does not infer a new trade from historical flips or recalculate scoring.
"""

import csv
import math
from datetime import datetime, timezone
from pathlib import Path


SCHEMA = "PANDA_GOLD_MT4_V1"
MAX_STATE_AGE = 300
MAX_EVENT_AGE = 600


def read_gold_state(directory, period=60, now=None):
    """Return None before first export, or an MT4 state including OFFLINE."""
    now = now or datetime.now(timezone.utc)
    files = sorted(Path(directory).glob(f"panda_gold_mt4_*_{period}.txt"),
                   key=lambda path: path.stat().st_mtime, reverse=True)
    if not files:
        return None
    path = files[0]
    offline = {"symbol": "XAUUSD", "source": "MT4", "timeframe": f"M{period}",
               "status": "OFFLINE", "bias": "WAIT", "gap": 0,
               "entry": None, "sl": None, "tp1": None, "tp2": None, "tp3": None,
               "usd_strength": 0, "filter": "OFFLINE", "new_signal": False,
               "signal_time": None, "error": "MT4 Gold export stale or invalid"}
    try:
        with path.open(encoding="utf-8-sig", newline="") as stream:
            row = next(csv.reader(stream, delimiter="|"))
        if len(row) != 16 or row[0] != SCHEMA:
            return offline
        (schema, generated, account, symbol, chart_period, bar_time, event_utc,
         direction, active, entry, stop, tp1, tp2, tp3, usd, filter_ready) = row
        if int(chart_period) != period or not symbol.upper().startswith("XAUUSD"):
            return offline
        age = now.timestamp() - int(generated)
        if age < -60 or age > MAX_STATE_AGE:
            return offline
        direction = int(direction)
        if direction not in (-1, 0, 1) or int(active) not in (0, 1):
            return offline
        active = int(active) == 1
        prices = tuple(float(value) for value in (entry, stop, tp1, tp2, tp3))
        if not all(math.isfinite(value) for value in prices):
            return offline
        signal_epoch = int(event_utc)
        event_age = now.timestamp() - signal_epoch if signal_epoch else None
        # The indicator itself decides whether a flip is allowed. A missing USD
        # refresh does not veto it in ProcessGold, so mirror that decision here.
        new_signal = (active and direction != 0 and event_age is not None
                      and 0 <= event_age <= MAX_EVENT_AGE)
        status = "LONG" if active and direction == 1 else "SHORT" if active and direction == -1 else "FLAT"
        signal_id = f"{account}:{symbol}:{period}:{bar_time}:{direction}:{signal_epoch}" if new_signal else None
        return {"symbol": "XAUUSD", "source": "MT4", "timeframe": f"M{period}",
                "status": status, "bias": "BUY" if status == "LONG" else "SELL" if status == "SHORT" else "WAIT",
                "gap": 9 if status == "LONG" else -9 if status == "SHORT" else 0,
                "entry": prices[0] if active else None,
                "sl": prices[1] if active else None,
                "tp1": prices[2] if active else None,
                "tp2": prices[3] if active else None,
                "tp3": prices[4] if active else None,
                "usd_strength": int(usd), "filter": "CLEAR" if int(filter_ready) else "USD UNAVAILABLE",
                "new_signal": new_signal, "signal_time": signal_id, "error": None}
    except (OSError, ValueError, StopIteration):
        return offline
