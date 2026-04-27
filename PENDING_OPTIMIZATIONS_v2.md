# PANDA ENGINE — PENDING OPTIMIZATIONS & ROADMAP

# Updated: April 25, 2026

---

## PART A — AI SYSTEM REFINEMENTS

## ✅ ALL COMPLETE (Apr 24–25, 2026)

 1. Dual win rate display ✅
 2. Maturity filtering (proven ≥50 / developing 20-49) ✅
 3. Sample size display (n=XX) ✅
 4. Computed timestamp in AI context ✅
 5. Confidence + historical merge ✅ (conflict flag live)
 6. Edge flag function (PROVEN_EDGE / DEAD_ZONE) ✅
 7. Memory index optimization (useMemo hashmap) ✅
 8. Stale agent warning (Telegram) ✅
 9. Agent run summary logging ✅
10. Duplicate EDGE block in PairCard removed ✅

---

## PART B — MARKET ON/OFF TOGGLE

## ✅ COMPLETE (Apr 24, 2026)

- Engine: skips run_gap_once() during weekend close
- Dashboard: green LIVE / red CLOSED indicator
- isMarketOpen() function live

---

## PART C — PER-USER AI ANALYSIS (Pro/Elite)

## STATUS: QUEUED — NOT YET BUILT

Add user_id (uuid, nullable) to ai_memory:

- NULL = global/engine findings (shared)
- user_id = personal findings (per-user)

Journal Agent + Pattern Agent accept user_id parameter. Master Agent merges global + personal memories. "Analyze My Trades" button for Pro/Elite users. RLS: users only see user_id=NULL or user_id=self.

Effort: MEDIUM (1–2 sessions) Prerequisites: pf_approved/pf_tier live ✅, manual_trades has user_id ✅

---

## PART D — ADMIN BRAIN SYSTEM

## ✅ COMPLETE (Apr 25, 2026)

- admin_brain Supabase table (18 records seeded)
- /api/admin-brain.js (GET/POST/DELETE)
- ai-chat.js rebuilt: USER_PROMPT (narrator) + ADMIN_PROMPT (coach)
- fetchBrainContext() + detectRemember() + classifyBrainEntry()
- Auto-stores when admin says "remember that/this"

---

## PART E — LOGGING COMPLETENESS

## ✅ COMPLETE (Apr 25, 2026)

All signals now log at entry time:

- session (ASIAN/LONDON/NEW_YORK)
- box_h1_trend + box_h4_trend
- pdr_strength + pdr_strong + pdr_direction

All trackers log at open:

- session_at_open
- box_h1_at_open + box_h4_at_open
- pdr_strength_at_open + pdr_strong_at_open

All snapshots log:

- gap_delta (velocity from previous cycle)

---

## PART F — NEWS ALERT SYSTEM

## ✅ COMPLETE (Apr 25, 2026)

- check_news_alerts() in [app.py](http://app.py) — every 5-min cycle
- /api/upcoming-news.js — HIGH impact events in next 60 min
- Dashboard: header banner + PairCard badges
- Source: ForexFactory JSON feed (same as calendar tab)
- Deduplication: NEWS_ALERTED set per engine session

---

## PART G — PDR TRACKING

## ✅ COMPLETE (Apr 25, 2026)

- pdr_cache table (per-symbol, symbol PK)
- pdr.js rewrites cache correctly (10s batch delay for rate limits)
- signal_tracker stores PDR at open
- signal_results has PDR columns (nullable — for future strategy)

---

## PART H — TELEGRAM AI SNAPSHOT

## ✅ COMPLETE (Apr 25, 2026)

- send_ai_snapshot() in [app.py](http://app.py) — runs hourly
- Calls OpenAI GPT-4o-mini with current market data
- Sends 3-4 line narration to Telegram group
- Narrator mode: no recommendations, includes disclaimer

---

## FUTURE ITEMS QUEUED

### PDR Strategy Filter

When sufficient data (est. Aug 2026+):

- Analyze pdr_strong_at_open correlation with signal outcomes
- If statistically significant → add as strategy filter option

### Kage Voice AI

- Picovoice Porcupine wake word "Kage"
- Whisper API speech-to-text
- ElevenLabs TTS voice response
- Always-on, no button needed
- \~$25/month to run
- **Build when**: payment infrastructure live

### Dashboard Redesign + Landing + Funnel

- Full premium UI (Dark Matter philosophy)
- Uniform aesthetic across dashboard + landing + pricing
- **Build when**: next home session

### Phase 8 — Signal Agent v2
- Analyzes signal_tracker data (lifecycle, close reasons, peak gap)
- Correlates session, box, PDR, gap_delta at open with outcomes
- **Earliest**: May 20, 2026 (needs 30 days tracker data)

---

## COMPLETE PRIORITY ORDER

| Priority | Item | Effort | Status |
|----------|------|--------|--------|
| 1 | Part A: AI refinements | ✅ | DONE |
| 2 | Part B: Market toggle | ✅ | DONE |
| 3 | Part D: Admin brain | ✅ | DONE |
| 4 | Part E: Logging | ✅ | DONE |
| 5 | Part F: News alerts | ✅ | DONE |
| 6 | Part G: PDR tracking | ✅ | DONE |
| 7 | Part H: AI snapshot | ✅ | DONE |
| 8 | Dashboard redesign | 3-5 sessions | QUEUED |
| 9 | Part C: Per-user AI | 1-2 sessions | QUEUED |
| 10 | Phase 8: Signal v2 | 1 session | WAITING (data) |
| 11 | PDR Strategy | 1 session | WAITING (data) |
| 12 | Kage Voice AI | 1 week | WAITING (payment) |
| 13 | Bot automation | High | WAITING (edge proven) |
