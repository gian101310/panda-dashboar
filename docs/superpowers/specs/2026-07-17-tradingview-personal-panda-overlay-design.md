# TradingView Personal Panda Overlay Design

**Date:** 2026-07-17

**Status:** Approved for specification review

**Owner:** Boss-G

## Objective

Build one lightweight, personal-use Pine Script v6 indicator that ports the
existing Panda scoring and Box logic to TradingView market data. The indicator
shows the active chart pair only. Its primary outputs are Panda Bias, H1/H4 Box
structure, and the active price's status relative to Panda Lines. It also adds
confirmed Panda Lines flip and Break of Structure (BOS) events that can be
ported to Panda Engine and Telegram in a later phase.

This is a TradingView-native calculation, not a mirror of the Panda Dashboard
API. It uses the same structural rules but may differ from the main dashboard
when TradingView and the MT4 engine receive different candles, session
boundaries, or quotes.

## Scope and non-goals

Version one includes:

- One personal Pine Script v6 indicator.
- Automatic scoring across the existing 21-pair Panda universe.
- Current-pair gap, Bias, and hard-invalid state.
- The three Panda Box ranges, H1/H4 Box structure, and optional chart boxes.
- Panda Lines, price status, and confirmed bullish/bearish flip events.
- Confirmed bullish/bearish BOS on the active chart timeframe.
- A compact current-pair panel and TradingView alert hooks.

Version one does not include:

- Panda API, Supabase, admin, token, account, device, or commercial licensing.
- A multi-pair scanner panel.
- Trading, order placement, strategy backtesting, or financial-advice text.
- CHoCH classification.
- Telegram delivery or changes to Panda Engine.
- Changes to `extract_panda_score()` or `compute_scores_all_pairs()` in
  `app.py`; those functions remain locked and untouched.

## TradingView data architecture

The script uses fixed `OANDA:` symbols internally for the 21 supported pairs:

`AUDCAD`, `AUDJPY`, `AUDNZD`, `AUDUSD`, `CADJPY`, `EURAUD`, `EURCAD`,
`EURGBP`, `EURJPY`, `EURNZD`, `EURUSD`, `GBPAUD`, `GBPCAD`, `GBPJPY`,
`GBPNZD`, `GBPUSD`, `NZDCAD`, `NZDJPY`, `NZDUSD`, `USDCAD`, and `USDJPY`.

Pine v6 dynamic requests fetch one compact H1 context per pair. Each request
returns a tuple or small user-defined snapshot containing only the current
price and the Box bounds required for scoring. This targets 21 unique
`request.security()` contexts, below TradingView's 40-request limit for
non-Ultimate plans. `calc_bars_count` is bounded to the history required by the
longest Box instead of requesting unlimited history.

TradingView currently permits `request.security()` to retrieve other symbols
and timeframes, but Pine cannot call the Panda HTTPS API. New Pine Seeds sources
are also unavailable. Therefore, no Panda server credential or secret appears
in the script.

The scoring and displayed Box levels use the fixed OANDA feed so their internal
relationship is consistent. Panda Lines and BOS use the active chart's own
OHLC data so their plots and events align with the candles the user sees.

## Panda scoring port

The Pine port reproduces the existing scoring structure without changing the
Python engine:

1. For every supported pair, calculate three historical price boxes from H1
   candles using deterministic UTC calendar boundaries.
2. Compare current OANDA price with each box:
   - Above the box high: base currency `+1`, quote currency `-1`.
   - Below the box low: base currency `-1`, quote currency `+1`.
   - Inside the box: both receive `0`.
3. Accumulate votes for the seven currencies across the 21 pairs separately
   for the D1, H4, and H1 scoring contexts.
4. Select each currency's strongest signed score across those contexts. Equal
   opposing absolute strengths resolve to zero.
5. The active pair's gap is strongest base score minus strongest quote score.
6. Apply the existing significant-conflict rule: a currency with a score of at
   least `+4` and another score of at most `-4` across its contexts is globally
   conflicted. A pair containing a conflicted currency is hard-invalid.
7. A matchup where both strongest currency scores have magnitude below `4` is
   also hard-invalid.
8. Otherwise, Bias is `BUY` for gap `>= +5`, `SELL` for gap `<= -5`, and
   `WAIT` inside that range.

No Advance score, confidence model, BB/INTRA entry logic, or execution signal
is added in version one. The signed main gap is secondary display information;
Bias remains the primary scoring output.

## Panda Box calculations

The Box port uses the existing windows with a one-period offset:

- Short/daily context (`WagBox3`): the two complete days ending at the start
  of the previous UTC day.
- Medium/weekly context (`WagBox1`): the two complete weeks ending at the start
  of the previous UTC week.
- Long/monthly context (`WagBox2`): the two complete months ending at the start
  of the previous UTC month.

For each window, the box high is the highest H1 high and the box low is the
lowest H1 low. The displayed rectangles use those exact boundaries.

Box structure uses the existing midpoint rule:

- H1 structure compares the short Box midpoint with the medium Box range.
- H4 structure compares the medium Box midpoint with the long Box range.
- A latter midpoint at or above the former high is `UPTREND`.
- A latter midpoint at or below the former low is `DOWNTREND`.
- A midpoint inside the former range is `RANGING`.
- Missing history produces `UNKNOWN`, never a guessed structure.

The three optional chart rectangles use orange for short, green for medium,
and blue for long context. They are background drawings and do not extend
indefinitely into future bars.

## Panda Lines and price status

Panda Lines are calculated from the active chart feed with the existing
parameters:

- SuperTrend: ATR period `10`, multiplier `3.0`.
- Follow Line: Bollinger period `21`, deviation `1.0`, ATR period `5`.

On each confirmed candle close:

- Close above both active lines is `ABOVE`.
- Close below both active lines is `BELOW`.
- Every other valid position is `BETWEEN`.
- Missing line values produce `UNKNOWN`.

The script remembers the last confirmed directional side while price is
`BETWEEN`. A new `ABOVE` after the last confirmed `BELOW` produces one
`PL_BULLISH_FLIP`. A new `BELOW` after the last confirmed `ABOVE` produces one
`PL_BEARISH_FLIP`. Remaining on the same side never repeats the event.

## Break of Structure

BOS is based on confirmed pivots on the active chart timeframe. Swing length is
an input from `2` to `20`, default `5`.

- A bullish BOS occurs when a confirmed candle closes above the latest
  confirmed, unbroken pivot high.
- A bearish BOS occurs when a confirmed candle closes below the latest
  confirmed, unbroken pivot low.
- A pivot level can emit at most one BOS event.
- Intrabar crossings do not count.
- Pivot confirmation delay is accepted to prevent repainting.

Version one reports `BULLISH`, `BEARISH`, or `NONE` for the latest BOS event.
It does not infer CHoCH or combine BOS with the Panda Bias into a trade entry.

## Panel and chart behavior

The compact table panel is bottom-left by default and shows:

- Canonical pair and `PANDA TV` label.
- Panda Bias and signed main gap.
- H1 and H4 Box structure.
- Panda Lines status.
- Most recent confirmed Panda Lines flip.
- Most recent confirmed BOS direction.

The panel position is an indicator input with standard TradingView table
positions. Pine tables cannot be freely mouse-dragged, so the design does not
claim cTrader-style dragging. BUY/bullish uses `#00ff9f`, SELL/bearish uses
`#ff4d6d`, transition/warning uses `#ffd166`, and neutral/unknown uses grey.

Independent inputs control visibility of the panel, Boxes, Panda Lines, BOS
levels, and event markers. The script updates one persistent table and reuses
or bounds drawings instead of creating unbounded labels on every bar.

Unsupported chart symbols show `UNSUPPORTED SYMBOL`. Missing OANDA contexts or
insufficient history show `DATA UNAVAILABLE`. Protected values are not
fabricated in either state.

## Alerts and future engine contract

The indicator exposes bar-close alert conditions for:

- `PL_BULLISH_FLIP`
- `PL_BEARISH_FLIP`
- `BOS_BULLISH`
- `BOS_BEARISH`

Event names are stable and reserved for phase-two engine integration. Dynamic
alert messages use a minimal JSON-shaped payload containing source, event,
canonical symbol, chart timeframe, close price, and confirmed bar time. They
contain no token or account information.

Phase two will independently calculate or ingest the same confirmed events in
Panda Engine, store bounded current state/event timestamps on dashboard rows,
and route selected events through authenticated Telegram infrastructure. That
phase must add tests and schema review without modifying the locked scoring
functions. TradingView webhooks are not enabled in version one.

## Source layout

Create:

- `panda-indicators/2026-07-17/tradingview-panda-personal/PandaEnginePersonalTV.pine`
- `panda-indicators/2026-07-17/tradingview-panda-personal/README.md`
- A focused Node source-contract/fixture test under `tests/`.

Only the editable personal Pine source is needed. There is no compiled binary,
download counter, product registry entry, pricing item, or public website
download in version one.

## Testing and acceptance criteria

### Automated repository checks

- Start with failing tests for the new Pine source contract and deterministic
  fixtures before writing production Pine code.
- Fixtures cover vote accumulation, strongest-score ties, global conflicts,
  neutral-vs-neutral invalidation, gap thresholds, Box midpoint structure,
  price status, side memory, one-shot flips, pivot confirmation, and one-shot
  BOS.
- Assert the source uses Pine v6, the exact 21-pair allowlist, OANDA contexts,
  bounded request history, bar-close confirmation, stable event names, panel
  labels, and no Panda/server credential.
- Run the full Node test suite, `python3.11 check_dupes.py`, and
  `npx next build`.

### TradingView verification

- Paste/open the source in TradingView Pine Editor and compile with zero errors.
- Attach it to representative supported OANDA and non-OANDA forex charts.
- Confirm supported-symbol normalization and fail-closed unsupported behavior.
- Compare selected Box bounds and scoring votes against the existing MT4 logic
  for identical fixtures, allowing documented feed/session differences.
- Verify BUY, SELL, WAIT, hard-invalid, H1/H4 structure, ABOVE, BELOW, BETWEEN,
  bullish/bearish flip, bullish/bearish BOS, and insufficient-data states.
- Confirm events appear only after candle close and do not repeat on the same
  pivot or directional side.
- Confirm toggles and all supported panel positions work without unbounded
  drawings or visible chart lag.

## Delivery sequence

1. Write failing fixture and Pine source-contract tests.
2. Implement the 21-pair OANDA snapshot and score aggregation.
3. Implement current-pair Box levels, structure, and drawings.
4. Port Panda Lines and confirmed price-status/flip state.
5. Add confirmed-pivot BOS and stable alerts.
6. Add the compact panel and visibility/position inputs.
7. Compile and smoke-test in TradingView.
8. Update README and CHANGELOG, run full repository verification, commit, push,
   and verify the Vercel deployment only if website-tracked files require it.

## References

- TradingView other timeframes and data:
  https://www.tradingview.com/pine-script-docs/concepts/other-timeframes-and-data/
- TradingView request and resource limitations:
  https://www.tradingview.com/pine-script-docs/writing/limitations/
