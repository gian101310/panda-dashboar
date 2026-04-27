# PANDA ENGINE — AI INTELLIGENCE LAYER BUILD PLAN

> Last updated: April 25, 2026 | Author: Boss-G Phases 1–7 COMPLETE. Phase 8 waiting on data. Major Apr 25 additions live. Read this file alongside SKILL_UPDATED.md before any AI-related work.

---

## CURRENT STATE (April 25, 2026)

### What's Live

- Panda AI tab — Market insights, Review Trades, Free chat
- **TWO AI MODES**: User (narrator, no recommendations) + Admin (unrestricted coach)
- **Admin Brain** — admin_brain table, 18 memories, injected every session
- **"Remember" detection** — admin says "remember that X" → auto-stored to brain
- AI Memory Layer — 57 memories (22 signal + 21 journal + 14 pattern)
- Master Agent — injects all ai_memory into every GPT call
- Signal Tracker — tracking open signals, auto-triggered every engine cycle
- TrackerPanel — visual tracker cards in Analytics tab
- **News Alert System** — HIGH impact news → Telegram + dashboard banner + pair badges
- **Telegram AI Snapshot** — hourly narration from OpenAI alongside PNG
- **PDR tracking** — pdr_cache table, stored at signal open in signal_tracker
- **Box tracking** — box_h1_trend + box_h4_trend stored at signal entry and tracker open
- **Session logging** — ASIAN/LONDON/NEW_YORK on signal_results and signal_tracker
- **Gap velocity** — gap_delta stored on every signal_snapshot

### Data State

TableRecordsStatussignal_results326+session + box + pdr columns livemanual_trades439cleansignal_snapshots30,000+gap_delta now populatedai_memory57LIVE — 22 signal + 21 journal + 14 patternsignal_tracker10+LIVE — session + box + pdr at openadmin_brain18LIVE — Boss-G personal brainpdr_cache21LIVE — per-symbol, 15-min TTL

---

## STRATEGY DEFINITIONS (CONFIRMED FINAL)

### BB Strategy

- Entry: gap &gt;= 5, any time, any day, PL NOT required
- Concurrent: no new entry if same pair has open BB trade
- Exit: gap drops &gt; 2 points from peak

### INTRA Strategy

- Entry: gap &gt;= 9 + PL confirmed (ABOVE=BUY, BELOW=SELL)
- Window: 2AM–4AM UAE (22:00–23:59 UTC)
- Exit: 10AM UAE hard close (06:00 UTC)

---

## COMPLETED PHASES

### Phase 1 — Foundation ✅

- ai-chat.js journal fix, confidence pipeline, BB/INTRA logic, /test-ctrader

### Phase 2 — AI Memory Layer ✅

- ai_memory table + /api/ai-memory.js

### Phase 3 — Signal Agent v1 ✅ (22 memories)

- 6 analysis functions, dual win rates, MIN_SAMPLE = 20

### Phase 4 — Journal Agent ✅ (21 memories)

- 6 analysis functions, 439 real trades analyzed

### Phase 5 — Master Agent Reads Memory ✅

- fetchMemoryContext() queries all ai_memory, injected into all 3 modes

### Phase 6 — Pattern Agent ✅ (14 memories)

- 7 pattern factors: alpha/leak pairs, session edge, hold duration, execution gap, PL discipline

### Phase 7A — Signal Tracker ✅

- signal_tracker table (30+ columns), /api/signal-tracker, close conditions, milestones

### Phase 7B — Tracker Panel ✅

- TrackerPanel component in Analytics tab, SHOW/HIDE CLOSED toggle

### Apr 24 Major Session ✅

- memoryIndex (useMemo), getEdgeMemory(), PROVEN_EDGE/DEAD_ZONE badges
- PDR Strength feature (pdr.js + PdrBadge)
- RIDE IT bias alignment fix, NEUTRAL vs NEUTRAL → INVALID
- Market On/Off auto-detection (engine + dashboard)
- Tab merge: LOGS tab (Signal Log + Spike Log subtabs)
- Spike throttle, auto-heal, admin AI mode, Telegram auto-signup
- Agents: stale warning, run summary logging, computed timestamp

### Apr 25 Session ✅

- **Part A closed**: duplicate EDGE block removed from PairCard
- **AI Brain System**: admin_brain table, /api/admin-brain.js, ai-chat.js rebuilt
  - USER_PROMPT: narrator only, permanent disclaimer
  - ADMIN_PROMPT: unrestricted, full engine knowledge, brain injected
  - detectRemember() + classifyBrainEntry() — auto-stores to brain
- **Logging patch**: session on signal_results, gap_delta on signal_snapshots, session names unified
- **PDR tracking**: pdr_cache schema fixed (per-symbol), batch delay 10s, signal-tracker reads pdr_cache at open
- **Box tracking**: box_h1_trend + box_h4_trend on signal_results + signal_tracker at open
- **Telegram AI Snapshot**: send_ai_snapshot() — hourly OpenAI narration → Telegram
- **News Alert System**: check_news_alerts() in engine (every 5min), /api/upcoming-news.js, dashboard banner + PairCard badge

---

## REMAINING PHASE

### Phase 8 — Signal Agent v2 on Tracker Data

**Status: WAITING — needs 30+ days of signal_tracker data Earliest feasible: May 20, 2026**

Questions to answer:

- How long do signals at each gap level sustain?
- What kills signals most often? (close_reason distribution)
- Does PDR strong correlate with signal longevity?
- Does session correlate with signal quality?
- Does box alignment at open correlate with outcome?
- Does gap_delta (velocity) at open predict direction?

---

## PENDING OPTIMIZATIONS (see PENDING_OPTIMIZATIONS_v2.md)

### Part A — AI Refinements

✅ ALL 9 ITEMS COMPLETE (Apr 24 + Apr 25)

### Part B — Market On/Off Toggle

✅ COMPLETE (Apr 24)

### Part C — Per-User AI Analysis (Pro/Elite)

**Status: SKIPPED for now — queued for later**

- Add user_id to ai_memory (nullable)
- Journal + Pattern agents accept user_id
- Master Agent merges global + personal memories
- "Analyze My Trades" button for Pro/Elite users

### New Items from Apr 25 Session

- PDR Strategy: when sufficient data gathered, add PDR as strategy filter (pdr_strong_at_open + gap + PL → combined edge validation)
- Kage Voice AI: wake word detection, Whisper STT, ElevenLabs TTS (\~$25/mo) Build when: payment infrastructure live + subscription revenue covers cost
- Dashboard redesign + landing page + funnel: queued for next home session

---

## FUTURE ADDITIONS (Post Phase 8)

FeatureEffortStatusAdaptive weight systemMediumAfter Phase 8News/Sentiment feedAlready built✅ ForexFactory liveKage Voice AIMediumPending payment infraMonthly AI performance reportMediumQueuedDashboard redesignHighQueued (next home session)Landing pagesMediumQueuedPWAMediumQueuedVPS migrationHighFuturePullback strategyHighFuturePDR strategyMediumAfter data (Aug 2026+)Per-user AI (Part C)MediumQueuedBot automationHighAfter edge proven

---

## ENGINEERING RULES

### Always

- Read SKILL_UPDATED.md + this file before any AI or signal_tracker work
- Surgical edits only — max 30-50 lines per change
- check_dupes.py → npx next build → .bat push — every time
- Update [CHANGELOG.md](http://CHANGELOG.md) at end of every session
- Restart engine (START_PANDA.bat) after any [app.py](http://app.py) changes

### Never

- Touch [app.py](http://app.py) lines 330–439 (core scoring — LOCKED FOREVER)
- Let AI write to dashboard, signal_results, or signal_snapshots
- Run AI agents from [app.py](http://app.py) — agents live in API routes only
- Start next phase without explicit instruction
- Modify session labels (ASIAN/LONDON/NEW_YORK are now canonical)
