"""Local, conservative four-hour outcome calibration for lifecycle labels.

Observations are sampled at least four hours apart per pair. A success means
the Panda bias is still valid four hours later AND price moved with that bias.
No trading orders or engine scoring are involved.
"""

import bisect
import json
import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path


HORIZON_SECONDS = 4 * 3600
MATCH_TOLERANCE_SECONDS = 15 * 60
MIN_TRAIN = 30
MIN_HOLDOUT = 15
MIN_DAYS = 10
OUTCOME_MIN_PIPS = 3


def phase_family(phase):
    phase = (phase or "").upper()
    if phase.startswith("STRONG"):
        return "STRONG"
    if phase.startswith(("STARTING", "STRENGTHENING", "BASELINE")):
        return "EARLY"
    if phase.startswith(("WEAKENING", "MIXED", "MATURE")):
        return "FADING"
    return "CONTINUING"


def _parse_utc(value):
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (AttributeError, TypeError, ValueError):
        return None


def _wilson(successes, total):
    p = successes / total
    z = 1.96
    denominator = 1 + z * z / total
    center = (p + z * z / (2 * total)) / denominator
    radius = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator
    return round(100 * (center - radius)), round(100 * (center + radius))


def calculate_report(history_dir, now):
    """Use completed outcomes only, with a later-date holdout for each pair/phase."""
    history_dir = Path(history_dir)
    cutoff = now.timestamp() - HORIZON_SECONDS
    first_date = (now - timedelta(days=45)).date().isoformat()
    rows = defaultdict(list)
    for path in sorted(history_dir.glob("*.jsonl")):
        if path.stem < first_date or path.stem > now.date().isoformat():
            continue
        with path.open(encoding="utf-8") as stream:
            for line in stream:
                try:
                    observation = json.loads(line)
                except ValueError:
                    continue
                if observation.get("version") != 2:
                    continue
                stamp = _parse_utc(observation.get("generated_utc"))
                if stamp is None or stamp > now.timestamp():
                    continue
                for symbol, item in (observation.get("pairs") or {}).items():
                    if len(symbol) == 6 and isinstance(item, dict):
                        rows[symbol].append((stamp, item))
    outcomes = defaultdict(list)
    for symbol, samples in rows.items():
        samples.sort(key=lambda x: x[0])
        times = [stamp for stamp, _ in samples]
        last_sample = -float("inf")
        for stamp, item in samples:
            if stamp > cutoff or stamp - last_sample < HORIZON_SECONDS:
                continue
            price = item.get("price")
            bias = item.get("bias")
            if not item.get("valid") or not isinstance(price, (int, float)) or bias not in ("BUY", "SELL"):
                continue
            future_index = bisect.bisect_left(times, stamp + HORIZON_SECONDS)
            if future_index == len(samples) or times[future_index] > stamp + HORIZON_SECONDS + MATCH_TOLERANCE_SECONDS:
                continue
            future = samples[future_index][1]
            future_price = future.get("price")
            if not isinstance(future_price, (int, float)):
                continue
            direction = 1 if bias == "BUY" else -1
            pip = 0.01 if "JPY" in symbol else 0.0001
            success = (future.get("valid") is True and future.get("bias") == bias and
                       direction * (future_price - price) >= OUTCOME_MIN_PIPS * pip)
            outcomes[(symbol, phase_family(item.get("phase")))].append((stamp, int(success)))
            last_sample = stamp
    report = {}
    for (symbol, family), values in outcomes.items():
        values.sort()
        days = {datetime.fromtimestamp(stamp, timezone.utc).date() for stamp, _ in values}
        split = max(MIN_TRAIN, int(len(values) * 0.7))
        train, holdout = values[:split], values[split:]
        holdout_days = {datetime.fromtimestamp(stamp, timezone.utc).date() for stamp, _ in holdout}
        entry = {"samples": len(values), "days": len(days), "status": "COLLECTING"}
        if (len(train) >= MIN_TRAIN and len(holdout) >= MIN_HOLDOUT and
                len(days) >= MIN_DAYS and len(holdout_days) >= 3):
            train_rate = sum(hit for _, hit in train) / len(train)
            test_rate = sum(hit for _, hit in holdout) / len(holdout)
            if abs(train_rate - test_rate) <= 0.15:
                low, high = _wilson(sum(hit for _, hit in values), len(values))
                entry.update(status="VALIDATED", percent=round(100 * sum(hit for _, hit in values) / len(values)),
                             low=low, high=high)
            else:
                entry["status"] = "UNSTABLE"
        report.setdefault(symbol, {})[family] = entry
    return report


def daily_report(history_dir, now):
    """Recompute at most once per UTC day; keep heavy history reads off each cycle."""
    history_dir = Path(history_dir)
    cache = history_dir / "four_hour_calibration.json"
    try:
        saved = json.loads(cache.read_text(encoding="utf-8"))
        if saved.get("date") == now.date().isoformat() and saved.get("model_version") == 2:
            return saved.get("pairs") or {}
    except (OSError, ValueError):
        pass
    report = calculate_report(history_dir, now)
    temp = cache.with_suffix(".tmp")
    temp.write_text(json.dumps({"date": now.date().isoformat(), "model_version": 2,
                                "pairs": report}, separators=(",", ":")), encoding="utf-8")
    temp.replace(cache)
    return report
