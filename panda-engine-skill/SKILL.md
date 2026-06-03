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
| **app.py** | `C:\Users\Admin\Desktop\ctrader_trend_scanner\app.py` | 1038 | Core engine: MT4 parser, scoring, Supabase push, Telegram, scheduler |
| **ctrader_journal.py** | `C:\Users\Admin\Desktop\ctrader_trend_scanner\ctrader_journal.py` | 229 | cTrader Open API → `trade_journal` table |
| **check_dupes.py** | `C:\Users\Admin\Desktop\ctrader_trend_scanner\check_dupes.py` | — | **RUN BEFORE EVERY PUSH** — catches duplicate function defs |

### Dashboard (Next.js 14 — Vercel)

| File | Path | Lines | Purpose |
|------|------|-------|---------|
| **dashboard.js** | `C:\Users\Admin\panda-dashboard\pages\dashboard.js` | 2052 | Main dashboard — all tabs, components, rendering |
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
| 70–81 | `tbgZoneBadge` | FL-ST zone badge (ABOVE/BELOW/BETWEEN) |
| 82–91 | `atrFill` | ATR fill percentage helper |
| 95–118 | `advScore` | Advance score warning logic |
| 121–157 | `scoreLabel`, `getMatchup` | Currency strength matchup labels |
| 158–195 | `signalLabel`, `strColor`, `formatTime`, `formatDt`, `timeAgo` | Display helpers |
| 198–222 | `playBeep` | Sound alert (Web Audio API) |
| 224–249 | `TrendArrow`, `Sparkline`, `DeltaChip` | Small visual components |
| 252–296 | `SpikeBanner` | Spike alert banner |
| 298–408 | `MomentumHeatmap` | Full momentum heatmap grid |
| 410–533 | `AlertSettingsModal` | Per-user alert settings |
| 535–632 | `GapChart` | Gap history chart (canvas) |
| 634–684 | `EconomicCalendar` | Calendar tab with pair filtering |
| 686–738 | `PositionCalculator` | Lot size / risk calculator |
| 740–764 | `EngineHealth` | Engine status (admin only) |
| 766–789 | `CotRow`, `StatCard` | COT row + stat card atoms |
| 791–845 | `PairCard` | Main pair card (panels view) |
| 847–1003 | `PairCardModal` | Click-to-expand modal for pair details |
| 1005–1113 | `ValidSetupsTab` | Filtered setups with box confirmation |
| 1115–1220 | `ValidPairsTab` | Auto-filtered tradable pairs |
| 1222–1360 | `OpenTradesPanel` | Open trades (admin only) |
| 1362–1417 | `SpikeLogTab` | Spike log with time-in-minutes |
| 1418–1493 | `buildTVDoc`, `ChartTab` | TradingView chart tab (srcdoc iframe) |
| 1494 | `TABS` | Tab name array |
| 1496–1509 | `TAB_FEATURE` | Tab → feature_access key mapping |
| 1510–1519 | `FILTERS`, `SORTS` | Filter buttons and sort options |
| 1521–1630 | `SignalFlashcard` | Signal flashcard component |
| 1631–2052 | `export default function Dashboard()` | **Main component** — state, fetch, tabs, render |

### Main Dashboard State (line ~1631)
Key state variables: `data`, `trends`, `cotMap`, `tab`, `filter`, `sort`, `search`,
`isAdmin`, `user`, `selectedPair`, `popup`, `lastUpdate`.

### Tab Rendering (line ~1855–1998)
Ternary chain: `tab==='PANELS'` → `tab==='SETUPS'` → `tab==='VALID PAIRS'` →
`tab==='SPIKE LOG'` → `tab==='CHART'` → `tab==='SIGNALS'` → `tab==='TABLE'` →
`tab==='GAP CHART'` → `tab==='CALENDAR'` → `tab==='CALCULATOR'` →
`tab==='ENGINE'` → `tab==='COT REPORT'`

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
| 757–809 | `generate_snapshot` | Renders PNG snapshot with PIL |
| 811–866 | `send_snapshot` | Posts snapshot to Telegram |
| 880–909 | `send_spike_alert` | Spike detection + Telegram alert |
| 911–938 | `POST /api/login-alert` | Login notification to Telegram |
| 942–978 | `master_scheduler` | 5-min gap / 60-min snapshot loop |
| 990–1038 | Routes: `/`, `/force`, `/force-gap`, `/status` | Manual triggers + health check |

---

## 4. SUPABASE TABLES (14 tables)

| Table | Used By | Purpose |
|-------|---------|---------|
| `dashboard` | app.py, API `/data` | Live pair data (upserted every 5 min) |
| `gap_history` | app.py, API `/gap-chart` | Historical gap scores per pair |
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

### Fonts (CSS variables used everywhere in dashboard.js)
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
| Muted text | CSS var | `var(--text-muted)` |
| Borders | CSS var | `var(--border)` |
| Background | CSS var | `var(--bg-primary)`, `var(--bg-secondary)` |

### Component Patterns
- **All styles are inline** — no CSS modules or styled-components
- **Ternary chain** for tab rendering (not switch/case)
- **Hooks**: use `useState`, `useEffect`, `useCallback`, `useRef` (destructured import, NOT `React.useState`)
- **Single file**: all components live in `dashboard.js` (no separate component files except ThemeToggle)
- **Data flow**: `Dashboard()` fetches → passes `data`, `trends`, `cotMap` as props to child tabs

### Scoring Logic
- GAP SCORE: sum of BASE – QUOTE across D1/H4/H1 (range ±18)
- BIAS: BUY if gap ≥ 5, SELL if gap ≤ -5, else WAIT
- EXECUTION: MARKET if |gap| ≥ 9, PULLBACK if ≥ 5
- CONFIDENCE: HIGH ≥ 10, MEDIUM ≥ 8, LOW ≥ 5
- Conflict threshold: |gap| ≥ 4 is extreme (not 3)

### Momentum States (10 values)
STRONG, BUILDING, SPARK, CONSOLIDATING, COOLING, FADING, REVERSING, STABLE, NEUTRAL, EMERGING

### 21 Forex Pairs
AUDJPY, AUDCAD, AUDNZD, AUDUSD, CADJPY, EURAUD, EURCAD, EURGBP, EURJPY, EURNZD,
EURUSD, GBPAUD, GBPCAD, GBPJPY, GBPNZD, GBPUSD, NZDCAD, NZDJPY, NZDUSD, USDCAD, USDJPY

---

## 7. TOOLING GOTCHAS (CRITICAL)

1. **Python**: Always use `py -3.11` — NOT `python` (which invokes 3.14 lacking packages)
2. **Git commits**: Use `.bat` files for commit messages — `cmd` breaks on special chars with `&&`
3. **check_dupes.py**: Run BEFORE every git push — catches duplicate function defs that crash Vercel builds
4. **dashboard.js writes**: If writing large chunks, use `write_file` with `mode: append` in 25-30 line chunks
5. **Restore corrupted dashboard.js**: `git show HEAD:pages/dashboard.js > pages\dashboard.js`
6. **PowerShell emoji**: Use position-based replacement, not pattern matching; use `[System.IO.File]::WriteAllText()` with UTF-8
7. **uvicorn restart**: `start cmd /k` from Desktop Commander is unreliable — Gian restarts manually
8. **Patching pattern**: Write patch logic to `.py` file in engine dir, execute with `py -3.11 scriptname.py`
9. **Vercel env vars**: Set in Vercel dashboard, NOT in `.env.local` for production
10. **Engine config**: Hardcoded in `app.py` lines 49-72 (not env vars)

---

## 8. OPERATION PLAYBOOKS

### PLAYBOOK A: Fix a Bug
1. Read this skill → identify file + line range from Component Index
2. `read_file` with exact `offset` and `length` (never read full 2052 lines)
3. `edit_block` with `old_string` / `new_string`
4. Run `py -3.11 check_dupes.py` from `C:\Users\Admin\panda-dashboard`
5. Run `npx next build` to verify
6. Write `.bat` file for git commit + push
7. Verify Vercel deployment

### PLAYBOOK B: Add a New Dashboard Tab
1. Define component function BEFORE line 1494 (`const TABS`)
2. Add tab name to `TABS` array (line 1494)
3. Add feature key to `TAB_FEATURE` map (line 1496)
4. Add ternary render case in tab chain (around line 1855-1998)
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
1. Create table in Supabase dashboard (project `jxkelchxitwuilpbrwxk`)
2. Enable RLS, add policies for service_role and authenticated
3. Add API route in `pages/api/`
4. If engine needs it, add to `app.py` with `supabase.table('name')`
5. Update this skill's table list

---

## 9. KEEPING THIS SKILL UPDATED

After making significant changes to dashboard.js (adding/removing components,
changing line counts by more than ~20 lines), update the Component Index above.

Quick way to regenerate the index:
```
py -3.11 C:\Users\Admin\Desktop\ctrader_trend_scanner\scan_dashboard.py
```

This prints all function definitions with line numbers.

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
