# Panda Confluence Prototype Changelog

## 2026-11-03 - Explain V5 decisions and trade plan visibility

- Added decision, next-step, and trade-plan drawing status rows to the V5 panel.
- Exposed drawing failures and reasons a preview cannot be plotted, while keeping Panda eligibility and entries unchanged.

## 2026-11-03 - Show V5 Panda context on shorter charts

- Moved Panda Lines, level, and setup state to the top of the V5 panel and added scrolling.
- Kept nearest-level context visible while unconfirmed Lines block a setup; rebuilt the cTrader package.

## 2026-11-01 — V5 possible pullback area

- Added a separate V5 indicator while preserving V4 and all locked Panda scoring and strategy behavior.
- Added a volatility-aware possible pullback area around the nearest directional Panda Level, with `APPROACHING`, `INSIDE ZONE — WAIT`, and `ZONE FAILED` states.
- Kept the selected area stable for the active bias and added panel rows plus visibility, width, ATR, and projection parameters.
- Retained the V4 draggable risk/reward preview and lot-size controls in V5.

## 2026-11-01 — V4 preview drawing and lot size

- Added `READY ONLY`, `CONTEXT READY`, and `ALWAYS` risk-plan visibility modes; `CONTEXT READY` is the default.
- Preview drawings are marked `PREVIEW — NOT READY`, stay draggable, and preserve manual edits when confirmation arrives.
- Added configurable lot size with broker volume normalization and panel display.

## 2026-11-01 — V4 H1 swing trade planner

- Added separate read-only cTrader V2, V3, and V4 artifacts without changing Panda scoring or locked strategy definitions.
- V3 uses H1 Panda Lines and previous-period Panda Levels with fresh M15 continuation confirmation to block early and late pullback entries.
- V4 draws a native draggable risk/reward plan from the confirmed M15 trigger close, latest confirmed H1 swing plus buffer, configurable maximum stop width, and fixed-R target.
- Added deterministic gap, line, level, pullback, continuation, swing-stop, and BUY/SELL symmetry tests plus installable `.algo` files and SHA-256 checksums.
