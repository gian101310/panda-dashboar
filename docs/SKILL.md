---
name: panda-engine
description: >
  Complete project context for the Panda Engine forex intelligence platform.
  Use this skill for ANY task involving Panda Engine, the trading dashboard,
  app.py engine, cTrader journal, Supabase backend, or Vercel deployment.
  Trigger on: dashboard.js edits, new tabs, component fixes, API routes,
  Supabase queries, engine scoring, TBG indicator, momentum states,
  gap analysis, deployment, git push, patch scripts, or any mention of
  "panda", "dashboard", "engine", "pairs", "gap score", "momentum",
  "TBG", "cTrader", "trade journal", "spike", "strength", "signals".
  ALWAYS read this skill before touching any Panda Engine file.
  ALSO read AI_BUILD_PLAN.md before any AI agent or signal_tracker work.
---

# Panda Engine — Project Skill

> **Purpose**: Eliminate redundant file scanning. Jump straight to the correct line and edit.
> **Behavioral rules, gotchas, workflow order** → stored in memory (not here).
> **Last audit**: May 15, 2026

---

## 1. FILE MAP

### Engine (Python/FastAPI — local PC, future VPS)

| File | Path | Purpose |
|------|------|---------|
| **app.py** | `C:\Users\Admin\Desktop\ctrader_trend_scanner\app.py` | Core engine (~2234 lines): MT4 parser, scoring, Supabase push, signals, Telegram, scheduler, MQ4 export |
| **check_dupes.py** | `C:\Users\Admin\Desktop\ctrader_trend_scanner\check_dupes.py` | **RUN BEFORE EVERY PUSH** |

### Dashboard (Next.js 14 — Vercel)

| File | Path | Purpose |
|------|------|---------|
| **dashboard.js** | `C:\Users\Admin\panda-dashboard\pages\dashboard.js` | Main dashboard (~3356 lines, all tabs/components) |
| **_app.js** | `C:\Users\Admin\panda-dashboard\pages\_app.js` | Global app wrapper (maintenance gate) |
| **ai-chat.js** | `C:\Users\Admin\panda-dashboard\pages\api\ai-chat.js` | Panda AI — 3 modes (insights, review, chat) |
| **signal-tracker.js** | `C:\Users\Admin\panda-dashboard\pages\api\signal-tracker.js` | Signal lifecycle tracking |
| **signal-agent.js** | `C:\Users\Admin\panda-dashboard\pages\api\signal-agent.js` | Analyzes signal_results |
| **journal-agent.js** | `C:\Users\Admin\panda-dashboard\pages\api\journal-agent.js` | Analyzes manual_trades |
| **pattern-agent.js** | `C:\Users\Admin\panda-dashboard\pages\api\pattern-agent.js` | Cross-references signal + journal |
| **maintenance.js** | `C:\Users\Admin\panda-dashboard\pages\api\maintenance.js` | Maintenance mode toggle |
| **ea-data.js** | `C:\Users\Admin\panda-dashboard\pages\api\ea-data.js` | EA data endpoint |
| **strategies.js** | `C:\Users\Admin\panda-dashboard\pages\api\strategies.js` | User strategies CRUD |
| **open-trades.js** | `C:\Users\Admin\panda-dashboard\pages\api\open-trades.js` | Open trades endpoint |
| **calendar.js** | `C:\Users\Admin\panda-dashboard\pages\api\calendar.js` | Calendar events |
| **lib/supabase.js** | `C:\Users\Admin\panda-dashboard\lib\supabase.js` | Shared Supabase client |
| **lib/auth.js** | `C:\Users\Admin\panda-dashboard\lib\auth.js` | Session validation |

### Standalone Pages (10 total)

| File | Purpose |
|------|---------|
| `index.js` | Landing page |
| `login.js` | Login page |
| `pending.js` | Pending approval page |
| `stream.js` | Stream page |
| `pricing.js` | Pricing page |
| `funnel.js` | Funnel / onboarding |
| `portfolio.js` | Portfolio page |
| `strength.js` | Currency strength page |
| `journal.js` | Journal page |
| `admin/index.js` | Admin panel |
| `admin/pf-approvals.js` | PF approval admin |

### Admin API Routes

| File | Purpose |
|------|---------|
| `api/admin/index.js` | Admin dashboard data |
| `api/admin/logs.js` | Admin logs |
| `api/admin/sessions.js` | Session management |
| `api/admin/users.js` | User management |
| `api/admin/pf-approve.js` | PF approval actions |

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
| 8 | `ALL_PAIRS` | 21-pair array |
| 10–22 | `MOMENTUM_GUIDE` | Icon/action/color for 10 states |
| 25–91 | Utility functions | `stateColor`, `biasFromGap`, `boxTrend`, `tbgZoneBadge`, `atrFill` |
| 186–275 | `computeConfidence` | Multi-factor confidence 0–100 |
| 376–487 | `MomentumHeatmap` | Heatmap grid |
| 613–711 | `GapChart` | Gap history (canvas) |
| 869–933 | `PairCard` | Main pair card |
| 934–1092 | `PairCardModal` | Expanded modal |
| 1093–1203 | `ValidSetupsTab` | Box-confirmed setups |
| 1204–1355 | `ValidPairsTab` | Auto-filtered tradable pairs |
| ~1752–1830 | `PandaAIChat` | Panda AI tab (+ onboarding/guide) |
| ~1782 | `SignalAnalytics` | Signal performance V2 |
| ~2019 | `Dashboard()` | Main export |

### Tab Structure (13 tabs)
PANELS, SIGNALS, TABLE, GAP CHART, RESEARCH, CALCULATOR, SETUPS, VALID PAIRS, SPIKE LOG, CHART, ANALYTICS, SIGNAL LOG, PANDA AI

---

## 3. APP.PY ENGINE INDEX

| ~Line | Function / Route | Purpose |
|-------|-----------------|---------|
| 49–72 | Config block | MT4_PATH, tokens, creds, PAIRS list |
| 109–226 | `parse_tf_score`, `parse_mt4_file` | MT4 file → D1/H4/H1/ADV/ATR/BOX |
| 229–272 | `parse_tbg_file` | TBG → ST/FL/BIAS/ZONE/G1 |
| 274–324 | `compute_box_trends` | UPTREND/DOWNTREND/RANGING |
| 327–436 | `extract_panda_score`, `compute_scores_all_pairs` | **LOCKED — NEVER TOUCH** |
| 454–495 | `classify_momentum` | Momentum engine |
| 497–755 | `run_gap_once` | **Main loop** — parse → score → momentum → upsert |
| 880–909 | `send_spike_alert` | Spike detection + Telegram |
| 942–978 | `master_scheduler` | 5-min gap / 60-min snapshot |

---

## 4. SUPABASE TABLES (31 tables, verified May 15)

| Table | Records | Purpose |
|-------|---------|---------|
| `dashboard` | 21 | Live pair data (upserted every 5 min) |
| `signal_snapshots` | 5,220 | Snapshot history (stopped writing May 8) |
| `signal_results` | 1,822 | BB + INTRA strategy performance |
| `signal_tracker` | 3,989 | Signal lifecycle — session/box/pdr/prices |
| `manual_trades` | 0 | Real trades (currently empty) |
| `ai_memory` | 28 | AI agent findings |
| `admin_brain` | 18 | Boss-G brain (pref/coaching/pattern/rule) |
| `panda_users` | 6 | Users + roles + feature_access |
| `spike_events` | 1,015 | Spike alerts + gap spikes |
| `gap_history` | 30,181 | Historical gap scores |
| `pdr_cache` | 21 | PDR strength (15-min TTL) |
| `strength_log` | 17,203 | Currency strength time series |
| `trade_matrix` | 13,768 | Trade matrix data |
| `trade_events` | 1,088 | Trade events |
| `engine_logs` | 1,460 | Engine run logs |
| `panda_sessions` | 284 | User sessions |
| `panda_access_logs` | 535 | Access logs |
| `site_config` | 1 | Site-wide config (maintenance mode etc.) |
| `pf_signup_requests` | 12 | Signup requests |
| `pf_security_events` | 215 | Security events |
| `pf_known_devices` | 28 | Known devices |
| `pf_known_ips` | 29 | Known IPs |

---

## 5. API ROUTES (37 total)

| Route | Purpose |
|-------|---------|
| `/api/data` | Dashboard rows |
| `/api/ai-chat` | Panda AI (3 modes) |
| `/api/signal-analytics` | Signal performance |
| `/api/signal-log` | Signal snapshots |
| `/api/signal-tracker` | Tracker CRUD |
| `/api/gap-chart` | Gap history |
| `/api/heatmap` | Momentum heatmap |
| `/api/spikes` | Spike log |
| `/api/pdr` | PDR strength |
| `/api/upcoming-news` | ForexFactory alerts |
| `/api/ai-memory` | Memory CRUD |
| `/api/admin-brain` | Brain CRUD |
| `/api/journal` | Trade journal CRUD |
| `/api/journal-upload` | CSV upload |
| `/api/login` / `logout` / `me` | Auth |
| `/api/engine-health` | Status |
| `/api/maintenance` | Maintenance mode toggle |
| `/api/ea-data` | EA data endpoint |
| `/api/strategies` | User strategies |
| `/api/open-trades` | Open trades |
| `/api/calendar` | Calendar |
| `/api/currency-strength` | Strength data |
| `/api/strength-history` | Strength time series |
| `/api/cot` | COT data |
| `/api/alert-prefs` | Alert preferences |
| `/api/notify-telegram` | Telegram notifications |
| `/api/telegram-webhook` | Webhook handler |
| `/api/public-signals` | Public signal feed |
| `/api/pf-signup` / `pf-me` / `pf-log-event` | Platform funnel |
| `/api/admin/*` | Admin panel (logs, sessions, users, pf-approve) |
| `/api/bakupjournal` | Legacy (stale cTrader ref) |

---

## 6. CODE STYLE

```
Fonts: Share Tech Mono (data), Orbitron (headings), Rajdhani (body)
Colors: BUY=#00ff9f, SELL=#ff4d6d, accent=#00b4ff, warn=#ffd166, cool=#ffaa44
```
- All styles inline — no CSS modules
- Ternary chain for tab rendering
- Hooks destructured: `useState`, `useEffect`, `useCallback`, `useRef`
- Single file: all components in dashboard.js
- API routes: always import from `../../lib/supabase`
- Entry levels renamed: ENTRY → PB ENTRY

---

## 7. STRATEGY DEFINITIONS (LOCKED)

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

## 8. QUICK REFERENCE

- Signal validity: `!hard_invalid && bias in (BUY,SELL) && |gap|>=5 && TBG confirms`
- G1 Colors: Red=Strong Sell, Green=Strong Buy, Yellow=Anticipation, White=No Trade
- `isMobile` breakpoint: 768px
- Vercel auto-deploys on push to main
- Maintenance mode: `site_config` table + global gate in `_app.js`

---

## 9. KNOWN ISSUES (May 15, 2026)

- Stale cTrader refs: `bakupjournal.js`, journal UI text, dead `/test-ctrader` in app.py
- signal_snapshots: old data purged (5,220 rows), writer confirmed working
- manual_trades: table reset to 0 (intentional)

### RESOLVED (confirmed May 15)
- Box badges: WORKING — all 21 pairs showing valid box_h1_trend (UPTREND/DOWNTREND/RANGING)
- PL zones: WORKING — all 21 pairs have pl_zone (ABOVE/BELOW/BETWEEN) + pl_bias
- PDR: WORKING — pdr_cache populated for all 21 pairs
- Panda_Exporter EA: compiled and attached
