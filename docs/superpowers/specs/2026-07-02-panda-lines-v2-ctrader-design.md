# Panda Lines v2 cTrader Conversion

## Goal

Create one importable cTrader Automate indicator that reproduces the supplied MetaTrader 4 `Panda Lines v2.mq4` indicator as closely as cTrader permits.

## Scope

The indicator will preserve the MT4 inputs and defaults for:

- SuperTrend period, multiplier, ATR toggle, signals, and alerts.
- Bollinger breakout trend-line period, deviation, ATR settings, labels, and alerts.
- Previous daily, weekly, monthly, and yearly high/low zones.
- Zone width, left extension, colors, labels, and visibility switches.

The output will be a single self-contained file named `Panda Lines v2 cTrader.cs` under the Panda Engine workspace. The original MQ4 file will remain unchanged.

## Calculation Parity

The port will implement the MQ4 formulas directly instead of substituting cTrader's built-in ATR or Bollinger indicators. This preserves the source indicator's simple-average true range, population standard deviation, previous-bar breakout checks, trailing-band state, and trend-transition behavior.

Four plotted series will represent bullish and bearish SuperTrend segments and bullish and bearish BB trend segments. Undefined segments will use `double.NaN`.

## Chart Objects and Alerts

Signal transitions will draw uniquely named chart icons so recalculation does not create duplicates. S/R zones will use rectangles, horizontal lines, and text labels based on completed higher-timeframe bars. The previous calendar year's high and low will be derived from monthly bars.

Alerts will evaluate closed bars only and fire once per newly closed chart bar. cTrader notification sounds will replace the MT4 WAV filenames because platform sound APIs differ.

## Reliability

The implementation will guard against insufficient history and missing higher-timeframe data. It will avoid trading operations, network access, Panda Engine strategy logic, and changes to locked project files.

Validation will include source-level checks for all parameters and features, plus compilation when a compatible local cTrader build tool is available. If cTrader compilation cannot be run locally, that limitation will be reported explicitly.
