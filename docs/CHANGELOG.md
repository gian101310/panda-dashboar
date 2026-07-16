# PANDA ENGINE — CHANGELOG

> Claude updates this at the end of every session. Most recent entries first. Keep only last 15 sessions.

---

## Jul 16, 2026 — Retired Hermes/Guardian + Supabase hardening + EA idempotency

- Removed the unused Hermes feed, learning table/RPCs, and active handoff documents.
- Removed the unused Guardian pages, snapshot APIs/agent, local command/watchdog routes, autonomous-loop launcher, and Guardian database tables. The reusable execution risk gates remain because live order tools depend on them.
- Enabled RLS on `pf_waitlist` and `shadow_tracker`; revoked `anon`/`authenticated` access to internal engine/signal/config tables; removed permissive public write policies; restricted remaining `SECURITY DEFINER` RPCs to `service_role` and pinned their search paths.
- Changed `/api/ea-result` from check-then-insert to a single atomic upsert on `ticket`, eliminating retry races and duplicate-key error churn.
- Added source regression tests for removed systems, security migration coverage, EA idempotency, and corrected the stale missing-SL hedge expectation.

---

## Jul 9, 2026 — Snapshot v9 (XTF line) + engine consolidation

- **Telegram snapshot v9**: EXTREME TF line on every pair card ("XTF GBP D1+5 H4+5 | JPY H1-5" / "XTF NONE"); row_h 300→370. Test message sent + verified.
- **Engine consolidation**: LIVE engine confirmed = `Projects\Panda Engine\app.py` (watchdog task → WATCH_PANDA.bat → START_PANDA.bat, imports app.py from CWD). Stale Desktop\ctrader_trend_scanner\app.py archived (archive\app_OLD_replaced_by_PandaEngine_folder_20260709.py); Desktop launcher bats (panda bats\START_PANDA, start_engine, PandaEngine_startup) now delegate to the live starter — no more restart-race regression risk.
- Also fixed in the old copy pre-discovery (harmless, kept in archive): font full-path loading.
- NOTE: earlier "Extreme TF badge fix" engine changes were applied to the archived copy; the live copy already had derive_score_tf — dashboard badge fixes (commit 3263af1) unaffected and correct.

---

## Jul 9, 2026 — Phase 8 follow-ups: tracker debounce + velocity capture

- Migration: `signal_tracker.gap_delta_at_open numeric` (signed dashboard.delta_short at open)
- signal-tracker.js: (1) captures gap_delta_at_open on every new tracker; (2) REOPEN_DEBOUNCE_MIN=60 — skips re-open of same symbol+strategy within 60 min of a PL_FLIPPED close (kills the 30–77×/day flicker); debounce is best-effort, non-blocking on query error
- signal-agent-v2.js: `v2_velocity` analysis (ACCEL/FLAT/DECEL, toward-signal threshold ±0.5) auto-activates at n≥20 rows with gap_delta_at_open; emits v2_velocity_note with live count until then
- All tracker logic is API-side — engine app.py untouched

---

## Jul 9, 2026 — PHASE 8 COMPLETE: Signal Agent v2 on tracker data

- NEW `/api/signal-agent-v2.js` — lifecycle analysis on 11,253 closed signal_tracker rows; 8 factors (`v2_gap_sustain`, `v2_close_reason`, `v2_pdr_longevity`, `v2_session_longevity`, `v2_box_longevity`, `v2_survivors`, `v2_churn`, `v2_velocity_note`); idempotent delete+insert; wired into run-all-agents (4th agent)
- ai_memory type CHECK extended with `tracker_lifecycle` (migration); 35 memories seeded via SQL (route re-run replaces)
- ai-chat fetchMemoryContext: new SIGNAL LIFECYCLE section + med-life/6h-survival fields
- KEY FINDINGS: BB median life 5 min at ALL gap levels, 2.9% survive 6h; PL_FLIPPED kills 68%; PDR/session/box = no longevity edge; INTRA (TBG-gated) 55% survive 6h; BB churn 30–77 re-opens/symbol/day = tracker flicker. Full answers in AI_BUILD_PLAN_UPDATED.md Phase 8.
- Q6 velocity: unanswerable (snapshots purged, hourly too coarse) — needs gap_delta_at_open column
- cTrader price capture: price_confirmed=0 on ALL 11k rows — Boss-G confirms API freezes; future price capture must not block on it

---

## Jul 9, 2026 — Extreme TF badge fix (dashboard + engine)

**Root cause:** live engine (Desktop ctrader_trend_scanner/app.py) never had `derive_score_tf` — dashboard.base_score_tf/quote_score_tf were stale leftovers, so EXTREME TF badges appeared inconsistently.

**Engine (auto-reload picked it up; frozen uvicorn killed + watchdog restarted, PID cycle verified):**
- Ported `derive_score_tf()` (before `_build_currency_line`); added `base_score_tf`/`quote_score_tf` to both dashboard payloads (valid + hard_invalid). signal_snapshots inherits via `dict(row)`.

**Dashboard (commit 3263af1):**
- ScoreTfBadge: new `showEmpty` prop → renders dim "NONE" (with tooltip) when a valid pair has no extreme TF, instead of vanishing; also fixed dangling-label case when tokens are legacy-format
- PairCardModal (PANELS expanded): badge added under Box Confirm/Matchup row
- OvSignalCard (OVERVIEW): badge now on ALL tiers (compact, no label on LOW), was hidden on LOW
- SignalLogTab (LOGS/snapshots): new EXTREME TF column

**Ops note:** engine loop had frozen at 20:50 UTC with port 8000 still LISTENING — watchdog only checks the port, so it never restarted. Consider a data-freshness watchdog (restart if dashboard.updated_at > 15 min old).

**Mac dev environment (session from Dubai, away from home):**
- Repo had diverged from force-pushed remote — backed up local to `backup-mac-2026-07-08`, hard-reset to origin/main a2528c2
- Regenerated node_modules + lockfile (fixed "Failed to patch lockfile" build error); added SUPABASE_ANON_KEY to .env.local (lib/supabase.js is env-based now)
- GitHub CLI installed + authenticated (gian101310) — push works from Mac

**Tooling (pushed b85a34d → 04914de + this session):**
- check_dupes.py: cross-platform path fix (re-applied — force-push had reverted it)
- NEW `map_code.py`: instant component→line index; run before any big-file edit (dashboard.js = 4,199 lines / ~90 components)
- NEW auto-pull sync: Mac cron active; Windows autopull.bat + SETUP_AUTOPULL.md ready (one-time schtasks registration needed on home PC)
- panda-engine-skill/SKILL.md fully regenerated: fresh component index (exact @ Jul 8), verified Supabase counts (tracker 11,249 / results 4,434 / ai_memory 111 / users 8; signal_snapshots purged to 0, gap_history trimmed ~25k), 14-tab structure, current API route list, token-saving workflow. Needs skill re-upload in Claude settings.
- CLAUDE.md: current-state refresh + token-saving workflow section

---

## Jul 4, 2026 — Trend Phase Indicator + Shadow Tracker

**Data analysis session:** full factor analysis of 4,170 BB signals — edge concentrates at |gap|≥9 (peak-gap ≥9 trades: +3,566 net pips; <9: −1,696), TBG-aligned + LONDON positive, NEW_YORK negative, FADING momentum negative. April profitable, May–Jul negative (regime-dependent).

**Dashboard (dashboard.js):**
- New `computePhase()` + `PhaseBadge` — PHASE line on every PairCard and PairCardModal: START—CATCHING / MID—RIDING / PULLBACK ZONE / LATE—DON'T CHASE / EXTENDED / TREND AT RISK, derived from state + momentum + delta_mid + gap. View-only; no locked formulas touched.
- Continuation checklist chips on cards: BIAS / PDR / ASIAN, with ★ CONTINUATION SETUP when all conditions met (Boss-G's continuation play: valid bias + strong aligned PDR + Asian session).

**Engine (app.py, local — not in this repo):**
- Shadow tracker added: logs |gap| tier crossings (9/10/11/12) to new `shadow_tracker` Supabase table independently of BB's concurrent-position rule. Write-only research logger, BB-style exits, DB unique index prevents dupes. Locked scoring untouched.

**Supabase:** new `shadow_tracker` table (migration `create_shadow_tracker`).

**Live price context (v2 exporter, same session):**
- New `Panda_Exporter_v2.mq4` (compiled clean, 0 errors) — adds PDO/PDC, DAYO/DAYH/DAYL, ADR(14), H1R6 lines to tbg files. v1 exporter remains as rollback.
- app.py: `compute_price_context()` — live PDR (broker candles), ADR-used %, pullback depth %, consolidation flag → dashboard table (6 new columns, migration `dashboard_price_context_v2`).
- dashboard.js: phase now price-confirmed — LATE—ADR SPENT override (≥70% ADR used), CONSOLIDATING phase (H1R6 < 25% ADR), live PDR preferred over Twelve Data (LIVE tag), ADR/PB metrics line on cards.
- Telegram snapshot: PDR column added per pair row (▲/▼ strength S/w).

---

## Jun 14, 2026 — Full Repository Audit

**Audit performed by Claude (Cowork). Zero application code modified.**

**Documentation updates (authorized, completed):**
- `PANDA_ENGINE_OVERVIEW.md` — corrected app.py line count (~2234+), dashboard.js line count (~3356), table count (31), signal_results and signal_tracker record counts
- `AGENTS.md` — added audit warning note about package-lock.json gitignore contradiction and missing ignoreCommand in vercel.json
- `PROJECT_AUDIT_REPORT.md` — created (full 15-section audit report)

**Security findings requiring Boss-G approval:**
- CRITICAL: Telegram Bot Token hardcoded in 5 source files (lib/loginAlert.mjs, telegram-webhook.js, pf-signup.js, pf-log-event.js, admin/pf-approve.js) — token must be rotated and moved to env vars
- HIGH: `ignoreCommand` is absent from `vercel.json` despite CHANGELOG claiming it was added May 28 — cross-deploy risk is fully restored
- HIGH: 4 API routes lack authentication (signal-agent.js, journal-agent.js, pattern-agent.js, run-all-agents.js)
- HIGH: package-lock.json is in .gitignore — contradicts AGENTS.md rule, prevents npm audit

**All fixes documented in PROJECT_AUDIT_REPORT.md, Section 13 (Prioritized Action Plan). No fixes applied yet.**

---

## Jun 10, 2026 - Engine Launcher Watchdog Hardening

**Engine restart reliability**
- `START_PANDA.bat` now auto-restarts the engine after unexpected uvicorn exits
- Added `WATCH_PANDA.bat` health check wrapper that starts only through `START_PANDA.bat`
- Registered local Windows watchdog task every 5 minutes and added a user Startup-folder logon check
- Removed wrong local `run_engine.bat` launcher that bypassed the canonical `py -3.11 -m uvicorn` command

---

## Jun 10, 2026 - High-Impact News Banner + Signal Telegram Warnings

**Overview news banner**
- Added same-day Dubai high-impact news normalization for `/api/upcoming-news`
- Overview tab now shows the next high-impact event with Dubai time, live countdown, and affected pairs to watch
- Existing pair news badges now use the same normalized affected-pair list

**Signal Telegram news warnings**
- Engine news alerts now target the signal Telegram channel
- Added per-event warning buckets for 3h, 1h, 15m, and 2m before high-impact events
- News checks run every minute while gap scoring stays on the existing 5-minute cycle

---

## May 28, 2026 — Cross-Deploy Fix, Deploy Guardrail, Multi-Agent Hardening, Hermes DB Integration

**Cross-repo deploy incident & fix**
- Codex deployed `assistant-server` to `panda-dashboard` Vercel project, silently overwriting ALL AGENTS tab + page visibility controls
- Fixed by redeploying from correct repo (`panda-dashboar`)

**Deploy guardrail (vercel.json)**
- Added `ignoreCommand` that blocks any deploy not from `panda-dashboar` repo
- Prevents future cross-repo overwrites automatically

**AGENTS.md — Codex handoff instructions**
- 220-line locked rules file pushed to repo root
- Covers: repo→Vercel mapping, critical files never-delete, locked code, mandatory workflow, conflict resolution between Claude and Codex, emergency recovery

**Supabase RLS hardening**
- Enabled RLS on `ea_executions`, `engine_heartbeat`, `hermes_learnings`
- Added `service_role_full_access` policy on all 3 tables
- Revoked direct table access from `public` role

**Hermes DB integration**
- Created `hermes_ro` role (least-privilege, login-enabled)
- Created 4 SECURITY DEFINER functions: `get_engine_heartbeat()`, `get_ea_executions()`, `get_hermes_learnings()`, `insert_hermes_learning(...)`
- Granted EXECUTE to hermes_ro on all 4 functions
- Connection string stored in `C:\Users\Admin\AppData\Local\hermes\secrets\supabase_readonly.key` (permissions locked)
- All 4 functions verified working with live data
- HERMES_HANDOFF.md created with actual schemas and hard rules

---

## Apr 25, 2026 — PDR Tracking (commit e603ef1)

**New: pdr_cache Supabase table**

- Per-symbol rows: symbol (PK), pdr_strength, pdr_strong, pdr_direction, retracement, computed_at
- RLS: service_role only

**pdr.js — cache rewritten**

- Old: single row id=1 with jsonb blob (broken schema mismatch)
- New: per-symbol upsert on conflict(symbol) — each pair tracked individually
- Cache read: checks if 20+ symbols exist and age &lt; 15min
- Cache write: upserts all symbols after fresh Twelve Data fetch

**signal-tracker.js — PDR at open**

- openNewTrackers() now fetches pdr_cache for candidate symbols before inserting
- pdrMap built from cache, non-blocking (fails silently if cache empty)
- pdr_strength_at_open + pdr_strong_at_open stored on every new tracker
- Future: PDR strategy filter reads these columns for analysis

**signal_results + signal_tracker schema**

- signal_results: pdr_strength, pdr_strong, pdr_direction columns added (nullable — for future PDR strategy)
- signal_tracker: pdr_strength_at_open, pdr_strong_at_open columns added (populated from pdr_cache)
- Index: idx_signal_results_pdr on pdr_strong

---

## Apr 25, 2026 — Logging Patch (commit 8f96077)

**Supabase migrations**

- `signal_results`: added `session` text column + index (ASIAN/LONDON/NEW_YORK)
- `signal_snapshots`: added `gap_delta` numeric column (rate of change from previous cycle)
[**app.py**](http://app.py)

- `get_session()` helper — ASIAN 22:00-05:59 UTC, LONDON 06:00-13:59, NEW_YORK 14:00-21:59
- `log_signal()`: now writes `session` on every signal entry
- Main loop: `gap_deltas = {}` tracks per-symbol gap velocity each cycle
- `gap_deltas[symbol]` computed before PREV_GAP update (captures true delta)
- Snapshot insert: `snap["gap_delta"]` injected from gap_deltas map

**signal-tracker.js**

- `sessionFromHour()` rewritten — TOKYO→ASIAN, OVERLAP→NEW_YORK, OFF_HOURS→ASIAN
- Session labels now consistent with ai_memory / Journal Agent (ASIAN/LONDON/NEW_YORK)

**Engine restart required** — [app.py](http://app.py) changes are not live until engine is restarted via START_PANDA.bat

---

## Apr 25, 2026 — AI Brain System (commit aed6023)

**New: admin_brain Supabase table**

- Columns: id, category (preference/coaching/pattern/rule/question), key (UNIQUE), value, updated_at
- Seeded with 10 brain memories: alpha pairs, leak pairs, optimal hold, sessions, BB/INTRA rules, London warning, execution gap
- RLS: service_role only
**New: /api/admin-brain.js**

- GET: fetch all brain records
- POST: upsert by key (auto-stores new memories)
- DELETE: remove by key
- Admin-only (validateSession + role check)

**Rebuilt: /api/ai-chat.js (full rewrite)**

- USER_PROMPT: narrator only — describes data, never recommends. Permanent disclaimer on every response.
- ADMIN_PROMPT: unrestricted coach — full engine knowledge + brain injection + no guardrails
- ENGINE_KNOWLEDGE: complete engine internals constant (\~80 lines)
- fetchBrainContext(): queries admin_brain, formats into prompt sections by category
- detectRemember(): regex patterns for "remember that/this", "don't forget", "keep in mind", "note that"
- classifyBrainEntry(): auto-categorizes remembered content into preference/rule/pattern/coaching
- Admin chat: auto-stores to admin_brain when "remember" keyword detected
- Admin: max_tokens=2000, temperature=0.5. User: max_tokens=1200, temperature=0.3
- History: last 8 turns for admin (was 6)

**Product decisions locked tonight:**

- AI is narrator for users (legal protection — not financial advice)
- AI is unrestricted coach for admin only
- Phase 2 upgrade path: once data sufficient + legal structure → expand coaching to Pro/Elite
- Rule: "If AI output could be screenshot as financial advice — rewrite it"

---

## Apr 25, 2026 — Part A Complete (1 commit)

**Bug Fix: Duplicate EDGE block removed from PairCard**

- `getEdgeMemory()` was rendering twice — once correctly after CONF section (with tooltip), once as duplicate after state dot (no tooltip)
- Removed the duplicate — EDGE now shows once, correctly, with full tooltip and dual win rate
- Items 5 + 6 confirmed fully implemented from Apr 24 session
- Part A (all 9 items) 100% complete ✅
- Commit: 60d9398

---
## Apr 25, 2026 — Full System Audit + Security Hardening + AI Refinements (17 commits)

**Phase 1 — Data Integrity**

- signal-tracker.js: `isValidSignal()` TBG gate removed for BB (bc66567)
- [app.py](http://app.py): `is_valid` snapshot flag corrected for BB (90ddbac)

**Phase 2 — Security**

- lib/auth.js: `expires_at` enforced in `validateSession()` (e50bc49)
- logout.js: DB session revoked on logout (e50bc49)
- ai-chat.js: Auth gate + `isAdmin` from session cookie, not body (e50bc49)
- ai-memory.js: `validateSession` on POST/DELETE (e50bc49)
- telegram-webhook.js: `TG_WEBHOOK_SECRET` header validation (e50bc49)
- pattern-agent.js: `strategy: 'BB'` on alpha/leak/overtraded memories + error guard (ae3a1c5, c441c5a)
- [app.py](http://app.py): CORS add pandaengine.app, fix login alert URL, PREV_GAP pre-load on restart (737efb2)

**Phase 3 — Security (S1+S2)**

- lib/supabase.js: service_role key moved to `SUPABASE_SERVICE_KEY` env var (af2ca7b)
- Auth gates added: data.js, signal-analytics.js, signal-log.js, strength-history.js, pdr.js, signal-tracker.js (af2ca7b)
- signal-tracker POST: dual auth (session cookie OR `ENGINE_SECRET` header) (af2ca7b)
- [app.py](http://app.py): `ENGINE_SECRET` header sent with tracker POST (41d6387)

**Feature Gating**

- pf-approve.js: Tier feature keys aligned with TAB_FEATURE, `panda_ai` added to Pro+Elite (82e5ee1)
- admin/index.js: PANDA AI + SIGNAL LOG toggles in admin panel (397264a)

**AI Memory Cleanup**

- Deleted 24 orphaned behavior + pattern memories (manual_trades source data deleted)
- ai_memory: 47 → 23 (22 signal + 1 tbg_discipline), all traceable to live engine data

**F1 — PDR Supabase Cache (2f6e11a)**

- `pdr_cache` table (single-row, 15-min TTL)
- Cache-first: check Supabase → return cached if &lt;15 min → else fetch Twelve Data → write cache
- Prevents quota burn under concurrent users

**A5 — Confidence + Historical Merge (2f6e11a)**

- `computeConfidence()` now accepts `memoryIndex`, returns `historical` + `conflict`
- CONFLICT flag: fires when confidence ≥70 but proven historical win rate ≤50%
- Conflict badge renders inline with confidence on PairCard

**Env vars added to Vercel:** SUPABASE_SERVICE_KEY, ENGINE_SECRET, TG_WEBHOOK_SECRET **Telegram webhook re-registered** with secret_token

---

## Apr 24, 2026 — Major Build Session (AI Refinements + PDR + Engine Hardening)

See CHANGELOG archive for full details of 10-commit session.

---

## PENDING / NEXT UP

- Phase 8: Signal Agent v2 on tracker data (needs 30+ days — earliest May 20, 2026)
- NowPayments USDT integration (monetization)
- VPS migration (Hyonix HS-2)
- Landing pages, PWA
- Per-user AI analysis (Part C — Pro/Elite feature)
