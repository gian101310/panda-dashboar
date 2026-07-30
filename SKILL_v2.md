---
name: panda-engine
description: >
  File map, strategy definitions, and code style for Panda Engine.
  Use for ANY task involving dashboard.js, app.py, API routes, Supabase, or deployment.
  Trigger on: "panda", "dashboard", "engine", "pairs", "gap score", "momentum",
  "TBG", "trade journal", "spike", "strength", "signals", "setups", "valid pairs".
  Behavioral rules, gotchas, deploy safety, multi-agent coordination → stored in memory (not here).
  ALSO read AI_BUILD_PLAN.md before any AI agent or signal_tracker work.
---

# Panda Engine — Project Skill (v2 — slim)

> Behavioral rules, deploy safety, multi-agent coordination, gotchas → **memory** (feedback_rules.md)
> Project overview, IDs, env vars, Telegram bots → **memory** (project_panda_engine_overview.md)

---

## 1. FILE MAP

### Engine (Python/FastAPI — local, future VPS)

| File | Path | Purpose |
|------|------|---------|
| **app.py** | `Panda Engine\app.py` | Core engine: MT4 parser, scoring, Supabase push, signals, Telegram, scheduler, MQ4 export |
| **check_dupes.py** | `Panda Engine\check_dupes.py` | **RUN BEFORE EVERY PUSH** |

### Dashboard (Next.js 14 — Vercel)

| File | Path | Purpose |
|------|------|---------|
| **dashboard.js** | `panda-dashboard\pages\dashboard.js` | Main dashboard (all tabs/components) |
| **ai-chat.js** | `panda-dashboard\pages\api\ai-chat.js` | Panda AI — 3 modes |
| **signal-tracker.js** | `panda-dashboard\pages\api\signal-tracker.js` | Signal lifecycle |
| **signal-agent.js** | `panda-dashboard\pages\api\signal-agent.js` | Analyzes signal_results |
| **journal-agent.js** | `panda-dashboard\pages\api\journal-agent.js` | Analyzes manual_trades |
| **pattern-agent.js** | `panda-dashboard\pages\api\pattern-agent.js` | Cross-references signal + journal |
| **lib/supabase.js** | `panda-dashboard\lib\supabase.js` | Shared Supabase client |
| **lib/auth.js** | `panda-dashboard\lib\auth.js` | Session validation |
| **AGENTS.md** | `panda-dashboard\AGENTS.md` | Codex locked rules |
| **vercel.json** | `panda-dashboard\vercel.json` | Build config + deploy guardrail |

### Key Paths

- **Cowork mount**: `C:\Users\Admin\Documents\Claude\Projects\Panda Engine`
- **Git working copy**: `C:\Users\Admin\panda-dashboard`
- **MT4 data dir**: `C:\Users\Admin\AppData\Roaming\MetaQuotes\Terminal\Common\Files`
- **Engine start**: `uvicorn app:app --host 0.0.0.0 --port 8000`

---

## 2. DASHBOARD.JS — KEY COMPONENTS

> Line numbers drift — grep to find exact positions.

| Component | Purpose |
|-----------|---------|
| `ALL_PAIRS` | 21-pair array |
| `MOMENTUM_GUIDE` | Icon/action/color for 10 states |
| Utility functions | `stateColor`, `biasFromGap`, `boxTrend`, `tbgZoneBadge`, `atrFill` |
| `computeConfidence` | Multi-factor confidence 0–100 |
| `MomentumHeatmap` | Heatmap grid |
| `GapChart` | Gap history (canvas) |
| `PairCard` | Main pair card |
| `PairCardModal` | Expanded modal |
| `ValidSetupsTab` | Box-confirmed setups |
| `ValidPairsTab` | Auto-filtered tradable pairs |
| `PandaAIChat` | Panda AI tab |
| `SignalAnalytics` | Signal performance V2 |
| `Dashboard()` | Main export |

### Tab Structure (13 tabs)
PANELS, SIGNALS, TABLE, GAP CHART, RESEARCH, CALCULATOR, SETUPS, VALID PAIRS, SPIKE LOG, CHART, ANALYTICS, SIGNAL LOG, PANDA AI

---

## 3. APP.PY ENGINE INDEX

> Grep function names — line numbers shift.

| Function / Route | Purpose |
|-----------------|---------|
| Config block | MT4_PATH, tokens, creds, PAIRS list |
| `parse_tf_score`, `parse_mt4_file` | MT4 file → D1/H4/H1/ADV/ATR/BOX |
| `parse_tbg_file` | TBG → ST/FL/BIAS/ZONE/G1 |
| `compute_box_trends` | UPTREND/DOWNTREND/RANGING |
| `extract_panda_score`, `compute_scores_all_pairs` | **LOCKED — NEVER TOUCH** |
| `classify_momentum` | Momentum engine |
| `run_gap_once` | **Main loop** — parse → score → momentum → upsert |
| `send_spike_alert` | Spike detection + Telegram |
| `master_scheduler` | 5-min gap / 60-min snapshot |

---

## 4. KEY SUPABASE TABLES

| Table | Purpose |
|-------|---------|
| `dashboard` | Live pair data (upserted every 5 min) |
| `signal_snapshots` | All 21 pairs every cycle |
| `signal_results` | BB + INTRA strategy performance |
| `signal_tracker` | Signal lifecycle |
| `manual_trades` | Real trades (CSV import) |
| `ai_memory` | AI agent findings |
| `admin_brain` | Boss-G brain |
| `panda_users` | Users + roles + feature_access |
| `spike_events` | Spike/gap alerts |
| `gap_history` | Historical gap scores |
| `pdr_cache` | PDR strength (15-min TTL) |
| `strength_log` | Currency strength time series |
| `engine_heartbeat` | Engine cycle health |
| `ea_executions` | EA trade records |

---

## 5. API ROUTES

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
| `/api/login` / `logout` / `me` | Auth |
| `/api/engine-health` | Status |

---

## 6. CODE STYLE

```
Fonts: Share Tech Mono (data), Orbitron (headings), Rajdhani (body)
Colors: BUY=#00ff9f, SELL=#ff4d6d, accent=#00b4ff, warn=#ffd166, cool=#ffaa44
```
- All styles inline — no CSS modules
- Ternary chain for tab rendering
- Single file: all components in dashboard.js
- API routes: always import from `../../lib/supabase`

---

## 7. STRATEGY DEFINITIONS (LOCKED)

### BB Strategy
- Entry: gap >= 5 (valid bias), any time, any day. TBG NOT required.
- No new entry if same pair has open BB trade. Re-entry allowed once closed.
- Exit: gap drops >2 points from peak gap value.

### INTRA Strategy
- Entry: gap >= 9 + TBG confirmed (ABOVE=BUY, BELOW=SELL). Window: 2AM-4AM UAE only.
- Same concurrent position rule as BB.
- Exit: 10AM UAE hard close.

### Gap Score
- Gap = BASE score minus QUOTE score across D1/H4/H1 (range +/-18)
- BIAS: BUY if gap >= 5, SELL if <= -5, else WAIT
- EXECUTION: MARKET if |gap| >= 9, PULLBACK if >= 5
- TBG Zones: ABOVE=BUY valid, BELOW=SELL valid, BETWEEN=always invalid

### computeConfidence() (frontend only, 0-100)
Factors: gap magnitude (~25-30pts) + TBG valid (+20) + box aligned (+20) + COT (+10) + momentum (+10). NOT stored in Supabase.

---

## 8. HARDCODED LOGIC — DO NOT EDIT WITHOUT BOSS-G APPROVAL

These are load-bearing functions. A single wrong edit can destroy the engine or corrupt all signals.

**app.py (LOCKED FOREVER):**
- `extract_panda_score` — core scoring algorithm
- `compute_scores_all_pairs` — pair-level score aggregation
- `PREV_GAP` / `gap_deltas` ordering — BB gap threshold depends on exact sequence
- BB entry/exit thresholds (gap >= 5 entry, >2 drop exit)
- INTRA entry/exit rules (gap >= 9, TBG confirmed, 2AM-4AM UAE, 10AM hard close)

**dashboard.js (LOCKED):**
- `computeConfidence` — multi-factor confidence formula
- `MOMENTUM_GUIDE` — state definitions and colors
- `biasFromGap` — gap-to-bias mapping (BUY >= 5, SELL <= -5)

**Strategy definitions (§7 above):** BB, INTRA, Gap Score, TBG zone rules — all locked.

**Rule:** Never modify any of the above without explicit instruction from Boss-G. If a task seems to require changing locked logic, STOP and ask first.

---

## 9. QUICK REFERENCE

- Signal validity: `!hard_invalid && bias in (BUY,SELL) && |gap|>=5 && TBG confirms`
- G1 Colors: Red=Strong Sell, Green=Strong Buy, Yellow=Anticipation, White=No Trade
- `isMobile` breakpoint: 768px
- Vercel auto-deploys on push to main
