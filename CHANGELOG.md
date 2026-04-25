# PANDA ENGINE — CHANGELOG

> Claude updates this at the end of every session. Most recent entries first. Keep only last 15 sessions.

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
