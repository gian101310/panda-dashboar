# PANDA ENGINE v3.0 — Structured Overview

> Last updated: 2026-06-14
> Author: Boss-G (gianronaldang@gmail.com)

---

## 1. What Is Panda Engine?

Panda Engine is a proprietary forex intelligence platform that reads live currency data from MetaTrader 4 indicators, scores every pair using a multi-timeframe gap scoring system, classifies momentum states, generates automated signals, and pushes everything to a real-time Next.js dashboard and Telegram alerts. It covers 21 major/cross pairs, runs on a 5-minute cycle, and is designed for a single operator (Boss-G) with plans for monetized multi-user access.

---

## 2. Architecture

```
MT4 Indicators (Panda Lines v4.1 + TBG)
        |
        | writes mt4_SYMBOL.txt + tbg_SYMBOL.txt
        v
+---------------------------+
|   app.py (FastAPI/Python) |  <-- Core Engine (~2234+ lines)
|   Running on local PC     |
|   Scheduler: 5-min + 60-min cycles
+---------------------------+
        |
        | Supabase upsert (dashboard, gap_history, signal_snapshots, etc.)
        | Telegram alerts (spike, gap zone, news, AI narration, snapshot PNG)
        | panda_score_*.txt -> MT4 EA panel
        v
+---------------------------+
|   Supabase (PostgreSQL)   |  <-- 31 tables
|   Project: jxkelchxitwuilpbrwxk
+---------------------------+
        |
        v
+---------------------------+
|   Next.js 14 Dashboard    |  <-- Vercel (pandaengine.app)
|   dashboard.js (~3356 lines, single-file)
|   44 API routes in pages/api/
|   3 AI Agents (signal, journal, pattern)
|   Panda AI Chat (3 modes)
+---------------------------+
        |
        v
+---------------------------+
|   MT4 EA Execution Layer  |  <-- Reads panda_score_*.txt
|   MT4+MT5 EAs trade Panda |     SuperTrend flip entry
|   Lines, gated by engine  |     panda_score file gates bias
+---------------------------+
```

---

## 3. Pairs (21 Total)

AUDJPY, AUDCAD, AUDNZD, AUDUSD, CADJPY, EURAUD, EURCAD, EURGBP, EURJPY, EURNZD, EURUSD, GBPAUD, GBPCAD, GBPJPY, GBPNZD, GBPUSD, NZDCAD, NZDJPY, NZDUSD, USDCAD, USDJPY

Currencies covered: AUD, CAD, EUR, GBP, JPY, NZD, USD (7 majors)

---

## 4. Core Engine (app.py) — Function Map

### 4.1 Configuration (Lines 53-98)

| Variable | Purpose |
|----------|---------|
| `MT4_PATH` | MetaQuotes Common Files directory |
| `PAIRS` | 21-pair array |
| `TELEGRAM_TOKEN / CHAT_ID` | Spike/snapshot/news alerts |
| `LOGIN_ALERT_BOT_TOKEN` | Separate bot for login notifications |
| `ENGINE_SECRET` | Auth header for Vercel API calls |
| `OPENAI_API_KEY` | AI snapshot narrator (gpt-4o-mini) |
| `CURRENCY_TO_PAIRS` | Maps each of 7 currencies to affected pairs |

### 4.2 Infrastructure

| Component | Lines | Purpose |
|-----------|-------|---------|
| `supabase_retry()` | 100-114 | Exponential backoff wrapper for transient 522/timeout errors |
| `TelegramCircuitBreaker` | 117-142 | 5-failure lockout (120s cooldown) prevents Telegram spam |
| `safe_float()` | 150-152 | Safe float parsing |
| `get_session()` | 154-164 | Returns ASIAN/LONDON/NEW_YORK based on UTC hour |

### 4.3 File Parsers

| Function | Lines | Input | Output |
|----------|-------|-------|--------|
| `parse_tf_score()` | 168-178 | Score string like "+3/-1" | Integer (summed) |
| `parse_mt4_file()` | 180-301 | `mt4_SYMBOL.txt` | Dict with base/quote D1/H4/H1 scores, ADV scores, ATR, spread, boxes |
| `parse_pl_file()` | 305-383 | `tbg_SYMBOL.txt` | Dict with pl_st, pl_fl, pl_bias, pl_zone, pl_g1_valid, PDR levels (PDH/PDL/PWH/PWL/PMH/PML/PYH/PYL) |

**File format — mt4_SYMBOL.txt:**
```
EUR : D1 : +4 | H4 : +3 | H1 : +2
USD : D1 : -2 | H4 : -3 | H1 : -1
ADV : EUR : D1 : +1 | H4 : +2 | H1 : +1
ADV : USD : D1 : -1 | H4 : 0 | H1 : -1
ATR : 942 : 1679 Points.
SPREAD : 24 Points.
BOX|WagBox1|1772409600|1.17959|1773619200|1.14107
```

**File format — tbg_SYMBOL.txt:**
```
TBG_ST   : 1.98450
TBG_FL   : 1.97800
TBG_BIAS : BUY
TBG_ZONE : ABOVE
TBG_G1   : VALID
TBG_PRICE: 1.98650
PDH : 1.98200
PDL : 1.97100
```

### 4.4 Box Trend Detection

| Function | Lines | Purpose |
|----------|-------|---------|
| `compute_box_trends()` | 387-436 | 3 boxes sorted by time span: shortest=H1, medium=H4, longest=D1. Uses 50% midpoint rule to classify UPTREND/DOWNTREND/RANGING |

### 4.5 Scoring Engine (LOCKED — Never Touch)

| Function | Lines | Purpose |
|----------|-------|---------|
| `extract_panda_score()` | 440-477 | Exact replica of C# PandaEngineMaster. Values >=4 or <=-4 are EXTREME. Both sides present = HARD_INVALID |
| `_build_currency_line()` | 480-488 | Returns raw MT4 line (split values like +2/-1 must NOT be summed before scoring) |
| `compute_scores_all_pairs()` | 491-550 | Two-phase scoring: Phase 1 scores + collects invalid currencies, Phase 2 propagates global currency conflict |

**Gap Score formula:** GAP = BASE_SCORE - QUOTE_SCORE (range +/-18)

| Condition | Result |
|-----------|--------|
| gap >= 5 | BUY bias |
| gap <= -5 | SELL bias |
| abs(gap) >= 9 | MARKET execution |
| abs(gap) >= 5 | PULLBACK execution |
| Both sides have extreme values | HARD_INVALID |
| Both sides weak (abs < 4) | NEUTRAL_VS_NEUTRAL = HARD_INVALID |

### 4.6 Momentum Classification

| Function | Lines | Purpose |
|----------|-------|---------|
| `classify_momentum()` | 573-590 | Returns (momentum_label, state) from gap + deltas |
| `should_close_alert()` | 592-600 | Close alert when gap < 5, FADING, REVERSING, or 3+ drop from peak |
| `classify_structural_state()` | 602-613 | EXPAND/STABLE/PULLBACK/DEEP_PULLBACK per regime |

**10 Momentum States:**

| State | Meaning | Action |
|-------|---------|--------|
| STRONG | Full trend alignment | RIDE IT |
| BUILDING | Momentum confirmed | ENTER NOW |
| SPARK | Early signal | WATCH — Wait for confirmation |
| CONSOLIDATING | Normal pause | HOLD — Do NOT close |
| COOLING | Profits at risk | TIGHTEN SL |
| FADING | Gap shrinking | CONSIDER CLOSING |
| REVERSING | Trend breaking | CLOSE POSITION |
| STABLE | No strong momentum | MONITOR |
| NEUTRAL | No valid signal | WAIT |

### 4.7 Signal Performance Tracking (Dual Strategy)

| Function | Lines | Purpose |
|----------|-------|---------|
| `calc_pips()` | 619-625 | Pip calc (JPY = 0.01, others = 0.0001) |
| `compute_signal_confidence()` | 648-693 | Server-side 0-100 confidence (gap + PL zone + box + momentum) |
| `log_signal()` | 696-726 | Insert new signal to signal_results |
| `check_bb_entry()` | 729-745 | BB strategy: gap crosses from <5 to >=5, no neutral matchup |
| `check_intra_entry()` | 748-774 | INTRA strategy: gap>=9, PL zone confirms, 2AM-4AM UAE window only |
| `evaluate_pending_signals()` | 777-895 | Every cycle: update peak, calc pips, check exits |

**BB Strategy:** Entry on gap crossing >=5. Exit on gap drop >2 from peak, bias flip, or Friday close.

**INTRA Strategy:** Entry on gap>=9 + TBG confirmed (ABOVE=BUY, BELOW=SELL). Window: 22:00-00:00 UTC. Hard close at 06:00 UTC (10AM UAE).

### 4.8 Main Loop — run_gap_once()

| Step | Lines | What It Does |
|------|-------|-------------|
| Market check | 902-910 | Skip if forex market closed (Fri 22:00 - Sun 22:00 UTC) |
| PREV_GAP init | 912-925 | Pre-load from Supabase on first run to prevent phantom BB signals |
| Parse all pairs | 939-951 | Read mt4_*.txt and tbg_*.txt for all 21 pairs |
| Score all pairs | 953 | Two-phase cross-pair scoring |
| Per-pair loop | 955-1165 | Gap history, momentum, spike detection, signal entry, gap alerts |
| Auto-heal | 1174-1189 | 3 consecutive stale cycles triggers sys.exit(1) for restart |
| Supabase writes | 1191-1341 | dashboard upsert, gap_history, strength_log, signal_snapshots, engine_logs, spike_events |
| Score files | 1202-1282 | Write panda_score_*.txt for MT4 EA panel (confluence 0-100) |
| Signal eval | 1373-1374 | Evaluate all PENDING signals |
| Tracker update | 1377-1383 | POST to pandaengine.app/api/signal-tracker |
| Heartbeat | 1385-1398 | Insert engine_heartbeat row |

### 4.9 Telegram Outputs

| Function | Lines | Trigger | Output |
|----------|-------|---------|--------|
| `generate_snapshot()` | 1459-1587 | Hourly | PNG table: all 21 pairs, color-coded (green=BUY, red=SELL, yellow=watch, white=idle) |
| `send_snapshot()` | 1590-1707 | Hourly | Sends PNG to Telegram with summary caption |
| `send_spike_alert()` | 1722-1750 | On momentum spike | HTML message with spike details and action guide |
| `send_gap_alert()` | 1753-1781 | On gap 9-12 + valid PL | "Pairs Good to Ride" alert |
| `check_news_alerts()` | 1859-1918 | Every cycle | HIGH impact ForexFactory events 10-60 min away |
| `send_ai_snapshot()` | 1921-2009 | Hourly | GPT-4o-mini market narration (no trade recs) |

### 4.10 Scheduler

| Schedule | Fires At | Actions |
|----------|----------|---------|
| 5-minute | Every :00, :05, :10... | `run_gap_once()` + `check_news_alerts()` |
| Hourly | Every :01 | `run_gap_once()` + `send_snapshot()` + `send_ai_snapshot()` + `daily_cleanup()` |

### 4.11 FastAPI Routes (Engine)

| Route | Method | Purpose |
|-------|--------|---------|
| `/` | GET | Health/version |
| `/force` | GET | Force gap run + snapshot |
| `/force-gap` | GET | Force gap run only |
| `/status` | GET | Detailed engine status (valid/invalid/buy/sell counts) |
| `/api/login-alert` | POST | Telegram login notification |
| `/telegram-webhook` | POST | Saves chat_id on /start, sends welcome |

---

## 5. Dashboard (Next.js 14) — Component Map

### 5.1 Main File: dashboard.js (~3356 lines)

| Line Range | Component | Purpose |
|------------|-----------|---------|
| 8 | `ALL_PAIRS` | 21-pair constant |
| 10-22 | `MOMENTUM_GUIDE` | Icon + action + color for 10 states |
| 25-91 | Utility functions | `stateColor`, `biasFromGap`, `boxTrend`, `tbgZoneBadge`, `atrFill` |
| 186-275 | `computeConfidence()` | Multi-factor confidence 0-100 (client-side, includes COT) |
| 376-487 | `MomentumHeatmap` | Grid of all pairs x momentum |
| 613-711 | `GapChart` | Canvas-based gap history chart |
| 869-933 | `PairCard` | Main card per pair |
| 934-1092 | `PairCardModal` | Expanded detail modal |
| 1093-1203 | `ValidSetupsTab` | Box-confirmed setups |
| 1204-1355 | `ValidPairsTab` | Auto-filtered tradable pairs |
| ~1752-1830 | `PandaAIChat` | AI chat (3 modes: insights, review, chat) |
| ~1782 | `SignalAnalytics` | Signal performance V2 |
| ~2019 | `Dashboard()` | Main export |

### 5.2 Tab Structure (13 Tabs)

PANELS, SIGNALS, TABLE, GAP CHART, RESEARCH, CALCULATOR, SETUPS, VALID PAIRS, SPIKE LOG, CHART, ANALYTICS, SIGNAL LOG, PANDA AI

### 5.3 Design System

| Element | Value |
|---------|-------|
| Data font | Share Tech Mono |
| Heading font | Orbitron |
| Body font | Rajdhani |
| BUY color | #00ff9f |
| SELL color | #ff4d6d |
| Accent | #00b4ff |
| Warning | #ffd166 |
| Cool | #ffaa44 |
| Styling | All inline (no CSS modules) |
| Mobile breakpoint | 768px (`isMobile`) |

---

## 6. API Routes (Dashboard — 44 Total)

### Core Data
| Route | Purpose |
|-------|---------|
| `/api/data` | Dashboard rows (main feed) |
| `/api/gap-chart` | Gap history time series |
| `/api/heatmap` | Momentum heatmap data |
| `/api/spikes` | Spike event log |
| `/api/pdr` | PDR strength (15-min TTL cache) |
| `/api/currency-strength` | Currency strength data |
| `/api/strength-history` | Strength time series |
| `/api/cot` | COT (Commitment of Traders) data |
| `/api/upcoming-news` | ForexFactory calendar |
| `/api/calendar` | Calendar events |
| `/api/engine-health` | Engine status check |

### Signal System
| Route | Purpose |
|-------|---------|
| `/api/signal-analytics` | Signal performance stats |
| `/api/signal-log` | Signal snapshot history |
| `/api/signal-tracker` | Signal lifecycle CRUD |
| `/api/public-signals` | Public-facing signal feed |
| `/api/strategies` | Strategy configuration |

### AI Layer
| Route | Purpose |
|-------|---------|
| `/api/ai-chat` | Panda AI (insights/review/chat modes) |
| `/api/ai-memory` | AI memory CRUD |
| `/api/admin-brain` | Boss-G brain entries CRUD |
| `/api/signal-agent` | Analyzes signal_results |
| `/api/journal-agent` | Analyzes manual_trades |
| `/api/pattern-agent` | Cross-references signal + journal data |

### Trade Journal
| Route | Purpose |
|-------|---------|
| `/api/journal` | Manual trade CRUD |
| `/api/journal-upload` | CSV import for trades |
| `/api/open-trades` | Currently open positions |

### EA Integration
| Route | Purpose |
|-------|---------|
| `/api/ea-data` | EA pair data feed |
| `/api/ea-result` | EA trade results |

### Auth & Users
| Route | Purpose |
|-------|---------|
| `/api/login` | Authentication |
| `/api/logout` | Session end |
| `/api/me` | Current user info |
| `/api/pf-me` | Public-facing user profile |
| `/api/pf-signup` | Public user signup |
| `/api/pf-log-event` | Event logging |
| `/api/notify-telegram` | Telegram notification trigger |
| `/api/telegram-webhook` | Bot webhook handler |
| `/api/alert-prefs` | Alert preference settings |

### Admin
| Route | Purpose |
|-------|---------|
| `/api/admin/index` | Admin dashboard |
| `/api/admin/users` | User management |
| `/api/admin/logs` | System logs |
| `/api/admin/sessions` | Active sessions |
| `/api/admin/pf-approve` | Approve public users |
| `/api/maintenance` | Maintenance mode toggle |

---

## 7. Supabase Tables (31)

### Live Data
| Table | Records | Purpose |
|-------|---------|---------|
| `dashboard` | 21 | Live pair data (upserted every 5 min) |
| `gap_history` | rolling | Historical gap scores per pair |
| `strength_log` | rolling | Currency strength time series |
| `pdr_cache` | 21 | PDR strength (15-min TTL) |

### Signal System
| Table | Records | Purpose |
|-------|---------|---------|
| `signal_snapshots` | 121K+ | All 21 pairs every cycle |
| `signal_results` | 1,822+ | BB + INTRA strategy performance |
| `signal_tracker` | 3,989+ | Signal lifecycle (session/box/pdr/prices) |
| `spike_events` | 852+ | Momentum spike alerts |

### AI Layer
| Table | Records | Purpose |
|-------|---------|---------|
| `ai_memory` | 28+ | AI agent findings |
| `admin_brain` | 18+ | Boss-G coaching/patterns/rules |

### Trade Journal
| Table | Records | Purpose |
|-------|---------|---------|
| `manual_trades` | 439+ | Real trades (CSV import) |

### Users & Auth
| Table | Records | Purpose |
|-------|---------|---------|
| `panda_users` | 4+ | Users + roles + feature_access |
| `pf_telegram_chats` | — | Telegram chat IDs for notifications |

### System
| Table | Purpose |
|-------|---------|
| `engine_logs` | Cycle completion logs |
| `engine_heartbeat` | Heartbeat with pairs_processed count |

---

## 8. Key Deployment Info

| Item | Value |
|------|-------|
| Engine host | Local PC (future VPS) |
| Engine command | `uvicorn app:app --host 0.0.0.0 --port 8000` |
| Dashboard host | Vercel (auto-deploy on push to main) |
| Domain | pandaengine.app / panda-dashboard.vercel.app |
| Git repo | github.com/gian101310/panda-dashboar (no 'd') |
| Supabase project | jxkelchxitwuilpbrwxk |
| MT4 data dir | C:\Users\Admin\AppData\Roaming\MetaQuotes\Terminal\Common\Files |

---

## 9. Confidence Score Breakdown (0-100)

| Factor | Points | Condition |
|--------|--------|-----------|
| Gap magnitude | +25 | abs(gap) >= 8 |
| Gap magnitude | +15 | abs(gap) >= 5 |
| Matchup spread | +20 | TF diff >= 8 |
| Matchup spread | +10 | TF diff >= 5 |
| PL zone valid | +15 | Zone confirms bias direction |
| Box alignment | +10 | Both H1 + H4 aligned |
| Box alignment | +5 | Only H1 aligned |
| Momentum | +10 | STRONG |
| Momentum | +5 | BUILDING |
| Strength | +10 | abs(strength) >= 3 |
| Strength | +5 | abs(strength) >= 1 |
| H4 box penalty | -10 | H4 trend opposes bias |
| PL zone penalty | -15 | Zone does NOT confirm bias |
| Weak momentum | -10 | FADING/REVERSING/COOLING/NEUTRAL |

Tiers: ELITE (90+), HIGH (75+), MOD (60+), LOW (40+), WEAK (<40)

---

## 10. Auto-Heal & Resilience

| Feature | Trigger | Action |
|---------|---------|--------|
| Supabase retry | 522/timeout errors | Exponential backoff (3 retries) |
| Telegram circuit breaker | 5 consecutive failures | 120s lockout |
| File read retry | PermissionError | 6 retries with exponential backoff (0.3s base) |
| Stale file handling | >5 pairs stale for 3 cycles | sys.exit(1) for auto-restart |
| Weekend mode | Fri 22:00 - Sun 22:00 UTC | Allows 72h stale files, skips engine cycles |
| PREV_GAP pre-load | Engine restart | Loads from Supabase to prevent phantom BB signals |
| Daily cleanup | Once per day | Purges signal_snapshots, gap_history, strength_log, engine_logs older than 7 days |
