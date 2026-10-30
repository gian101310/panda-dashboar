"""Export lifecycle context from the engine's existing local score files.

This is a read-only fallback when the running engine has not loaded the newer
app.py exporter. It does not score pairs, call Supabase, or send alerts.
"""

import os
import time
import sys
import json
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

from lib.panda_signal_lifecycle import export_lifecycle_snapshot
from lib.panda_lifecycle_history import build_history_observation


def read_score(path):
    if not path.exists() or time.time() - path.stat().st_mtime > 10 * 60:
        return None
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition(":")
        if separator:
            values[key] = value
    try:
        return {"gap": float(values["GAP"]), "bias": values["BIAS"],
                "hard_invalid": values.get("HARD_INVALID") == "1"}
    except (KeyError, ValueError):
        return None


def main():
    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / ".env")
    source = Path(os.environ.get("MT4_PATH") or
                  Path.home() / "AppData" / "Roaming" / "MetaQuotes" / "Terminal" / "Common" / "Files")
    target = (Path.home() / "Documents" / "cAlgo" / "Data" / "Indicators" /
              "Panda Signal Lifecycle" / "panda_lifecycle_snapshot.json")
    score_files = list(source.glob("panda_score_*.txt"))
    snapshot_current = (target.exists() and score_files and
                        target.stat().st_mtime >= max(p.stat().st_mtime for p in score_files))
    snapshot_mtime = target.stat().st_mtime if snapshot_current else None
    current_snapshot = json.loads(target.read_text(encoding="utf-8")) if snapshot_current else None
    if snapshot_current:
        analytics_file = (target.parent / "history" / "analytics" /
                          (current_snapshot["generated_utc"][:10] + ".jsonl"))
        if analytics_file.exists() and analytics_file.stat().st_mtime >= target.stat().st_mtime:
            print("Lifecycle snapshot and analytics already current")
            return
    from app import PAIRS, parse_mt4_file, parse_pl_file

    rows, parsed, score_times = [], {}, []
    for symbol in PAIRS:
        score_file = source / f"panda_score_{symbol}.txt"
        score = read_score(score_file)
        if score is None:
            continue
        score_times.append(score_file.stat().st_mtime)
        chart = parse_mt4_file(symbol)
        if chart is not None:
            parsed[symbol] = chart
        pl = parse_pl_file(symbol) or {}
        rows.append({"symbol": symbol, **score, "pl_price": pl.get("pl_price"),
                     "pl_zone": pl.get("pl_zone"),
                     **{name: pl.get(name) for name in ("pdh", "pdl", "pwh", "pwl", "pmh", "pml",
                                                          "dayh", "dayl")}})
    if len(rows) != len(PAIRS):
        raise RuntimeError(f"Only {len(rows)}/{len(PAIRS)} fresh score files; snapshot withheld")
    if max(score_times) - min(score_times) > 60:
        raise RuntimeError("Score files span different engine cycles; snapshot withheld")
    if snapshot_current:
        if target.stat().st_mtime != snapshot_mtime:
            print("Lifecycle snapshot changed during read; analytics waits for next check")
            return
        snapshot = current_snapshot
        if len(snapshot.get("pairs") or {}) != len(PAIRS):
            raise RuntimeError("Current lifecycle snapshot is incomplete; analytics withheld")
        analytics_dir = target.parent / "history" / "analytics"
        analytics_dir.mkdir(parents=True, exist_ok=True)
        analytics_file = analytics_dir / (snapshot["generated_utc"][:10] + ".jsonl")
        if analytics_file.exists() and analytics_file.stat().st_mtime >= snapshot_mtime:
            print("Lifecycle analytics already current")
            return
        observation = build_history_observation(snapshot, rows, parsed, source,
                                                datetime.now(timezone.utc))
        with analytics_file.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(observation, separators=(",", ":")) + "\n")
        print(f"Captured analytics for {len(observation['pairs'])} lifecycle pairs")
        return
    print(f"Exported {export_lifecycle_snapshot(rows, parsed, price_source_dir=source)} lifecycle pairs")


if __name__ == "__main__":
    main()
