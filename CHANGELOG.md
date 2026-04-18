# PANDA ENGINE — CHANGELOG

> Claude updates this at the end of every session.
> Most recent entries first. Keep only last 15 sessions.

---

## Apr 18, 2026 — Phase 3 Complete (Signal Agent v1)

**New file: `pages/api/signal-agent.js` (246 lines)**
- POST triggers full analysis → writes findings to `ai_memory`
- GET returns all signal agent memories
- Idempotent: clears previous agent memories before re-writing

**6 analysis functions (core validation sequence from BUILD_PLAN):**
1. `analyzeByStrategy` — overall BB and INTRA win rates
2. `analyzeGapLevels` — win rate at each gap level (5,6,7,8,9,10+) per strategy
3. `analyzeTBGConfirmation` — TBG confirmed vs unconfirmed edge per strategy
4. `analyzeGapPlusTBG` — combined gap + TBG confluence validation
5. `analyzePairs` — per-pair performance (sample ≥ 20 only)
6. `analyzeFlatRate` — FLAT % as signal quality indicator per gap level

**Both win rates computed per BUILD_PLAN:**
- `win_rate_resolved`: WIN / (WIN + LOSS) — excludes FLAT
- `win_rate_total`: WIN / (WIN + LOSS + FLAT) — includes FLAT
- Both stored in metadata for every memory

**Sample size enforcement:** MIN_SAMPLE = 20 (memories with fewer signals are skipped)
**Commit:** ba876ba

---

## Apr 18, 2026 — Phase 2 Complete (AI Memory Layer)

**ai_memory Supabase table created:**
- 9 columns: id, type, factor, pair, strategy, win_rate, sample_size, metadata, computed_at
- CHECK constraint on `type` — 5 valid enum values (signal_pattern, behavior, edge_analysis, market_theme, confluence_validation)
- 4 indexes: type, pair (partial), strategy (partial), computed_at DESC
- RLS enabled: service_role full access, authenticated read-only

**API route: `pages/api/ai-memory.js`**
- GET with filters: type, pair, strategy, limit (max 500)
- POST with validation: sample_size >= 20 enforced, metadata must be JSON object (no free text)
- DELETE by id for maintenance
- Uses shared Supabase client from `../../lib/supabase`

**Files changed:** pages/api/ai-memory.js (new, 71 lines)
**Supabase migration:** create_ai_memory_table
**Commit:** 4370860

---

## Apr 18, 2026 — Phase 1 Complete (Foundation Fixes)

**1A: ai-chat.js journal fix**
- Changed `trade_journal` → `manual_trades` with correct columns (`entry_time`, `exit_price`, `profit_loss_pips`, `strategy_name`)
- Review Trades button now pulls real 439 trades

**1B: Confidence + Momentum pipeline**
- Added `confidence` numeric column to `signal_results` (Supabase migration)
- Backfilled 326 existing records with gap-based approximation
- Added `compute_signal_confidence()` in app.py — server-side multi-factor score (gap 0-30 + TBG 0-20 + box 0-20 + momentum 0-10)
- `log_signal()` now writes both `momentum` and `confidence` at signal entry
- Threaded momentum + parsed data through `check_bb_entry` → `check_intra_entry` → `log_signal`

**1C: BB + INTRA strategy logic**
- BB entry: verified correct — no TBG required, concurrent check already in place via `has_pending_signal`
- INTRA entry window: expanded from 3AM UAE ±30min to 2AM–4AM UAE (22:00–23:59 UTC)
- INTRA gap threshold: 8 → 9
- INTRA exit: 6-hour from entry → 10AM UAE hard close (06:00 UTC)

**1D: cTrader API test endpoint**
- Added `/test-ctrader` route — tests token refresh, measures REST API latency
- Returns: status, token_valid, refresh_latency_ms
- Note: spot price capture needs protobuf WebSocket (Phase 7)

**Files changed:** pages/api/ai-chat.js, app.py (9 edits)
**Supabase migration:** add_confidence_to_signal_results
**Commits:** d941160 (dashboard), app.py changes need uvicorn restart
**app.py now:** ~1640 lines (was 1527)

---

## Apr 18, 2026 — Panda AI Tab + Analytics Filters
- **NEW: Panda AI tab** — AI-powered market analysis chatbot
  - Three modes: Analyze Market (rank pairs), Review Trades (journal vs signals), Free Chat
  - Guardrails: never reveals scoring logic, thresholds, or system internals
  - Uses GPT-4o-mini via OpenAI API (key via Vercel env var `OPENAI_API_KEY`)
  - Feeds all 21 pairs' live data as context for every request
  - Review mode cross-references `signal_results` + `trade_journal` (30-day window)
  - Chat history maintained in-session (last 6 messages as context)
- **NEW files**: `lib/openai.js`, `pages/api/ai-chat.js`
- **Analytics tab**: removed 30-day limit, added pair + date filters, raised limit to 2000
- Files changed: `dashboard.js`, `signal-analytics.js`, `lib/openai.js`, `pages/api/ai-chat.js`
- Commit: `dee3ae6`

## Apr 18, 2026 — Analytics Tab: All-Time Data + Filters
- Removed hardcoded 30-day window from `signal-analytics.js` — now fetches all-time by default
- Added pair filter dropdown (ALL_PAIRS) to SignalAnalytics component
- Added date range filters (from/to) with clear button
- Raised API limit from 500 to 2000 rows
- API accepts `symbol`, `from`, `to` query params
- Files changed: `pages/api/signal-analytics.js`, `pages/dashboard.js`
- Commit: `fff930f`

## Apr 18, 2026 — Merge Calendar + COT into Research Tab
- Merged CALENDAR and COT REPORT tabs into single RESEARCH tab with subtab toggle (Calendar | COT)
- Created `ResearchTab` component with inline subtab state
- Updated TABS array: 13 tabs → 12 tabs (removed CALENDAR + COT REPORT, added RESEARCH)
- Updated TAB_FEATURE mapping: merged both keys into `'RESEARCH': 'calendar'`
- Updated COT fetch trigger to fire on RESEARCH tab
- Removed inline COT REPORT render block from ternary chain
- Files affected: `dashboard.js` (2459 lines, was 2447)
- Build: ✅ passed | Dupes: ✅ none

## Apr 6, 2026 — Chart Tab Fix + Skill + Project Setup
- Fixed ChartTab crash: `React.useState` → `useState` (lines 1438-1439)
- Improved TradingView iframe sandbox (`allow-popups allow-popups-to-escape-sandbox`)
- Built complete `SKILL.md` (327 lines) with file map, component index, playbooks
- Created Claude Project "Panda Engine" with full instructions
- Uploaded SKILL.md as project knowledge
- Created this CHANGELOG.md
- Commit: `b772f93`
- dashboard.js: 2052 lines (unchanged)

## Apr 5, 2026 — Chart Tab + PairCardModal Cleanup
- Restored clean PairCardModal (removed tabs/chart inside modal)
- Added standalone CHART tab: pair selector, TF switcher (M15/H1/H4/D1), TradingView iframe 600px, Dubai timezone
- Commit: `60a64c4`
- dashboard.js: 2052 lines

## Apr 2, 2026 — TBG + Signals + Access Control (Major Build)
- TBG integration: SuperTrend + FollowLine badge on pair cards
- Built `TBG_MultiExporter` cBot for cTrader
- Built SIGNALS tab (clean BUY/SELL labels)
- Per-user tab access control (`feature_access` TEXT[] column)
- 5-minute scheduler in app.py
- Created `PANDA_ENGINE.bat` and `PUSH.bat` scripts
- Supabase RLS fixes across all 19 tables
- Vercel URL renamed to `panda-dashboard.vercel.app`
- Created 7-page PDF user guide

---

## PENDING / NEXT UP
- Phase 4: Journal Agent (manual_trades 439 trades → writes to ai_memory)
- Phase 5: Master Agent reads ai_memory as context for OpenAI calls
- Phase 6: Pattern Agent (cross-reference Signal Agent + Journal Agent findings)
- VPS migration (Hyonix HS-2, $12/mo — decision made, not yet purchased)
- Landing/funnel pages (Free/Pro/Elite tiers)
- PWA publishing
