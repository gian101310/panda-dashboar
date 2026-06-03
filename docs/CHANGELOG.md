# PANDA ENGINE — CHANGELOG

> Claude updates this at the end of every session. Most recent entries first. Keep only last 15 sessions.

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
