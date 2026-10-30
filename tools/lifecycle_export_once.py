"""Export lifecycle context from the engine's existing local score files.

This is a read-only fallback when the running engine has not loaded the newer
app.py exporter. It does not score pairs, call Supabase, or send alerts.
"""

import time
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import MT4_PATH, PAIRS, parse_mt4_file, parse_pl_file
from lib.panda_signal_lifecycle import export_lifecycle_snapshot


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
    source = Path(MT4_PATH)
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
                     **{name: pl.get(name) for name in ("pdh", "pdl", "pwh", "pwl", "pmh", "pml")}})
    if len(rows) != len(PAIRS):
        raise RuntimeError(f"Only {len(rows)}/{len(PAIRS)} fresh score files; snapshot withheld")
    if max(score_times) - min(score_times) > 60:
        raise RuntimeError("Score files span different engine cycles; snapshot withheld")
    target = (Path.home() / "Documents" / "cAlgo" / "Data" / "Indicators" /
              "Panda Signal Lifecycle" / "panda_lifecycle_snapshot.json")
    if target.exists() and target.stat().st_mtime >= max(score_times):
        print("Lifecycle snapshot already current")
        return
    print(f"Exported {export_lifecycle_snapshot(rows, parsed, price_source_dir=source)} lifecycle pairs")


if __name__ == "__main__":
    main()
