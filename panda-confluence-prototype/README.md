# Panda Confluence — calculation prototype

This is an isolated research prototype. It does not import, call, or modify
Panda Engine scoring. Its purpose is to validate deterministic confluence
features before they are ported into a cTrader indicator.

## V1 contract

- SuperTrend: ATR period 10, multiplier 3.0, confirmed bars only.
- Context timeframes: H1, H4 and D1. M15 is display-only entry timing and
  never participates in Panda direction or HTF alignment.
- Trend strength: distance from SuperTrend (30), consecutive direction bars
  (40), and ten-bar directional momentum (30).
- ADX: Wilder period 14; 20 is confirmation and 25 is strong confirmation.
- Structure: confirmed pivot highs/lows, BOS in the current structural
  direction, and CHoCH against it.
- FVG: three-candle imbalance (`low[n] > high[n-2]` bullish,
  `high[n] < low[n-2]` bearish).
- Panda bias, gap, validity and update time are read from the existing
  read-only `/api/ctrader-overlay` feed with the operator token.
- No trading, Panda-score changes, licensing changes, or alerts.

## cTrader setup

1. Attach `PandaConfluencePrototype` to a supported Panda pair.
2. In `Panda Feed`, paste the same Operator Token used by the existing Panda
   dashboard overlay.
3. Confirm the `FEED` row becomes `LIVE` and that `PANDA BIAS` matches the
   existing overlay's gap and direction.

The chart layer displays up to 8 recent unmitigated FVG boxes by default,
labels them `BULL FVG` or `BEAR FVG`, and labels recent confirmed pivots
`HH`, `HL`, `LH`, `LL` together with `BOS UP/DOWN` and `CHOCH UP/DOWN` events.
Both display limits are adjustable under `Structure`.

The panel location is persisted per chart instance. Dragging it updates the
stored X/Y location, and rebuilding the panel during a data refresh preserves
those coordinates.

The pullback state machine uses M15 only for execution timing. With a live
BUY/SELL Panda bias and at least two aligned H1/H4/D1 trends, it reports
`PULLBACK ACTIVE`, `PULLBACK ENDING`, `ENTRY TRIGGER`, `CONTEXT READY`, or
`SETUP INVALIDATED`. M15 CHoCH/BOS events expire after three closed M15 bars
so an old event cannot remain displayed as a fresh trigger.

## Decision V2

`PandaConfluenceDecisionV2` adds a final read-only decision row. `BUY READY`
or `SELL READY` is possible only when the main confluence is `READY` or
`HIGH CONFLUENCE` and the pullback engine has a fresh `ENTRY TRIGGER`.
Otherwise the row explains why it is waiting, including weak ADX, HTF
conflict, active pullback, missing fresh trigger, Panda WAIT, or structural
invalidation. It never places an order.

Display parameters independently control the panel, HH/HL/LH/LL labels,
BOS/CHoCH labels, FVG boxes, and FVG text. Turning off labels does not remove
FVG boxes and never touches Order Block objects created by another indicator.
The panel has a persisted minimize button. A transparent visibility sentinel
also mirrors cTrader's indicator visibility, so using cTrader's hide control
hides the custom panel as well as the indicator drawings.

The indicator blocks interpretation when authentication is missing, the feed
is stale, Panda returns `WAIT`, or the pair is hard-invalid.

## H1 Pullback Entry Assistant V3

`PandaConfluenceV3` is installed separately from V2. It treats H1 as the
setup timeframe and M15 only as the continuation trigger. H4 and D1 no longer
block an H1 setup.

- `PANDA LINES` is the price-direction filter received from Panda's feed:
  BUY requires `ABOVE` with valid lines; SELL requires `BELOW` with valid
  lines. This is separate from Panda Levels.
- `PANDA LEVEL` is the nearest directional previous-period level calculated
  from the broker's completed candles: PDL/PDH, PWL/PWH, or PML/PMH.
- Gap magnitude 5–8 is labelled `PULLBACK`; gap magnitude 9 or more is
  labelled `MARKET`. These are Panda classifications, not order instructions.
- A level touch always displays `AT PANDA LEVEL — WAIT FOR REJECTION`.
  It cannot produce READY by itself.
- A completed H1 rejection plus a fresh, matching M15 CHoCH reports
  `PULLBACK ENDING`. A fresh matching M15 BOS is required for `BUY READY` or
  `SELL READY`; the event expires after three completed M15 candles by default.
- H1 range conditions, opposing H1 structure, stale/missing feed data, Panda
  Line loss, and hard invalidation block READY.
- Gap 9+ displays `MARKET ELIGIBLE`, but overextension from locally calculated
  H1 SuperTrend/Follow Line values and nearby opposing Panda Levels produce a
  review warning instead of an entry instruction.

The `CONTINUATION` row is a rule-based `WEAK`, `MODERATE`, or `STRONG`
assessment. It is not a predicted probability or validated win rate. V3 is
read-only and does not place or manage orders.

## V4 H1 Swing Risk/Reward Planner

`PandaConfluenceV4` keeps the V3 entry filter and adds a native, draggable
cTrader risk/reward drawing when a fresh `BUY READY` or `SELL READY` trigger
appears.

- Entry freezes at the completed M15 BOS trigger candle's close.
- BUY stop uses the latest confirmed H1 swing low; SELL stop uses the latest
  confirmed H1 swing high.
- A configurable buffer is placed beyond the swing (default 3 pips).
- Target is a configurable fixed reward/risk multiple (default 2R).
- Maximum stop width defaults to 60 pips. Wider plans remain visible for
  review but the decision changes to `SKIP — STOP TOO WIDE`.
- If no valid confirmed H1 swing exists, the panel reports
  `WAIT — NO CONFIRMED H1 SWING` and does not fabricate a stop.
- Dragging the native entry, SL, or TP handles updates the displayed stop
  width, reward/risk, and plan status. The indicator never submits an order.

V4 parameters under `V4 Trade Plan` control drawing visibility, swing buffer,
reward/risk target, maximum stop width, and drawing width. A new trigger
replaces the previous drawing. Structural/Panda invalidation removes it.

Run the deterministic calculation checks with:

```sh
node --test panda-confluence-prototype/test/confluence-core.test.mjs
```

Build V3 on this Mac with:

```sh
dotnet build panda-confluence-prototype/ctrader/panda-confluence-v3/PandaConfluenceV3/PandaConfluenceV3.csproj -c Release
```

The build writes `panda-confluence-v3.algo` and installs it in cTrader's local
Indicators directory. Final chart behavior should still be visually checked
in cTrader with the live feed.
