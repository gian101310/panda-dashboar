# Panda Confluence V3 H1 Pullback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate, read-only cTrader V3 indicator that identifies H1 Panda Level pullback zones and waits for fresh M15 continuation confirmation before displaying BUY READY or SELL READY.

**Architecture:** Extend the prototype's pure JavaScript reference core with an H1-first state machine, then port the same decisions into a new cTrader indicator class. V3 consumes live Panda bias/gap and available Panda Line/Level fields, calculates local H1/M15 structure, and degrades explicitly when feed fields are unavailable.

**Tech Stack:** Node.js built-in test runner, ECMAScript modules, C#/.NET 6, cTrader Automate API.

**Spec:** `docs/superpowers/specs/2026-11-01-panda-confluence-v3-h1-pullback-design.md`

## Global Constraints

- Do not modify Panda scoring, gap thresholds, locked strategies, or production Panda Engine files.
- Keep V2 source, build, and installed artifact available.
- V3 is read-only and never places or manages orders.
- H1 controls setup validity; M15 only times continuation; H4/D1 are informational.
- Panda Lines and Panda Levels remain separate concepts in calculations and panel copy.
- A level touch alone can never produce READY.
- Missing feed data must be shown as unavailable, never reconstructed or fabricated.
- Do not claim prediction certainty or a fixed win probability.

## Review Focus

- Feed provides bias/gap but no Panda Lines or Levels: show unavailable state without READY.
- BUY/SELL symmetry around line position, directional levels, rejection, and M15 events.
- Exact gap boundaries 4.9, 5, 8, and 9 classify consistently.
- Stale M15 confirmation expires and cannot remain READY.
- H1 range or confirmed line loss blocks a technically fresh M15 trigger.

---

### Task 1: H1 pullback decision model

**Files:**
- Modify: `panda-confluence-prototype/src/confluence-core.mjs`
- Modify: `panda-confluence-prototype/test/confluence-core.test.mjs`

**Interfaces:**
- Consumes: normalized Panda feed, H1 state, nearest level, and M15 event inputs.
- Produces: `classifyGapExecution(gap)`, `pandaLineConfirmation(input)`, `nearestDirectionalLevel(input)`, `h1PullbackDecision(input)`.

- [ ] **Step 1: Write failing tests for gap and Panda Line classification**

Add tests proving gap below 5 is `NONE`, 5–8 is `PULLBACK`, 9+ is `MARKET`; BUY requires price above both lines and SELL below both; missing line values return `UNAVAILABLE`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test --test-name-pattern="gap execution|Panda Line" panda-confluence-prototype/test/confluence-core.test.mjs`

Expected: FAIL because the new exports do not exist.

- [ ] **Step 3: Implement classification helpers**

Add the four named exports with numeric finite-value guards and symmetric BUY/SELL handling.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command; expected PASS.

- [ ] **Step 5: Write failing tests for level selection and the complete state machine**

Cover nearest level below BUY price/above SELL price, unavailable levels, approaching, touch without READY, rejection + fresh CHoCH, rejection + fresh BOS, stale BOS, H1 range, H1 structure invalidation, line loss, and market overextension/nearby-level warnings.

- [ ] **Step 6: Run the focused decision tests and verify RED**

Run: `node --test --test-name-pattern="H1 pullback|directional Panda Level|market eligibility" panda-confluence-prototype/test/confluence-core.test.mjs`

Expected: FAIL on missing V3 state behavior.

- [ ] **Step 7: Implement the minimal H1 pullback state machine**

`h1PullbackDecision(input)` returns `{ state, decision, continuation, execution, lineState, levelState, level, distancePips, warnings }`. Use completed-bar inputs, M15 event expiry of three bars by default, and `WEAK`/`MODERATE`/`STRONG` continuation labels.

- [ ] **Step 8: Run the full reference suite**

Run: `node --test panda-confluence-prototype/test/*.test.mjs`

Expected: all tests PASS.

### Task 2: V3 cTrader indicator and panel

**Files:**
- Create: `panda-confluence-prototype/ctrader/PandaConfluence.V3.cs`
- Create: `panda-confluence-prototype/ctrader/panda-confluence-v3/PandaConfluenceV3.csproj`
- Modify: `panda-confluence-prototype/test/confluence-core.test.mjs`

**Interfaces:**
- Consumes: live overlay fields for bias, gap, hard invalid, update time, `pl_st`, `pl_fl`, and previous-period levels when present; local H1 and M15 completed bars.
- Produces: cTrader indicator class `PandaConfluenceV3` and installable `panda-confluence-v3.algo`.

- [ ] **Step 1: Add failing source-contract tests**

Assert V3 has a distinct class/name, H1/M15 bars, line/level feed parsing, gap classification, the designed panel states, no order APIs, display toggles, draggable persistence, minimize behavior, and visibility-sentinel behavior.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test panda-confluence-prototype/test/*.test.mjs`

Expected: FAIL because the V3 source does not exist.

- [ ] **Step 3: Implement the V3 indicator by adapting V2 display infrastructure**

Keep V2 untouched. Port Task 1 state rules into C#, use only confirmed H1/M15 candles, show separate `PANDA LINES`, `PANDA LEVEL`, `PULLBACK`, `CONTINUATION`, and `DECISION` rows, and preserve chart labels/FVG/display options.

- [ ] **Step 4: Create the isolated V3 build project**

Reference the installed cTrader Automate NuGet package and link only `PandaConfluence.V3.cs`.

- [ ] **Step 5: Run tests and compile**

Run: `node --test panda-confluence-prototype/test/*.test.mjs`

Run: `dotnet build panda-confluence-prototype/ctrader/panda-confluence-v3/PandaConfluenceV3.csproj -c Release`

Expected: all tests PASS; build completes with zero errors.

### Task 3: Install and verify V3 independently

**Files:**
- Create/update: `~/cAlgo/Sources/Indicators/panda-confluence-v3.algo`
- Modify: `panda-confluence-prototype/README.md`

**Interfaces:**
- Consumes: Task 2 Release artifact.
- Produces: installed V3 indicator alongside V2 plus operator-facing usage notes.

- [ ] **Step 1: Verify the artifact identity before installation**

Compute SHA-256 and confirm the compiled filename is `panda-confluence-v3.algo` and V2 remains present.

- [ ] **Step 2: Install the V3 artifact**

Copy the compiled artifact to the explicit cTrader Indicators path without replacing V2.

- [ ] **Step 3: Document V3 usage and limitations**

Explain MARKET versus PULLBACK classification, Panda Lines versus Panda Levels, every panel state, missing-level behavior, and that READY is decision support rather than a prediction or order instruction.

- [ ] **Step 4: Run final verification**

Run the complete Node suite, Release build, installed/source checksum comparison, and explicit file checks for both V2 and V3.

Expected: tests PASS, build has zero errors, checksums match, both artifacts exist.
