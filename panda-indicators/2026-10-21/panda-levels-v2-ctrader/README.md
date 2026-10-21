# Panda Levels V2 for cTrader

Separate V2 based on Panda Levels. Original box ranges and previous day/week/month/year levels are preserved.

## Parameters

- **Fill Boxes**: Yes by default. No leaves borders only.
- **Box Fill Opacity (%)**: 20 by default; 0 is transparent, 100 is solid. Applies to all three boxes; borders stay opaque.
- **Show Panda Lines**: No by default. Set Yes to show SuperTrend and Follow Line on the chart timeframe.
- SuperTrend and Follow Line also have independent visibility switches and the existing period/ATR settings.

Panda Lines use the calculations from the personal cTrader XTF BOS indicator, without its currency-pair restriction, scoring, panel, signals, or trading actions.

Build `PandaLevelsV2/PandaLevelsV2.csproj` in Release mode, then open the generated `.algo` in cTrader and add **Panda Levels V2** to the chart. Remove the original Panda Levels instance if you do not want duplicate boxes and levels.

Live chart appearance and parameter interaction must be checked in cTrader after installation.
