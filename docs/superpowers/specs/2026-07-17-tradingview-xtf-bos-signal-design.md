# TradingView XTF BOS Confluence Signal — Design

**Date:** 2026-07-17
**Status:** Approved; implementation authorized
**Scope:** Private `Panda Engine Personal TV` Pine v6 overlay only

## Purpose

Add a chart-readable two-stage signal that makes the waiting sequence clear:

1. The structural conditions are aligned, so the trader waits for a break of
   structure (BOS).
2. A confirmed BOS occurs in the same direction, so the indicator marks a
   final BUY or SELL trigger.

The feature is informational only. It does not place orders, change the locked
Panda Engine scoring functions, alter BB/INTRA rules, or connect to the engine,
dashboard, Telegram, licensing, Supabase, or a website API.

## Approved confluence model

The user selected an execution-timeframe-relative (XTF) Box rule instead of
requiring both Box trends to agree.

### New user input

`XTF structure` is a Pine input with two values:

- `H1` — default
- `H4`

The selected XTF determines the mandatory structural Box:

| XTF | BUY requires | SELL requires |
|---|---|---|
| H1 | `BOX H1 = UPTREND` | `BOX H1 = DOWNTREND` |
| H4 | `BOX H4 = UPTREND` | `BOX H4 = DOWNTREND` |

The non-XTF Box never blocks an otherwise valid setup. It is displayed as
context because a lower structure can be opposing during a pullback within a
higher-timeframe trend.

## Signal state machine

### No setup

The panel reports `NO SETUP` whenever any mandatory gate is absent:

- Symbol is unsupported or data is unavailable.
- Panda bias is `WAIT` or `HARD_INVALID`.
- Panda Lines status is `BETWEEN` or `UNKNOWN`.
- The selected XTF Box is not aligned with the Panda bias.

### Ready state

`BUY READY — WAIT BULLISH BOS` requires, on the confirmed chart bar:

- `pandaBias = BUY`
- `pandaLineStatus = ABOVE`
- selected XTF Box = `UPTREND`

`SELL READY — WAIT BEARISH BOS` is the symmetric rule:

- `pandaBias = SELL`
- `pandaLineStatus = BELOW`
- selected XTF Box = `DOWNTREND`

### Final trigger

`BUY TRIGGER` is a confirmed bullish BOS while BUY READY is true.

`SELL TRIGGER` is a confirmed bearish BOS while SELL READY is true.

The existing BOS implementation defines a bullish BOS as a confirmed candle
close above the newest unbroken confirmed pivot high, and a bearish BOS as a
confirmed close below the newest unbroken confirmed pivot low. The existing
one-trigger-per-swing guard remains in force.

The final trigger is event-only: it displays on the BOS bar, plots a distinct
BUY or SELL marker, and can fire an alert once. On the next bar, the panel
returns to READY if the three gates still align, otherwise it returns to NO
SETUP. The permanent BOS row remains available as history.

## Other-Box context

The non-XTF Box is a descriptive field only:

| Other Box relative to direction | Panel context |
|---|---|
| Same direction | `ALIGNED` |
| `RANGING` | `RANGING` |
| Opposite direction | `COUNTER` |
| Unknown data | `UNKNOWN` |

Examples:

- H4 XTF BUY + H4 Box UPTREND + H1 Box DOWNTREND = BUY READY when Bias and
  Panda Lines agree; H1 is shown as `COUNTER`, representing a possible
  pullback. A bullish BOS becomes the final continuation trigger.
- H1 XTF SELL + H1 Box DOWNTREND + H4 Box UPTREND = SELL READY when Bias and
  Panda Lines agree; H4 is shown as `COUNTER`. This remains informational and
  is not silently filtered out by the indicator.

## Panel, drawings, and alerts

The compact bottom-left panel retains existing fields and adds:

- `XTF` — selected `H1` or `H4`
- `XTF BOX` — active Box trend used as the mandatory gate
- `OTHER BOX` — `ALIGNED`, `RANGING`, `COUNTER`, or `UNKNOWN`
- `SIGNAL` — `NO SETUP`, READY text, or event-only BUY/SELL TRIGGER

Existing BOS markers remain. Final confluence markers are visually distinct:

- Green `BUY` label below the BOS bar
- Red `SELL` label above the BOS bar

New stable alert events:

- `XTF_BOS_BUY_TRIGGER`
- `XTF_BOS_SELL_TRIGGER`

`alertcondition()` messages use the existing `PANDA_TV` pipe-delimited format.
Optional dynamic `alert()` calls use the same stable event names. READY states
do not send alerts in this release; only final trigger events do.

## Constraints and verification

- Keep `PandaEnginePersonalTV.pine` lightweight and within its 1,800-bar,
  21-request runtime budget.
- Do not change existing Panda scoring, Box calculations, Panda Lines, BOS
  detection, or their existing alerts; compose the new signal from their
  already-confirmed outputs.
- Add deterministic reference tests for XTF selection, all READY gates,
  trigger gating, non-XTF context, and event-only reset behavior.
- Extend source-contract tests for XTF input, new signal labels, stable event
  names, and no `strategy.*` calls.
- Compile and runtime-smoke-test on TradingView using a supported H1 forex
  chart, test both XTF choices, and confirm no runtime error.
- Run `node --test tests/*.test.mjs`, `python3.11 check_dupes.py`, and
  `npx next build` before push.
