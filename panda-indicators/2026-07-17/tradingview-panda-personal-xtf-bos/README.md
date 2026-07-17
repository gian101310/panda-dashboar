# Panda Engine Personal TV XTF BOS

This is a separate private TradingView Pine v6 indicator. It does **not**
replace `Panda Engine Personal TV`; both versions can be kept in TradingView.

## Install

1. Open a supported non-CHF forex chart, preferably H1.
2. Open **Pine Editor**, create an **Indicator**, and paste the complete
   `PandaEnginePersonalTVXtfBos.pine` source.
3. Select **Add to chart**, then save it as `Panda Engine Personal TV XTF BOS`.
4. In **Settings → Inputs**, choose the mandatory `XTF structure` Box:
   `H1` (default) or `H4`.

The indicator calculates from TradingView's 21 OANDA H1 feeds only. It needs
no Panda token, account approval, website API, Supabase, Windows engine, or
trade permissions.

## Signal flow

The selected XTF Box is the required structure gate:

- **BUY READY — WAIT BULLISH BOS:** Bias is BUY, Panda Lines are ABOVE, and
  the selected Box is UPTREND.
- **SELL READY — WAIT BEARISH BOS:** Bias is SELL, Panda Lines are BELOW, and
  the selected Box is DOWNTREND.
- **BUY TRIGGER / SELL TRIGGER:** a new, confirmed chart-timeframe BOS occurs
  while its respective READY condition is true. The marker and alert occur
  only on that BOS bar; the following bar returns to READY or NO SETUP.
- **NO SETUP:** any required gate is missing, including WAIT/HARD_INVALID
  Bias, Panda Lines BETWEEN/UNKNOWN, or an incompatible selected Box.

`OTHER BOX` is context only and never blocks a setup:

- `ALIGNED` — it agrees with the active Bias.
- `RANGING` — it is neutral.
- `COUNTER` — it points the opposite way.
- `UNKNOWN` — it cannot yet be determined.

The panel defaults to bottom-left. Tables are not mouse-draggable in
TradingView, so use **Settings → Inputs → Panel position** to move it.

## Alerts

Create alerts only for the two final confirmation events:

- **Panda XTF BOS BUY Trigger** (`XTF_BOS_BUY_TRIGGER`)
- **Panda XTF BOS SELL Trigger** (`XTF_BOS_SELL_TRIGGER`)

READY is deliberately visible-only and never alerts. The optional dynamic
alert input remains off by default and is not connected to Panda Engine or
Telegram in this version.

## Scope

The indicator retains the 21 OANDA H1 requests and 1,800-bar performance
budget used by the verified personal overlay. It is informational, does not
place trades, and does not change the locked Panda Engine scoring or strategy
rules.
