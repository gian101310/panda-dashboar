# Panda Box and Lines for cTrader

Standalone, read-only cTrader port of the MT4 `Panda Box and Lines.mq4` v1.35 indicator. It uses broker H1 history and current bids for the 21 Panda pairs. It does not use the Panda Engine feed or place trades.

## Chart display

- Current raw positive/negative currency votes for D1, H4 and H1, for the chart pair's base and quote currencies.
- ADV raw votes for the same six currency/timeframe cells.
- Current strongest-score gap and BUY/SELL/INVALID bias. ADV next-session gap and BUY/SELL/WAIT/INVALID bias, with the TMRW/WK/MTH horizon.
- Gap selection keeps positive and negative raw votes separate across D1/H4/H1, as the Panda engine does. A mixed `+3/-1` cell contributes `+3` as its strongest side rather than a net `+2`; opposing raw extremes mark the current pair `HARD_INVALID`.
- WagBox2 (monthly), WagBox1 (weekly), WagBox3 (trading-day) rectangles using the MT4 default 2-period windows and offset 1. Window sizes and offsets are inputs.
- The boxes draw without WagBox text labels on the chart.
- Box appearance parameters include fill on/off, fill opacity (30% by default), outline width, and a separate color for each box.
- PDH/PDL, PWH/PWL, PMH/PML and PYH/PYL previous-period lines.
- ST (SuperTrend) and FL (FollowLine) curves across the chart candles, colored by direction like Panda Levels V2. They use the chart timeframe and cTrader broker bars; on H1 the default periods match the MT4 exporter's settings. The Panda Lines inputs can be adjusted to match a customized exporter.

PYH/PYL load monthly history back through the start of the previous year before drawing. If the broker has no complete previous-year history, those two lines remain hidden rather than showing partial-year levels. The values are calculated from cTrader broker candles and can differ from MT4 exports.

The panel shows `DATA UNAVAILABLE` until all 21 pairs and their required H1 history are available. It loads more history every 10 seconds while waiting, then refreshes every 60 seconds by default. The box and level calendar is based on UTC H1 bars; broker session cuts can differ from the MT4 terminal, so live side-by-side value parity remains to be checked.

## Install

Open `dist/Panda Box and Lines cTrader.algo` in cTrader and add **Panda Box and Lines** to a supported forex chart. The compiled package also appears under `C:\Users\Admin\Documents\cAlgo\Sources\Indicators` after a local build.

Build with `C:\Program Files\dotnet\dotnet.exe build -c Release` in this directory. The source is `PandaBoxAndLines.cs`; the `.algo` is the ready-to-import binary.
