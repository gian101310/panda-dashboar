# Claude Windows Handoff — 2026-07-31

> Written from the Windows Cowork session (Boss-G). Read this first if you're on
> the Mac and just pulled. It supersedes the divergence notes in the older
> 2026-07-17 handoff and in `CLAUDE.md`'s VERIFIED STATE.

## TL;DR — the big change: the divergence is RESOLVED

- The old note "the `C:\...\Documents\Claude\Projects\Panda Engine` clone is DIVERGED,
  pushes come from `C:\Users\Admin\panda-dashboard`" is **no longer true**.
- On 2026-07-31 we reconciled: committed the Windows engine folder's uncommitted
  work, merged `origin/main` (128 commits) into it, resolved conflicts, and pushed.
- **`C:\Users\Admin\Documents\Claude\Projects\Panda Engine` is now the canonical,
  up-to-date repo AND the machine that runs the live engine.** It is on `origin/main`.
- The `C:\Users\Admin\panda-dashboard` clone is now the *secondary* and is BEHIND
  until it pulls. Pushes now come from the engine folder.
- Safety net kept on the Windows box: `panda-engine-backup-20260731.tar.gz`
  (full pre-reconcile snapshot) and branch `pre-merge-backup-20260731`.

## Conflict resolutions during the merge (so you know the rules used)

- `app.py` → kept the **running engine's** version (Windows is authoritative for the engine).
- `WATCH_PANDA.bat` → kept Windows' version (better process/port detection).
- `.gitignore` → unioned both sides.
- `panda-engine-skill/SKILL.md` → took origin's (newer project doc).
- `tools/autonomous-loop.mjs` → honored origin's deletion (retired autonomous agent).

## Commits this session (latest first)

- `9cb914e` news alerts hourly within 4h (+15m/2m) and Overview banner shows next high-impact within 48h
- `fde7f13` engine skips auto-heal restart when market closed; watchdog restarts hidden window
- `67baf21` fix: signal_snapshots insert uses column allowlist so Signal Log populates
- `31b126d` merge/reconcile (origin/main + Windows engine work)
- `8caed58` windows engine snapshot (app.py FLIP/BOS alerts, engine tools, indicator backups)
- `775876f` (pre-existing) BOS-enabled MT4 exporter + FLIP/BOS handoff doc

## Feature changes shipped

1. **FLIP + BOS Telegram alerts** (`app.py`). `parse_pl_file` now reads `TBG_BOS` /
   `TBG_BOS_T`; new `check_structure_alerts()` + `_send_structure_alert()` send on the
   **signal bot** (`SIGNAL_BOT_TOKEN`/`SIGNAL_CHAT_ID`). Module state `PREV_ZONE` /
   `LAST_BOS_T` seed silently on boot (no restart burst). FLIP = TBG_ZONE crossing
   ABOVE<->BELOW; BOS = new H1 break deduped on break-bar time.
2. **Signal Log fix** (`app.py`). The `signal_snapshots` insert was sending columns the
   table doesn't have (`pl_st/pl_fl/pl_price`, price-context) so every insert 400'd and
   the table stayed empty. Now uses a **column allowlist** (`_SNAPSHOT_COLS`). Verified:
   21 rows/cycle landing again. Signal Log tab populates.
3. **Auto-heal guard** (`app.py`). AUTO-HEAL `sys.exit` now runs only when
   `not is_market_closed()`. Stops the weekend restart storm (stale files are expected
   when the market is shut).
4. **News alerts hourly** (`app.py`). `NEWS_ALERT_THRESHOLDS` = 2M/15M/1H/2H/3H/4H →
   alerts at 4h, 3h, 2h, 1h before each HIGH-impact event, plus the 15m and 2m warnings.
5. **Overview news banner look-ahead** (`lib/newsCalendar.mjs`,
   `pages/api/upcoming-news.js`, `pages/dashboard.js`). New
   `normalizeUpcomingHighImpact(..., {hoursAhead:48})` → `/api/upcoming-news` now returns
   `banner_events` (next 48h). `OvNewsBanner` uses `banner_events` (falls back to `events`).
   `affected_pairs` and PairCard flags stay **today-only** (no over-flagging).
6. **MT4 exporter merge** (Windows only, NOT in repo yet). Built
   `Panda_Exporter_v2_BOS.mq4` in the MT4 Experts folder = the running **v2** exporter
   (keeps `PDO/PDC/PRH/PRL/DAYO/DAYH/DAYL/ADR/H1R6`) **plus** BOS (`CalcBos`, `TBG_BOS`,
   `TBG_BOS_T`, `SwingLength`, `BOS_ScanBars`). ⚠️ The repo's `Panda_Exporter_BOS.mq4`
   (from `775876f`) was built on the OLD v1 base and is **missing the v2 price-context
   fields** — do NOT ship that one. If we commit an exporter, commit the v2_BOS merge.

## Windows ops changes (why there's no engine terminal anymore)

- The engine now runs **hidden**. The two 5-minute scheduled tasks (`Panda Engine
  Watchdog`, `PandaAutoPull`) were flashing a console every 5 min; they're now set to
  **S4U** (run whether logged on or not = no window). `WATCH_PANDA.bat` relaunches the
  engine with `-WindowStyle Hidden`.
- To restart the engine (e.g., after an `app.py` change): run **`RESTART_ENGINE.bat`**
  (or `RESTART_ENGINE.ps1`). It kills the engine + supervisor and relaunches
  `START_PANDA.bat` hidden, then confirms `/status`. Never start `app.py` directly.
- Helper scripts on the box: `FIX_TERMINAL_POPUPS.bat` (re-apply the S4U task fix if
  needed), `RESTART_ENGINE.*`.

## Pending / next steps

1. **Compile + attach `Panda_Exporter_v2_BOS.mq4`** in MetaEditor (F7), swap it onto the
   chart in place of `Panda_Exporter_v2`. Until then the `tbg_*.txt` files have no
   `TBG_BOS` lines, so **BOS alerts stay quiet** (FLIP alerts already work). Then verify
   `tbg_EURUSD.txt` shows `TBG_BOS` + `TBG_BOS_T` and still shows `PDO/DAYO/ADR/H1R6`.
2. Decide whether to **commit `Panda_Exporter_v2_BOS.mq4`** into the repo (currently only
   in the Experts folder) and retire the v1-based `Panda_Exporter_BOS.mq4`.
3. Decide what to do with the now-redundant `panda-dashboard` clone (pull it up to date, or
   retire it — the engine folder is canonical now).
4. Indicator-release priorities from the 2026-07-17 handoff are UNCHANGED by this session
   (device licensing OFF→SHADOW→ENFORCED, Licensed public download replacement, MT5 feed EA).

## Locked / unchanged (still true)

- Never edit `extract_panda_score()` / `compute_scores_all_pairs()` or the BB/INTRA
  strategy definitions.
- Scoring logic, Supabase RLS posture, and the 2026-07-17 indicator state are unchanged
  except where noted above.
