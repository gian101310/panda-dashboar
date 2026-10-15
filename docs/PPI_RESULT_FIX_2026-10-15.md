# PPI result retrieval and delivery

Yesterday's `b08b8ca` added the summary formatter. The CPI sample sent in the
chat **Explain Panda Engine and latest push** manually supplied actual/forecast/
previous values, and Telegram returned 200 for both samples. It did not test
automatic retrieval. Today's live ForexFactory JSON had 111 events and no
`actual` fields, including both USD PPI events.

## Fix

- Preserve the existing summary format; resolve missing USD headline/core PPI
  monthly/yearly actuals from the dated BLS PDF hosted by DOL.
- Verify its embargo date and reporting-period/table agreement. Use aggregate
  FD 4 and FD 49104, never core goods FD 413 or the measure excluding trade.
- Keep calendar forecast/previous values as pre-release context. Include the
  official source link; do not silently replace actual with forecast.
- Retry failed Telegram result sends. Save successful message IDs locally in
  ignored `news_result_marks.json` to prevent repeats after restart.
- Catch up released results within 24 hours. Other releases still need a feed
  supplying actuals; this is specifically a US PPI fallback.

Install engine PDF dependencies with
`py -3.11 -m pip install -r requirements-news.txt`.
Restart using `RESTART_ENGINE.ps1`; an elevated existing engine requires an
elevated restart. An ACTIVE status by itself does not prove new code loaded:
check the listener process creation time and persisted news delivery marks.

## Verification

- Ten regression tests pass, including forecast-only feed through the sender,
  HTTP failure/timeout retries, persisted restart suppression, negative/zero
  numbers, and rejection of stale or incomplete official releases.
- Real HTTP fetch and PDF extraction returned headline 1.3% MoM / 6.3% YoY,
  and core (excluding food and energy) 0.7% MoM / 5.0% YoY for September 2026.
- Python compile, duplicate checker, and Next.js production build passed.
- Locked scoring functions and `run_gap_once` are unchanged (AST comparison).
- Python suite: 39/41 passing. Existing failures reproduced on HEAD:
  `test_news_alert_threshold_selects_current_warning_bucket` (old test expects
  no 4H warning) and `test_telegram_snapshot_layout_keeps_all_context_readable`
  (old expected height 3816, current layout 4586).
- JS suite: 216/218 passing. Existing failures:
  `active application surfaces no longer advertise Guardian or Hermes`
  (existing Hermes route) and `Pine source contains the fixed personal scoring
  and Box contract` (declaration matching in the unchanged local Pine file).
  These tests and Pine source are unchanged by this fix.

Unrelated local snapshots, archives, and helper scripts must remain unstaged.
