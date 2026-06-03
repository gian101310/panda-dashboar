# Hermes Knowledge Pack

> Reference document for Hermes autonomous learning. Contains exact schemas, signal flow, scoring rules, and operational data Hermes needs to learn from Panda Engine without human hand-holding.

---

## 1. SYSTEM ARCHITECTURE

```
MT4 Indicators (Panda Lines v2, TBG)
    → Write .txt files to MT4 Common/Files every ~2 min
        → app.py (FastAPI engine) reads + parses every 5 min
            → Scores all 21 pairs (gap, bias, momentum, confidence)
            → Upserts to Supabase (dashboard, gap_history, strength_log, signal_results, spike_events)
            → Sends Telegram alerts (spikes, signals, health)
                → Next.js dashboard reads from Supabase (pandaengine.app)
                    → AI agents analyze signal_results + signal_tracker

HERMES sits here → reads Supabase + /status endpoint, learns patterns, reports via Telegram
```

Hermes does NOT read MT4 files. Hermes does NOT write to the dashboard table. Hermes reads what the engine produces.

---

## 2. ENGINE ENDPOINTS

| Endpoint | Method | Purpose | Hermes Use |
|----------|--------|---------|------------|
| `/api/hermes/feed` | GET | **PRIMARY** — Compact JSON: all pairs, recent signals, health, deltas | Main data source |
| `/status` | GET | Lightweight health: last_run, valid/invalid counts | Quick health poll |
| `/force-gap` | GET | Force a gap cycle (admin only) | DO NOT USE without approval |
| `/telegram-health` | GET | Check Telegram bot connectivity | Health check |
| `/` | GET | Engine version + uptime | Basic ping |

### /api/hermes/feed — PRIMARY FEED (auth required)

**Auth:** `X-Engine-Secret` header or `?secret=` query param with HERMES_SECRET (defaults to ENGINE_SECRET).
**Params:** `limit` (int, default 20) — number of recent signals to include.

```json
{
  "v": "1.0",
  "ts": "2026-05-25T12:05:00Z",
  "health": {
    "last_run": "2026-05-25 12:05:00",
    "last_hb": "2026-05-25 12:05:00",
    "total": 21, "active": 8, "stale": 2,
    "buy": 5, "sell": 3, "market_exec": 2
  },
  "pairs": [
    {
      "p": "EURUSD", "g": 7, "b": "BUY", "ex": "PULLBACK", "m": "BUILDING",
      "c": 72, "hi": false, "pl": "ABOVE", "bx1": "UPTREND", "bx4": "UPTREND",
      "ds": 0.5, "dm": 1.2, "dl": 2.0, "str": 3.5, "ts": "2026-05-25 12:05:00"
    }
  ],
  "changed": ["EURUSD", "GBPJPY"],
  "signals": [
    {
      "id": 1823, "p": "EURUSD", "d": "BUY", "st": "BB", "eg": 7, "pg": 9,
      "m": "BUILDING", "c": 72, "pl": "ABOVE", "ses": "ASIAN",
      "bx1": "UPTREND", "bx4": "UPTREND", "res": "PENDING", "at": "2026-05-25T04:10:00Z"
    }
  ]
}
```

**Key map:** p=pair, g=gap, b=bias, ex=execution, m=momentum, c=confidence, hi=hard_invalid, pl=pl_zone, bx1/bx4=box trends, ds/dm/dl=delta short/mid/long, str=strength, d=direction, st=strategy, eg=entry_gap, pg=peak_gap, ses=session, res=status, at=created_at

Use this as the PRIMARY data source. One call returns everything — no need to query multiple Supabase tables for routine monitoring.

### /status Response Shape (lightweight alternative)
```json
{
  "status": "ACTIVE",
  "version": "3.0 (cBot retired)",
  "last_run": "2026-05-25 12:05:00",
  "total_pairs": 21, "valid_pairs": 8, "hard_invalid": 2,
  "buy_pairs": 5, "sell_pairs": 3, "market_exec": 2
}
```

---

## 3. SUPABASE TABLES — HERMES LEARNING TARGETS

### 3a. `dashboard` (21 rows, upserted every 5 min)
Primary learning source. Current state of all pairs.

| Column | Type | Description |
|--------|------|-------------|
| symbol | text PK | e.g. "EURUSD" |
| gap | int | Gap score (-18 to +18). BUY >= 5, SELL <= -5 |
| bias | text | BUY / SELL / WAIT |
| execution | text | MARKET (|gap|>=9) / PULLBACK (|gap|>=5) / WAIT |
| momentum | text | One of 10 states (see below) |
| confidence | int | 0-100 multi-factor score |
| hard_invalid | bool | True = stale MT4 data (>5 min old) |
| state | text | Structural state |
| signal | text | Signal string |
| close_alert | text | Close alert if any |
| delta_short | float | Short-term gap change |
| delta_mid | float | Mid-term gap change |
| delta_long | float | Long-term gap change |
| strength | float | Currency strength |
| base_currency | text | e.g. "EUR" |
| quote_currency | text | e.g. "USD" |
| base_d1 / base_h4 / base_h1 | int | Base TF scores |
| quote_d1 / quote_h4 / quote_h1 | int | Quote TF scores |
| adv_base_d1 / adv_base_h4 / adv_base_h1 | int | ADV base scores |
| adv_quote_d1 / adv_quote_h4 / adv_quote_h1 | int | ADV quote scores |
| atr | float | Current ATR |
| atr_reference | float | Reference ATR |
| spread | float | Current spread |
| box_h1_trend / box_h4_trend | text | UPTREND / DOWNTREND / RANGING |
| pl_zone | text | ABOVE / BELOW / BETWEEN |
| pl_bias | text | PL-derived bias |
| pl_g1_valid | bool | G1 confirmation |
| pdh/pdl/pwh/pwl/pmh/pml/pyh/pyl | float | Previous day/week/month/year H/L |
| updated_at | timestamp | Last engine write |

### 3b. `signal_results` (~1,822 rows)
Every signal the engine has generated with outcome tracking.

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | Auto |
| symbol | text | Pair |
| direction | text | BUY / SELL |
| strategy | text | BB or INTRA |
| entry_gap | int | Gap at entry |
| peak_gap | int | Peak |gap| during signal life |
| entry_price | float | Price at entry |
| base_score / quote_score | int | Scores at entry |
| bias | text | BUY / SELL |
| momentum | text | Momentum state at entry |
| confidence | int | Confidence at entry |
| pl_zone | text | ABOVE / BELOW / BETWEEN |
| pl_st / pl_fl | text | SuperTrend / FL at entry |
| session | text | ASIAN / LONDON / NY |
| box_h1_trend / box_h4_trend | text | Box trends at entry |
| status | text | PENDING / WIN / LOSS / CLOSED |
| snapshots | jsonb | Gap snapshots during signal life |
| created_at | timestamp | Signal creation |

**Key learning queries:**
- Win rate by strategy: `SELECT strategy, status, COUNT(*) FROM signal_results GROUP BY strategy, status`
- Win rate by session: `SELECT session, status, COUNT(*) FROM signal_results GROUP BY session, status`
- Win rate by momentum: `SELECT momentum, status, COUNT(*) FROM signal_results GROUP BY momentum, status`
- Win rate by gap threshold: `SELECT CASE WHEN abs(entry_gap)>=9 THEN 'MARKET' ELSE 'PULLBACK' END as exec, status, COUNT(*) FROM signal_results GROUP BY 1, status`

### 3c. `signal_tracker` (~3,989+ rows)
Full signal lifecycle with session, box, PDR context.

### 3d. `gap_history` (~30,181 rows)
Every gap score for every pair every 5 min. Time series data.
- Columns: timestamp, symbol, gap
- Use for: trend analysis, gap velocity, mean reversion patterns

### 3e. `strength_log` (~17,203 rows)
Currency strength time series.
- Columns: timestamp, symbol, strength
- Use for: divergence detection, correlation analysis

### 3f. `spike_events` (~852+ rows)
Gap spike alerts.
- Use for: spike pattern analysis, false spike detection

### 3g. `engine_heartbeat`
Engine health pings with timestamps.
- Use for: uptime monitoring, gap detection (if heartbeat stops)

### 3h. `engine_logs`
Run logs with timestamps.
- Use for: error detection, run frequency analysis

### 3i. `ai_memory` (28 rows)
Existing AI agent findings. Key insights already discovered:
- BB gap 7 + PL confirmed = 91% win (n=27); without PL = 0% (n=53)
- ASIAN session: +1582 pips. LONDON: -272 pips
- 4-12h holds: +2614 pips. Under 1h: -238 pips
- Alpha pairs: NZDCAD, NZDUSD, AUDJPY, GBPAUD
- Leak pairs: GBPJPY, GBPCAD, GBPUSD, EURUSD, AUDUSD

### 3j. `admin_brain` (18 rows)
Boss-G's trading rules, preferences, coaching notes, patterns.
- Categories: pref, coaching, pattern, rule
- Read this to understand Boss-G's trading philosophy

### 3k. `hermes_learnings` (Hermes' own table — READ/WRITE)
Where Hermes stores what it learns. This is the ONLY table Hermes may INSERT/UPDATE into.

| Column | Type | Description |
|--------|------|-------------|
| id | bigserial PK | Auto |
| category | text NOT NULL | pattern, anomaly, insight, rule, metric |
| subject | text NOT NULL | e.g. "BB_win_rate_by_session", "EURUSD_gap_mean_reversion" |
| finding | text NOT NULL | The actual learning in plain text |
| confidence | real | 0.0 to 1.0 — how confident Hermes is in this finding |
| sample_size | int | Number of data points this is based on |
| data | jsonb | Structured supporting data (stats, thresholds, breakdowns) |
| source_tables | text[] | Which tables the learning came from |
| status | text | active, stale, superseded, archived |
| superseded_by | bigint FK | Points to newer finding that replaces this one |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto |

**Usage rules:**
- Before inserting a new finding, check if an existing active finding with the same subject exists
- If it does, UPDATE the existing row OR insert new + set old to `superseded` with `superseded_by` pointing to new ID
- Use `stale` status for findings that may no longer hold (data has grown significantly since)
- Keep `sample_size` updated — findings with low sample_size should be treated as hypotheses
- Use `data` jsonb for structured stats so Hermes can reference them programmatically later

---

## 4. MOMENTUM STATES (10 total)

| State | Meaning | Action |
|-------|---------|--------|
| BUILDING | Steady growth in gap | Hold / add |
| SURGING | Rapid acceleration | Ride momentum |
| SPARK | New ignition (gap just crossed 5) | Watch closely |
| EMERGING | Early signs of trend | Prepare entry |
| FADING | Losing steam | Tighten / prepare exit |
| STALLING | Flat, no movement | Wait |
| REVERSING | Direction changing | Exit / flip |
| COLLAPSING | Rapid decline | Exit immediately |
| RECOVERING | Bounce from low | Watch for re-entry |
| FLAT | No signal | Skip |

Momentum-bias alignment rule (May 2026): For BUILDING, SPARK, EMERGING — if trend1h/trend4h opposes bias, show COUNTER warning. If bias is neutral (|gap| < 5), show WAIT.

---

## 5. SCORING RULES (CRITICAL — DO NOT MODIFY)

### Gap Score
- GAP = sum(base D1+H4+H1) - sum(quote D1+H4+H1)
- Range: -18 to +18
- BUY if gap >= 5, SELL if gap <= -5, WAIT otherwise

### Execution Type
- MARKET: |gap| >= 9 (strong enough for immediate entry)
- PULLBACK: |gap| >= 5 but < 9 (wait for pullback)
- WAIT: |gap| < 5

### TBG Zones
- ABOVE = BUY valid
- BELOW = SELL valid
- BETWEEN = always invalid (no trade)

### BB Strategy
- Entry: gap crosses from <5 to >=5, not neutral matchup
- Exit: gap drops >2 points from peak gap
- No TBG required, any session, any day

### INTRA Strategy
- Entry: |gap| >= 9 + TBG confirmed + 2AM-4AM UAE window
- Exit: 10AM UAE hard close, no exceptions

---

## 6. TELEGRAM CONFIGURATION

| Chat | Purpose | Hermes Permissions |
|------|---------|-------------------|
| Engine Health Chat | Health alerts, anomaly reports, engine status | SEND freely |
| Signal Group | Public signal broadcasts | DO NOT SEND without Boss-G approval |

Hermes sends to the health/reports chat autonomously. NEVER to the signal group.

---

## 7. HERMES LEARNING TARGETS

### Phase 1: Passive Learning (immediate)
- Poll /status every 10 min — detect anomalies (stale data, zero valid pairs, status ERROR)
- Query signal_results — build win rate models by strategy/session/momentum/gap
- Query gap_history — detect mean reversion patterns, gap velocity
- Query ai_memory — absorb existing findings, don't duplicate
- Query admin_brain — understand Boss-G's rules and preferences

### Phase 2: Pattern Recognition
- Cross-reference signal_results outcomes with entry conditions
- Identify which momentum states at entry predict wins vs losses
- Find optimal gap thresholds per pair (some pairs may perform better at gap 7 vs gap 5)
- Detect session-pair correlations (which pairs perform in which sessions)
- Track PL zone confirmation impact on outcomes

### Phase 3: Active Intelligence
- Generate confidence-weighted signal ratings
- Flag signals that match high-loss patterns before they're taken
- Produce weekly performance reports with actionable insights
- Detect engine anomalies before they become problems
- Track which ai_memory findings still hold as data grows

### What Hermes Should Learn From Outcomes
When signal_results has outcome data (WIN/LOSS/CLOSED):
1. Entry gap magnitude vs outcome
2. Momentum state at entry vs outcome
3. Session (ASIAN/LONDON/NY) vs outcome
4. PL zone confirmation vs outcome
5. Box trend alignment vs outcome
6. Hold duration vs outcome (from snapshots timestamps)
7. Peak gap vs final outcome
8. Pair-specific patterns (alpha vs leak pairs)

---

## 8. COMPACT JSON FORMAT

When Hermes processes or stores signal data internally, use this compact format to save tokens:

```json
{
  "p": "EURUSD",
  "ts": "2026-05-25T12:05Z",
  "g": 7,
  "b": "BUY",
  "ex": "PULLBACK",
  "m": "BUILDING",
  "c": 72,
  "pl": "ABOVE",
  "bx1": "UPTREND",
  "bx4": "UPTREND",
  "hi": false
}
```

Field map: p=pair, ts=timestamp, g=gap, b=bias, ex=execution, m=momentum, c=confidence, pl=pl_zone, bx1=box_h1_trend, bx4=box_h4_trend, hi=hard_invalid

Only expand to human-readable when presenting to Boss-G.

---

## 9. ANOMALY DETECTION RULES

Hermes should alert on:
1. **Engine down**: No heartbeat for >10 minutes
2. **Mass stale**: >5 pairs with hard_invalid=true
3. **Zero valid pairs**: No pairs with |gap|>=5 (unusual during active sessions)
4. **Gap spike**: Any pair moves >3 gap points in one cycle (5 min)
5. **Supabase lag**: updated_at on dashboard rows >10 min behind current time
6. **Signal flood**: >5 new signals in one cycle (possible false signal storm)
7. **Win rate crash**: Rolling 20-signal win rate drops below 30% for any strategy

---

## 10. 21 TRACKED PAIRS

AUDJPY, AUDCAD, AUDNZD, AUDUSD, CADJPY, EURAUD, EURCAD, EURGBP, EURJPY, EURNZD, EURUSD, GBPAUD, GBPCAD, GBPJPY, GBPNZD, GBPUSD, NZDCAD, NZDJPY, NZDUSD, USDCAD, USDJPY

---

## 11. CURRENCY-TO-PAIRS MAP

For news impact analysis:
- USD: EURUSD, GBPUSD, AUDUSD, NZDUSD, USDCAD, USDJPY
- EUR: EURUSD, EURJPY, EURGBP, EURAUD, EURCAD, EURNZD
- GBP: GBPUSD, GBPJPY, GBPAUD, GBPCAD, GBPNZD, EURGBP
- JPY: USDJPY, EURJPY, GBPJPY, AUDJPY, CADJPY, NZDJPY
- AUD: AUDUSD, AUDJPY, AUDCAD, AUDNZD, EURAUD, GBPAUD
- CAD: USDCAD, CADJPY, EURCAD, GBPCAD, AUDCAD, NZDCAD
- NZD: NZDUSD, NZDJPY, NZDCAD, AUDNZD, EURNZD, GBPNZD

---

## 12. SESSION WINDOWS (UTC)

| Session | UTC | UAE |
|---------|-----|-----|
| ASIAN | 00:00 - 08:00 | 04:00 - 12:00 |
| LONDON | 08:00 - 16:00 | 12:00 - 20:00 |
| NEW YORK | 13:00 - 21:00 | 17:00 - 01:00 |
| INTRA window | 22:00 - 00:00 | 02:00 - 04:00 |
| INTRA hard close | 06:00 | 10:00 |

---

## 13. WHAT'S READY vs WHAT HERMES STILL NEEDS

### DONE (built May 25, 2026)
- `/api/hermes/feed` endpoint in app.py — compact JSON, auth via HERMES_SECRET
- `hermes_learnings` table in Supabase — Hermes can store patterns, anomalies, insights
- Full knowledge pack with schemas, scoring rules, learning targets
- Autonomy rules and token optimization in handoff prompt

### STILL NEEDED (Boss-G to provide)
1. **HERMES_SECRET env var** — Set in the engine's .env (or defaults to ENGINE_SECRET if not set)
2. **Engine base URL** — The host:port where app.py runs so Hermes can call `/api/hermes/feed`
3. **Supabase credentials for Hermes** — Either share the existing service key or create a restricted one
4. **Telegram bot token + health chat ID** — For sending health/anomaly alerts
5. **Labeled trade outcomes** — manual_trades is empty. signal_results has outcomes but real trade results would improve supervised learning

Once items 1-4 are provided, Hermes can call `/api/hermes/feed`, bootstrap from the response, and begin Phase 1 learning immediately.
