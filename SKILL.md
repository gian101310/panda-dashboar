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
---

# Panda Engine — Project Skill

> **Purpose**: Eliminate redundant file scanning. This skill contains the
> complete file map, component index, code conventions, and operation
> playbooks so Claude can jump straight to the correct line and edit.

---

## 1. FILE MAP

### Engine (Python/FastAPI — local PC, future VPS)

| File | Path | Lines | Purpose |
|------|------|-------|---------|
| **app.py** | `C:\Users\Admin\Desktop\ctrader_trend_scanner\app.py` | 1331 | Core engine: MT4 parser, scoring, Supabase push, signal snapshots, Telegram, scheduler |
| **ctrader_journal.py** | `C:\Users\Admin\Desktop\ctrader_trend_scanner\ctrader_journal.py` | 229 | cTrader Open API → `trade_journal` table |
| **check_dupes.py** | `C:\Users\Admin\Desktop\ctrader_trend_scanner\check_dupes.py` | — | **RUN BEFORE EVERY PUSH** — catches duplicate function defs |

### Dashboard (Next.js 14 — Vercel)

| File | Path | Lines | Purpose |
|------|------|-------|---------|
| **dashboard.js** | `C:\Users\Admin\panda-dashboard\pages\dashboard.js` | 2459 | Main dashboard — all tabs, components, rendering (mobile responsive) |
| **strength.js** | `C:\Users\Admin\panda-dashboard\pages\strength.js` | — | Currency strength chart (canvas) |
| **journal.js** | `C:\Users\Admin\panda-dashboard\pages\journal.js` | — | Trade journal page |
| **admin/index.js** | `C:\Users\Admin\panda-dashboard\pages\admin\index.js` | — | Admin panel (users, features, logs) |
| **index.js** | `C:\Users\Admin\panda-dashboard\pages\index.js` | — | Login page |
| **ThemeToggle.js** | `C:\Users\Admin\panda-dashboard\components\ThemeToggle.js` | — | Dark/light theme toggle |

### Key Paths

- **MT4 data dir**: `C:\Users\Admin\AppData\Roaming\MetaQuotes\Terminal\Common\Files`
- **Git repo**: `github.com/gian101310/panda-dashboar` (note: no 'd' at end)
- **Vercel URL**: `panda-dashboard.vercel.app`
- **Supabase project ID**: `jxkelchxitwuilpbrwxk`
- **Engine runs on**: `uvicorn app:app --host 0.0.0.0 --port 8000`

---

## 2. DASHBOARD.JS COMPONENT INDEX

> **CRITICAL**: Read exact line ranges below — never scan the whole file.
> Use `Desktop Commander:read_file` with `offset` and `length` to jump directly.

| Line | Component / Constant | Purpose |
|------|---------------------|---------|
| 8 | `ALL_PAIRS` | 21-pair array constant |
| 10–22 | `MOMENTUM_GUIDE` | Icon/action/color map for 10 momentum states |
| 25–41 | `stateColor`, `biasFromGap`, `isValid` | Core utility functions |
| 45–54 | `boxTrend` | Box trend detection (UP/DOWN/RANGING) |
| 56–65 | `boxConfirm` | Box confirmation + ATR fill helpers |
| 66–81 | `tbgZoneBadge` | FL-ST zone badge (ABOVE/BELOW/BETWEEN) |
| 82–91 | `atrFill` | ATR fill percentage helper |
| 92–146 | `advScore` | Advance score warning logic |
| 147–185 | `scoreLabel`, `getMatchup` | Currency strength matchup labels |
| 186–275 | `computeConfidence` | Confidence scoring system (ELITE/HIGH/MOD) |
| 237–259 | `signalLabel`, `strColor`, `formatTime`, `formatDt`, `timeAgo` | Display helpers |
| 276–301 | `playBeep` | Sound alert (Web Audio API) |
| 302–329 | `TrendArrow`, `Sparkline`, `DeltaChip` | Small visual components |
| 330–375 | `SpikeBanner` | Spike alert banner |
| 376–487 | `MomentumHeatmap` | Full momentum heatmap grid |
| 488–612 | `AlertSettingsModal` | Per-user alert settings |
| 613–711 | `GapChart` | Gap history chart (canvas) |
| 712–763 | `EconomicCalendar` | Calendar with pair filtering (used inside ResearchTab) |
| 764–817 | `PositionCalculator` | Lot size / risk calculator |
| 818–843 | `EngineHealth` | Engine status (admin only) |
| 844–868 | `CotRow`, `StatCard` | COT row + stat card atoms |
| 869–933 | `PairCard` | Main pair card (panels view) |
| 934–1092 | `PairCardModal` | Click-to-expand modal (accepts `isMobile` prop) |
| 1093–1203 | `ValidSetupsTab` | Filtered setups with box confirmation |
| 1204–1355 | `ValidPairsTab` | Auto-filtered tradable pairs |
| 1356–1495 | `OpenTradesPanel` | Open trades (admin only) |
| 1496–1553 | `SpikeLogTab` | Spike log with time-in-minutes |
| 1554–1629 | `buildTVDoc`, `ChartTab` | TradingView chart tab (srcdoc iframe) |
| 1630–1731 | `SignalLogTab` | Signal snapshot log with filters (date/pair/bias/valid) |
| 1732–1753 | `ResearchTab` | **NEW** Combined Calendar + COT tab with subtab toggle |
| 1754 | `TABS` | Tab name array (12 tabs) |
| 1755–1770 | `TAB_FEATURE` | Tab → feature_access key mapping |
| 1771–1780 | `FILTERS`, `SORTS` | Filter buttons and sort options |
| 1782–1911 | `SignalAnalytics` | Signal performance analytics V2 |
| 1912–2018 | `SignalFlashcard` | Signal flashcard component |
| 2019–2459 | `export default function Dashboard()` | **Main component** — state, fetch, tabs, render |

### Main Dashboard State (line ~2019)
Key state variables: `data`, `trends`, `cotMap`, `tab`, `filter`, `sort`, `search`,
`isAdmin`, `user`, `selectedPair`, `popup`, `lastUpdate`, **`isMobile`** (responsive hook).

### Tab Rendering (line ~2240–2430)
Ternary chain: `tab==='PANELS'` → `tab==='SETUPS'` → `tab==='VALID PAIRS'` →
`tab==='SPIKE LOG'` → `tab==='CHART'` → `tab==='SIGNALS'` → `tab==='ANALYTICS'` →
`tab==='SIGNAL LOG'` → `tab==='TABLE'` → `tab==='GAP CHART'` → `tab==='RESEARCH'` →
`tab==='CALCULATOR'` → `tab==='ENGINE'`

### Mobile Responsive (line ~2040)
`isMobile` state + `useEffect` resize listener (breakpoint: 768px).
Applied to: header wrap, tab scroll, content padding, grid columns, modal fullscreen.
PairCardModal receives `isMobile` as prop.

---

## 3. APP.PY ENGINE INDEX

| Line | Function / Route | Purpose |
|------|-----------------|---------|
| 49–72 | Config block | MT4_PATH, Telegram tokens, Supabase creds, PAIRS list |
| 75–101 | `TelegramCircuitBreaker` | Rate-limit protection for Telegram API |
| 103–106 | `safe_float` | Safe float parser |
| 109–226 | `parse_tf_score`, `parse_mt4_file` | Reads mt4_SYMBOL.txt → dict with D1/H4/H1/ADV/ATR/BOX |
| 229–272 | `parse_tbg_file` | Reads tbg_SYMBOL.txt → ST/FL/BIAS/ZONE/G1 |
| 274–324 | `compute_box_trends` | Detects UPTREND/DOWNTREND/RANGING from box levels |
| 327–436 | `extract_panda_score`, `compute_scores_all_pairs` | **Core scoring**: GAP, BIAS, CONFIDENCE, EXECUTION |
| 438–452 | `get_gap_history` | Fetches gap_history from Supabase |
| 454–495 | `classify_momentum`, `should_close_alert`, `classify_structural_state` | Momentum engine |
| 497–755 | `run_gap_once` | **Main engine loop** — parse → score → momentum → Supabase upsert |
| 968–995 | **Signal snapshots insert** | Logs all 21 pairs to `signal_snapshots` after dashboard upsert |
| 757–809 | `generate_snapshot` | Renders PNG snapshot with PIL |
| 811–866 | `send_snapshot` | Posts snapshot to Telegram |
| 880–909 | `send_spike_alert` | Spike detection + Telegram alert |
| 911–938 | `POST /api/login-alert` | Login notification to Telegram |
| 942–978 | `master_scheduler` | 5-min gap / 60-min snapshot loop |
| 990–1038 | Routes: `/`, `/force`, `/force-gap`, `/status` | Manual triggers + health check |

---

## 4. SUPABASE TABLES (15 tables)

| Table | Used By | Purpose |
|-------|---------|---------|
| `dashboard` | app.py, API `/data` | Live pair data (upserted every 5 min) |
| `gap_history` | app.py, API `/gap-chart` | Historical gap scores per pair |
| `signal_snapshots` | app.py, API `/signal-log` | All 21 pairs logged every cycle (valid+invalid) |
| `signal_results` | app.py, API `/signal-analytics` | V2 strategy performance (BB + INTRA) |
| `strength_log` | app.py, API `/strength-history` | Currency strength time series |
| `spike_events` | app.py, API `/spikes` | Spike alerts with timestamps |
| `engine_logs` | app.py, API `/engine-health` | Engine run logs |
| `panda_users` | API `/login`, `/me`, `/admin/users` | User accounts + roles |
| `panda_sessions` | API `/login`, `/logout` | Active sessions |
| `panda_access_logs` | API `/admin/logs` | Login audit trail |
| `trade_journal` | ctrader_journal.py, API `/journal` | Synced trades from cTrader |
| `manual_trades` | API `/journal` | Manually logged trades |
| `csv_uploads` | API `/journal-upload` | Imported trade CSVs |
| `user_strategies` | API `/strategies` | Custom strategy labels |
| `user_alert_prefs` | API `/alert-prefs` | Per-user alert preferences |
| `telegram_subscriptions` | API `/notify-telegram` | Telegram notification opt-ins |

### signal_snapshots columns
`id` (uuid PK), `timestamp` (timestamptz), `symbol`, `gap`, `bias`, `confidence`, `execution`,
`momentum`, `state`, `strength`, `signal`, `hard_invalid`, `close_alert`, `delta_short/mid/long`,
`base_d1/h4/h1`, `quote_d1/h4/h1`, `adv_base_d1/h4/h1`, `adv_quote_d1/h4/h1`,
`atr`, `atr_reference`, `spread`, `box_h1_trend`, `box_h4_trend`,
`tbg_zone`, `tbg_bias`, `tbg_g1_valid`, `is_valid`, `base_currency`, `quote_currency`
Indexes: `timestamp DESC`, `(symbol, timestamp DESC)`, `(is_valid, timestamp DESC)`

### Roles & Access
- **Admin** > **VIP** > **User** (stored in `panda_users.role`)
- `feature_access` TEXT[] column controls per-user tab visibility
- `TAB_FEATURE` map in dashboard.js links tab names to feature keys

---

## 5. NEXT.JS API ROUTES

| Route | File | Method | Purpose |
|-------|------|--------|---------|
| `/api/data` | `data.js` | GET | Fetch all dashboard rows |
| `/api/gap-chart` | `gap-chart.js` | GET | Gap history for chart |
| `/api/signal-log` | `signal-log.js` | GET | Signal snapshots (filters: symbol, bias, valid, from, to, limit) |
| `/api/signal-analytics` | `signal-analytics.js` | GET | Signal performance stats |
| `/api/strength-history` | `strength-history.js` | GET | Currency strength series |
| `/api/heatmap` | `heatmap.js` | GET | Momentum heatmap data |
| `/api/spikes` | `spikes.js` | GET | Spike event log |
| `/api/calendar` | `calendar.js` | GET | Economic calendar (external) |
| `/api/cot` | `cot.js` | GET | COT report data |
| `/api/engine-health` | `engine-health.js` | GET | Engine status + logs |
| `/api/open-trades` | `open-trades.js` | GET | Live open trades |
| `/api/currency-strength` | `currency-strength.js` | GET | Real-time strength |
| `/api/login` | `login.js` | POST | Auth login |
| `/api/logout` | `logout.js` | POST | Auth logout |
| `/api/me` | `me.js` | GET | Current user info |
| `/api/journal` | `journal.js` | GET/POST | Trade journal CRUD |
| `/api/journal-upload` | `journal-upload.js` | POST | CSV/XLSX import |
| `/api/strategies` | `strategies.js` | GET/POST | Strategy management |
| `/api/alert-prefs` | `alert-prefs.js` | GET/POST | Alert preferences |
| `/api/notify-telegram` | `notify-telegram.js` | POST | Telegram subscribe |
| `/api/admin` | `admin/index.js` | GET/POST | Admin user management |
| `/api/admin/users` | `admin/users.js` | GET/POST | User CRUD |
| `/api/admin/logs` | `admin/logs.js` | GET | Access logs |
| `/api/admin/sessions` | `admin/sessions.js` | GET | Active sessions |

---

## 6. CODE STYLE & CONVENTIONS

### Fonts
```
const mono = "'Share Tech Mono',monospace";  // Data, labels, badges
const orb  = "'Orbitron',sans-serif";        // Headings, titles, scores
const raj  = "'Rajdhani',sans-serif";        // Input fields, body text
```

### Color Palette
| Usage | Color | Hex |
|-------|-------|-----|
| BUY / bullish | Green | `#00ff9f` |
| SELL / bearish | Red | `#ff4d6d` |
| UI accent / active tab | Blue | `#00b4ff` |
| Warning / caution | Yellow | `#ffd166` |
| Cooling / transition | Orange | `#ffaa44` |

### Component Patterns
- **All styles are inline** — no CSS modules or styled-components
- **Ternary chain** for tab rendering (not switch/case)
- **Hooks**: `useState`, `useEffect`, `useCallback`, `useRef` (destructured, NOT `React.useState`)
- **Single file**: all components in `dashboard.js` (except ThemeToggle)
- **Data flow**: `Dashboard()` fetches → passes `data`, `trends`, `cotMap` as props
- **Mobile**: `isMobile` state (768px breakpoint), passed as prop where needed

### Scoring Logic
- GAP SCORE: sum of BASE – QUOTE across D1/H4/H1 (range ±18)
- BIAS: BUY if gap ≥ 5, SELL if gap ≤ -5, else WAIT
- EXECUTION: MARKET if |gap| ≥ 9, PULLBACK if ≥ 5
- CONFIDENCE: HIGH ≥ 10, MEDIUM ≥ 8, LOW ≥ 5
- Conflict threshold: |gap| ≥ 4 is extreme (not 3)

### Validity (is_valid in signal_snapshots)
`is_valid = !hard_invalid && bias in (BUY,SELL) && |gap| >= 5 && TBG zone confirms`
TBG confirms: BUY+ABOVE or SELL+BELOW

### Momentum States (10 values)
STRONG, BUILDING, SPARK, CONSOLIDATING, COOLING, FADING, REVERSING, STABLE, NEUTRAL, EMERGING

### 21 Forex Pairs
AUDJPY, AUDCAD, AUDNZD, AUDUSD, CADJPY, EURAUD, EURCAD, EURGBP, EURJPY, EURNZD,
EURUSD, GBPAUD, GBPCAD, GBPJPY, GBPNZD, GBPUSD, NZDCAD, NZDJPY, NZDUSD, USDCAD, USDJPY

---

## 7. TOOLING GOTCHAS (CRITICAL)

1. **Python**: Always use `py -3.11` — NOT `python` (invokes 3.14 lacking packages)
2. **Git commits**: Use `.bat` files — `cmd` breaks on special chars with `&&`
3. **check_dupes.py**: Run BEFORE every git push
4. **dashboard.js writes**: Use `write_file` with `mode: append` in 25-30 line chunks
5. **Restore corrupted dashboard.js**: `git show HEAD:pages/dashboard.js > pages\dashboard.js`
6. **PowerShell emoji**: Use `[System.IO.File]::WriteAllText()` with UTF-8
7. **uvicorn restart**: Gian restarts manually (Desktop Commander unreliable for this)
8. **Patching**: Write `.py` file in engine dir, execute with `py -3.11 scriptname.py`
9. **Vercel env vars**: Set in Vercel dashboard, NOT `.env.local`
10. **Engine config**: Hardcoded in `app.py` lines 49-72

---

## 8. OPERATION PLAYBOOKS

### PLAYBOOK A: Fix a Bug
1. Read this skill → identify file + line range from Component Index
2. `read_file` with exact `offset` and `length` (never read full 2459 lines)
3. `edit_block` with `old_string` / `new_string`
4. Run `py -3.11 check_dupes.py` from `C:\Users\Admin\panda-dashboard`
5. Run `npx next build` to verify
6. Write `.bat` file for git commit + push
7. Verify Vercel deployment

### PLAYBOOK B: Add a New Dashboard Tab
1. Define component function BEFORE line 1754 (`const TABS`)
2. Add tab name to `TABS` array (line 1754)
3. Add feature key to `TAB_FEATURE` map (line 1755)
4. Add ternary render case in tab chain (around line 2240–2430)
5. Run check_dupes → build → bat push

### PLAYBOOK C: Add a New API Route
1. Create `pages/api/routename.js`
2. Import `createClient` from `@supabase/supabase-js`
3. Use `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from env
4. Export default async handler
5. Build → push

### PLAYBOOK D: Modify Engine Scoring
1. Read `app.py` lines 327-436 (scoring section)
2. Edit with `edit_block`
3. Test locally: `py -3.11 -c "from app import extract_panda_score; ..."`
4. Restart uvicorn manually

### PLAYBOOK E: Deploy Dashboard
```
cd C:\Users\Admin\panda-dashboard
py -3.11 check_dupes.py
npx next build
:: Write commit.bat:
@echo off
cd /d C:\Users\Admin\panda-dashboard
git add -A
git commit -m "description here"
git push origin main
:: Run commit.bat
```

### PLAYBOOK F: Add a Supabase Table
1. Use `Supabase:apply_migration` with project `jxkelchxitwuilpbrwxk`
2. Enable RLS, add policies for service_role and authenticated
3. Add API route in `pages/api/`
4. If engine needs it, add to `app.py` with `supabase.table('name')`
5. Update this skill's table list

---

## 9. KEEPING THIS SKILL UPDATED

After significant changes to dashboard.js (adding/removing components,
changing line counts by >20 lines), update the Component Index above.

Quick way to regenerate the index:
```
py -3.11 C:\Users\Admin\Desktop\ctrader_trend_scanner\scan_dashboard.py
```

---

## 10. QUICK REFERENCE

**To find a component**: Check Section 2 table → `read_file offset=LINE length=SIZE`
**To find an engine function**: Check Section 3 table → same approach
**To find a table schema**: Check Section 4 table → query Supabase directly if needed
**To deploy**: Follow Playbook E
**To add a tab**: Follow Playbook B
**To fix a bug**: Follow Playbook A

**Import pattern** (dashboard.js line 1):
```js
import { useState, useEffect, useCallback, useRef } from 'react';
```
Never use `React.useState` — React is NOT imported as namespace.

**G1 Trading System Colors**: Red=Strong Sell, Green=Strong Buy, Yellow=Anticipation, White=No Trade
**TBG Zones**: ABOVE both lines=BUY valid, BELOW both=SELL valid, BETWEEN=always invalid
**Signal validity**: `!hard_invalid && bias in (BUY,SELL) && |gap|>=5 && TBG confirms`

**Tab structure** (12 tabs):
PANELS, SIGNALS, TABLE, GAP CHART, RESEARCH (Calendar|COT subtabs), CALCULATOR,
SETUPS, VALID PAIRS, SPIKE LOG, CHART, ANALYTICS, SIGNAL LOG
