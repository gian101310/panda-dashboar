# Handoff — Panda Lines FLIP + BOS Telegram alerts

**Goal:** Telegram alert when (1) a pair's Panda Lines **flip** and (2) a pair
prints a new **Break of Structure (BOS)** on H1.

Part A = MT4 exporter (this folder — swap + compile). Part B = `app.py` on the
Windows engine box (apply the patch below).

---

## PART A — MT4 exporter (Windows MetaTrader)

File: `Panda_Exporter_BOS.mq4` (this folder). It is the existing
`Panda_Exporter.mq4` with BOS added — scoring / Panda Lines / S/R logic is
byte-for-byte unchanged. Additions only:

- New inputs: `SwingLength = 5`, `BOS_ScanBars = 400`.
- New function `CalcBos()` — ported verbatim from `Panda XTF BOS v5.mq4`
  (`ProcessClosedShift`): confirmed swing pivots, one break per swing, tested on
  closed bars only (shift >= 1 -> non-repainting). Runs on `plTF` (H1 default).
- Two new lines in every `tbg_SYMBOL.txt`:
  `TBG_BOS  : BULLISH|BEARISH|NONE`
  `TBG_BOS_T: <unix time of the break bar, 0 if none>`

Install: copy into `MQL4/Experts`, F7 compile, remove the old exporter from its
chart, attach the new one. Confirm a `tbg_*.txt` now shows the two BOS lines.

> `TBG_BOS` stays "BULLISH" across many 5s cycles after a bull break, so the
> engine must dedup on **`TBG_BOS_T`** (break-bar time) -> one alert per break.

---

## PART B — `app.py` engine patch

Path: `C:\Users\Admin\Desktop\ctrader_trend_scanner\app.py`
(Do NOT touch the LOCKED scoring block, ~lines 330-439.)

### B1. parse_tbg_file — read the two new fields
```python
if line.startswith("TBG_BOS_T"):
    try:    result["bos_t"] = int(line.split(":", 1)[1].strip())
    except: result["bos_t"] = 0
elif line.startswith("TBG_BOS"):
    result["bos"] = line.split(":", 1)[1].strip()   # BULLISH / BEARISH / NONE
```
Default when absent: `result.setdefault("bos","NONE")`,
`result.setdefault("bos_t",0)`.

### B2. Module-level state (near PREV_GAP)
```python
PREV_ZONE  = {}   # pair -> last TBG_ZONE
LAST_BOS_T = {}   # pair -> last alerted TBG_BOS_T (int)
```
Seed both from the first read on engine start (same pattern as PREV_GAP pre-load,
commit 737efb2) so no stale burst on boot.

### B3. Detection + send (call once per pair per cycle, after tbg parsed)
```python
def check_structure_alerts(pair, tbg):
    zone  = tbg.get("zone", "BETWEEN")   # match your dict keys
    bos   = tbg.get("bos", "NONE")
    bos_t = tbg.get("bos_t", 0)

    prev = PREV_ZONE.get(pair)
    if zone in ("ABOVE", "BELOW"):
        if prev in ("ABOVE", "BELOW") and prev != zone:
            direction = "BULLISH" if zone == "ABOVE" else "BEARISH"
            send_telegram(f"PANDA LINES FLIP - {pair}\n{prev} -> {zone} ({direction})")
        PREV_ZONE[pair] = zone
    elif prev is None:
        PREV_ZONE[pair] = zone   # seed only; don't overwrite a real side with BETWEEN

    if bos in ("BULLISH","BEARISH") and bos_t > 0 and bos_t != LAST_BOS_T.get(pair, 0):
        arrow = "UP" if bos == "BULLISH" else "DOWN"
        send_telegram(f"BREAK OF STRUCTURE - {pair} (H1)\n{bos} BOS confirmed [{arrow}]")
        LAST_BOS_T[pair] = bos_t
```
`send_telegram(...)` = the existing helper `send_gap_alert` / `check_news_alerts`
already use (goes to @PandaEngineBot, admin chat 5379148910, via the circuit
breaker). Do not create a new Telegram path.

### B4. Wire in run_gap_once_v3 (where each pair's tbg dict is available)
```python
check_structure_alerts(pair, tbg)
```

### B5. Verify + restart
`py -3.11 -m py_compile app.py` then restart via `START_PANDA.bat`
(never Desktop Commander — APScheduler loop won't survive).

## Decisions baked in
- Timeframe = H1 (exporter PL_Timeframe=0 -> H1; BOS same TF).
- Flip source = TBG_ZONE crossing ABOVE<->BELOW (BETWEEN = no side, no spam).
- Optional later: per-user opt-in via user_alert_prefs; structure_events table
  for history.
