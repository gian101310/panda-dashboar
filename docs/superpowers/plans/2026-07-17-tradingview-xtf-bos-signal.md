# TradingView XTF BOS Confluence Signal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a separate private Pine v6 version with XTF-relative READY states and final confirmed BOS BUY/SELL triggers.

**Architecture:** Copy the verified personal overlay into a new directory and compose its existing bias, Panda Lines, Box, and BOS values. The original personal indicator remains unchanged.

**Tech Stack:** Pine Script v6, Node.js built-in test runner, TradingView Pine Editor.

## Global Constraints

- Create `panda-indicators/2026-07-17/tradingview-panda-personal-xtf-bos/`.
- Do not modify the original Pine source, locked Python scoring, or BB/INTRA rules.
- Preserve 21 OANDA H1 requests and the 1,800-bar runtime budget.
- Do not add tokens, licensing, APIs, Supabase, engine secrets, or `strategy.*`.
- READY never alerts; final confirmed triggers alert once.

### Task 1: Reference contract

**Files:**

- Modify: `tests/helpers/tradingviewPandaReference.mjs`
- Modify: `tests/tradingviewPandaReference.test.mjs`

**Interface:** export `classifyXtfBosSignal({ xtf, bias, pandaLines, boxH1, boxH4, bosEvent })`, returning `{ activeBox, otherBox, otherContext, ready, status, event }`.

- [ ] **Step 1: Add a failing test**

```js
assert.deepEqual(classifyXtfBosSignal({ xtf: 'H4', bias: 'BUY', pandaLines: 'ABOVE', boxH1: 'DOWNTREND', boxH4: 'UPTREND', bosEvent: null }), { activeBox: 'UPTREND', otherBox: 'DOWNTREND', otherContext: 'COUNTER', ready: true, status: 'BUY READY — WAIT BULLISH BOS', event: null });
assert.equal(classifyXtfBosSignal({ xtf: 'H1', bias: 'BUY', pandaLines: 'ABOVE', boxH1: 'RANGING', boxH4: 'UPTREND', bosEvent: 'BOS_BULLISH' }).status, 'NO SETUP');
```

- [ ] **Step 2: Verify RED** — run `node --test tests/tradingviewPandaReference.test.mjs`; expect missing export.

- [ ] **Step 3: Implement the pure helper**

```js
const activeBox = xtf === 'H4' ? boxH4 : boxH1;
const otherBox = xtf === 'H4' ? boxH1 : boxH4;
const ready = bias === 'BUY' ? pandaLines === 'ABOVE' && activeBox === 'UPTREND' : bias === 'SELL' && pandaLines === 'BELOW' && activeBox === 'DOWNTREND';
const event = ready && bias === 'BUY' && bosEvent === 'BOS_BULLISH' ? 'XTF_BOS_BUY_TRIGGER' : ready && bias === 'SELL' && bosEvent === 'BOS_BEARISH' ? 'XTF_BOS_SELL_TRIGGER' : null;
```

Return `ALIGNED`, `RANGING`, `COUNTER`, or `UNKNOWN` for the other Box, and return `NO SETUP`, READY, or TRIGGER status exactly as specified.

- [ ] **Step 4: Verify GREEN and commit** — run `node --test tests/tradingviewPandaReference.test.mjs`, then commit `test-tradingview-xtf-bos-signal-contract`.

### Task 2: Separate Pine version and source contract

**Files:**

- Create: `panda-indicators/2026-07-17/tradingview-panda-personal-xtf-bos/PandaEnginePersonalTVXtfBos.pine`
- Create: `tests/tradingviewXtfBosSource.test.mjs`

**Interface:** consume `pandaBias`, `boxH1Trend`, `boxH4Trend`, `pandaLineStatus`, `bosBullish`, and `bosBearish`; produce `xtfBoxTrend`, `otherBoxContext`, `buyReady`, `sellReady`, `buyTrigger`, `sellTrigger`, and `signalStatus`.

- [ ] **Step 1: Add the failing source contract**

```js
const path = 'panda-indicators/2026-07-17/tradingview-panda-personal-xtf-bos/PandaEnginePersonalTVXtfBos.pine';
assert.match(source, /indicator\("Panda Engine Personal TV XTF BOS"/);
assert.match(source, /input\.string\("H1",\s*"XTF structure"/);
assert.match(source, /XTF_BOS_BUY_TRIGGER|XTF_BOS_SELL_TRIGGER/);
assert.match(source, /alertcondition\(buyTrigger|alertcondition\(sellTrigger/);
assert.doesNotMatch(source, /strategy\(|supabase|engine.secret|operator.token/i);
```

- [ ] **Step 2: Verify RED** — run `node --test tests/tradingviewXtfBosSource.test.mjs`; expect `ENOENT`.

- [ ] **Step 3: Copy and compose the version**

Use title `Panda Engine Personal TV XTF BOS`, short title `PANDA XTF`, and add this input and composition after the existing BOS booleans:

```pine
string xtfStructure = input.string("H1", "XTF structure", options = ["H1", "H4"], group = "XTF BOS Signal")
string xtfBoxTrend = xtfStructure == "H4" ? boxH4Trend : boxH1Trend
string otherBoxTrend = xtfStructure == "H4" ? boxH1Trend : boxH4Trend
bool buyReady = pandaBias == "BUY" and pandaLineStatus == "ABOVE" and xtfBoxTrend == "UPTREND"
bool sellReady = pandaBias == "SELL" and pandaLineStatus == "BELOW" and xtfBoxTrend == "DOWNTREND"
bool buyTrigger = buyReady and bosBullish
bool sellTrigger = sellReady and bosBearish
```

Add other-Box context, event-only BUY/SELL markers, both alertcondition events, optional dynamic alerts, and four compact panel rows: `XTF`, `XTF BOX`, `OTHER BOX`, and `SIGNAL`. Move the transparent watermark spacer to final table row 12.

- [ ] **Step 4: Verify GREEN and commit** — run `node --test tests/tradingviewPandaReference.test.mjs tests/tradingviewXtfBosSource.test.mjs`, then commit `add-tradingview-xtf-bos-signal-version`.

### Task 3: Documentation, TradingView smoke test, and deployment

**Files:**

- Create: `panda-indicators/2026-07-17/tradingview-panda-personal-xtf-bos/README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Document the separate version** — explain XTF H1/H4, READY, TRIGGER, OTHER BOX context, and the two final trigger alerts. State that it does not replace the original indicator.

- [ ] **Step 2: Smoke-test in TradingView** — create a new Indicator without overwriting either existing private script; save it as `Panda Engine Personal TV XTF BOS`; test XTF H1 and H4 on a supported H1 forex chart; wait three seconds and confirm no compiler/runtime error.

- [ ] **Step 3: Verify and ship**

```bash
node --test tests/*.test.mjs
python3.11 check_dupes.py
npx next build
git diff --check
git push origin main
```

Confirm the Git deployment is READY above 20 seconds and `https://pandaengine.app/` returns HTTP 200. Commit documentation as `document-tradingview-xtf-bos-signal` before push.
