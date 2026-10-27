"""Export a small, local Panda setup snapshot for the read-only cTrader panel."""

import os
from datetime import datetime, timezone
from pathlib import Path


def export_hedge_bias_snapshot(rows, target=None, now=None):
    if target is None:
        target = (Path.home() / "Documents" / "cAlgo" / "Data" / "Indicators" /
                  "Panda Cross-Hedge" / "panda_bias_snapshot.txt")
    target = Path(target)
    timestamp = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    lines = ["PANDA_HEDGE_BIAS_V1\t" + timestamp.strftime("%Y-%m-%dT%H:%M:%SZ")]
    for row in rows:
        symbol = str(row.get("symbol") or "").upper()
        if len(symbol) != 6 or not symbol.isalpha():
            continue
        fields = [symbol, str(row.get("bias") or "WAIT").upper(),
                  str(row.get("gap") or 0), "1" if row.get("hard_invalid") else "0",
                  str(row.get("pl_zone") or "UNKNOWN").upper(),
                  str(row.get("box_h1_trend") or "UNKNOWN").upper(),
                  str(row.get("box_h4_trend") or "UNKNOWN").upper(),
                  "1" if row.get("pl_g1_valid") else "0"]
        lines.append("\t".join(fields))
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + ".tmp")
    try:
        temporary.write_text("\n".join(lines) + "\n", encoding="utf-8")
        os.replace(temporary, target)
    finally:
        if temporary.exists():
            temporary.unlink()
    return len(lines) - 1
