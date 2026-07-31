# Mac Handoff — 2026-07-31

> Written from the Mac Cowork session (Boss-G). Read this first if you're on Windows
> and just pulled. Latest-date-first; this is the newest Mac->Windows handoff.

## TL;DR

- Pulled `origin/main` on the Mac to reconcile with the Windows 2026-07-31 session
  (Mac was 18 commits behind; now equal to `origin/main`).
- Added a formal **two-machine sync workflow** to `CLAUDE.md` so both sides always
  pull first, read the newest handoff, and write a handoff after every change.
- No engine (`app.py`), dashboard, or API logic changed this session — docs only.

## Commits this session

- (this commit) `docs: add two-machine sync workflow to CLAUDE.md + Mac handoff`

## Changes

1. **`CLAUDE.md`** — new subsection "Two-machine sync workflow (Mac <-> Windows) — ALWAYS
   FOLLOW" under WORKING FROM MAC VS WINDOWS. Codifies:
   - start of session: `git pull --ff-only origin main` + read newest handoff first;
   - after Mac changes: write `docs/MAC_HANDOFF_<date>.md`, commit, push;
   - after Windows changes: write `docs/CLAUDE_WINDOWS_HANDOFF_<date>.md`, commit, push;
   - handoffs are latest-date-first, never deleted, never force-push.

## Pending / next steps (unchanged from Windows 2026-07-31 handoff)

1. Compile + attach `Panda_Exporter_v2_BOS.mq4` in MetaEditor (F7); until then BOS alerts
   stay quiet (FLIP alerts already work).
2. Retire the v1-based `Panda_Exporter_BOS.mq4` (already marked SUPERSEDED).
3. Decide whether to retire the now-behind `C:\Users\Admin\panda-dashboard` clone (the
   engine folder is canonical).

## Locked / unchanged

- No scoring, engine, or RLS changes. `extract_panda_score()` / `compute_scores_all_pairs()`
  and BB/INTRA definitions untouched.
- A pre-pull Mac stash exists locally (`stash@{0}: mac-local-before-pull-2026-07-31`) holding
  a deleted `.mq4` + two untracked indicator files — Mac-local only, not pushed.
