---

## name: panda-engine description: &gt; Complete project context for the Panda Engine forex intelligence platform. Use this skill for ANY task involving Panda Engine, the trading dashboard, [app.py](http://app.py) engine, cTrader journal, Supabase backend, or Vercel deployment. Trigger on: dashboard.js edits, new tabs, component fixes, API routes, Supabase queries, engine scoring, TBG indicator, momentum states, gap analysis, deployment, git push, patch scripts, or any mention of "panda", "dashboard", "engine", "pairs", "gap score", "momentum", "TBG", "cTrader", "trade journal", "spike", "strength", "signals", "PDR", "edge badge", "memory index", "tracker", "confidence", "auto-heal", "news alert", "brain", "session", "box trend", "gap velocity". ALWAYS read this skill before touching any Panda Engine file. ALSO read AI_BUILD_PLAN_UPDATED.md before any AI agent or signal_tracker work.

# Panda Engine — Project Skill

> Last updated: April 25, 2026

---
## 1. FILE MAP

### Engine (Python/FastAPI — local PC, future VPS)

FilePathLinesPurpose[**app.py**](http://app.py)`C:\Users\Admin\Desktop\ctrader_trend_scanner\app.py`\~1940Core engine: MT4 parser, scoring, Supabase push, signal snapshots, Telegram, scheduler, tracker trigger, spike throttle, auto-heal, news alerts, AI snapshot**check_dupes.py**`C:\Users\Admin\Desktop\ctrader_trend_scanner\check_dupes.py`—**RUN BEFORE EVERY PUSHSTART_PANDA.bat**`C:\Users\Admin\Desktop\START_PANDA.bat`18**WATCHDOG** — auto-restarts engine on crash

### Dashboard (Next.js 14 — Vercel)

FilePathLinesPurpose**dashboard.js**`C:\Users\Admin\panda-dashboard\pages\dashboard.js`\~2781Main dashboard — 12 tabs, all components, news alerts, memoryIndex, edge badges, PDR**ai-chat.js**`C:\Users\Admin\panda-dashboard\pages\api\ai-chat.js`\~323Panda AI — 2 modes (user narrator / admin coach) + brain injection + remember detection**admin-brain.js**`C:\Users\Admin\panda-dashboard\pages\api\admin-brain.js`48Admin brain CRUD (GET/POST/DELETE) — admin only**signal-agent.js**`C:\Users\Admin\panda-dashboard\pages\api\signal-agent.js`\~250Signal Agent v1 + run summary logging**journal-agent.js**`C:\Users\Admin\panda-dashboard\pages\api\journal-agent.js`\~229Journal Agent + run summary logging**pattern-agent.js**`C:\Users\Admin\panda-dashboard\pages\api\pattern-agent.js`\~277Pattern Agent + run summary logging**signal-tracker.js**`C:\Users\Admin\panda-dashboard\pages\api\signal-tracker.js`\~324Signal Tracker — open/update/close, PDR at open, box at open, session, price capture**pdr.js**`C:\Users\Admin\panda-dashboard\pages\api\pdr.js`\~178PDR strength via Twelve Data D1 OHLC + per-symbol pdr_cache upsert**upcoming-news.js**`C:\Users\Admin\panda-dashboard\pages\api\upcoming-news.js`111HIGH impact news in next 60 min + affected pairs**ai-memory.js**`C:\Users\Admin\panda-dashboard\pages\api\ai-memory.js`71AI memory CRUD**telegram-webhook.js**`C:\Users\Admin\panda-dashboard\pages\api\telegram-webhook.js`\~166/start auto-signup (free 7-day trial)

### Key Paths

- **Git repo**: `github.com/gian101310/panda-dashboar` (no 'd')
- **Vercel URL**: `pandaengine.app`
- **Supabase project ID**: `jxkelchxitwuilpbrwxk`
- **Engine runs via**: `START_PANDA.bat` (watchdog — auto-restarts)
- **Engine URL**: `http://localhost:8000`

---

## 2. DASHBOARD.JS COMPONENT INDEX (\~2781 lines)

LineComponent / ConstantPurpose1`import`useState, useEffect, useCallback, useRef, useMemo8`ALL_PAIRS`21-pair array10–22`MOMENTUM_GUIDE`Icon/action/color for 10 momentum states25–41`stateColor`, `biasFromGap`, `isValid`Core utilities42–51`isNeutralMatchup`NEUTRAL vs NEUTRAL hard_invalid check52–60`isMarketOpen`Forex market hours auto-detection61–64`getMaturity`proven (≥50) / developing (20-49)65–76`getMomentumAction`RIDE IT / COUNTER alignment check77–97`getEdgeMemory`Edge lookup cascade: gap+pl → gap → overall100–113`PdrBadge`PDR strength badge component\~115`boxTrend`Box trend detection (UP/DOWN/RANGING)\~135`plZoneBadge`PL zone badge (ABOVE/BELOW/BETWEEN)\~200`scoreLabel`, `getMatchup`Currency strength matchup\~257`computeConfidence`Multi-factor confidence 0–100, returns {confidence, reasons, historical, conflict}\~310`confStyle`Confidence tier styling\~320`signalLabel`STRONG/MOD/WEAK\~340`TrendArrow`, `Sparkline`, `DeltaChip`Small visual components\~380`SpikeBanner`Spike alert banner\~500`AlertSettingsModal`Per-user alert settings\~625`GapChart`Gap history chart\~730`EconomicCalendar`Calendar with pair filtering\~780`PositionCalculator`Lot size calculator\~830`EngineHealth`Engine status (admin only)\~940`PairCard`Main pair card — `{ row, trend, cotBias, confidence, memoryIndex, pdr, newsAlert }`\~1040`PairCardModal`Click-to-expand modal\~1150`ValidSetupsTab`Filtered setups\~1270`ValidPairsTab`Auto-filtered pairs\~1410`OpenTradesPanel`Open trades (admin)\~1560`LogsTab`Signal Log + Spike Log subtab\~1590`buildTVDoc`, `ChartTab`TradingView chart\~1690`SignalLogTab`Signal snapshot log\~1790`ResearchTab`Calendar + COT\~1830`PandaAIChat`Panda AI chat (3 modes, userId for admin)\~1900`TrackerPanel`Signal tracker cards\~1960`TABS`12 tabs\~1980`SignalAnalytics`Signal performance analytics\~2280`export default function Dashboard()`Main — upcomingNews state, news fetch useEffect

### Tab Structure (12 tabs)

PANELS, SIGNALS, TABLE, GAP CHART, RESEARCH, CALCULATOR, SETUPS, VALID PAIRS, CHART, ANALYTICS, LOGS, PANDA AI

### Key State in Dashboard()

```javascript
const [upcomingNews, setUpcomingNews] = useState({ events: [], affected_pairs: [] });
const [pdrData, setPdrData] = useState({});
const [aiMemories, setAiMemories] = useState([]);
const memoryIndex = useMemo(() => { ... }, [aiMemories]); // strategy-based hashmap
```

---

## 3. [APP.PY](http://APP.PY) ENGINE INDEX (\~1940 lines)

LineFunction / BlockPurpose49–72Config blockMT4_PATH, Telegram, Supabase, OpenAI, PAIRS73–92State varsPREV_GAP, NEWS_ALERTED, NEWS_CACHE, CURRENCY_TO_PAIRS103–110`TelegramCircuitBreaker`Rate-limit protection112–130`get_session()`ASIAN 22:00-05:59 UTC / LONDON 06:00-13:59 / NEW_YORK 14:00-21:59133`safe_float`Safe float parser140–230`parse_tf_score`, `parse_mt4_file`Reads mt4_SYMBOL.txt233–276`parse_pl_file`Reads pl_SYMBOL.txt → ST/FL/BIAS/ZONE278–328`compute_box_trends`UPTREND/DOWNTREND/RANGING330–439`extract_panda_score`, `compute_scores_all_pairs`**LOCKED — NEVER TOUCH**\~450`neutral_matchup`both abs &lt; 4 → hard_invalid455–500`classify_momentum`, `should_close_alert`Momentum engine\~505`compute_signal_confidence`Server-side confidence 0-100\~640`log_signal()`Inserts into signal_results WITH session + box_h1_trend + box_h4_trend\~680`check_bb_entry`, `check_intra_entry`Signal entry logic\~820`run_gap_once()`Main engine loop — includes gap_deltas tracking\~1015`gap_deltas[symbol]`Computed BEFORE PREV_GAP update\~1095Snapshot insertIncludes gap_delta from gap_deltas map\~1160Signal tracker triggerPOST to signal-tracker after every cycle\~1515`fetch_news_feed()`Fetches ForexFactory JSON, 30-min cache\~1540`parse_news_time()`FF date/time → UTC datetime, handles ET timezone\~1560`check_news_alerts()`HIGH impact events 10-60 min away → Telegram alert, deduped by NEWS_ALERTED\~1615`send_ai_snapshot()`Hourly OpenAI narration → Telegram text message\~1720`master_scheduler()`5-min: run_gap_once + check_news_alerts; Hourly: +send_snapshot +send_ai_snapshot

---

## 4. SUPABASE TABLES (21 tables)

TableRecordsPurpose`dashboard`21Live pair data (upserted every 5 min)`gap_history`—Historical gap scores`signal_snapshots`30,000+All 21 pairs every 5-min cycle — includes gap_delta`signal_results`326+BB + INTRA signals — includes session, box_h1_trend, box_h4_trend, pdr_strength, pdr_strong, pdr_direction`manual_trades`439Real trades CSV import`signal_tracker`10+Live signal lifecycle — includes session_at_open, pdr_strength_at_open, pdr_strong_at_open, box_h1_at_open, box_h4_at_open`ai_memory`57AI agent findings (22 signal + 21 journal + 14 pattern)`admin_brain`18Boss-G personal brain (preferences, rules, coaching, patterns)`pdr_cache`21Per-symbol PDR strength cache (symbol PK, 15-min TTL)`panda_users`4+Users + roles + telegram_chat_id + expires_at + feature_access`spike_events`852+Spike alerts (throttled: gap≥7, 4hr cooldown)`engine_logs`—Engine runs + agent summaries`strength_log`—Currency strength time series`panda_sessions`—Active sessions`panda_access_logs`—Login audit`csv_uploads`—Trade CSV uploads`user_alert_prefs`—Per-user alert preferences`telegram_subscriptions`—Telegram opt-ins`pf_approved`—SaaS signup approvals

### signal_results key columns (full)

symbol, direction, strategy, entry_gap, peak_gap, entry_price, base_score, quote_score, bias, momentum, confidence, pl_zone, pl_st, pl_fl, **session**, **box_h1_trend**, **box_h4_trend**, **pdr_strength**, **pdr_strong**, **pdr_direction**, status, snapshots

### signal_tracker key columns (full)

symbol, direction, strategy, gap_at_open, momentum_at_open, pl_zone_at_open, **session_at_open**, **box_h1_at_open**, **box_h4_at_open**, **pdr_strength_at_open**, **pdr_strong_at_open**, peak_gap, hourly_gaps, hourly_prices, entry_price, exit_price, peak_price, worst_price, net_pips, closed_at, close_reason, status, milestones

### admin_brain columns

id (uuid PK), category (preference/coaching/pattern/rule/question), key (UNIQUE text), value (text), updated_at

### pdr_cache columns

symbol (text PK), pdr_strength (numeric), pdr_strong (boolean), pdr_direction (text), retracement (numeric), computed_at

---

## 5. AI INTELLIGENCE LAYER

### Two AI Modes

ModeTriggerPromptRestrictionsUSERAny logged-in userUSER_PROMPTNarrator only, no recommendations, disclaimer on every responseADMINrole === 'admin'ADMIN_PROMPT + ENGINE_KNOWLEDGE + brainUnrestricted, full coach, remembers everything

### Admin Brain System

- `admin_brain` Supabase table — 18 records seeded
- `fetchBrainContext()` — injected into every admin chat session
- `detectRemember()` — regex detects "remember that/this", "don't forget", "keep in mind"
- `classifyBrainEntry()` — auto-categorizes into preference/rule/pattern/coaching
- Auto-stored to admin_brain when admin says "remember"

### Agents (all live)

AgentRouteMemoriesAnalyzesSignal Agent v1`/api/signal-agent`22gap levels, PL edge, per-pair, flat ratesJournal Agent`/api/journal-agent`21per-pair P&L, sessions, hold durationsPattern Agent`/api/pattern-agent`14alpha/leak pairs, session edge, execution gapMaster Agent`/api/ai-chat`—reads all 57, injects into every response

### memoryIndex (strategy-based, built once via useMemo)

Keys: `BB_7_confirmed`, `BB_5`, `BB_strategy_overall`Lookup cascade: gap_pl → gap_only → general

### Key Findings in ai_memory

- BB gap 7 + PL confirmed: 91% win rate (n=27)
- BB gap 7 no PL: 0% win rate (n=53) — dead zone
- Asian session: +1582 pips. London: -272 pips
- 4–12h holds: +2614 pips. Under 1h: -238 pips
- Execution gap: 22.9 points

---

## 6. NEWS ALERT SYSTEM

### Telegram Alert ([app.py](http://app.py))

- Runs every 5-min engine cycle via `check_news_alerts()`
- Source: `https://nfs.faireconomy.media/ff_calendar_thisweek.json`
- Filters: impact === 'High', event 10–60 min away, currency in CURRENCY_TO_PAIRS
- Deduplication: NEWS_ALERTED set (per session, resets on engine restart)
- ET → UTC conversion: +4 hours (DST default)

### Dashboard (dashboard.js)

- `/api/upcoming-news` — fetches HIGH impact events in next 60 min + affected pairs
- Refreshes every 5 minutes
- Header banner appears when events found
- PairCard shows `📰 HIGH IMPACT NEWS` badge if pair is affected
- `newsAlert={upcomingNews.affected_pairs?.includes(row.symbol)}` prop

### Currency → Pairs Mapping (both [app.py](http://app.py) + upcoming-news.js)

USD, EUR, GBP, JPY, AUD, CAD, NZD — each maps to 6 relevant pairs from the 21

---

## 7. PDR SYSTEM

### pdr.js flow

1. Check pdr_cache — if 20+ symbols with age &lt; 15min → return cached
2. Fetch Twelve Data D1 OHLC (batches of 8, **10s delay between batches**)
3. Compute: pdr_strength = body/ATR (strong ≥0.5), retracement = (range-body)/range (clean ≤0.25)
4. Upsert per-symbol rows to pdr_cache
5. Return results

### Integration

- signal_tracker `openNewTrackers()` reads pdr_cache at open time
- Stores pdr_strength_at_open, pdr_strong_at_open
- signal_results has pdr columns (nullable — for future PDR strategy)
- PdrBadge shown on PANELS + TABLE

---

## 8. CODE STYLE & CONVENTIONS

```javascript
const mono = "'Share Tech Mono',monospace";
const orb  = "'Orbitron',sans-serif";
const raj  = "'Rajdhani',sans-serif";
```

### Colors

UsageHexBUY / bullish`#00ff9f`SELL / bearish`#ff4d6d`UI accent`#00b4ff`Warning`#ffd166`News alert`#ffd166` (amber)AI / brain`#7C3AED` (purple)PROVEN_EDGE`#10B981`DEAD_ZONE`#EF4444`

---

## 9. STRATEGY DEFINITIONS (LOCKED)

### BB Strategy

- Entry: gap ≥ 5, any time, no PL required
- Concurrent: no new entry if same pair has open BB trade
- Exit: gap drops &gt; 2 from peak

### INTRA Strategy

- Entry: gap ≥ 9 + PL confirmed (ABOVE=BUY, BELOW=SELL)
- Window: 2–4AM UAE (22:00–23:59 UTC)
- Exit: 10AM UAE hard close (06:00 UTC)

### Gap Score

- Gap = BASE currency score − QUOTE currency score across D1/H4/H1
- Range: ±18. TBG/PL is only price-based confirmation.

---

## 10. TOOLING GOTCHAS

 1. **Python**: Always `py -3.11` — NOT `python`
 2. **Git commits**: Use `.bat` files
 3. **check_dupes.py**: Run BEFORE every push
 4. **dashboard.js**: Use `edit_block` with exact `old_string`; chunks of 25-30 lines for appends
 5. **Restore**: `git show HEAD:pages/dashboard.js > pages\dashboard.js`
 6. **Engine start**: `START_PANDA.bat` (watchdog) — NOT Desktop Commander
 7. **Supabase import**: All API routes use `supabase` as global (no import needed — pattern established across all routes)
 8. **pdr_cache batch delay**: 10s between batches (Twelve Data free tier = 8 req/min)
 9. **Session labels**: ASIAN / LONDON / NEW_YORK — consistent across all tables
10. **ai_memory keying**: Strategy-based (BB/INTRA), NOT symbol/pair-based
11. **PREV_GAP**: Updated AFTER signal checks, BEFORE dashboard_payload.append
12. **gap_deltas**: Computed BEFORE PREV_GAP update in main loop

---

## 11. OPERATION PLAYBOOKS

### PLAYBOOK A: Fix a Bug

1. Read SKILL_UPDATED.md + AI_BUILD_PLAN_UPDATED.md if AI-related
2. `read_file` with exact `offset` and `length`
3. `edit_block` surgical edit
4. `py -3.11 check_dupes.py` → `npx next build`
5. Write `.bat` → push
6. Update [CHANGELOG.md](http://CHANGELOG.md)

### PLAYBOOK B: Restart Engine
```
Double-click: C:\Users\Admin\Desktop\START_PANDA.bat
```
Engine auto-restarts on crash. Required after any app.py changes.

### PLAYBOOK C: Re-run AI Agents
```javascript
fetch('/api/signal-agent', {method:'POST'}).then(r=>r.json()).then(console.log)
fetch('/api/journal-agent', {method:'POST'}).then(r=>r.json()).then(console.log)
fetch('/api/pattern-agent', {method:'POST'}).then(r=>r.json()).then(console.log)
```
Re-run when signal_results grows 50+ resolved records.

### PLAYBOOK D: Add Brain Memory (Admin)
Say in Panda AI chat: "Remember that [preference/rule/pattern]"
Or POST to `/api/admin-brain` with { category, key, value }

---

## 12. QUICK REFERENCE

**Signal validity**: `!hard_invalid && !isNeutralMatchup(row) && bias in (BUY,SELL) && |gap|>=5`
**PL Zones**: ABOVE=BUY valid, BELOW=SELL valid, BETWEEN=always invalid
**21 Pairs**: AUDJPY, AUDCAD, AUDNZD, AUDUSD, CADJPY, EURAUD, EURCAD, EURGBP, EURJPY, EURNZD, EURUSD, GBPAUD, GBPCAD, GBPJPY, GBPNZD, GBPUSD, NZDCAD, NZDJPY, NZDUSD, USDCAD, USDJPY
**12 Tabs**: PANELS, SIGNALS, TABLE, GAP CHART, RESEARCH, CALCULATOR, SETUPS, VALID PAIRS, CHART, ANALYTICS, LOGS, PANDA AI
**Sessions**: ASIAN 22:00-05:59 UTC · LONDON 06:00-13:59 UTC · NEW_YORK 14:00-21:59 UTC
**Free tier tabs**: signals, gap_chart, calendar, calculator
