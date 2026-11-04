# Panda Confluence Prototype Changelog

## 2026-11-04 - Align box checks with Panda bias

- Opposing H1 or H4 box trends now block both market and pullback paths. Ranging boxes are neutral, including on the 5-8 pullback path.
- H1 ADX below 15 remains a separately labelled pullback wait. The 9+ market path does not require box agreement, but shows 0/2, 1/2, or 2/2 support.
- Updated the original cTrader V5, licensed cTrader v1, and MT5 indicator; Panda scoring and BB/INTRA rules are unchanged.

## 2026-11-04 - Confirm V5 market trend and momentum

- Split gap 9+ market context from gap 5–8 pullback checks. Market context no longer depends on the H1 box classification or a previous-period level.
- Added aligned H1 trend strength 65+, H1 ADX 25+, aligned H1 structure, aligned M15 strength 50+, and a fresh opposing M15 event veto before market context appears.
- Kept live-price overextension and nearby opposing-level review warnings. V5 remains read-only; Panda scoring and BB/INTRA rules are unchanged.

## 2026-11-04 - Keep V5 pullback drawing on the correct side

- Checked the pullback drawing against the live chart bid, hiding a SELL area once price is above it or a BUY area once price is below it.
- Showed the pullback drawing only for gaps 5–8 and labelled an area already reached as `AT LEVEL • WAIT` instead of `POSSIBLE`.
- Left Panda scoring, V5 decisions, and market-context checks unchanged.

## 2026-11-04 - Simplify the V5 chart panel

- Made a 400-pixel simple view the default, with Panda direction, H1 strength and ADX, H1 and M15 events, Lines, level, alignment, decision, and next step.
- Strong aligned SELL readings display red and BUY readings green; weak, old, or opposing readings display amber. The prior full diagnostics remain under the Details button.
- Rebuilt the cTrader package without changing V5 decision rules, Panda scoring, or order behavior.

## 2026-11-04 - Show the full V5 panel at once

- Arranged the V5 context, decision, structure, pullback, and plan details in two columns without a scroll viewer.
- Rebuilt and installed the cTrader package locally. Signal rules and scoring are unchanged.

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
