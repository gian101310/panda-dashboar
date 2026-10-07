# Claude Windows Handoff — 2026-10-08

> Written from the Windows Codex session. Latest-date handoff for Panda Engine.

## TL;DR

- Added a separate Panda Gold `XAUUSD` signal add-on in `app.py`.
- Gold uses Twelve Data candles, SuperTrend flip logic, and Panda USD-strength filtering.
- Gold appears in the open Telegram snapshot slot and sends SIGNAL-bot alerts on fresh LONG/SHORT flips.
- Added a second Telegram image: `PANDA ADV SCORECARD`, sent alongside the normal snapshot.
- Fixed Telegram snapshot display for non-valid forex rows:
  - one-sided extreme currency = yellow `WATCH`;
  - same-side extreme conflict = white `INVALID`.
- Locked forex scoring functions and BB/INTRA strategy definitions were not changed.

## Commits This Session

- Pending commit: `add-panda-gold-telegram-snapshot`

## Changes

1. `app.py`
   - Added configurable Gold settings:
     - `TWELVEDATA_API_KEY`
     - `PANDA_GOLD_SYMBOL`
     - `PANDA_GOLD_TD_SYMBOL`
     - `PANDA_GOLD_INTERVAL`
     - `PANDA_GOLD_ST_FACTOR`
     - `PANDA_GOLD_ST_ATR`
     - `PANDA_GOLD_USD_THRESHOLD`
     - `PANDA_GOLD_USD_QUORUM`
     - `PANDA_GOLD_BLOCK_OFFLINE`
   - Added server-side Panda Gold logic:
     - fetch confirmed `XAU/USD` candles from Twelve Data;
     - compute SuperTrend flips;
     - filter Gold longs/shorts using USD strength from the existing 21-pair MT4 files;
     - calculate Entry, SL, TP1, TP2, TP3;
     - suppress duplicate alerts with `panda_gold_signal_mark.txt`.
   - Added `XAUUSD` as a Telegram snapshot card appended after the 21 forex pairs.
   - Added `send_gold_signal_alert()` to send Gold LONG/SHORT alerts through the SIGNAL bot.
   - Corrected snapshot-only display classification:
     - valid pairs keep BUY/SELL;
     - one-sided strong/weak currency rows show yellow `WATCH`;
     - same-side extreme conflicts such as EUR weak + NZD weak show white `INVALID`.
   - Added `generate_adv_scorecard()` for a second Telegram snapshot showing:
     - pair;
     - gap;
     - bias;
     - raw base/quote D1/H4/H1;
     - ADV base/quote D1/H4/H1.
   - Added `_send_telegram_photo()` reusable Telegram photo sender.
   - Normal snapshot send now also sends the ADV scorecard after the main image succeeds.
   - ADV scorecard row fills match the main snapshot:
     - green = valid BUY;
     - red = valid SELL;
     - yellow = WATCH;
     - white/gray = INVALID.

## Verification

- `py -3.11 -m py_compile app.py`
- `py -3.11 check_dupes.py`
- `npx next build`
- Restarted hidden engine with `RESTART_ENGINE.ps1`
- Sent test Telegram message successfully.
- Sent corrected Telegram snapshots successfully.
- Sent normal snapshot plus ADV scorecard successfully.
- Verified Gold dry read after Twelve Data key was added:
  - `XAUUSD` no longer offline;
  - current state was `FLAT`;
  - USD filter showed USD strength context.

## Notes / Local Dirt

- Do not commit generated `snapshot.png` / `snapshot_send.jpg`.
- Existing untracked helper/test files remain local and unrelated.
- `.env` contains the local Twelve Data key and must not be committed.

## Locked / Unchanged

- `extract_panda_score()` unchanged.
- `compute_scores_all_pairs()` unchanged.
- `PREV_GAP` / `gap_deltas` ordering unchanged.
- BB and INTRA strategy rules unchanged.
