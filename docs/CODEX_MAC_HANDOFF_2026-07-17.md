# Codex Mac Handoff - MT4/MT5 Overlay Feed Architecture - 2026-07-17

**From:** Claude (Cowork, Windows)
**Repository:** `gian101310/panda-dashboar`, branch `main`

## Critical discovery

The 2026-07-14 MT4/MT5 Dashboard Overlay builds could never work: **MetaTrader
prohibits `WebRequest()` inside custom indicators** (MQL4 and MQL5, documented
platform restriction — indicators run in the interface thread). Every call
returned -1 with error 4014/4060, which `Core.mqh` mapped to the permanent
`ALLOW WEBREQUEST` banner regardless of terminal settings. cTrader is not
affected. Verified live on Boss-G's MT4 and MT5 terminals before the fix.

## New architecture (implemented, compiled, smoke-tested on Windows)

Split fetch from display:

- **Overlay indicator** (unchanged names): never calls WebRequest
  (`MQL_PROGRAM_TYPE` guard in Core). Displays purely from the shared
  common-files snapshot cache. Shows `ATTACH FEED EA` when no cache exists.
- **Feed EA** (new: `PandaDashboardFeed{MT4,MT5}-{Personal,Licensed}`):
  same Core, same credentials, EAs may call WebRequest. Attach to ONE chart
  per terminal; refreshes the shared cache every 60s (existing lock and
  throttle). Renders only a small `PANDA FEED` status badge. Places no orders.

## UI changes in both MT4/MT5 cores

- New `PanelCorner` input on all six MT4/MT5 entry files (enum
  `PANDA_PANEL_CORNER`: top left / top right / bottom left / bottom right,
  default bottom left).
- Panel rebuilt top-down with `CORNER_LEFT_UPPER` + `ANCHOR_LEFT_UPPER`:
  opaque 280x184 background (the old lower-corner rectangle math hung the
  background off-screen, leaving text transparent on the chart), fixed row
  grid so XTF and footer no longer overlap, drag + minimize preserved,
  repositions on `CHARTEVENT_CHART_CHANGE`.
- Object prefixes now include program type (`.I.` indicator / `.F.` feed)
  so indicator and feed EA never fight over the same objects; init sweeps
  ALL `PandaMT4.` / `PandaMT5.` objects because MT4 chart IDs change per
  session and orphaned drawings survived restarts.

## Distribution changes (live on the website after this deploy)

- `public/downloads/panda-dashboard-overlay-mt4-licensed.zip` and
  `...-mt5-licensed.zip`: overlay + feed EA + INSTALL-MT4/MT5.txt.
- `lib/indicatorProducts.mjs` MT4/MT5 products now point at the zips with
  updated install notes. cTrader product untouched.
- Legacy raw `.ex4`/`.ex5` files in `public/downloads/` refreshed with the
  new builds so stale links do not serve the broken binaries (alone they
  still need the feed EA — the zip is the real package).
- `dist/` refreshed: 8 binaries, 8 zero-warning compile logs, SHA256SUMS.

## Tests

`tests/metatraderOverlaySource.test.mjs` extended (feed EA contracts,
`MQL_PROGRAM_TYPE` guard, corner enum, `CORNER_LEFT_UPPER`);
`tests/indicatorDownload.test.mjs` redirect expectation now `.zip`.
Full suite + `check_dupes.py` + `npx next build` passed before push.

## What Codex Mac should do

1. Pull main. Read this file and `MT4_MT5_DASHBOARD_OVERLAY_HANDOFF.md`
   (its MT4/MT5 sections are superseded by this document where they
   conflict — especially any claim that the indicator performs HTTP).
2. cTrader: no action required; single-file .algo flow stays.
3. If you regenerate MT4/MT5 artifacts on Mac, remember they must be
   compiled by MetaEditor on Windows — leave compilation to Windows Claude.
4. Device-enforcement rollout steps are unchanged (all platforms still OFF).
   The feed EA carries the licensed device headers exactly as the indicator
   did, because it shares the same Core.
5. Update the landing/product copy if it still describes a single-file
   MT4/MT5 install.

## Known state on Boss-G's machines

- Windows MT4 (IC Markets Global): Personal overlay + feed LIVE, verified.
- Windows MT5 (IC Markets Global): new builds installed; feed EA attach
  pending Boss-G (terminal actively trades via PandaEngine_EA_MT5_WRITEBACK,
  so the feed must go on a chart without an EA).
- The old Windows clone `C:\Users\Admin\Documents\Claude\Projects\Panda Engine`
  is diverged (79 behind / 8 ahead, local app.py edits). This push was made
  from the clean `C:\Users\Admin\panda-dashboard` clone. Divergence resolution
  is Boss-G's call — do not force anything.
