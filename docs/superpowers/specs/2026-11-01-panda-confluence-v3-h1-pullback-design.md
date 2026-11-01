# Panda Confluence V3 — H1 Pullback Entry Assistant

## Intent

Add a read-only H1 entry assistant to the existing Panda Confluence prototype. Its purpose is to help the operator avoid entering while a pullback is still developing and identify when continuation conditions have returned. Panda Engine scoring and production strategy rules remain unchanged.

## Verified terminology

- **Panda Lines** are the H1 SuperTrend and Follow Line. A BUY requires price above both; a SELL requires price below both. Price between them is unconfirmed.
- **Panda Levels** are previous-period price references (PDH/PDL, PWH/PWL, PMH/PML and, where available, Panda Boxes). They are potential pullback entry areas, not Panda Line history.
- `|gap| >= 9` is MARKET classification. `|gap| 5–8` is PULLBACK classification. Classification alone is not an instruction to enter.

## Selected approach

Use **H1 setup plus M15 trigger**. H1 controls direction, structure, trend/range state, Panda Line confirmation, and the pullback zone. M15 is used only to confirm that the pullback may be ending. H4 and D1 are informational and cannot block an otherwise valid H1 setup.

Alternatives considered:

- H1-only confirmation: simpler but later entries and wider structural risk.
- Immediate Panda Level touch: earlier entries but does not adequately prevent premature pullback entries.

## V3 behavior

The panel will distinguish these states:

1. `NO SETUP` — Panda WAIT, hard invalid, missing/stale data, or gap below 5.
2. `MARKET ELIGIBLE` — gap at least 9, Panda Lines confirmed, and H1 conditions acceptable; this is eligibility, not automatic execution.
3. `PULLBACK ACTIVE — WAIT` — gap 5–8 and price is moving against the Panda direction toward a valid Panda Level.
4. `APPROACHING PANDA LEVEL` — price is within a configurable proximity of the nearest directional level.
5. `AT PANDA LEVEL — WAIT FOR REJECTION` — price has entered the level zone but continuation is not confirmed.
6. `PULLBACK ENDING` — price has rejected the level and M15 has produced a fresh CHoCH in the Panda direction.
7. `BUY READY` / `SELL READY` — Panda Lines remain confirmed, H1 structure is not invalidated, the level has rejected, and a fresh M15 BOS confirms continuation.
8. `RANGE — NO TRADE` — H1 ADX/structure and repeated direction changes indicate unsuitable conditions.
9. `SETUP INVALIDATED` — Panda bias invalidates, price loses the required Panda Line side on a confirmed H1 close, or H1 structure breaks against the setup.

## Entry-zone and continuation information

- Show the nearest valid directional Panda Level and distance in pips.
- Treat a level touch as context only, never as READY.
- Show Panda Line state separately from Panda Level state.
- Grade continuation conditions as `WEAK`, `MODERATE`, or `STRONG`; do not display an invented probability.
- Fresh M15 CHoCH/BOS events expire after a small configurable number of completed M15 candles.
- Market-eligible setups receive overextension and nearby-level warnings before any READY state.

## Constraints and non-goals

- No order placement or position management.
- No changes to Panda scoring, gap thresholds, locked BB/INTRA definitions, or production Panda Engine files.
- No claim of predictive certainty or fixed win rate.
- V3 will be built as a separate indicator/artifact so V2 remains available for comparison and rollback.
- The first release will consume Panda Level values only when the feed exposes reliable values; missing levels must produce `LEVEL DATA UNAVAILABLE`, not a fabricated level.

## Validation

- Test decision-state transitions before implementation.
- Test BUY and SELL symmetry, stale/missing data, gap boundaries, Panda Line loss, range blocking, level approach/touch/rejection, event expiry, and market-overextension warnings.
- Build the cTrader artifact with zero compiler errors and run the complete prototype test suite.
