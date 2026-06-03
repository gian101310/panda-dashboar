# Panda Engine — Full Context Prompt

Paste this at the start of any new Claude chat so it has full project memory.

---

## WHO I AM

I'm Boss-G, sole developer and operator of Panda Engine — a live forex intelligence SaaS platform. I am NOT a beginner. I build in Python/FastAPI, Next.js 14, Supabase, Vercel, MT4 data pipelines, Telegram Bot API, and OpenAI API.

**How to work with me:**
- Give implementation-ready answers, not generic recommendations
- Skip preamble — get to the code/answer
- Your role is senior full-stack dev collaborator, not architect. All decisions are mine.
- Never modify existing logic without my explicit instruction
- Never rewrite dashboard.js wholesale — use chunked edits (25-30 lines)
- Never assume thresholds or logic — always read the source files first
- When I pick an option, execute immediately

---

## WHAT PANDA ENGINE IS

A modular AI-augmented forex intelligence platform tracking 21 currency pairs. Generates gap-score signals every 5 min. 4 strategies (BB, INTRA, PULLBACK, INTRA MASTER) with a 4-strategy MT5 EA executing live trades.

**System class:** Junior prop-desk research platform territory. Multi-agent with shared memory bus. NOT a simple retail bot.

### 4-Pillar Architecture
```
Signal Intelligence      → app.py (gap scoring, badges, confluence, PL zones, box trends, momentum)
Execution Intelligence   → signal_tracker (mock) + MT5 EA (live) → ea_executions (write-back ACTIVE)
Performance Intelligence → Signal Agent + Journal Agent + Pattern Agent → ai_memory
Memory Intelligence      → ai_memory records, cross-agent pattern matching, Panda AI reasoning
```

### Signal Flow
```
Engine (app.py) → panda_score_SYMBOL.txt (Common Files) → MT5 EA reads every 30s → EA executes
EA closes trade → OnTradeTransaction → WebRequest POST → /api/ea-result → ea_executions table
```

---

## STACK & IDs

| Component | Detail |
|-----------|--------|
| Engine | FastAPI/Python 3.11, local PC (future Hyonix VPS) |
| Dashboard | Next.js 14 on Vercel |
| DB | Supabase project `jxkelchxitwuilpbrwxk` (31 tables, free tier, 78MB/500MB) |
| Domain | `pandaengine.app` |
| Git | `github.com/gian101310/panda-dashboar` (no 'd') |
| Vercel | team `team_yI8pvA0JfHlIj3f2B8dlphgh`, project `panda-dashboard` |
| Env vars | SUPABASE_SERVICE_KEY, ENGINE_SECRET, TG_WEBHOOK_SECRET, OPENAI_API_KEY, EA_API_KEY |
| MT4 data dir | `C:\Users\Admin\AppData\Roaming\MetaQuotes\Terminal\Common\Files` |

---

## FILE MAP

### Engine (Python)
| File | Path | Notes |
|------|------|-------|
| app.py | `C:\Users\Admin\Desktop\ctrader_trend_scanner\app.py` | ~2234 lines. Lines ~421-536 are **LOCKED FOREVER** (core scoring) |
| check_dupes.py | same folder | Run before every push |

### Dashboard (Next.js)
| File | Path | Notes |
|------|------|-------|
| dashboard.js | `C:\Users\Admin\panda-dashboard\pages\dashboard.js` | ~3356 lines, all 13 tabs, all components |
| ea-result.js | `pages/api/ea-result.js` | EA write-back endpoint (Bearer auth via EA_API_KEY) |
| signal-tracker.js | `pages/api/signal-tracker.js` | Mock trade lifecycle |
| signal-agent.js | `pages/api/signal-agent.js` | Analyzes signal_results → ai_memory |
| journal-agent.js | `pages/api/journal-agent.js` | Analyzes manual_trades → ai_memory |
| pattern-agent.js | `pages/api/pattern-agent.js` | Cross-references signal + journal → ai_memory |
| ai-chat.js | `pages/api/ai-chat.js` | Panda AI (3 modes: insights, review, chat) |

### EA (MT5)
| File | Path | Notes |
|------|------|-------|
| PandaEngine_EA_MT5_v2.10_writeback.mq5 | `C:\Users\Admin\Documents\Claude\Projects\Panda Engine\` | 4 strategies + write-back layer |

---

## SUPABASE TABLES (key ones)

| Table | Records | Purpose |
|-------|---------|---------|
| dashboard | 21 | Live pair data (upserted every 5 min) |
| signal_results | ~1,822 | BB + INTRA strategy performance |
| signal_tracker | ~3,989 | Mock trade lifecycle with price snapshots |
| ea_executions | NEW | Real MT5 trade results (write-back) |
| ai_memory | 28 | AI agent findings (STALE — last run Apr 19) |
| signal_snapshots | 121K+ | All 21 pairs every cycle |
| manual_trades | 0 | Reset intentionally |
| admin_brain | 18 | Boss-G brain (pref/coaching/pattern/rule) |
| spike_events | 852+ | Spike alerts |
| panda_users | 4+ | Users + roles + feature_access |

---

## 4-STRATEGY EA (LOCKED DEFINITIONS)

| Strategy | Magic | Entry | SL | TP | Management |
|----------|-------|-------|----|----|------------|
| BB | 111001 | gap≥5, bias directional, not hard_invalid | Swing + buffer | Fixed RR 2:1 | Set-and-forget |
| INTRA | 111002 | gap≥9, PL confirmed, UAE 2-4AM | Swing + buffer | Fixed RR 2:1 | Hard close 10AM UAE |
| PULLBACK | 111003 | gap≥5, near PDH/PDL/PWH/PWL/PMH/PML/PYH/PYL | Dynamic S/R | Next S/R (min 50 pips) | Asymmetric RR 2:1→4:1 |
| INTRA MASTER | 111004 | gap≥9, PL confirmed | SuperTrend or swing | Safe TP (10x SL) | Break-even at 1R + trailing |

**Exposure Guard:** Max 20 open, max 4 per currency, max 2 same-direction per currency. Currency-aware (GBPUSD BUY + GBPJPY BUY = double GBP long).

---

## KEY AI FINDINGS (from 28 ai_memory records)

- BB gap 7 + PL confirmed = 91% win (n=27); without PL = 0% (n=53)
- ASIAN session: +1582 pips. LONDON: -272 pips.
- 4-12h holds: +2614 pips. Under 1h: -238 pips.
- Alpha pairs: NZDCAD, NZDUSD, AUDJPY, GBPAUD
- Leak pairs: GBPJPY, GBPCAD, GBPUSD, EURUSD, AUDUSD

---

## WHAT'S BEEN COMPLETED (as of May 18, 2026)

- All Phases 1-7 + Parts A/B/D/E/F/G/H of AI layer
- EA write-back: ea_executions table + ea-result.js endpoint + EA v2.10 with OnTradeTransaction
- Architecture assessment document
- Maintenance mode, Panda AI onboarding, PB entry levels, spike filters
- Momentum-bias alignment, TBG indicators
- Dashboard 13 tabs fully functional

## CURRENT BUILD QUEUE (priority order)

| # | Item | Status |
|---|------|--------|
| 1 | NowPayments USDT integration | NEXT UP |
| 2 | Re-run stale agents (Signal/Journal/Pattern) | READY — agents stale since Apr 19 |
| 3 | Execution Quality Agent (new) | QUEUED — needs ea_executions data first |
| 4 | Confidence calibration | QUEUED |
| 5 | File-age check in EA | QUEUED |
| 6 | Engine heartbeat (Telegram alert) | QUEUED |
| 7 | Part C: Per-user AI (Pro/Elite) | QUEUED |
| 8 | Phase 8: Signal Agent v2 on tracker data | DATA READY |
| 9 | Dashboard redesign + Landing pages | IN PROGRESS |
| 10 | VPS migration (Hyonix) | Future |

---

## RULES — DO NOT BREAK

- **LOCKED CODE:** `extract_panda_score` + `compute_scores_all_pairs` in app.py — NEVER TOUCH
- **Never rewrite** dashboard.js wholesale — chunk edits 25-30 lines
- **Never start engine** via Desktop Commander — use `START_PANDA.bat` (DC kills APScheduler)
- **Always use** `py -3.11`, never `python`
- **Git commits** via `.bat` file — inline `&&` breaks on special chars
- **Supabase queries:** always use `.limit()` to avoid 1000-row default cap
- **Auth:** all data-returning routes need validateSession + role check
- **None vs "":** use `row.get("key") or ""` not `row.get("key", "")` — the latter returns None when key exists but value is None
- **Sessions:** ASIAN 22:00-05:59 UTC / LONDON 06:00-13:59 / NEW_YORK 14:00-21:59
- **AI rule:** "If output could be screenshot as financial advice — rewrite it"
- **FLAT** = unresolved (not a third result)
- **Code style:** inline styles, Share Tech Mono (data), Orbitron (headings), Rajdhani (body). Colors: BUY=#00ff9f, SELL=#ff4d6d, accent=#00b4ff

---

## WHAT I NEED YOU TO DO

[INSERT YOUR TASK HERE]
