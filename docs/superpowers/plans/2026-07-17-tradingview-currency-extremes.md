# TradingView Currency Extremes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the base and quote currency's engine-style extreme D1/H4/H1 scores in both private TradingView Pine overlays.

**Architecture:** Each overlay already builds currency score arrays for D1, H4, and H1. Add one pure Pine formatter that filters those existing values at absolute score 4 or above, then render its base and quote results as two panel rows. No scoring or trade logic changes.

**Tech Stack:** Pine Script v6, Node.js built-in test runner, existing source-contract tests.

## Global Constraints

- Qualify a timeframe only when its absolute score is 4 or greater.
- Preserve `D1`, `H4`, `H1` display order and signed score values.
- Modify both private Pine source files identically for the shared display feature.
- Do not modify `app.py` scoring, Pine Bias, Box, Panda Lines, BOS, XTF/BOS triggers, or alerts.

---

### Task 1: Add source contracts for currency extremes

**Files:**
- Modify: `tests/tradingviewPandaSource.test.mjs`
- Modify: `tests/tradingviewXtfBosSource.test.mjs`

**Interfaces:**
- Consumes: the Pine source files' existing `scoresD1`, `scoresH4`, `scoresH1`, `baseIndex`, and `quoteIndex` values.
- Produces: source contracts for a formatter and `BASE XTF` / `QUOTE XTF` panel rows in both files.

- [ ] **Step 1: Add the failing source contracts**

Require both source files to contain `f_currency_extremes`, an absolute-score
threshold against `PANDA_SIGNIFICANT`, base and quote calls using all three
score arrays, and both panel labels.

- [ ] **Step 2: Run the contracts and confirm failure**

Run: `node --test tests/tradingviewPandaSource.test.mjs tests/tradingviewXtfBosSource.test.mjs`

Expected: FAIL because `f_currency_extremes`, `BASE XTF`, and `QUOTE XTF` are
not present yet.

### Task 2: Render currency extremes in both Pine panels

**Files:**
- Modify: `panda-indicators/2026-07-17/tradingview-panda-personal/PandaEnginePersonalTV.pine`
- Modify: `panda-indicators/2026-07-17/tradingview-panda-personal-xtf-bos/PandaEnginePersonalTVXtfBos.pine`
- Modify: `panda-indicators/2026-07-17/tradingview-panda-personal/README.md`
- Modify: `panda-indicators/2026-07-17/tradingview-panda-personal-xtf-bos/README.md`

**Interfaces:**
- Consumes: `f_currency_extremes(currency, d1, h4, h1)`.
- Produces: `baseXtf` and `quoteXtf` panel strings that use existing score arrays and report all values whose absolute score is at least 4.

- [ ] **Step 1: Add the pure formatter**

Implement `f_currency_extremes` with exact `D1`, `H4`, `H1` order and `+` sign
formatting for positive values. Return `<currency>: NONE` when no value
qualifies.

- [ ] **Step 2: Wire base and quote values**

Call the formatter from the existing `baseIndex` and `quoteIndex`, guarding
unready score data with `—`.

- [ ] **Step 3: Add panel rows and preserve spacers**

Insert `BASE XTF` and `QUOTE XTF` after `GAP`; resize each panel and its
`table.clear` range to retain the transparent bottom spacer.

- [ ] **Step 4: Update both READMEs**

Document that the panel now lists all base/quote D1/H4/H1 extremes with
absolute score 4 or higher and remains display-only.

### Task 3: Verify and package

**Files:**
- Verify: the two source files and source-contract tests.

- [ ] **Step 1: Run targeted tests**

Run: `node --test tests/tradingviewPandaSource.test.mjs tests/tradingviewXtfBosSource.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run project checks**

Run: `py -3.11 check_dupes.py` and `npx next build`.

Expected: duplicate check clean and Next.js production build succeeds.

- [ ] **Step 3: Review the diff**

Confirm that only the two Pine overlays, their READMEs, their source tests,
and these documentation files changed; the pre-existing local ZIP stays
uncommitted unless explicitly requested.
