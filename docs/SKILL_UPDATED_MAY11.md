---
name: panda-engine
description: >
  Complete project context for the Panda Engine forex intelligence platform.
  Use this skill for ANY task involving Panda Engine, the trading dashboard,
  app.py engine, Supabase backend, or Vercel deployment.
  Trigger on: dashboard.js edits, new tabs, component fixes, API routes,
  Supabase queries, engine scoring, TBG indicator, momentum states,
  gap analysis, deployment, git push, patch scripts, or any mention of
  "panda", "dashboard", "engine", "pairs", "gap score", "momentum",
  "TBG", "trade journal", "spike", "strength", "signals", "PDR",
  "edge badge", "memory index", "tracker", "confidence", "news alert",
  "brain", "session", "box trend", "gap velocity", "overview".
  ALWAYS read this skill before touching any Panda Engine file.
  ALSO read AI_BUILD_PLAN.md before any AI agent or signal_tracker work.
  NOTE: Engine folder is named ctrader_trend_scanner (legacy) — cTrader is NOT a dependency.
---

# Panda Engine — Project Skill

> **Purpose**: Eliminate redundant file scanning. Jump straight to the correct line and edit.
> **Behavioral rules, gotchas, workflow order** → stored in memory (not here).
> **Last updated**: May 11, 2026

---

## 1. FILE MAP

### Engine (Python/FastAPI — local PC, future VPS)

| File | Path | Lines | Purpose |
|------|------|-------|---------|
| **app.py** | `C:\Users\Admin\Desktop\ctrader_trend_scanner\app.py` | ~2080 | Core engine: MT4 parser, scoring, Supabase push, signals, Telegram, scheduler, tracker trigger, spike throttle, auto-heal, news alerts, AI snapshot |
| **check_dupes.py** | `C:\Users\Admin\Desktop\ctrader_trend_scanner\check_dupes.py` | — | **RUN BEFORE EVERY PUSH** |
| **START_PANDA.bat** | `C:\Users\Admin\Desktop\START_PANDA.bat` | 18 | **WATCHDOG** — auto-restarts engine on crash |

### Dashboard (Next.js 14 — Vercel)

| File | Path | Lines | Purpose |
|------|------|-------|---------|
| **dashboard.js** | `C:\Users\Admin\panda-dashboard\pages\dashboard.js` | ~3251 | Main dashboard — 13 tabs, all components |
| **journal.js** | `C:\Users\Admin\panda-dashboard\pages\journal.js` | — | Trade journal page (standalone) |
| **portfolio.js** | `C:\Users\Admin\panda-dashboard\pages\portfolio.js` | — | Portfolio/stats page |
| **pricing.js** | `C:\Users\Admin\panda-dashboard\pages\pricing.js` | — | Pricing page |
| **funnel.js** | `C:\Users\Admin\panda-dashboard\pages\funnel.js` | — | Signup funnel |
| **strength.js** | `C:\Users\Admin\panda-dashboard\pages\strength.js` | — | Currency strength page |
| **login.js** | `C:\Users\Admin\panda-dashboard\pages\login.js` | — | Login page |
| **index.js** | `C:\Users\Admin\panda-dashboard\pages\index.js` | — | Landing page |

### API Routes (35+)

| File | Purpose |
|------|---------|
| **ai-chat.js** | Panda AI — 2 modes (user narrator / admin coach) + brain |
| **admin-brain.js** | Brain CRUD (GET/POST/DELETE) |
| **signal-agent.js** | Signal Agent v1 |
| **journal-agent.js** | Journal Agent |
| **pattern-agent.js** | Pattern Agent |
| **signal-tracker.js** | Tracker — open/update/close, PDR/box/session at open |
| **signal-analytics.js** | Signal performance stats |
| **signal-log.js** | Signal snapshots |
| **pdr.js** | PDR strength via Twelve Data + pdr_cache |
| **upcoming-news.js** | HIGH impact news + affected pairs |
| **ai-memory.js** | AI memory CRUD |
| **telegram-webhook.js** | /start auto-signup |
| **data.js** | Dashboard rows |
| **gap-chart.js** | Gap history |
| **heatmap.js** | Momentum heatmap |
| **spikes.js** | Spike log |
| **journal.js** | Trade journal CRUD |
| **journal-upload.js** | CSV trade import |
| **calendar.js** | Economic calendar |
| **cot.js** | COT data |
| **currency-strength.js** | Currency strength |
| **strategies.js** | User strategies |
| **alert-prefs.js** | Alert preferences |
| **open-trades.js** | Open trades panel |
| **public-signals.js** | Public signal feed |
| **pf-me.js** | User profile |
| **pf-signup.js** | Signup flow |
| **pf-log-event.js** | Event logging |
| **notify-telegram.js** | Telegram notifications |
| **engine-health.js** | Engine status |
| **login.js** / **logout.js** / **me.js** | Auth |
| **admin/index.js** | Admin panel API |
| **admin/users.js** | User management |
| **admin/sessions.js** | Session management |
| **admin/logs.js** | Log viewer |
| **admin/pf-approve.js** | Approval flow |

### Shared Libs

| File | Path | Purpose |
|------|------|---------|
| **lib/supabase.js** | `C:\Users\Admin\panda-dashboard\lib\supabase.js` | Shared Supabase client |
| **lib/auth.js** | `C:\Users\Admin\panda-dashboard\lib\auth.js` | Session validation |

### Key Paths

- **MT4 data dir**: `C:\Users\Admin\AppData\Roaming\MetaQuotes\Terminal\Common\Files`
- **Git repo**: `github.com/gian101310/panda-dashboar` (no 'd')
- **Vercel URL**: `panda-dashboard.vercel.app` / `pandaengine.app`
- **Supabase project ID**: `jxkelchxitwuilpbrwxk`
- **Engine**: `uvicorn app:app --host 0.0.0.0 --port 8000`

---

## 2. DASHBOARD.JS — KEY ANCHORS

> Line numbers shift after edits — use these as approximate landmarks, grep to verify.

| ~Line | Component | Purpose |
|-------|-----------|---------|
| 10 | `ALL_PAIRS` | 21-pair array |
| 12–24 | `MOMENTUM_GUIDE` | Icon/action/color for 10 states |
| 26–168 | Utility functions | `stateColor`, `biasFromGap`, `boxTrend`, `plZoneBadge`, `atrFill`, `advScore`, `getMatchup` |
| 266–320 | `computeConfidence` | Multi-factor confidence 0–100 |
| 460–571 | `MomentumHeatmap` | Heatmap grid |
| 573–696 | `AlertSettingsModal` | Alert preferences |
| 697–776 | `GapChart` | Gap history (canvas) |
| 778–828 | `EconomicCalendar` | Calendar component |
| 830–882 | `PositionCalculator` | Calculator |
| 884–908 | `EngineHealth` | Engine status |
| 935–1001 | `PairCard` | Main pair card |
| 1003–1185 | `PairCardModal` | Expanded modal |
| 1187–1287 | `ValidSetupsTab` | Box-confirmed setups |
| 1289–1440 | `ValidPairsTab` | Auto-filtered tradable pairs |
| 1442–1580 | `OpenTradesPanel` | Admin open trades |
| 1582–1638 | `SpikeLogTab` | Spike history |
| 1641–1714 | `ChartTab` | TradingView chart |
| 1716–1816 | `SignalLogTab` | Signal log |
| 1818–1839 | `ResearchTab` | Calendar + COT |
| 1841–1910 | `PandaAIChat` | Panda AI tab |
| 1912–2010 | `TrackerPanel` | Signal tracker cards |
| 2011–2460 | `OverviewTab` | Overview dashboard (many sub-components) |
| 2462 | `TABS` | 13-tab array |
| 2464–2480 | `TAB_FEATURE` | Feature gating map |
| 2492–2639 | `SignalAnalytics` | Signal performance V2 |
| 2640+ | `SignalFlashcard` | Signal flashcards |
| ~2700+ | `Dashboard()` | Main export |

### Tab Structure (13 tabs)
OVERVIEW, PANELS, SIGNALS, TABLE, GAP CHART, RESEARCH, CALCULATOR, SETUPS, VALID PAIRS, CHART, ANALYTICS, LOGS, PANDA AI

---

## 3. APP.PY ENGINE INDEX

| ~Line | Function / Route | Purpose |
|-------|-----------------|---------|
| 49–97 | Config block | MT4_PATH, tokens, creds, PAIRS list, TelegramCircuitBreaker |
| 131–160 | `safe_float`, `get_session`, `parse_tf_score` | Helpers |
| 161–285 | `parse_mt4_file` | MT4 file → D1/H4/H1/ADV/ATR/BOX |
| 286–367 | `parse_pl_file` | PL zone parser |
| 368–420 | `compute_box_trends` | UPTREND/DOWNTREND/RANGING |
| 421–536 | `extract_panda_score`, `compute_scores_all_pairs` | **LOCKED — NEVER TOUCH** |
| 551–605 | `classify_momentum`, `should_close_alert`, `classify_structural_state` | Momentum engine |
| 606–673 | Helpers | `is_neutral_matchup`, `has_pending_signal`, `compute_signal_confidence` |
| 674–754 | `log_signal`, `check_bb_entry`, `check_intra_entry` | Signal logging |
| 755–868 | `evaluate_pending_signals` | Pending signal evaluator |
| 869–1255 | `run_gap_once` | **Main loop** — parse → score → momentum → upsert → signals → tracker |
| 1256–1310 | `_score_label`, `_compute_confidence` | Snapshot helpers |
| 1311–1441 | `generate_snapshot` | Telegram snapshot PNG |
| 1442–1580 | `send_snapshot` | Snapshot delivery |
| 1581–1642 | `send_spike_alert`, `send_gap_alert` | Spike/gap Telegram alerts |
| 1643–1674 | `/api/login-alert` | Login alert POST |
| 1675–1779 | `fetch_news_feed`, `parse_news_time`, `check_news_alerts` | ForexFactory news |
| 1780–1909 | `send_ai_snapshot` | AI hourly narration |
| 1910–2006 | Startup + scheduler + routes | APScheduler, `/`, `/force`, `/status` |
| 2007–2080 | `/test-ctrader` | **DEAD — legacy, safe to remove** |

---

## 4. SUPABASE TABLES (30 tables)

### Core Data
| Table | Records | Purpose |
|-------|---------|---------|
| `dashboard` | 21 | Live pair data (upserted every 5 min) |
| `signal_snapshots` | 121,084+ | All 21 pairs every cycle |
| `signal_results` | 1,419 | BB + INTRA strategy performance |
| `signal_tracker` | 2,851 | Signal lifecycle — session/box/pdr/prices |
| `spike_events` | 960 | Spike alerts |
| `gap_history` | — | Historical gap scores |
| `pdr_cache` | 21 | PDR strength (15-min TTL) |
| `strength_log` | — | Currency strength time series |
| `structural_log` | — | Structural state log |
| `signal_accuracy` | — | Accuracy tracking |

### AI & Brain
| Table | Records | Purpose |
|-------|---------|---------|
| `ai_memory` | 28 | AI agent findings |
| `admin_brain` | 18 | Boss-G brain (pref/coaching/pattern/rule) |

### Users & Auth
| Table | Purpose |
|-------|---------|
| `panda_users` (4) | Users + roles + feature_access |
| `panda_sessions` | Active sessions |
| `panda_access_logs` | Access logging |

### Trading
| Table | Purpose |
|-------|---------|
| `trade_journal` | Trade journal entries |
| `trade_events` | Trade events |
| `trade_matrix` | Trade matrix |
| `user_strategies` | User strategies |
| `user_alert_prefs` | Alert preferences |
| `csv_uploads` | CSV upload tracking |

### Security (PandaFort)
| Table | Purpose |
|-------|---------|
| `pf_signup_requests` | Signup requests |
| `pf_known_devices` | Device fingerprints |
| `pf_known_ips` | IP tracking |
| `pf_security_events` | Security events |
| `pf_telegram_chats` | Telegram chat mapping |
| `telegram_subscriptions` | Telegram subscriptions |

### System
| Table | Purpose |
|-------|---------|
| `engine_logs` | Engine logging |
| `panda_project_docs` | Project docs |

---

## 5. CODE STYLE

```
Fonts: Share Tech Mono (data), Orbitron (headings), Rajdhani (body)
Colors: BUY=#00ff9f, SELL=#ff4d6d, accent=#00b4ff, warn=#ffd166, cool=#ffaa44
```
- All styles inline — no CSS modules
- Ternary chain for tab rendering
- Hooks: `useState`, `useEffect`, `useCallback`, `useRef`, `useMemo`
- Single file: all components in dashboard.js
- API routes: always import from `../../lib/supabase`

---

## 6. STRATEGY DEFINITIONS (LOCKED)

### BB Strategy
- Entry: gap >= 5 (valid bias), any time, any day. TBG NOT required.
- No new entry if same pair has open BB trade. Re-entry allowed once closed.
- Exit: gap drops >2 points from peak gap value.

### INTRA Strategy
- Entry: gap >= 9 + TBG confirmed (ABOVE=BUY, BELOW=SELL). Window: 2AM-4AM UAE only.
- Same concurrent position rule as BB.
- Exit: 10AM UAE hard close — no exceptions.

### Gap Score (CRITICAL)
- Gap = BASE score minus QUOTE score across D1/H4/H1 (range +/-18)
- BIAS: BUY if gap >= 5, SELL if <= -5, else WAIT
- EXECUTION: MARKET if |gap| >= 9, PULLBACK if >= 5
- TBG Zones: ABOVE=BUY valid, BELOW=SELL valid, BETWEEN=always invalid

### computeConfidence() (frontend only, 0-100)
Factors: gap magnitude (~25-30pts) + TBG valid (+20) + box aligned (+20) + COT (+10) + momentum (+10). Client-side only — NOT stored in Supabase.

---

## 7. QUICK REFERENCE

- Signal validity: `!hard_invalid && bias in (BUY,SELL) && |gap|>=5 && TBG confirms`
- G1 Colors: Red=Strong Sell, Green=Strong Buy, Yellow=Anticipation, White=No Trade
- `isMobile` breakpoint: 768px
- Vercel auto-deploys on push to main
- Engine folder `ctrader_trend_scanner` = legacy name, NOT a cTrader dependency
