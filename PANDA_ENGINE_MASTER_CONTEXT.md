# 🐼 PANDA ENGINE — MASTER PROJECT CONTEXT
> Save this file. Paste at the start of any new Claude chat to continue without re-explaining.
> Last updated: 2026-03-30

---

## 🏗️ SYSTEM OVERVIEW

| Component | Details |
|---|---|
| **Engine** | Python/FastAPI v3.0 — `C:\Users\Admin\Desktop\ctrader_trend_scanner\app.py` |
| **Run engine** | Double-click `START_PANDA_ENGINE.bat` on Desktop |
| **Python version** | `py -3.11` (NOT `python` — that's 3.14 which lacks packages) |
| **Dashboard** | Next.js on Vercel — https://panda-dashboar.vercel.app |
| **GitHub repo** | https://github.com/gian101310/panda-dashboar |
| **Local repo** | `C:\Users\Admin\panda-dashboard` |
| **Data flow** | MT4 Indicator writes `mt4_SYMBOL.txt` → `app.py` reads + scores → Supabase → Vercel dashboard |

---

## 🔑 CREDENTIALS

| Key | Value |
|---|---|
| Admin login | `TBGAdmin` / `TropangbossG` |
| Supabase project ID | `jxkelchxitwuilpbrwxk` |
| Supabase URL | `https://jxkelchxitwuilpbrwxk.supabase.co` |
| Supabase service key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4a2VsY2h4aXR3dWlscGJyd3hrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg1MTI2NSwiZXhwIjoyMDg5NDI3MjY1fQ.OgNCKlZPy010de01wW02qH--Lb6zVYqPBxTEFpGrD5M` |
| Vercel project ID | `prj_kDcxJzdtMK67OMeaod9UeQ3t3Wgh` |
| Vercel team ID | `team_yI8pvA0JfHlIj3f2B8dlphgh` |
| Signal Telegram token | `8556482762:AAGd6I7M6fFZ84f-8r2O8fyVktRCF3rUosA` |
| Signal Telegram chat | `-1003857801976` |
| Login alert bot token | `8605294552:AAG2o7bF30qkZx0Zv_FgmwA0RgS7g56OH7Y` |
| Login alert chat | `5379148910` |
| cTrader Client ID | `23689_eFecowPIdNGAlM5xItfPv3VDAxI5Pmkv7BER7kcsjDVKdiTxyy` |
| cTrader Secret | `2dukGwM5H0PizXwHsNfDiPnz5iOvlKu1kF9WqxGkyxpQBMbCcK` |


---

## 📁 KEY FILE PATHS

```
C:\Users\Admin\Desktop\ctrader_trend_scanner\app.py          ← Python engine v3.0
C:\Users\Admin\Desktop\ctrader_trend_scanner\app_backup_v2.1.py  ← backup
C:\Users\Admin\Desktop\START_PANDA_ENGINE.bat                ← Engine startup script
C:\Users\Admin\panda-dashboard\                              ← Next.js dashboard repo
C:\Users\Admin\panda-dashboard\pages\dashboard.js            ← Main dashboard UI
C:\Users\Admin\panda-dashboard\pages\api\data.js             ← API: returns all pair data
C:\Users\Admin\panda-dashboard\pages\api\spikes.js           ← API: spike events
C:\Users\Admin\AppData\Roaming\MetaQuotes\Terminal\Common\Files\mt4_SYMBOL.txt  ← MT4 source files
```

---

## ⚙️ ENGINE v3.0 ARCHITECTURE (cBot RETIRED)

### What Changed in v3.0
- **cBot (`PandaEngineMaster.cs`) is RETIRED** — no longer needed
- `app.py` now reads **`mt4_SYMBOL.txt`** directly (not `panda_SYMBOL.txt`)
- All scoring logic moved to Python

### MT4 File Format (`mt4_SYMBOL.txt`)
Written by the **MT4 Indicator** (`Panda_scoring.cs`) — must keep running:
```
EUR : D1 : -3    | H4 : +2    | H1 : +3/-1    ← BASE currency TF scores
USD : D1 : +2    | H4 : +4    | H1 : +6        ← QUOTE currency TF scores
ADV : EUR : D1 : -2  | H4 : +4  | H1 : +1/-1  ← Advance/filtered scores
ADV : USD : D1 : +3  | H4 : +4  | H1 : +6
ATR : 942 : 1679 Points.                        ← ATR current : ATR reference
SPREAD : 24 Points.
BOX|WagBox1|1772409600|1.17959|1773619200|1.14107  ← 3 price boxes
BOX|WagBox2|...
BOX|WagBox3|...
```

### CRITICAL: Split Value Parsing (`+3/-1`)
The `/` split values (e.g. `+2/-1` on H4) must be parsed as **two separate values**:
- The engine runs `extract_panda_score()` on the **raw original line** — NOT a reconstructed line
- `parse_tf_score("+2/-1")` = sums to `+1` for display only
- But `extract_panda_score("JPY : D1:-2 | H4:+2/-1 | H1:+1/-1")` finds all individual values `[-2, +2, -1, +1, -1]`, detects tie → returns `0`
- Stored as `raw_base_line` and `raw_quote_line` in the parsed dict

### Scoring Logic (exact match to cBot `ExtractPandaScore`)
```python
# For each currency line:
# 1. Parse ALL values including /split (e.g. "+2/-1" gives +2 and -1)
# 2. Values >= 3 = significant positive; values <= -3 = significant negative
# 3. BOTH sides significant = HARD_INVALID (return 0)
# 4. Pick strongest (largest abs) single value; tie = 0

# Two-phase global conflict detection:
# Phase 1: Score each pair, collect globally invalid currencies
# Phase 2: Any pair containing an invalid currency = HARD_INVALID
```

### GAP Score Rules
| Condition | Result |
|---|---|
| `gap >= 5` | BUY |
| `gap <= -5` | SELL |
| `abs(gap) < 5` | INVALID |
| Currency conflict | HARD_INVALID |

### Execution / Confidence
| abs(gap) | Execution | Confidence |
|---|---|---|
| >= 9 | MARKET | — |
| >= 5 | PULLBACK | LOW |
| >= 8 | — | MEDIUM |
| >= 10 | — | HIGH |


---

## 🗄️ SUPABASE TABLES

### `dashboard` — main pair data (upserted every 15 min)
| Column | Type | Notes |
|---|---|---|
| symbol | TEXT PK | e.g. EURUSD |
| gap | INTEGER | BASE_SCORE - QUOTE_SCORE |
| bias | TEXT | BUY / SELL / INVALID / HARD_INVALID |
| execution | TEXT | MARKET / PULLBACK / NONE |
| confidence | TEXT | HIGH / MEDIUM / LOW / INVALID |
| hard_invalid | BOOLEAN | Currency conflict flag |
| base_currency | TEXT | e.g. EUR |
| base_d1, base_h4, base_h1 | INTEGER | Per-TF scores for base currency |
| quote_currency | TEXT | e.g. USD |
| quote_d1, quote_h4, quote_h1 | INTEGER | Per-TF scores for quote currency |
| adv_base_d1/h4/h1 | INTEGER | ADV (filtered) base scores |
| adv_quote_d1/h4/h1 | INTEGER | ADV (filtered) quote scores |
| atr | NUMERIC | Current ATR |
| atr_reference | NUMERIC | Reference ATR |
| spread | NUMERIC | Current spread in points |
| momentum | TEXT | STRONG/BUILDING/SPARK/CONSOLIDATING/COOLING/FADING/REVERSING/STABLE/NEUTRAL |
| delta_short | NUMERIC | 30-min gap change |
| delta_mid | NUMERIC | 2h gap change |
| delta_long | NUMERIC | 6h gap change |
| strength | NUMERIC | Computed momentum strength score |
| state | TEXT | EXPAND_BULL / STABLE_BEAR etc. |
| close_alert | BOOLEAN | True if position should be considered for closing |
| updated_at | TIMESTAMP | Last engine run time |

### `gap_history` — historical gap readings
- `timestamp`, `symbol`, `gap` — inserted every 15 min
- Used for delta calculations (30min/2h/6h)

### `spike_events` — momentum spike log (NEVER replaced, append-only)
- `id`, `symbol`, `gap`, `bias`, `momentum`, `strength`, `delta_short`, `delta_mid`
- `execution`, `confidence`, `base_score`, `quote_score`
- `fired_at` (ISO timestamp), `notified` (boolean)
- Indexes: `fired_at DESC`, `symbol`

### `strength_log` — currency strength history
- `timestamp`, `symbol`, `strength`

### `trade_journal` — cTrader trade sync
- Full trade data from cTrader Open API via `ctrader_journal.py`

### `engine_logs`, `spike_events` — operational logs

---

## 🏃 RUNNING THE ENGINE

### Start
```cmd
Double-click: C:\Users\Admin\Desktop\START_PANDA_ENGINE.bat
```
The BAT file automatically kills any existing Python processes on port 8000, then starts:
```cmd
cd /d C:\Users\Admin\Desktop\ctrader_trend_scanner
py -3.11 -m uvicorn app:app --host 0.0.0.0 --port 8000
```

### Engine Routes
| Route | Description |
|---|---|
| `GET /force-gap` | Force immediate run of all 21 pairs |
| `GET /force` | Force run + send Telegram snapshot |
| `GET /status` | Engine health + pair counts |
| `POST /api/login-alert` | Called by dashboard login to send Telegram alert |

### Schedule
- Every 15 min (xx:01, xx:16, xx:31, xx:46): gap scoring cycle
- Every hour (xx:01): gap scoring + Telegram snapshot

### Required MT4 Side
- **MT4 Indicator (`Panda_scoring.cs`) must keep running** — writes `mt4_SYMBOL.txt`
- cBot (`PandaEngineMaster.cs`) is **RETIRED** — do NOT run it


---

## 📊 DASHBOARD FEATURES

### Live URL
https://panda-dashboar.vercel.app

### Tabs
| Tab | Description |
|---|---|
| PANELS | Pair cards — gap, bias, momentum, matchup label, sparkline |
| TABLE | Sortable table — all pairs with MATCHUP column |
| GAP CHART | Historical gap line chart per pair |
| CALENDAR | Economic calendar |
| CALCULATOR | Position size / R:R calculator |
| COT REPORT | CFTC COT data |
| SETUPS | Valid pairs (gap ≥ 5) with matchup label |
| VALID PAIRS | Pairs with gap ≥ 5 + BUILDING/STRONG momentum + 1H/4H aligned |
| SPIKE LOG | Full spike history, no time filter |
| ENGINE | Health monitor (admin only) |

### Matchup Label System
Shows currency strength matchup on pair cards, TABLE, SETUPS, VALID PAIRS tabs.

**Score Rules (from Panda Playbook):**
| Score | Label |
|---|---|
| `+4, +5, +6` | **STRONG** |
| `-4, -5, -6` | **WEAK** |
| `-3, -2, -1, 0, +1, +2, +3` | **NEUTRAL** |

**Uses the dominant (largest abs) raw TF value per currency (signed, not abs)**

**Label combinations:**
| Base | Quote | Label | Color |
|---|---|---|---|
| STRONG | WEAK | `USD STRONG / CAD WEAK` | 🟢 Green — IDEAL |
| WEAK | STRONG | `NZD WEAK / USD STRONG` | 🔴 Red — IDEAL |
| STRONG | NEUTRAL | `USD STRONG / JPY NEUTRAL` | 🟩 Light green |
| STRONG | STRONG | `STRONG / STRONG` | 🟡 Yellow |
| WEAK | WEAK | `WEAK / WEAK` | 🟠 Orange — AVOID |
| NEUTRAL | NEUTRAL | `NEUTRAL / NEUTRAL` | ⬜ Grey |

### Spike Banner vs Spike Log
- **Spike Banner** (top of dashboard): last 20 min only, max 10 items
- **Spike Log tab**: full history, 500 limit, never filtered by time

### Momentum States
| State | Icon | Action |
|---|---|---|
| STRONG | 🔥 | RIDE IT |
| BUILDING | 🚀 | ENTER NOW |
| SPARK | ⚡ | WATCH |
| CONSOLIDATING | 🔵 | HOLD |
| COOLING | 🌡️ | TIGHTEN SL |
| FADING | 📉 | CONSIDER CLOSING |
| REVERSING | ⚠️ | CLOSE POSITION |

---

## 🚀 DEPLOYMENT WORKFLOW

### Push to Vercel
```cmd
cd C:\Users\Admin\panda-dashboard
git add -f pages\dashboard.js pages\api\data.js pages\api\spikes.js
git commit -m "your message here"
git push origin main
```
Vercel auto-builds on push (~60 seconds). Hard refresh dashboard: `Ctrl+Shift+R`

### ⚠️ CRITICAL: Never Use Python Patches on Windows PowerShell
- PowerShell breaks emoji/multi-line strings
- Always write patch logic to `.py` files and run with `py -3.11 script.py`
- JS files with emoji: use base64 restore method (`restore_b64.ps1`)

### ⚠️ CRITICAL: Check for Duplicate Functions After Patching
After any dashboard.js patch, verify no duplicate function definitions:
```python
content = open(r'C:\Users\Admin\panda-dashboard\pages\dashboard.js', encoding='utf-8').read()
for fn in ['function stateColor','function biasFromGap','function isValid','function scoreLabel','function getMatchup']:
    print(fn, content.count(fn))  # all should be 1
```
Duplicate functions cause Vercel build errors like `the name X is defined multiple times`.

### ⚠️ CRITICAL: Restore File from Git If Corrupted
```cmd
cd C:\Users\Admin\panda-dashboard
git show HEAD:pages/dashboard.js > pages\dashboard.js
```


---

## 📈 TRADING PAIRS (21 Total)

```
AUDJPY, AUDCAD, AUDNZD, AUDUSD, CADJPY,
EURAUD, EURCAD, EURGBP, EURJPY, EURNZD, EURUSD,
GBPAUD, GBPCAD, GBPJPY, GBPNZD, GBPUSD,
NZDCAD, NZDJPY, NZDUSD, USDCAD, USDJPY
```

---

## 📋 COMPLETED PHASES

| Phase | What Was Built |
|---|---|
| Phase 1 | Engine v2.0 — removed Google Sheets, Supabase direct, multi-TF momentum |
| Phase 2 | Gap chart, Economic calendar, Position calculator, Engine health monitor |
| Phase 3 | Spike banner, Heatmap, Sound alerts, Browser notifications, Telegram alerts |
| Phase 4 | Trade journal, VIP roles, feature access, XLSX import, strategies |
| Phase 5 | Currency Strength Chart (7 currencies, EMA smoothing, crossover detection) |
| Phase 5b | VALID PAIRS tab, SPIKE LOG tab, spike time fix (UTC parse with Z suffix) |
| Engine v3.0 | **cBot RETIRED** — app.py reads mt4_SYMBOL.txt directly, full scoring in Python |
| Matchup Labels | STRONG/WEAK/NEUTRAL per currency on all tabs — correct signed score rules |
| Spike Log | Full history preserved forever (INSERT only, never upsert/replace) |

---

## 🔜 PENDING (Five-Phase Panda Playbook Roadmap)

| Phase | Description |
|---|---|
| Phase 1 ✅ | PandaDataExporter EA + Python scoring migration (DONE as Engine v3.0) |
| Phase 2 | Advance scoring, box confirmation, close/cancel recommendations using ADV scores + BOX levels |
| Phase 3 | PDR/Intra Game detection, ATR fill estimation |
| Phase 4 | Risk budget tracking, PSL automation, bias persistence |
| Phase 5 | Dashboard redesign + granular admin permission system |

### Also Pending (older roadmap)
- Phase 6 — UX polish, mobile layout, session clock, pair watchlist
- Phase 7 — Community features (signal broadcast, voting, leaderboard)
- cTrader auto-sync improvements (multi-account filtering)

---

## 🧠 TRADING METHODOLOGY (G1 Masterclass — WAGFOREX Academy)

| Signal | Color | Action |
|---|---|---|
| Strong Buy | 🟢 Green | Enter immediately |
| Strong Sell | 🔴 Red | Enter immediately |
| Anticipation | 🟡 Yellow | Wait for moving trendline confirmation |
| No Trade | ⬜ White | Skip |

- **SL**: Previous swing high/low
- **TP**: 1:2 RRR
- **ATR**: Per pair for position sizing
- **Triple Momentum Pro**: FollowLine (Blue=up/Orange=down) + SuperTrend + PMax confirmation
- Strongest signals when all 3 indicators agree

---

## 🔧 COMMON COMMANDS

### Engine
```cmd
# Start engine
START_PANDA_ENGINE.bat

# Force a test run
curl http://localhost:8000/force-gap

# Check status
curl http://localhost:8000/status

# Syntax check app.py
py -3.11 -c "import ast; ast.parse(open('app.py', encoding='utf-8').read()); print('OK')"
```

### Dashboard Deploy
```cmd
cd C:\Users\Admin\panda-dashboard

# Check for duplicate functions (run before pushing)
py -3.11 -c "c=open('pages/dashboard.js',encoding='utf-8').read(); [print(f,c.count(f)) for f in ['function stateColor','function biasFromGap','function isValid','function scoreLabel','function getMatchup']]"

# Commit and push
git add -f pages\dashboard.js pages\api\data.js
git commit -m "description"
git push origin main
```

### Supabase Quick Checks
```sql
-- Current valid pairs
SELECT symbol, gap, bias, execution, base_currency, base_d1, base_h4, base_h1,
       quote_currency, quote_d1, quote_h4, quote_h1
FROM dashboard WHERE hard_invalid = false AND ABS(gap) >= 5 ORDER BY ABS(gap) DESC;

-- Recent spikes
SELECT symbol, gap, bias, momentum, fired_at FROM spike_events ORDER BY fired_at DESC LIMIT 20;

-- Spike count total
SELECT COUNT(*) FROM spike_events;
```

---

## 📱 IMPORTANT BOTS & EXTERNAL SERVICES

| Service | Details |
|---|---|
| Signal Telegram group | chat `-1003857801976` — hourly snapshots + spike alerts |
| Personal login alert | chat `5379148910` — fires on every dashboard login |
| cTrader account | `3015848` — FundedNext 50k prop challenge |
| ctrader_journal.py | Runs on main machine alongside app.py, syncs trades to Supabase every 5 min |

---

## 🐼 NOTES FOR CLAUDE

- Always use `py -3.11` not `python` on this machine
- Write patch scripts to `.py` files, run with `py -3.11 script.py`
- Git commits: use batch files (`push_x.bat`) — `&&` chains break in PowerShell
- After ANY dashboard.js patch: check for duplicate function definitions before pushing
- Restore from git if file is corrupted: `git show HEAD:pages/dashboard.js > pages\dashboard.js`
- The engine reads `mt4_EURUSD.txt` (lowercase symbol in filename)
- `extract_panda_score()` MUST receive the raw original line, not a reconstructed one
- The `parse_tf_score()` function sums split values for display — but scoring uses raw lines

---

## 📘 G1 MASTERCLASS SWING PLAYBOOK (WAGFOREX Academy — Cai Angeni Reyes)

### Overview — Trade Signal Colors

| Color | Signal | Action |
|---|---|---|
| 🔴 RED | Strong SELL | Immediate execution — no indicators needed |
| 🟢 GREEN | Strong BUY | Immediate execution — no indicators needed |
| 🟡 YELLOW | Anticipation | Wait for Moving Trendline confirmation |
| ⬜ WHITE | No Trade | Skip — do not enter |

### Trade Management (RED / GREEN signals)
- **SL Placement**: Below/above the previous swing high or low
- **TP Placement**: RRR 1:2 — if SL = 50 pips, TP = 100 pips

---

### Yellow Signal — Anticipation Rules

Uses the **"Moving Trendline" indicator** to confirm entry.

#### BUY Yellow Signal — Entry Rules
Enter a BUY only when ALL three conditions are met:
1. Price **crosses UP** the moving trendline
2. Moving trendline **turns GREEN**
3. Price is **ABOVE** the moving trendline

#### SELL Yellow Signal — Entry Rules
Enter a SELL only when ALL three conditions are met:
1. Price **crosses DOWN** the moving trendline
2. Moving trendline **turns RED**
3. Price is **BELOW** the moving trendline

#### Yellow Signal Examples
| Pair | Signal | Trendline | Status |
|---|---|---|---|
| AUDCAD | BUY | 🟢 Green, below price | ✅ Safe to buy |
| AUDJPY | BUY | 🔴 Red, above price | ❌ Not ready — wait for trendline flip |
| EURCAD | SELL | 🔴 Red, above price | ✅ Safe to sell |

#### Yellow Signal SL/TP (same 1:2 rule)
- SL: Previous swing (above for SELL, below for BUY)
- TP: 2× SL distance (e.g. SL=25 pips → TP=50 pips)

---

### How This Connects to Panda Engine

The Panda Engine GAP score maps directly to G1 signals:

| Panda Engine | G1 Signal | Meaning |
|---|---|---|
| GAP ≥ 5, EXECUTION=MARKET | 🟢 GREEN / 🔴 RED | Strong signal — enter now |
| GAP ≥ 5, EXECUTION=PULLBACK | 🟡 YELLOW | Anticipation — wait for confirmation |
| GAP < 5 or HARD_INVALID | ⬜ WHITE | No trade |
| MATCHUP = STRONG vs WEAK | Best quality setups | Ideal entries |
| MATCHUP = NEUTRAL or WEAK | Lower quality | Avoid or wait |

**Motto**: *Susuka pero hindi susuko* (Tire but never give up)

---

## 📗 WAGFX PLAYBOOK — FULL G1 MASTERCLASS (WAGFOREX Academy — Cai Angeni Reyes)

### STEP 1 — SCORING

#### Score Types
| Score | Values | Rule |
|---|---|---|
| Extreme Strong | +4, +5, +6 | Pick the HIGHEST single value (never add up) |
| Extreme Weak | -4, -5, -6 | Pick the LOWEST single value (never add up) |
| Neutral | +3, +2, +1, 0, -1, -2, -3 | Score = 0 (not tradeable on its own) |
| Invalid | Both +extreme AND -extreme present | Score = BLANK (do not trade) |

#### Key Scoring Rules
- **NEVER add scores** — only pick ONE (the strongest/weakest)
- Neutral scores cancel each other: if D1=-3 and H1=+3 → score = 0
- Split values like `+3/-3` in same TF → score = 0
- If extreme strong exists alongside neutral opposition → extreme wins (e.g. D1:-4 H1:+3/-3 → score = -4)
- Invalid = when BOTH extreme strong AND extreme weak exist in same currency (e.g. D1:+5 H4:-3 H1:-4 → INVALID)

#### Application Workflow (4 Steps)
1. Read Telegram scorecard
2. Input into Excel — get TREND and SCORE per currency
3. Calculate GAP for all 21 pairs + label BIAS
4. Filter out bad gaps and invalid bias — only trade what remains

---

### STEP 1 — GAP RULE

**Formula:** `GAP = BASE_SCORE - QUOTE_SCORE`

**Tradeable gaps:** `+5 and above` OR `-5 and below`

> **NOTE:** Gap rule only applies to EXTREME vs NEUTRAL matchups
> **"WE ONLY TRADE EXTREME SCORES"**

| Matchup | Example GAP | Tradeable? |
|---|---|---|
| Extreme vs Neutral | 5 - 3 = 2 | ❌ NO |
| Extreme vs Neutral (negative) | 5 - (-3) = 8 | ✅ YES |
| Strong vs Strong | USDCAD: Strong vs Strong = 1 | ❌ INVALID |
| Strong vs Weak | CADJPY: 10 | ✅ BEST SETUP |

---

### STEP 2 — BOX STRUCTURE (WAG Boxes)

Three boxes to observe (green boxes in MT4):
- **Big Box** = Daily (D1)
- **Medium Box** = H4
- **Small Box** = H1

#### Box Rules — 50% Midpoint Rule
The **midpoint of the latter box** (most recent) determines trend:

| Condition | Market State |
|---|---|
| Latter box midpoint ABOVE former box | UPTREND ✅ |
| Latter box midpoint INSIDE former box | RANGING ❌ |
| Latter box midpoint BELOW former box | DOWNTREND ✅ |

#### Which Box to Check Per TF
| Scoring Bias TF | Check Box Structure in |
|---|---|
| H1 | H1 box vs H4 box |
| H4 | H4 box vs D1 box |
| D1 | H4 box vs D1 box |

#### Entry Rule
- BUY scoring + UPTREND boxes = ✅ Enter
- SELL scoring + DOWNTREND boxes = ✅ Enter
- Scoring direction ≠ Box direction = ❌ Do NOT enter

---

### STEP 3 — ENTRY (DZ / WAG Lines)

**DZ = Discount Zone** — entry is always at WAG mechanical lines (not market orders)

#### Two Entry Types

**1. Pullback Play** (primary method — NO market execution)
- Price pulls back to WAG line (last day's low/high or last week's low/high)
- Entry: nearest mechanical line (H1 or H4 WAG line)
- TP: nearest mechanical line in trade direction
- SL: previous swing low (BUY) or swing high (SELL)

**2. Intra Game** (if rally already started, pullback unlikely)
- Enter on 2nd candle of H1 TF (skip 1st — big spread)
- Previous swing must align with bias direction
- At least one WAG line above/below entry
- TP: nearest mechanical line, SL: RRR-based (minimum 1:2)
- Do NOT use if price is in resistance/support cluster (multiple WAG lines)

---

### TRADE MANAGEMENT

#### SL / PSL (Positive Stop Loss)
- **SL**: Previous swing high (SELL) or swing low (BUY)
- **Breakeven SL**: When trade gains = original SL distance → move SL to entry
- **PSL (+SL)**: After breakeven, trail SL with each new swing formation

#### TP / RRR
- Minimum 1:2 RRR (preferred 1:3 or 1:4)
- TP at nearest mechanical WAG line
- Budget = 200 pips total risk per week

#### Do NOT Enter if:
- Box direction contradicts scoring bias
- Currency has both extreme+ and extreme- scores → INVALID
- Advance scoring shows bad score for next session → cancel/skip order

---

### ADVANCE SCORING

Used to decide hold vs close. Check every Thu/Fri.

| ADV Timeframe | Projects Scores For |
|---|---|
| ADV H1 | Following day |
| ADV H4 | Following week |
| ADV D1 | Following month |

**Rules:**
- If ADV H1 bad AND ADV H4 bad → close/cancel trade
- If ADV H1 bad BUT ADV H4 good → can hold for next week
- If ADV D1 good → swing traders can hold with PSL adjustment
- Thursday: impulse from Wednesday → set/cancel pending orders for next week
- Friday: best time for advance scoring; set pending orders for Monday

---

### ATR FILL ESTIMATION

Used to estimate when pending order will be filled.

```
Step 1:  ATR ÷ 24 hrs = X  (pips per hour)
Step 2:  Pip distance from price to entry ÷ X = Y hours
```

**Example:** ATR=90 pips, Distance=47 pips
- X = 90/24 = 3.75 pips/hr
- Y = 47/3.75 = **12.53 hours** until order fills

ATR is already stored in Supabase `dashboard.atr` — engine can calculate this automatically.

---

### RISK MANAGEMENT

| Capital | Lot Size | Max Pip Risk |
|---|---|---|
| $1,000 | 0.01 | 200 pips |
| $2,000 | 0.02 | 200 pips |
| $3,000 | 0.03 | 200 pips |

- Daily target: **1% of capital**
- Risk budget: **200 pips per week** across all open trades
- Margin limit: $50 per $1,000 account
- Overall portfolio risk: **2-5%** per trade

#### Preferred Pairs by RRR
| Pair | TP (pips) | SL (pips) | RRR |
|---|---|---|---|
| GBPAUD | 190 | 50 | **3.80** |
| GBPJPY | 211 | 60 | **3.52** |
| AUDJPY | 110 | 35 | **3.14** |
| GBPUSD | 125 | 40 | **3.12** |
| EURJPY | 129 | 40 | **3.22** |
| CADJPY | 95 | 35 | 2.71 |
| NZDJPY | 85 | 35 | 2.43 |

---

### WEEKLY ROUTINE

| Day | Action |
|---|---|
| Weekend | Scan charts, plot scoring manually, set TP/SL levels |
| Monday | Set pending orders in morning |
| Tuesday | Same as Monday |
| Wednesday | Biggest moves/impulses happen — same routine |
| Thursday | Check if Wednesday impulse changed next week's scoring; cancel/set pending orders |
| Friday AM | Best time for advance scoring; set pending orders for next week by Friday at latest |

---

### PANDA ENGINE → WAGFX PLAYBOOK MAPPING

| Panda Engine | WAGFX Playbook |
|---|---|
| `base_d1, base_h4, base_h1` | BASE currency scores per TF |
| `quote_d1, quote_h4, quote_h1` | QUOTE currency scores per TF |
| `adv_base_d1/h4/h1` | Advance scoring for BASE currency |
| `adv_quote_d1/h4/h1` | Advance scoring for QUOTE currency |
| `gap` | GAP score (base - quote) |
| `hard_invalid` | Currency has opposing extreme scores = INVALID |
| `execution = MARKET` | Strong signal, rally started — Intra Game |
| `execution = PULLBACK` | Trend established — Pullback Play |
| `atr` | Use for ATR fill estimation formula |
| `BOX data` | WAG Box positioning for STEP 2 |
| MATCHUP = STRONG vs WEAK | Best setup (extreme vs extreme opposing) |
| MATCHUP = STRONG vs NEUTRAL | Good setup (extreme vs neutral, gap ≥ 5) |
| MATCHUP = STRONG vs STRONG | INVALID — do not trade |


---

## 📦 SESSION LOG — 2026-03-31

### Completed This Session

**Box Structure Detection (Phase 2 — Step 2)**
- `compute_box_trends()` added to `app.py` — uses 50% midpoint rule
- 3 WAG boxes from mt4 file sorted by span: ~2d=H1 ctx, ~14d=H4 ctx, ~62d=D1 ctx
- H1 trend = H4ctx(former) vs H1ctx(latter)
- H4 trend = D1ctx(former) vs H4ctx(latter)
- Results stored in Supabase `dashboard.box_h1_trend` and `dashboard.box_h4_trend`
- Dashboard shows BOX badges on pair cards and SETUPS tab
- Colors: ▲ UP=green, ▼ DOWN=red, ↔ RNG=yellow

**Bug Fixes**
- `scoreLabel()` fixed to use signed values (not abs) — STRONG=+4to+6, WEAK=-4to-6
- `timeAgo()` fixed to handle all Supabase timestamp formats (with/without Z, space separator)
- Tab text brightness increased: inactive tabs now `rgba(180,205,240,0.80)` instead of dim grey
- Fixed duplicate function build errors (stateColor, biasFromGap, isValid, scoreLabel, getMatchup)
- Spike banner capped at 10 items (was 50)

**Git commits this session (all READY on Vercel):**
- `6b91a34` — fix scoreLabel signed values
- `84c32ec` — fix duplicate functions
- `b81337b` — feat box H4/H1 trend on pair cards and setups tab
- `294c019` — fix timeAgo NaN + brighter tab text

---

## 🔜 NEXT STEPS — PRIORITY ORDER

### Next Up: Phase 2 — Entry Validation + Advance Score Warning

**1. Box Confirmation Filter on SETUPS tab**
Cross-check bias vs box trend to flag valid/invalid entries:
| Bias | H4 Box | H1 Box | Result |
|---|---|---|---|
| SELL | DOWNTREND | DOWNTREND | ✅ CONFIRMED |
| SELL | DOWNTREND | RANGING | ⚠️ WAIT |
| SELL | RANGING | any | ⚠️ WAIT |
| SELL | UPTREND | any | ❌ SKIP |
| BUY | UPTREND | UPTREND | ✅ CONFIRMED |
| BUY | UPTREND | RANGING | ⚠️ WAIT |
| BUY | RANGING | any | ⚠️ WAIT |
| BUY | DOWNTREND | any | ❌ SKIP |

**2. Advance Score Warning Badge**
Use `adv_base_*` and `adv_quote_*` already in Supabase:
- Compute ADV gap = adv_base_score - adv_quote_score
- If ADV H1 gap < 5 AND current gap >= 5 → show 🟡 ADV WEAK badge
- If ADV H4 gap < 5 → show 🔴 ADV BAD — consider closing
- Shown on pair cards + SETUPS

**3. ATR Fill Estimation**
Formula: `hours = (pip_distance / (ATR / 24))`
ATR is already in Supabase. Show on SETUPS: "Est. ~X hrs to entry"

**4. Phase 3 — PDR Detection**
Detect Premium/Discount/Range using box midpoint vs current price:
- Price above box mid → Premium zone (sell bias pairs — ideal)
- Price below box mid → Discount zone (buy bias pairs — ideal)
- Show PDR badge on pair cards

**5. VPS Migration**
Move app.py + ctrader_journal.py to VPS for 24/7 operation without PC running

