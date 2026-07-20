# Panda XTF BOS v1 (MT4)

A lightweight MT4 indicator that fuses the working XTF/BOS logic (Panda Boxes,
Panda Lines, Break of Structure and the XTF-gated BUY/SELL trigger) with the
local 21-pair currency scoring. Everything is computed from the broker's own
live chart data — **no API keys, no engine files, no network, and it never
places trades.** Personal use.

## What it shows

- **Scoring panel:** BIAS, GAP, BASE XTF, QUOTE XTF, the strongest-extreme XTF
  summary, the selected XTF box trend, SIGNAL, BOX H1, BOX H4, PANDA LINES zone,
  FLIP and BOS. All derived from the same 21-pair currency-strength scoring the
  Panda engine uses (gap threshold 5, HARD_INVALID conflict rule, strongest
  extreme per currency).
- **Panda Boxes:** the three offset boxes drawn on chart — short = completed
  days 2-3 (orange), medium = weeks 2-3 (green), long = months 2-3 (blue).
  These match the cTrader XTF/BOS boxes and the `Panda Engine MT4 Final` main
  boxes exactly.
- **Panda Lines:** SuperTrend (10, 3) and the BB/ATR Follow Line (21, 1.0,
  ATR 5), drawn as single colour-split lines (green/red SuperTrend, blue/red
  Follow Line) via four buffers, non-repainting on `close[1]`.
- **Break of Structure:** confirmed swing-pivot BOS (default swing length 5)
  with `BOS+` / `BOS-` markers, one-shot per swing.
- **XTF-gated BUY/SELL trigger:** fires only when BIAS + price vs Panda Lines +
  the selected H1/H4 box trend all align **and** a matching confirmed BOS prints.
  Draws a `BUY` / `SELL` label and raises a popup + sound alert. `PL+` / `PL-`
  flip markers show the Panda Lines crossings along the way.

## Signal funnel

1. Currency scoring → BIAS (BUY at gap +5, SELL at -5, else WAIT; HARD_INVALID
   on conflict or neutral-vs-neutral).
2. Price above both Panda Lines (buy) / below both (sell).
3. Selected XTF box (H1 or H4) is UPTREND (buy) / DOWNTREND (sell).
4. Confirmed Break of Structure in that direction → BUY / SELL trigger + alert.

## Install & compile

1. The source is `Panda XTF BOS v1.mq4`. Copy it into your MT4
   `MQL4/Indicators` folder (already placed there on the build machine).
2. Open it in **MetaEditor** and press **F7** (Compile) to produce
   `Panda XTF BOS v1.ex4`. It should compile clean; any messages will be
   unused-parameter warnings only.
3. In MT4, refresh Navigator → Indicators, attach **Panda XTF BOS v1** to a
   supported forex chart (H1 recommended). Enable alerts in the inputs if you
   want the popup/sound on triggers.

Note: this repo build machine (Apple-Silicon Wine) cannot run the MetaEditor
compiler headlessly, so the `.ex4` is produced by the F7 step above.

## Inputs (highlights)

- Scoring: `GapThreshold`, `BoxCalcTF` (H1), box spans/offsets, `RefreshSeconds`.
- Panda Lines: `ShowPandaLines`, `ST_Period`, `ST_Multiplier`, `BB_Period`,
  `BB_Deviations`, `BB_UseATR`, `BB_ATRPeriod`.
- XTF/BOS: `XtfStructure` (H1/H4 gate), `SwingLength`, `ShowBoxes`, `ShowBOS`,
  `ShowFlips`, `ShowTriggers`.
- Alerts: `EnableAlerts`, `AlertPopup`, `AlertSound`.
- Panel + box colours.

## Differences from the heavy `Panda Engine MT4 Final`

Stripped for lightness: no engine-file export (`mt4_`/`tbg_` writes), no
previous day/week/month/year S/R zones, no advance-score pass. Added: the
swing BOS, the XTF gate and the gated BUY/SELL trigger with alerts. The
scoring, boxes and Panda Lines are the same proven logic.
