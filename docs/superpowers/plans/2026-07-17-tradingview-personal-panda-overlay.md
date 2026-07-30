# TradingView Personal Panda Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal Pine Script v6 overlay that calculates Panda Bias and Box structure from the 21-pair OANDA universe, plots Panda Lines, detects confirmed flips and BOS, and shows the active pair in a compact panel.

**Architecture:** One Pine file owns the TradingView runtime calculation and UI. A test-only JavaScript reference model supplies deterministic fixtures for scoring, Box, Panda Lines state, flip memory, and BOS because Pine has no local repository compiler. A source-contract test binds the Pine implementation to the approved constants, pair universe, request budget, events, and fail-closed states; final compilation occurs in TradingView Pine Editor.

**Tech Stack:** Pine Script v6, TradingView `request.security()`, Node.js built-in test runner, Markdown.

## Global Constraints

- Do not modify `extract_panda_score()` or `compute_scores_all_pairs()` in `app.py`.
- Do not modify BB or INTRA strategy rules.
- Version one is Personal only: no Supabase, API, token, account, device, product, pricing, or licensing work.
- Use exactly the approved 21 OANDA pairs and no CHF pairs.
- Keep unique `request.*()` contexts below the standard 40-call limit; target exactly 21 dynamic OANDA H1 contexts.
- Confirm Panda Lines flips and BOS only on candle close.
- Never infer Bias or structure when required data is unavailable.
- Do not place, modify, or close trades.
- Main scoring uses OANDA data; Panda Lines and BOS use the visible chart feed.
- Phase-two Panda Engine and Telegram integration is documentation only.
- Follow `AGENTS.md`: read before edits, use `apply_patch`, run `python3.11 check_dupes.py` and `npx next build`, protect the four build files, commit with kebab-case, push only `origin/main`, and verify Vercel READY.

---

### Task 1: Deterministic TradingView reference behavior

**Files:**
- Create: `tests/helpers/tradingviewPandaReference.mjs`
- Create: `tests/tradingviewPandaReference.test.mjs`

**Interfaces:**
- Consumes: Plain numeric fixture objects only.
- Produces: `strongestScore(scores)`, `classifyPair(input)`, `classifyBoxTrend(input)`, `classifyPandaLineStatus(input)`, `advancePandaSide(input)`, and `detectBos(input)` for test fixtures.

- [ ] **Step 1: Write the failing reference tests**

Create `tests/tradingviewPandaReference.test.mjs` with explicit expected behavior:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  strongestScore,
  classifyPair,
  classifyBoxTrend,
  classifyPandaLineStatus,
  advancePandaSide,
  detectBos,
} from './helpers/tradingviewPandaReference.mjs';

test('selects the strongest signed currency score and resolves equal opposition to zero', () => {
  assert.equal(strongestScore([2, 5, -3]), 5);
  assert.equal(strongestScore([2, 4, -6]), -6);
  assert.equal(strongestScore([1, 4, -4]), 0);
});

test('classifies Panda gap, bias, global conflict, and neutral matchup', () => {
  assert.deepEqual(classifyPair({ baseScores: [5, 2, 1], quoteScores: [-3, -2, -1] }),
    { gap: 8, bias: 'BUY', hardInvalid: false });
  assert.deepEqual(classifyPair({ baseScores: [-5, -2, -1], quoteScores: [2, 1, 0] }),
    { gap: -7, bias: 'SELL', hardInvalid: false });
  assert.deepEqual(classifyPair({ baseScores: [4, 0, -4], quoteScores: [-5, -2, 0] }),
    { gap: 0, bias: 'HARD_INVALID', hardInvalid: true });
  assert.deepEqual(classifyPair({ baseScores: [3, 2, 1], quoteScores: [-3, -2, -1] }),
    { gap: 0, bias: 'HARD_INVALID', hardInvalid: true });
});

test('classifies Box midpoint structure without guessing missing values', () => {
  assert.equal(classifyBoxTrend({ formerHigh: 10, formerLow: 5, latterHigh: 13, latterLow: 9 }), 'UPTREND');
  assert.equal(classifyBoxTrend({ formerHigh: 10, formerLow: 5, latterHigh: 6, latterLow: 2 }), 'DOWNTREND');
  assert.equal(classifyBoxTrend({ formerHigh: 10, formerLow: 5, latterHigh: 9, latterLow: 7 }), 'RANGING');
  assert.equal(classifyBoxTrend({ formerHigh: null, formerLow: 5, latterHigh: 9, latterLow: 7 }), 'UNKNOWN');
});

test('tracks Panda Lines side through BETWEEN and emits one opposite-side flip', () => {
  assert.equal(classifyPandaLineStatus({ close: 12, supertrend: 10, followLine: 11 }), 'ABOVE');
  assert.equal(classifyPandaLineStatus({ close: 8, supertrend: 10, followLine: 9 }), 'BELOW');
  assert.equal(classifyPandaLineStatus({ close: 10, supertrend: 9, followLine: 11 }), 'BETWEEN');
  const between = advancePandaSide({ lastSide: -1, status: 'BETWEEN', confirmed: true });
  assert.deepEqual(between, { lastSide: -1, event: null });
  const flip = advancePandaSide({ lastSide: between.lastSide, status: 'ABOVE', confirmed: true });
  assert.deepEqual(flip, { lastSide: 1, event: 'PL_BULLISH_FLIP' });
  assert.deepEqual(advancePandaSide({ lastSide: flip.lastSide, status: 'ABOVE', confirmed: true }),
    { lastSide: 1, event: null });
});

test('emits one confirmed BOS per swing and ignores intrabar crossings', () => {
  assert.deepEqual(detectBos({ close: 101, swingHigh: 100, swingLow: 90, highBroken: false, lowBroken: false, confirmed: false }),
    { event: null, highBroken: false, lowBroken: false });
  assert.deepEqual(detectBos({ close: 101, swingHigh: 100, swingLow: 90, highBroken: false, lowBroken: false, confirmed: true }),
    { event: 'BOS_BULLISH', highBroken: true, lowBroken: false });
  assert.deepEqual(detectBos({ close: 102, swingHigh: 100, swingLow: 90, highBroken: true, lowBroken: false, confirmed: true }),
    { event: null, highBroken: true, lowBroken: false });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
node --test tests/tradingviewPandaReference.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `tests/helpers/tradingviewPandaReference.mjs`.

- [ ] **Step 3: Implement the minimal test reference**

Create `tests/helpers/tradingviewPandaReference.mjs`:

```js
const finite = (value) => Number.isFinite(value);

export function strongestScore(scores) {
  const positive = Math.max(0, ...scores.filter((value) => value > 0));
  const negative = Math.min(0, ...scores.filter((value) => value < 0));
  if (Math.abs(positive) === Math.abs(negative)) return 0;
  return Math.abs(negative) > Math.abs(positive) ? negative : positive;
}

export function classifyPair({ baseScores, quoteScores }) {
  const conflict = (scores) => scores.some((value) => value >= 4) && scores.some((value) => value <= -4);
  const base = strongestScore(baseScores);
  const quote = strongestScore(quoteScores);
  const hardInvalid = conflict(baseScores) || conflict(quoteScores) || (Math.abs(base) < 4 && Math.abs(quote) < 4);
  if (hardInvalid) return { gap: 0, bias: 'HARD_INVALID', hardInvalid: true };
  const gap = base - quote;
  return { gap, bias: gap >= 5 ? 'BUY' : gap <= -5 ? 'SELL' : 'WAIT', hardInvalid: false };
}

export function classifyBoxTrend({ formerHigh, formerLow, latterHigh, latterLow }) {
  if (![formerHigh, formerLow, latterHigh, latterLow].every(finite)) return 'UNKNOWN';
  const midpoint = (latterHigh + latterLow) / 2;
  return midpoint >= formerHigh ? 'UPTREND' : midpoint <= formerLow ? 'DOWNTREND' : 'RANGING';
}

export function classifyPandaLineStatus({ close, supertrend, followLine }) {
  if (![close, supertrend, followLine].every(finite)) return 'UNKNOWN';
  return close > Math.max(supertrend, followLine) ? 'ABOVE'
    : close < Math.min(supertrend, followLine) ? 'BELOW' : 'BETWEEN';
}

export function advancePandaSide({ lastSide, status, confirmed }) {
  if (!confirmed || !['ABOVE', 'BELOW'].includes(status)) return { lastSide, event: null };
  const nextSide = status === 'ABOVE' ? 1 : -1;
  const event = lastSide === -nextSide ? (nextSide === 1 ? 'PL_BULLISH_FLIP' : 'PL_BEARISH_FLIP') : null;
  return { lastSide: nextSide, event };
}

export function detectBos({ close, swingHigh, swingLow, highBroken, lowBroken, confirmed }) {
  if (!confirmed) return { event: null, highBroken, lowBroken };
  if (!highBroken && finite(swingHigh) && close > swingHigh)
    return { event: 'BOS_BULLISH', highBroken: true, lowBroken };
  if (!lowBroken && finite(swingLow) && close < swingLow)
    return { event: 'BOS_BEARISH', highBroken, lowBroken: true };
  return { event: null, highBroken, lowBroken };
}
```

- [ ] **Step 4: Verify GREEN**

Run `node --test tests/tradingviewPandaReference.test.mjs`.

Expected: 5 tests pass, 0 fail.

- [ ] **Step 5: Commit the reference contract**

```bash
git add tests/helpers/tradingviewPandaReference.mjs tests/tradingviewPandaReference.test.mjs
git commit -m "test-tradingview-panda-reference-behavior"
```

### Task 2: Pine scoring, Box structure, and source contract

**Files:**
- Create: `tests/tradingviewPandaSource.test.mjs`
- Create: `panda-indicators/2026-07-17/tradingview-panda-personal/PandaEnginePersonalTV.pine`

**Interfaces:**
- Consumes: OANDA H1 data for the exact 21 pairs.
- Produces: Pine series `pandaGap`, `pandaBias`, `boxH1Trend`, `boxH4Trend`, active-pair Box bounds/times, and fail-closed `supportedPair`/`scoreReady` state.

- [ ] **Step 1: Write a failing Pine source-contract test**

Create `tests/tradingviewPandaSource.test.mjs` that reads the future Pine file and asserts:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const path = 'panda-indicators/2026-07-17/tradingview-panda-personal/PandaEnginePersonalTV.pine';

test('Pine source contains the fixed personal scoring and Box contract', () => {
  const source = fs.readFileSync(path, 'utf8');
  assert.match(source, /^\/\/@version=6/m);
  assert.match(source, /indicator\("Panda Engine Personal TV"/);
  for (const pair of ['AUDCAD','AUDJPY','AUDNZD','AUDUSD','CADJPY','EURAUD','EURCAD','EURGBP','EURJPY','EURNZD','EURUSD','GBPAUD','GBPCAD','GBPJPY','GBPNZD','GBPUSD','NZDCAD','NZDJPY','NZDUSD','USDCAD','USDJPY'])
    assert.match(source, new RegExp(`"${pair}"`));
  assert.doesNotMatch(source, /USDCHF|CHFJPY|operator.token|account.number|supabase|engine.secret/i);
  assert.match(source, /"OANDA:"\s*\+\s*pair/);
  assert.match(source, /request\.security\([^)]*"60"/s);
  assert.match(source, /calc_bars_count\s*=\s*3500/);
  assert.match(source, /PANDA_GAP_THRESHOLD\s*=\s*5/);
  assert.match(source, /PANDA_SIGNIFICANT\s*=\s*4/);
  assert.match(source, /HARD_INVALID|DATA UNAVAILABLE|UNSUPPORTED SYMBOL/);
  assert.match(source, /boxH1Trend|boxH4Trend/);
});
```

- [ ] **Step 2: Run the source test to verify RED**

Run `node --test tests/tradingviewPandaSource.test.mjs`.

Expected: FAIL with `ENOENT` for the Pine file.

- [ ] **Step 3: Create the Pine declaration, types, inputs, and constants**

Start `PandaEnginePersonalTV.pine` with Pine v6, `overlay=true`, bounded drawing counts, the 21-pair and seven-currency arrays, constants `PANDA_GAP_THRESHOLD = 5`, `PANDA_SIGNIFICANT = 4`, panel/drawing inputs, and a `PairSnapshot` type containing current price, three highs/lows, and three start/end timestamp pairs.

The Box snapshot function must use persistent H1 aggregates shifted by `timeframe.change("1D")`, `timeframe.change("1W")`, and `timeframe.change("1M")`. For each unit, retain the last three completed ranges; return ranges 2 and 3 so the one-period offset is preserved:

```pine
f_snapshot() =>
    var float dayHigh = na
    var float dayLow = na
    var int dayStart = na
    var float d1High = na
    var float d1Low = na
    var int d1Start = na
    var float d2High = na
    var float d2Low = na
    var int d2Start = na
    var float d3High = na
    var float d3Low = na
    var int d3Start = na
    if na(dayHigh)
        dayHigh := high
        dayLow := low
        dayStart := time
    else if timeframe.change("1D")
        d3High := d2High
        d3Low := d2Low
        d3Start := d2Start
        d2High := d1High
        d2Low := d1Low
        d2Start := d1Start
        d1High := dayHigh
        d1Low := dayLow
        d1Start := dayStart
        dayHigh := high
        dayLow := low
        dayStart := time
    else
        dayHigh := math.max(dayHigh, high)
        dayLow := math.min(dayLow, low)

    var float weekHigh = na
    var float weekLow = na
    var int weekStart = na
    var float w1High = na
    var float w1Low = na
    var int w1Start = na
    var float w2High = na
    var float w2Low = na
    var int w2Start = na
    var float w3High = na
    var float w3Low = na
    var int w3Start = na
    if na(weekHigh)
        weekHigh := high
        weekLow := low
        weekStart := time
    else if timeframe.change("1W")
        w3High := w2High
        w3Low := w2Low
        w3Start := w2Start
        w2High := w1High
        w2Low := w1Low
        w2Start := w1Start
        w1High := weekHigh
        w1Low := weekLow
        w1Start := weekStart
        weekHigh := high
        weekLow := low
        weekStart := time
    else
        weekHigh := math.max(weekHigh, high)
        weekLow := math.min(weekLow, low)

    var float monthHigh = na
    var float monthLow = na
    var int monthStart = na
    var float m1High = na
    var float m1Low = na
    var int m1Start = na
    var float m2High = na
    var float m2Low = na
    var int m2Start = na
    var float m3High = na
    var float m3Low = na
    var int m3Start = na
    if na(monthHigh)
        monthHigh := high
        monthLow := low
        monthStart := time
    else if timeframe.change("1M")
        m3High := m2High
        m3Low := m2Low
        m3Start := m2Start
        m2High := m1High
        m2Low := m1Low
        m2Start := m1Start
        m1High := monthHigh
        m1Low := monthLow
        m1Start := monthStart
        monthHigh := high
        monthLow := low
        monthStart := time
    else
        monthHigh := math.max(monthHigh, high)
        monthLow := math.min(monthLow, low)

    PairSnapshot.new(close,
      math.max(d2High, d3High), math.min(d2Low, d3Low), d3Start, d1Start,
      math.max(w2High, w3High), math.min(w2Low, w3Low), w3Start, w1Start,
      math.max(m2High, m3High), math.min(m2Low, m3Low), m3Start, m1Start)
```

- [ ] **Step 4: Implement the 21-context aggregation and active-pair result**

Reset three seven-element integer arrays each bar. Loop through `PANDA_PAIRS`, request `f_snapshot()` from `"OANDA:" + pair` at H1 with `ignore_invalid_symbol=true` and `calc_bars_count=3500`, add base/quote votes for each context, and preserve the active pair snapshot. After the loop:

```pine
f_strongest(int d1, int h4, int h1) =>
    int positive = math.max(0, math.max(d1, math.max(h4, h1)))
    int negative = math.min(0, math.min(d1, math.min(h4, h1)))
    math.abs(positive) == math.abs(negative) ? 0 : math.abs(negative) > math.abs(positive) ? negative : positive

bool baseConflict = f_conflicted(baseIndex)
bool quoteConflict = f_conflicted(quoteIndex)
bool neutralMatchup = math.abs(baseStrong) < PANDA_SIGNIFICANT and math.abs(quoteStrong) < PANDA_SIGNIFICANT
bool hardInvalid = scoreReady and (baseConflict or quoteConflict or neutralMatchup)
int pandaGap = hardInvalid ? 0 : baseStrong - quoteStrong
string pandaBias = not supportedPair ? "UNSUPPORTED SYMBOL" : not scoreReady ? "DATA UNAVAILABLE" : hardInvalid ? "HARD_INVALID" : pandaGap >= PANDA_GAP_THRESHOLD ? "BUY" : pandaGap <= -PANDA_GAP_THRESHOLD ? "SELL" : "WAIT"
```

Calculate `boxH1Trend` from medium-versus-short and `boxH4Trend` from long-versus-medium. Create three persistent `box` objects using `xloc.bar_time`; update or hide them based on readiness and the visibility input.

- [ ] **Step 5: Verify the focused tests**

Run:

```bash
node --test tests/tradingviewPandaReference.test.mjs tests/tradingviewPandaSource.test.mjs
```

Expected: all tests pass.

- [ ] **Step 6: Commit scoring and Boxes**

```bash
git add tests/tradingviewPandaSource.test.mjs panda-indicators/2026-07-17/tradingview-panda-personal/PandaEnginePersonalTV.pine
git commit -m "add-tradingview-panda-scoring-and-boxes"
```

### Task 3: Panda Lines, flips, BOS, panel, and alerts

**Files:**
- Modify: `tests/tradingviewPandaSource.test.mjs`
- Modify: `panda-indicators/2026-07-17/tradingview-panda-personal/PandaEnginePersonalTV.pine`

**Interfaces:**
- Consumes: Task 2's active-pair scoring/Box state and active chart OHLC.
- Produces: `pandaLineStatus`, `PL_BULLISH_FLIP`, `PL_BEARISH_FLIP`, `BOS_BULLISH`, `BOS_BEARISH`, chart plots/markers, alert hooks, and the compact current-pair table.

- [ ] **Step 1: Extend the source test and verify RED**

Add assertions for exact parameters and behavior:

```js
assert.match(source, /ta\.supertrend\(3\.0,\s*10\)/);
assert.match(source, /BB_PERIOD\s*=\s*21/);
assert.match(source, /BB_DEVIATION\s*=\s*1\.0/);
assert.match(source, /FOLLOW_ATR_PERIOD\s*=\s*5/);
assert.match(source, /barstate\.isconfirmed/);
for (const event of ['PL_BULLISH_FLIP','PL_BEARISH_FLIP','BOS_BULLISH','BOS_BEARISH'])
  assert.match(source, new RegExp(event));
for (const label of ['BIAS','GAP','BOX H1','BOX H4','PANDA LINES','FLIP','BOS'])
  assert.match(source, new RegExp(label));
assert.match(source, /ta\.pivothigh|ta\.pivotlow/);
assert.match(source, /alertcondition/);
assert.doesNotMatch(source, /strategy\(|strategy\.(entry|exit|order)/);
```

Run `node --test tests/tradingviewPandaSource.test.mjs`.

Expected: FAIL because Panda Lines/BOS/event source is absent.

- [ ] **Step 2: Port Panda Lines and confirmed flip memory**

Use chart OHLC. Calculate standard SuperTrend and the existing BB/ATR Follow Line state:

```pine
[supertrend, _] = ta.supertrend(3.0, 10)
float bbBasis = ta.sma(close, BB_PERIOD)
float bbDev = ta.stdev(close, BB_PERIOD) * BB_DEVIATION
float bbUpper = bbBasis + bbDev
float bbLower = bbBasis - bbDev
float followAtr = ta.atr(FOLLOW_ATR_PERIOD)
var float followLine = na
if close > bbUpper
    float candidate = low - followAtr
    followLine := na(followLine[1]) ? candidate : math.max(candidate, followLine[1])
else if close < bbLower
    float candidate = high + followAtr
    followLine := na(followLine[1]) ? candidate : math.min(candidate, followLine[1])
else
    followLine := followLine[1]

string pandaLineStatus = na(supertrend) or na(followLine) ? "UNKNOWN" : close > math.max(supertrend, followLine) ? "ABOVE" : close < math.min(supertrend, followLine) ? "BELOW" : "BETWEEN"
var int lastDirectionalSide = 0
bool plBullishFlip = barstate.isconfirmed and pandaLineStatus == "ABOVE" and lastDirectionalSide == -1
bool plBearishFlip = barstate.isconfirmed and pandaLineStatus == "BELOW" and lastDirectionalSide == 1
if barstate.isconfirmed and pandaLineStatus != "BETWEEN" and pandaLineStatus != "UNKNOWN"
    lastDirectionalSide := pandaLineStatus == "ABOVE" ? 1 : -1
```

Plot both lines behind price and add optional small flip markers.

- [ ] **Step 3: Add confirmed, one-shot BOS**

Use `swingLength = input.int(5, minval=2, maxval=20)`, `ta.pivothigh`, and `ta.pivotlow`. A new confirmed pivot replaces the corresponding level and resets its broken flag. Only `barstate.isconfirmed` may emit an event:

```pine
float pivotHigh = ta.pivothigh(high, swingLength, swingLength)
float pivotLow = ta.pivotlow(low, swingLength, swingLength)
var float lastSwingHigh = na
var float lastSwingLow = na
var bool swingHighBroken = false
var bool swingLowBroken = false
if not na(pivotHigh)
    lastSwingHigh := pivotHigh
    swingHighBroken := false
if not na(pivotLow)
    lastSwingLow := pivotLow
    swingLowBroken := false
bool bosBullish = barstate.isconfirmed and not swingHighBroken and not na(lastSwingHigh) and close > lastSwingHigh
bool bosBearish = barstate.isconfirmed and not swingLowBroken and not na(lastSwingLow) and close < lastSwingLow
if bosBullish
    swingHighBroken := true
if bosBearish
    swingLowBroken := true
```

Reuse two pivot `line` objects and use bounded `plotshape` markers rather than unbounded BOS labels.

- [ ] **Step 4: Add the panel and stable alerts**

Create one persistent two-column table at the selected input position. Populate it only on `barstate.islast` with the seven approved rows. Use Panda colors and `—`/fail-closed status rather than defaults.

Add four `alertcondition()` declarations with constant stable names and messages plus optional dynamic `alert()` calls using `alert.freq_once_per_bar_close`. Dynamic payloads have this exact shape:

```json
{"source":"PANDA_TV","event":"PL_BULLISH_FLIP","symbol":"EURUSD","timeframe":"60","price":1.12345,"bar_time":1784252400000}
```

No URL, Telegram token, Panda token, or account value is embedded.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node --test tests/tradingviewPandaReference.test.mjs tests/tradingviewPandaSource.test.mjs
```

Expected: all tests pass.

- [ ] **Step 6: Commit signals and UI**

```bash
git add tests/tradingviewPandaSource.test.mjs panda-indicators/2026-07-17/tradingview-panda-personal/PandaEnginePersonalTV.pine
git commit -m "add-tradingview-panda-lines-bos-and-panel"
```

### Task 4: Installation guide and TradingView compiler verification

**Files:**
- Create: `panda-indicators/2026-07-17/tradingview-panda-personal/README.md`
- Modify: `CHANGELOG.md`
- Modify only if compiler corrections are required: `panda-indicators/2026-07-17/tradingview-panda-personal/PandaEnginePersonalTV.pine`
- Modify only if behavior changes are required: `tests/tradingviewPandaSource.test.mjs`

**Interfaces:**
- Consumes: Completed Pine source from Task 3.
- Produces: Personal install/use instructions and a Pine Editor-compiled source.

- [ ] **Step 1: Write the README**

Document exact installation:

1. Open TradingView chart and Pine Editor.
2. Create a blank personal indicator.
3. Paste the complete contents of `PandaEnginePersonalTV.pine`.
4. Save as `Panda Engine Personal TV`, click **Add to chart**, and leave it private.
5. Use a supported forex chart; OANDA is the internal scoring feed regardless of visible broker.
6. Explain panel position and visibility inputs, Box colors, status/flip/BOS meanings, bar-close confirmation, alert creation, and `DATA UNAVAILABLE`/unsupported troubleshooting.
7. State that TradingView/MT4 feed differences are expected and that the indicator is informational.

- [ ] **Step 2: Compile in TradingView and correct only compiler errors**

Open TradingView Pine Editor with the user's authenticated browser when available, paste the source, and compile. For each compiler error, record the exact message, add or adjust a failing source-contract assertion when behavior changes, patch minimally, and compile again.

Expected final result: zero Pine compiler errors and the indicator attaches to a supported chart.

- [ ] **Step 3: Run the visual smoke matrix**

Verify on at least `OANDA:EURUSD`, one non-OANDA EURUSD chart, and one unsupported chart:

- Supported canonical pair and panel values render.
- Unsupported chart displays `UNSUPPORTED SYMBOL` with no invented score.
- Three Boxes align with their historical UTC windows when enabled.
- H1/H4 structure matches the midpoint rule.
- Panda Lines plots and ABOVE/BELOW/BETWEEN match visible closes.
- Flip and BOS markers occur only on confirmed closes and do not repeat.
- Panel, Box, Panda Lines, and BOS visibility toggles work.

- [ ] **Step 4: Update CHANGELOG and commit**

Add a dated entry describing the personal Pine v6 indicator, exact logic boundary, alerts, and future engine/Telegram phase.

```bash
git add CHANGELOG.md panda-indicators/2026-07-17/tradingview-panda-personal
git commit -m "document-tradingview-personal-panda-overlay"
```

### Task 5: Full verification, push, and handoff

**Files:**
- Verify only; modify earlier task files only for discovered failures.

**Interfaces:**
- Consumes: All completed source, tests, and documentation.
- Produces: Clean `main`, pushed feature commits, and verified Vercel production deployment.

- [ ] **Step 1: Run complete automated verification**

```bash
node --test tests/*.test.mjs
python3.11 check_dupes.py
npx next build
git diff --check
```

Expected: all tests pass, `DUPES: NONE`, Next build succeeds, and no whitespace errors.

- [ ] **Step 2: Verify safety boundaries**

```bash
git status --short package.json package-lock.json vercel.json next.config.js
rg -n -i 'supabase|engine.secret|operator.token|account.number' panda-indicators/2026-07-17/tradingview-panda-personal/PandaEnginePersonalTV.pine
git status --short
```

Expected: protected files are not deleted/modified, secret scan returns no matches, and only intentional committed work remains.

- [ ] **Step 3: Synchronize and push**

```bash
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
git push origin main
```

If origin advanced, pull/merge normally, rerun Step 1, and never force push.

- [ ] **Step 4: Verify production and report handoff**

Use pinned Vercel CLI to confirm the Git-triggered production deployment is `READY`, duration exceeds 20 seconds, aliases include `pandaengine.app`, the home page returns HTTP 200, and no new error logs appear.

Report:

- Pine source and README paths.
- Pine compile status and charts smoke-tested.
- Automated test/build totals.
- Commit and deployment identifiers.
- The manual TradingView installation steps.
- Phase two remains Panda Engine fields plus authenticated Telegram delivery; it is not implemented in this feature.
