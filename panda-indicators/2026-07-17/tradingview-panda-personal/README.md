# Panda Engine Personal TV

Private TradingView Pine v6 overlay for Boss-G. It computes its own Panda
currency scoring from TradingView's OANDA H1 feeds and does not use a Panda
token, account approval, website API, Supabase, or the Windows engine.

## Install

The verified private script is already saved in TradingView as
`Panda Engine Personal TV`. To install it on another TradingView account:

1. Open a chart and select **Pine Editor**.
2. Create a new **Indicator** script.
3. Copy all contents of `PandaEnginePersonalTV.pine` into the editor.
4. Select **Add to chart**, then save it as `Panda Engine Personal TV`.
5. Use one of the 21 supported non-CHF forex pairs. Broker-prefixed symbols
   such as `ICMARKETS:USDJPY` are normalized to their six-letter pair.

## What it shows

- `BIAS`: `BUY`, `SELL`, `WAIT`, `HARD_INVALID`, or a data/symbol warning.
- `GAP`: the signed base-minus-quote Panda score.
- `BOX H1`: short Box midpoint versus the medium Box range.
- `BOX H4`: medium Box midpoint versus the long Box range.
- `PANDA LINES`: price `ABOVE`, `BELOW`, or `BETWEEN` SuperTrend 10/3 and
  the BB21/deviation-1/ATR-SMA5 Follow Line.
- `FLIP`: the last confirmed Panda Lines side change. A move through
  `BETWEEN` remembers the prior directional side.
- `BOS`: the last confirmed close beyond an unbroken pivot swing.

The three optional chart Boxes use the existing offset windows: two completed
days, two completed weeks, and two completed months, each shifted one period.
The panel defaults to bottom-left and includes a transparent bottom spacer so
the TradingView watermark does not cover the BOS row. TradingView tables are
not mouse-draggable; choose any chart corner in **Settings → Inputs → Panel
position**.

## Alerts

Create a TradingView alert from this indicator and select one of:

- **Panda Lines Bullish Flip** (`PL_BULLISH_FLIP`)
- **Panda Lines Bearish Flip** (`PL_BEARISH_FLIP`)
- **Panda Bullish BOS** (`BOS_BULLISH`)
- **Panda Bearish BOS** (`BOS_BEARISH`)

All four events are confirmed only at bar close. The optional dynamic alert
input emits a compact JSON payload for future webhook/Telegram integration;
it is off by default. No engine or Telegram route is wired in this release.

## Performance and scope

The script makes 21 dynamic OANDA H1 requests and limits both the indicator
and each request to 1,800 bars. This is sufficient for the retained three
completed monthly ranges on normal forex sessions and passed a live USDJPY H1
compile/runtime smoke test on 2026-07-17.

This overlay is informational. TradingView data and session boundaries can
differ from the Windows Panda Engine feed, so values are structurally aligned
but are not guaranteed to be tick-for-tick identical.
