# Telegram Snapshot Size Reference

Known-good layout for Panda Telegram snapshots:

- Generated image size for 21 pairs: `3504x3816`
- Columns: `2`
- Rows per column: `11`
- Card width: `1700`
- Row height: `300`
- Header height: `220`
- Footer height: `120`
- Row gap: `16`
- Pair/GAP/BIAS top offsets:
  - `GAP`: `x + 430`
  - `BIAS`: `x + 680`
- Context lines:
  - Line 1: `PAIR`, `GAP`, `BIAS`
  - Line 2: `H1/H4 box`
  - Line 3: `FL-ST`, `SCORE`
- Metric offsets:
  - `FL-ST`: `x + 0`
  - `SCORE`: `x + 650`

If the Telegram image becomes small or text overlaps again, restore the
`build_snapshot_layout()` constants and row drawing offsets to these values.

Runtime file currently used by `START_PANDA.bat`:

`C:\Users\Admin\Desktop\ctrader_trend_scanner\app.py`
