# Panda Levels MT5

A standalone, read-only MT5 chart indicator. It does not use a feed EA, dashboard token, files, WebRequest, or trading functions.

## What it draws

- Orange short box: the high/low of the second and third most recently completed broker days.
- Green medium box: the high/low of the second and third most recently completed broker weeks.
- Blue long box: the high/low of the second and third most recently completed broker months.
- Previous completed day, week, month, and calendar-year highs and lows (PDH/PDL, PWH/PWL, PMH/PML, PYH/PYL).

The three box time windows follow the existing cTrader Panda Levels V2 H1-period grouping. They use the MT5 broker's server time and need roughly four months of H1 history. Boxes are fixed to historical period starts; they do not slide with each tick. Shading is blended against the chart background because MT5 rectangle objects do not provide the same alpha-fill control as the cTrader chart rectangles.

## Install

Copy `Panda Levels MT5.ex5` into the terminal's `MQL5/Indicators` folder, refresh Navigator, and attach **Panda Levels MT5** to a chart. The indicator may be attached alongside a trading EA. Its inputs control boxes, shading strength, previous-period lines, and labels.

Compilation with the installed IC Markets MetaEditor: 0 errors, 0 warnings. Chart appearance and same-feed parity with cTrader should be checked in MT5 after attaching.
