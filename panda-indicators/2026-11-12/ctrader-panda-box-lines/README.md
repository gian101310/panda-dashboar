# Panda Box and Lines for cTrader

Standalone, read-only cTrader port of the MT4 `Panda Box and Lines.mq4` v1.35 indicator. It uses broker H1 history and current bids for the 21 Panda pairs. It does not use the Panda Engine feed or place trades.

## Chart display

- Current raw positive/negative currency votes for D1, H4 and H1, for the chart pair's base and quote currencies.
- ADV raw votes for the same six currency/timeframe cells.
- Current strongest-score gap and BUY/SELL/INVALID bias. ADV next-session gap and BUY/SELL/WAIT/INVALID bias, with the TMRW/WK/MTH horizon.
- WagBox2 (monthly), WagBox1 (weekly), WagBox3 (trading-day) rectangles using the MT4 default 2-period windows and offset 1. Window sizes and offsets are inputs.
- The boxes draw without WagBox text labels on the chart.
- Box appearance parameters include fill on/off, fill opacity (30% by default), outline width, and a separate color for each box.
- PDH/PDL, PWH/PWL, PMH/PML and PYH/PYL previous-period lines.

The panel shows `DATA UNAVAILABLE` until all 21 pairs and their required H1 history are available. It loads more history every 10 seconds while waiting, then refreshes every 60 seconds by default. The box and level calendar is based on UTC H1 bars; broker session cuts can differ from the MT4 terminal, so live side-by-side value parity remains to be checked.

## Install

Open `dist/Panda Box and Lines cTrader.algo` in cTrader and add **Panda Box and Lines** to a supported forex chart. The compiled package also appears under `C:\Users\Admin\Documents\cAlgo\Sources\Indicators` after a local build.

Build with `C:\Program Files\dotnet\dotnet.exe build -c Release` in this directory. The source is `PandaBoxAndLines.cs`; the `.algo` is the ready-to-import binary.
