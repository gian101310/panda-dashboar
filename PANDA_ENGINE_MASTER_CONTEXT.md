# 🐼 PANDA ENGINE — MASTER CONTEXT v4.0
> Paste this at the start of any new Claude chat to resume instantly.
> Last updated: 2026-04-02

---

## 🏗️ SYSTEM OVERVIEW

| Component | Details |
|---|---|
| **Engine** | Python/FastAPI v3.0 — `C:\Users\Admin\Desktop\ctrader_trend_scanner\app.py` |
| **Start engine** | Double-click `C:\Users\Admin\Desktop\PANDA_ENGINE.bat` (interactive ON/OFF/RESTART/FORCE menu) |
| **Python version** | `py -3.11` (NOT `python` — that's 3.14 which lacks packages) |
| **Dashboard** | Next.js on Vercel — https://panda-dashboar.vercel.app |
| **GitHub repo** | https://github.com/gian101310/panda-dashboar |
| **Local dashboard repo** | `C:\Users\Admin\panda-dashboard` |
| **Data flow** | MT4 Indicator writes `mt4_SYMBOL.txt` → app.py scores → Supabase → Vercel dashboard |

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

---

## 📁 KEY FILE PATHS

```
C:\Users\Admin\Desktop\ctrader_trend_scanner\app.py          ← Python engine v3.0
C:\Users\Admin\Desktop\PANDA_ENGINE.bat                      ← Engine ON/OFF control menu
C:\Users\Admin\panda-dashboard\                              ← Next.js dashboard repo
C:\Users\Admin\panda-dashboard\pages\dashboard.js            ← Main dashboard UI (~1780 lines)
C:\Users\Admin\panda-dashboard\pages\admin\index.js          ← Admin panel
C:\Users\Admin\panda-dashboard\pages\api\data.js             ← API: all pair data
C:\Users\Admin\panda-dashboard\pages\api\spikes.js           ← API: spike events
C:\Users\Admin\panda-dashboard\check_dupes.py                ← Duplicate function checker
C:\Users\Admin\AppData\Roaming\MetaQuotes\Terminal\Common\Files\  ← MT4 shared files folder
  mt4_SYMBOL.txt     ← Written by MT4 Indicator (source data)
  tbg_SYMBOL.txt     ← Written by cTrader TBG_MultiExporter cBot
C:\Users\Admin\Documents\cAlgo\Sources\Indicators\TBG_FileExporter\TBG_FileExporter\TBG_FileExporter.cs
C:\Users\Admin\Documents\cAlgo\Sources\Robots\TBG_MultiExporter.cs
```

---

## ⚙️ ENGINE v3.0 ARCHITECTURE

### Key Facts
- **cBot (`PandaEngineMaster.cs`) is RETIRED** — do NOT run it
- `app.py` reads `mt4_SYMBOL.txt` directly and does ALL scoring in Python
- Scheduler: every 15 min (gap scoring) + every hour (gap + Telegram snapshot)
- `MAX_FILE_AGE_SECONDS = 300` — mt4 files older than 5 min are skipped as stale
- TBG files use `7200s` limit (H1 bar close = up to 2 hrs between updates)

### Engine Routes
| Route | Description |
|---|---|
| `GET /force` | Force run + send Telegram snapshot |
| `GET /status` | Engine health + pair counts |
| `POST /api/login-alert` | Called by dashboard login for Telegram alert |

### MT4 File Format (`mt4_SYMBOL.txt`)
```
EUR : D1 : -3    | H4 : +2    | H1 : +3/-1
USD : D1 : +2    | H4 : +4    | H1 : +6
ADV : EUR : D1 : -2  | H4 : +4  | H1 : +1/-1
ADV : USD : D1 : +3  | H4 : +4  | H1 : +6
ATR : 942 : 1679 Points.
SPREAD : 24 Points.
BOX|WagBox1|1772409600|1.17959|1773619200|1.14107
BOX|WagBox2|...
BOX|WagBox3|...
```

### TBG File Format (`tbg_SYMBOL.txt`)
Written by `TBG_MultiExporter` cBot every 60s for all 21 pairs:
```
TBG_ST   : 0.57994     ← SuperTrend line value
TBG_FL   : 0.57552     ← FollowLine value
TBG_BIAS : SELL        ← BUY / SELL / NEUTRAL
TBG_ZONE : BELOW       ← ABOVE / BELOW / BETWEEN
TBG_G1   : VALID       ← VALID / INVALID
TBG_PRICE: 0.57692
```

### CRITICAL: Split Value Parsing
- `extract_panda_score()` MUST receive raw original lines (stored as `raw_base_line`, `raw_quote_line`)
- `parse_tf_score("+2/-1")` = sums to `+1` for display only
- Scoring uses individual values: `+2` and `-1` are separate → if both extremes → HARD_INVALID

### GAP Score Rules
| Condition | Result |
|---|---|
| `gap >= 5` | BUY |
| `gap <= -5` | SELL |
| `abs(gap) < 5` | INVALID |
| Currency conflict | HARD_INVALID |
| `abs(gap) >= 9` | MARKET execution |
| `abs(gap) >= 5` | PULLBACK execution |
| `abs(gap) >= 10` | HIGH confidence |
| `abs(gap) >= 8` | MEDIUM confidence |
| `abs(gap) >= 5` | LOW confidence |

---

## 🗄️ SUPABASE TABLES

### `dashboard` — main table (upserted every 15 min, conflict key: `symbol`)
Key columns: `symbol`, `gap`, `bias`, `execution`, `confidence`, `hard_invalid`,
`base_currency`, `base_d1`, `base_h4`, `base_h1`, `quote_currency`, `quote_d1`, `quote_h4`, `quote_h1`,
`adv_base_d1/h4/h1`, `adv_quote_d1/h4/h1`, `atr`, `atr_reference`, `spread`,
`momentum`, `delta_short`, `delta_mid`, `delta_long`, `strength`, `state`, `close_alert`,
`box_h1_trend`, `box_h4_trend`, `tbg_zone`, `tbg_bias`, `tbg_g1_valid`, `updated_at`

### `gap_history` — historical gap readings (upsert conflict: `timestamp,symbol`)
### `spike_events` — momentum spikes (INSERT only — never replace)
### `strength_log`, `engine_logs`, `trade_journal` — operational tables
### `users`, `sessions`, `audit_log` — auth tables
### `feature_flags`, `user_roles`, `user_feature_access` — permission tables

---

## 📊 DASHBOARD — FULL FEATURE LIST (as of 2026-04-02)

### Live URL: https://panda-dashboar.vercel.app

### Tabs
| Tab | Feature Key | Description |
|---|---|---|
| PANELS | dashboard | All 21 pair cards with full detail |
| SIGNALS | signals | Clean BUY/SELL only view — shows `EURUSD BUY`, `NZDJPY SELL` etc. |
| TABLE | dashboard | Sortable table all pairs |
| GAP CHART | dashboard | Historical gap line chart |
| CALENDAR | calendar | Economic calendar + central bank rates |
| CALCULATOR | calculator | Position size + R:R calculator |
| COT REPORT | cot | CFTC COT data |
| SETUPS | dashboard | Valid pairs gap ≥ 5 |
| VALID PAIRS | dashboard | gap ≥ 5 + BUILDING/STRONG momentum |
| SPIKE LOG | dashboard | Full spike history (unlimited) |
| LIVE | dashboard | Live indicator |
| ENGINE | engine | Admin-only health monitor |

### Tab Access Control (Per-User)
Controlled via Admin Panel → Edit User → Feature Access toggles:
- `dashboard` → PANELS, TABLE, GAP CHART, SETUPS, VALID PAIRS, SPIKE LOG
- `signals` → SIGNALS tab
- `cot` → COT REPORT tab
- `calendar` → CALENDAR tab
- `calculator` → CALCULATOR tab
- `journal` → Journal page (`/journal`)
- `engine` → ENGINE tab (admin only)

Role defaults:
- `user`: dashboard, cot, calendar, calculator
- `vip`: + signals, journal
- `admin`: all features

### Pair Card Features (PANELS tab)
Each card shows:
- Symbol + BUY/SELL badge
- Gap score (large) + trend arrow (STRONGER/WEAKER/STABLE)
- Sparkline history
- MATCHUP label (e.g. `EUR STRONG / NZD WEAK — IDEAL`)
- BOX badges: `H4 ▲ UP`, `H1 ↔ RNG`
- TBG badge: `🟢 ABOVE LINES ✅` or `🔴 BELOW LINES ⛔`
- Box confirm badge: `✅ CONFIRMED`, `⚠️ WAIT H1`, `❌ SKIP`, `⚠️ RANGING`
- ADV warning: `🔴 ADV H4 WEAK`, `🟡 ADV H1 WEAK` (hidden if OK)
- COT bias badge
- Momentum state + action guide (`👉 ENTER NOW — Momentum confirmed`)
- Delta chips (1H / 4H / 8H)
- Strength bar + score
- Click → opens full PairCardModal with all TF scores

### SIGNALS Tab
- Shows only pairs where `bias === 'BUY'` or `bias === 'SELL'`
- Sorted by abs(gap) descending
- Clean minimal cards: just symbol + colored BUY/SELL badge
- No other information shown

### Spike Banner
- Top of dashboard, last 20 min only, max 10 items, hideable

### Matchup Label Rules
| Score | Label |
|---|---|
| `+4 to +6` | STRONG |
| `-4 to -6` | WEAK |
| `-3 to +3` | NEUTRAL |

Uses signed dominant TF value per currency (NOT abs).

### TBG Badge Logic
- `ABOVE` + BUY bias → 🟢 ABOVE LINES ✅ (G1 valid)
- `BELOW` + SELL bias → 🔴 BELOW LINES ✅ (G1 valid)
- `BETWEEN` → ↔️ BETWEEN ⛔ (not valid)
- `ABOVE` + SELL bias → ⬆️ ABOVE LINES ⛔
- `BELOW` + BUY bias → ⬇️ BELOW LINES ⛔

---

## 🤖 CTRADER COMPONENTS

### TBG_FileExporter Indicator
- File: `C:\Users\Admin\Documents\cAlgo\Sources\Indicators\TBG_FileExporter\TBG_FileExporter\TBG_FileExporter.cs`
- Attaches to individual charts, writes `tbg_SYMBOL.txt` on bar close
- Parameters: ST(10, 3.0), FL BB(21, 1.0), FL ATR(5)
- Writes on `IsLastBar || index == Bars.Count - 2` (stays fresh between bar closes)

### TBG_MultiExporter cBot ⭐ (preferred — use this instead of indicator)
- File: `C:\Users\Admin\Documents\cAlgo\Sources\Robots\TBG_MultiExporter.cs`
- **Attach to ONE chart only** — auto-exports all 21 pairs every 60 seconds
- Uses `MarketData.GetBars(TimeFrame.Hour, sym)` to get H1 data per symbol
- Calculates ST + FL internally and writes all `tbg_SYMBOL.txt` files
- No need to open 21 charts — single instance covers everything

### MT4 Indicator (`Panda_scoring.cs`)
- Must keep running — writes `mt4_SYMBOL.txt` for all 21 pairs
- Source of all scoring data

---

## 👤 USER MANAGEMENT (Admin Panel)

URL: https://panda-dashboar.vercel.app/admin

Features:
- Create / Edit / Disable / Delete users
- Set role (user / vip / admin)
- Set max devices, expiry date, notes
- Toggle feature access per user (controls which tabs they see)
- SESSIONS tab — see active sessions, revoke any
- LOGS tab — full audit trail of logins

---

## 🚀 DEPLOYMENT WORKFLOW

### Push Dashboard to Vercel
```cmd
cd C:\Users\Admin\panda-dashboard
git add -A
git commit -m "description"
git push origin main
```
Use batch files — PowerShell `&&` chains break. Example: `push_signals.bat`

Vercel auto-builds (~60 seconds). Hard refresh: `Ctrl+Shift+R`

### ⚠️ ALWAYS CHECK DUPES BEFORE PUSHING
```cmd
cd C:\Users\Admin\panda-dashboard
py -3.11 check_dupes.py
```
Output should show: `✅ function X: 1` for all 6 functions.
Duplicate functions = Vercel build error `defined multiple times`.

### ⚠️ Restore Corrupted File
```cmd
cd C:\Users\Admin\panda-dashboard
git show HEAD:pages/dashboard.js > pages\dashboard.js
```

### Writing Patches
- NEVER patch JS inline from PowerShell (breaks emojis/encoding)
- Always write patch logic to `.py` file, run: `py -3.11 patchfile.py`
- Write files in chunks of 25–30 lines using `mode: append`

---

## 🔧 COMMON COMMANDS

```cmd
# Start/stop engine interactively
C:\Users\Admin\Desktop\PANDA_ENGINE.bat

# Force engine run
curl http://localhost:8000/force

# Check engine status
curl http://localhost:8000/status

# Validate app.py syntax
py -3.11 -c "import ast; ast.parse(open('app.py', encoding='utf-8').read()); print('OK')"

# Check dashboard duplicate functions
py -3.11 check_dupes.py

# Commit and push dashboard
push_signals.bat  (or create new .bat for each push)
```

---

## ✅ COMPLETED FEATURES (Full History)

| Feature | Status |
|---|---|
| Engine v3.0 — cBot retired, app.py reads mt4 files directly | ✅ |
| 21-pair scoring (GAP, BIAS, EXECUTION, CONFIDENCE, HARD_INVALID) | ✅ |
| Two-phase global currency conflict detection | ✅ |
| Momentum states (STRONG/BUILDING/SPARK/CONSOLIDATING/COOLING/FADING/REVERSING) | ✅ |
| Delta calculations (30min/2h/6h from gap history) | ✅ |
| Supabase: dashboard, gap_history, spike_events, strength_log tables | ✅ |
| Vercel Next.js dashboard with login/session auth | ✅ |
| PANELS tab — pair cards with sparklines | ✅ |
| TABLE tab — sortable with all columns | ✅ |
| GAP CHART tab — multi-pair history chart | ✅ |
| CALENDAR tab — economic events + central bank rates | ✅ |
| CALCULATOR tab — position size + R:R | ✅ |
| COT REPORT tab | ✅ |
| SETUPS tab — valid pairs sorted alphabetically | ✅ |
| VALID PAIRS tab | ✅ |
| SPIKE LOG tab — full history, INSERT-only | ✅ |
| ENGINE tab — admin-only health monitor | ✅ |
| **SIGNALS tab** — clean BUY/SELL only view (symbol + badge) | ✅ NEW |
| Spike banner — last 20 min, max 10 items, hideable | ✅ |
| Momentum heatmap (1H/4H/8H) | ✅ |
| Sound + browser notifications on spike | ✅ |
| Telegram spike alerts + hourly snapshot | ✅ |
| Login alert Telegram bot | ✅ |
| Box structure detection (H1/H4 trend via 50% midpoint rule) | ✅ |
| Box confirmation badge (CONFIRMED/WAIT H1/SKIP/RANGING) | ✅ |
| Advance score (ADV) warning badge on pair cards | ✅ |
| Matchup label (STRONG/WEAK/NEUTRAL) on all tabs | ✅ |
| scoreLabel uses signed values (not abs) — fixed | ✅ |
| TBG zone badge on pair cards (ABOVE/BELOW/BETWEEN) | ✅ |
| TBG badge label shows TBG ✅/⛔ (G1 removed from label) | ✅ NEW |
| TBG modal section shows "TBG LINES" with zone + validity | ✅ |
| Clickable PairCardModal — full detail view | ✅ |
| ATR fill estimation (pips/hr) on pair cards | ✅ |
| cTrader journal sync (ctrader_journal.py) | ✅ |
| Trade journal page (`/journal`) | ✅ |
| Open trades panel (admin) | ✅ |
| Currency strength chart (`/strength`) | ✅ |
| Admin panel — create/edit/delete/disable users | ✅ |
| Admin panel — sessions + audit logs | ✅ |
| **Per-user tab access control via feature_access toggles** | ✅ NEW |
| Role defaults: user/vip/admin with different tab sets | ✅ NEW |
| **TBG_FileExporter indicator** (single chart, writes on bar close) | ✅ NEW |
| **TBG_MultiExporter cBot** (single instance, all 21 pairs, every 60s) | ✅ NEW |
| **PANDA_ENGINE.bat** — interactive engine control menu (ON/OFF/RESTART/FORCE) | ✅ NEW |
| TBG age limit raised to 7200s in app.py (H1 bar close timing) | ✅ NEW |
| TBG fields added to BOTH payload blocks in app.py | ✅ NEW |
| check_dupes.py utility | ✅ |

---

## 🔜 PENDING / NEXT STEPS

| Priority | Feature | Notes |
|---|---|---|
| 1 | **VPS Migration** | Move app.py + ctrader_journal.py to VPS for 24/7 without PC on |
| 2 | **PDR Zone Detection** | Premium/Discount/Range badge using box midpoint vs current price |
| 3 | **Signal Performance Analytics** | Win rate per momentum state from trade_journal data |
| 4 | **Multi-account journal filtering** | 4 cTrader accounts — filter P&L per account |
| 5 | **MT4 Alert Export** (SAVED FOR LATER) | Export G1 LIMIT ORDER alerts from MT4 EA to dashboard |
| 6 | **Session Clock** | London/NY/Tokyo/Sydney overlap indicator |
| 7 | **Mobile layout** | Dashboard is desktop-only currently |
| 8 | **ATR Fill on VALID PAIRS** | Show est. hrs to order fill |

---

## 🧠 TRADING METHODOLOGY (G1 Masterclass — WAGFOREX Academy / Cai Angeni Reyes)

### Signal Colors
| Color | Signal | Action |
|---|---|---|
| 🔴 RED | Strong SELL | Enter immediately |
| 🟢 GREEN | Strong BUY | Enter immediately |
| 🟡 YELLOW | Anticipation | Wait for Moving Trendline confirmation |
| ⬜ WHITE | No Trade | Skip |

### Scoring Rules
- Values `+4/+5/+6` = EXTREME STRONG — pick ONE highest
- Values `-4/-5/-6` = EXTREME WEAK — pick ONE lowest
- Values `-3 to +3` = NEUTRAL (score = 0)
- Both extreme strong AND extreme weak = INVALID
- NEVER add scores — only pick the strongest single value

### GAP Rule
- `GAP = BASE_SCORE - QUOTE_SCORE`
- Tradeable: `≥ +5` (BUY) or `≤ -5` (SELL)
- Gap scoring: ±9 = MARKET, ±5 = PULLBACK, ±10 = HIGH confidence, ±8 = MEDIUM

### Box Structure (WAG Boxes / Step 2)
- Big Box = D1, Medium = H4, Small = H1
- **50% Midpoint Rule**: if latter box midpoint > former box → UPTREND
- H1 trend = H4ctx(former) vs H1ctx(latter)
- H4 trend = D1ctx(former) vs H4ctx(latter)
- Bias must MATCH box direction to enter

### Entry Types
- **Pullback Play** — price returns to WAG line (limit order)
- **Intra Game** — rally started, enter on 2nd H1 candle

### Trade Management
- SL: previous swing high (SELL) or low (BUY)
- TP: 1:2 RRR minimum (prefer 1:3 or 1:4)
- PSL: move to breakeven when gain = original SL, then trail

### Advance Scoring
- ADV H1 = next day forecast, ADV H4 = next week, ADV D1 = next month
- If ADV H4 bad → cancel/close trade
- If ADV H1 bad but ADV H4 good → can hold

### TBG (Triple Momentum / G1 Intraday Validity)
- FollowLine (blue = up, orange = down) + SuperTrend + PMax
- All 3 agree = strongest signal
- `ABOVE both lines` + BUY bias = G1 VALID (intra game entry OK)
- `BELOW both lines` + SELL bias = G1 VALID (intra game entry OK)
- `BETWEEN` = not valid for intra

### Panda Engine → WAGFX Mapping
| Panda Engine | WAGFX |
|---|---|
| `gap >= 5, execution=MARKET` | 🟢/🔴 Strong signal |
| `gap >= 5, execution=PULLBACK` | 🟡 Anticipation |
| `hard_invalid` | INVALID — do not trade |
| `box_h4_trend, box_h1_trend` | Step 2 box check |
| `tbg_zone=ABOVE/BELOW, tbg_g1_valid=true` | G1 Intra valid |
| `adv_base/quote` scores | Advance scoring |
| MATCHUP STRONG vs WEAK | Best setup |

---

## 📱 BOTS & EXTERNAL SERVICES

| Service | Details |
|---|---|
| Signal Telegram group | `-1003857801976` — spike alerts + hourly snapshots |
| Login alert bot | `5379148910` — fires on every dashboard login |
| cTrader journal | `ctrader_journal.py` syncs trades every 5 min |
| 4 cTrader accounts | 36456179 (live), 42138936, 42181315, 43889924 (demo) |

---

## 🐼 NOTES FOR CLAUDE (IMPORTANT)

- Always use `py -3.11` not `python` on this machine
- Write patches to `.py` files, run with `py -3.11 script.py`
- Git commits: use `.bat` files — `&&` chains break in PowerShell
- After ANY dashboard.js patch: run `py -3.11 check_dupes.py` before pushing
- Restore from git if file corrupted: `git show HEAD:pages/dashboard.js > pages\dashboard.js`
- Engine reads `mt4_eurusd.txt` (lowercase symbol in filename)
- `extract_panda_score()` MUST receive raw original line (not reconstructed)
- TBG files: 7200s age limit (not 300s like mt4 files)
- Both payload blocks in `run_gap_once()` must have TBG fields
- Admin panel is at `/admin` (separate page, not dashboard tab)
- Dashboard tabs are filtered at render time using `TAB_FEATURE` map + user `feature_access`
- `PANDA_ENGINE.bat` on Desktop is the new engine control — detects online/offline state

---

## 📦 RECENT SESSION LOG (2026-04-01 to 2026-04-02)

### TBG Integration (Full Chain)
1. Built `TBG_FileExporter.cs` indicator — exports tbg_SYMBOL.txt on bar close
2. Fixed stray `=` character at file start that caused 157 compile errors
3. Built `TBG_MultiExporter.cs` cBot — single instance exports all 21 pairs every 60s
4. Added `parse_tbg_file()` to app.py — reads tbg_SYMBOL.txt, 7200s age limit
5. Added `tbg_zone`, `tbg_bias`, `tbg_g1_valid` columns to Supabase dashboard table
6. Added TBG fields to BOTH payload blocks in `run_gap_once()` (was only in HARD_INVALID block)
7. Updated `pages/api/data.js` to return TBG fields
8. Added `tbgZoneBadge()` helper + TBG badge rendering on PANELS, SETUPS, VALID PAIRS, modal
9. TBG badge label changed from "G1✅/G1⛔" to just "✅/⛔"

### SIGNALS Tab
- Added `SIGNALS` to TABS array in dashboard.js
- Clean layout: only shows `bias === 'BUY' || bias === 'SELL'` pairs
- Each item: symbol (Orbitron font) + colored BUY/SELL badge only — no other info
- Sorted by abs(gap) descending

### Per-User Tab Access Control
- Added `TAB_FEATURE` map in dashboard.js (tab name → feature_access key)
- Tab bar now filters: `TABS.filter(t => isAdmin || user?.feature_access?.includes(TAB_FEATURE[t]))`
- Updated admin panel `ALL_FEATURES`, `FEATURE_LABELS`, `ROLE_DEFAULTS`
- VIP default now includes `signals` and `journal`

### PANDA_ENGINE.bat
- Saved to `C:\Users\Admin\Desktop\PANDA_ENGINE.bat`
- Interactive menu: detects online/offline, shows relevant options
- Commands: START / STOP / RESTART / FORCE RUN / VIEW STATUS

### Bug Fixed: TBG Data Not Writing to Supabase
- Root cause: second `dashboard_payload.append()` block (valid pairs) was missing TBG fields
- Only the HARD_INVALID block had them
- Fixed with `_fix_tbg_payload.py` — added 3 TBG lines to valid-pairs block

### Bug Fixed: TBG File Age Rejection
- app.py was using `MAX_FILE_AGE_SECONDS * 2 = 600s` for TBG files
- TBG files only update on H1 bar close (~60 min)
- Fixed: TBG parser now uses `7200s` hardcoded limit (2 hours)

### Git Commits This Session
- `f94d7a4` — feat tbg zone badge
- `a526dad` — update dashboard (batch files)
- `51b75af` — add check_dupes.py utility
- `68df678` — feat: SIGNALS tab + tab access control + TBG label fix

---

## 🔢 21 TRADING PAIRS

```
AUDJPY, AUDCAD, AUDNZD, AUDUSD, CADJPY,
EURAUD, EURCAD, EURGBP, EURJPY, EURNZD, EURUSD,
GBPAUD, GBPCAD, GBPJPY, GBPNZD, GBPUSD,
NZDCAD, NZDJPY, NZDUSD, USDCAD, USDJPY
```

---

## 📐 USEFUL SQL QUERIES

```sql
-- Current valid pairs with TBG
SELECT symbol, gap, bias, execution, tbg_zone, tbg_bias, tbg_g1_valid, updated_at
FROM dashboard WHERE hard_invalid = false AND ABS(gap) >= 5
ORDER BY ABS(gap) DESC;

-- TBG status check
SELECT symbol, tbg_zone, tbg_bias, tbg_g1_valid, updated_at
FROM dashboard WHERE symbol IN ('NZDUSD','EURUSD','GBPJPY');

-- Recent spikes
SELECT symbol, gap, bias, momentum, fired_at
FROM spike_events ORDER BY fired_at DESC LIMIT 20;

-- Engine last run
SELECT symbol, updated_at FROM dashboard ORDER BY updated_at DESC LIMIT 1;
```

---
*End of context file. Paste this entire document at the start of a new chat.*
*Version: 4.0 | Updated: 2026-04-02*
