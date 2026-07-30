---
name: panda-engine
description: Complete project context for the Panda Engine forex intelligence platform. Use this skill for ANY task involving Panda Engine, the trading dashboard, app.py engine, cTrader journal, Supabase backend, or Vercel deployment. Trigger on dashboard.js edits, new tabs, component fixes, API routes, Supabase queries, engine scoring, TBG indicator, momentum states, gap analysis, deployment, git push, or any mention of "panda", "dashboard", "engine", "pairs", "gap score", "momentum", "TBG", "cTrader", "trade journal", "spike", "strength", "signals". ALWAYS read this skill before touching any Panda Engine file.
---

# Panda Engine — Project Skill

> **Purpose**: Eliminate redundant file scanning. Jump straight to the correct
> line and edit.
>
> **Last audited**: 2026-07-08 (Mac session — dashboard verified live, engine data verified via Supabase)

---

## 0. TOKEN-SAVING WORKFLOW (READ FIRST)

1. **NEVER read big files end-to-end.** dashboard.js is 4,199 lines.
2. Run `python3.11 map_code.py` (Mac) / `py -3.11 map_code.py` (Windows) from repo
   root — prints a fresh component→line index in one cheap call.
   Other files: `python3.11 map_code.py pages/pricing.js pages/api/ai-chat.js`
3. Read ONLY the exact line range you need, then edit surgically.
4. Line numbers in this file were exact on 2026-07-08 — they drift after edits;
   map_code.py output is always current.
5. Auto-pull: both machines pull origin/main every 5 min when online
   (Mac cron + Windows Task Scheduler — see SETUP_AUTOPULL.md).

---

## 1. FILE MAP

### Engine (Python/FastAPI — Windows PC only, via START_PANda.bat)
| File | Path | Purpose |
|------|------|---------|
| app.py | `C:\Users\Admin\Desktop\ctrader_trend_scanner\app.py` (~1940 lines) | Core engine: MT4 parser, scoring, momentum, Supabase push, Telegram, scheduler |
| check_dupes.py | repo root (cross-platform since Jul 2026) | **RUN BEFORE EVERY PUSH** |

### Dashboard (Next.js 14.2.35 — Vercel; edit from Mac or Windows)
| File | Purpose |
|------|---------|
| `pages/dashboard.js` (4,199 lines) | Main dashboard — 14 tabs, ~90 components, all inline styles |
| `pages/index.js` | Landing page (Dark Matter design) |
| `pages/pricing.js`, `pages/get-started.js` | Pricing (Ziina links, Pro $49/Elite $99, 7-day trial), signup funnel |
| `pages/journal.js`, `pages/portfolio.js`, `pages/strength.js`, `pages/stream.js`, `pages/legal.js`, `pages/pending.js`, `pages/admin/` | Other pages |
| `lib/supabase.js` | **Env-based since Jun 2026**: SUPABASE_SERVICE_KEY \|\| SUPABASE_ANON_KEY (Vercel has service key; Mac .env.local has anon key) |
| `lib/auth.js` | requireAdmin + auth helpers |
| `lib/openai.js` | OPENAI_API_KEY via env |
| `lib/indicatorReader.mjs`, `lib/trendbarsFetcher.mjs` | cTrader MCP bridge (127.0.0.1:9876) |
| `map_code.py` | Component→line index generator (Section 0) |

### Key References
- Repo: `github.com/gian101310/panda-dashboar` (no trailing 'd') — **remote gets force-pushed sometimes; fetch + check divergence before work**
- Live: `pandaengine.app` (Vercel auto-deploys main)
- Supabase project: `jxkelchxitwuilpbrwxk`
- Mac repo path: `~/panda-dashboar` · Windows: `C:\Users\Admin\panda-dashboard`

---

## 2. DASHBOARD.JS COMPONENT INDEX (exact @ 2026-07-08)

> Regenerate anytime: `python3.11 map_code.py`

### Utilities & helpers
| Line | Name | Purpose |
|------|------|---------|
| 11 | ALL_PAIRS | 21-pair array |
| 14 | MOMENTUM_GUIDE | momentum state → icon/action/color |
| 28 | stateColor · 40 biasFromGap · 45 isValid · 46 isNeutralMatchup | core utils |
| 56 | isMarketOpen · 65 getMaturity · 70 getMomentumAction | session/maturity utils |
| 86 | getEdgeMemory | admin_brain edge lookup |
| 165 | isPullbackZoneNow · 185 computeVerdict | live pullback-zone + verdict logic |
| 238 | computePhase · 283 PhaseBadge · 307 PHASE_LEGEND · 319 PhaseLegend | phase engine |
| 360 | boxTrend · 371 boxConfirm · 385 plZoneBadge · 397 atrFill | box/TBG/ATR helpers |
| 414 | advScore · 474 scoreLabel · 480 getMatchup | ADV + strength matchup |
| 513 | computeConfidence | multi-factor 0–100 confidence (frontend only) |
| 560 | confStyle · 568 signalLabel · 573 strColor · 578–607 format/time helpers | display |
| 608 | playBeep | sound alerts |

### Badges & atoms
| Line | Name |
|------|------|
| 110 PdrBadge · 124 LivePdrBadge · 139 PdrVerdict | PDR badges |
| 220 VerdictBanner · 634 TrendArrow · 641 Sparkline · 650 DeltaChip | visuals |
| 1162 CotRow · 1176 StatCard · 1224 ScoreTfBadge | atoms |
| 1187 CTRADER_BASE · 1188 PLATFORMS · 1193 PlatformButtons | platform links |

### Major components
| Line | Name | Purpose |
|------|------|---------|
| 662 | SpikeBanner | spike alert banner |
| 708 | MomentumHeatmap | heatmap grid |
| 820 | AlertSettingsModal | per-user alerts |
| 945 | GapChart | canvas gap chart |
| 1025 | EconomicCalendar · 1077 PositionCalculator · 1131 EngineHealth | tools |
| 1258 | PairCard | main pair card |
| 1327 | PairCardModal | expanded modal (to 1582) |
| 1583 | ValidSetupsTab · 1719 ValidPairsTab | filtered setups/pairs |
| 1875 | OpenTradesPanel | admin open trades |
| 2016 | SpikeLogTab · 2104 buildTVDoc · 2118 ChartTab | logs + TV chart |
| 2179 | ShadowTab | SHADOW tab (added Jun 2026) |
| 2276 | SignalLogTab · 2378 ResearchTab | logs + research |
| 2401 | PandaAIChat | PANDA AI tab (to 2631) |
| 2632 | TrackerPanel | signal tracker panel |
| 3308 | SignalAnalytics · 3459 SignalFlashcard | analytics V2 |

### OVERVIEW tab suite (added Jun 2026)
2737 OV_COLORS · 2752 AnimNum · 2761 MiniSpark · 2769 OvMarketGauge ·
2785 OvSessionTimeline · 2812 OvExposureRings · 2827 OvCurrencyChart ·
2846 OvSignalCard · 2903 OvStatCard · 2912 OvMomentumBar · 2930 OvAIPanel ·
2955 ovNewsCountdown · 2965 OvNewsBanner · 3007 OvNewsPanel ·
3033 OvTrackerSummary · **3065 OverviewTab** (to 3276)

### Structure
| Line | Name |
|------|------|
| 3277 | TABS — 14 tabs: OVERVIEW, PANELS, SIGNALS, TABLE, GAP CHART, RESEARCH, CALCULATOR, SETUPS, VALID PAIRS, CHART, ANALYTICS, SHADOW, LOGS, PANDA AI |
| 3279 | TAB_FEATURE (tab → feature_access key) |
| 3297 | FILTERS · 3298 SORTS |
| 3563 | ALL_TABS_SET · **3565 Dashboard()** main component (to 4199) |

Mobile: `isMobile` state + resize listener, breakpoint 768px.

---

## 3. APP.PY ENGINE INDEX (NOT verified since 2026-05-09 — engine lives on Windows)

| ~Line | Function | Purpose |
|------|-----------|---------|
| 49–72 | Config block | MT4_PATH, Telegram, Supabase, PAIRS |
| 109–226 | parse_tf_score, parse_mt4_file | mt4_SYMBOL.txt → D1/H4/H1/ADV/ATR/BOX |
| 229–272 | parse_tbg_file | tbg_SYMBOL.txt → ST/FL/BIAS/ZONE/G1 |
| 274–324 | compute_box_trends | UPTREND/DOWNTREND/RANGING |
| ~327–439 | extract_panda_score, compute_scores_all_pairs | **CORE SCORING — LOCKED FOREVER, identify by function name** |
| 454–495 | classify_momentum, should_close_alert, classify_structural_state | momentum engine |
| 497–755 | run_gap_once_v3 | main 5-min loop → Supabase upsert |
| 942–978 | master_scheduler | 5-min gap / 60-min snapshot |
| + | derive_score_tf() | base/quote score source TF (added Jun 2026) |

Run `py -3.11 map_code.py app.py` equivalent on Windows (or grep by function name) before touching anything.

---

## 4. SUPABASE — KEY TABLES (verified 2026-07-08)

| Table | Rows Jul 8 | Notes |
|-------|-----------|-------|
| dashboard | 21 | live pairs, upserted every 5 min |
| signal_tracker | 11,249 (0 open) | BB + INTRA live tracking |
| signal_results | 4,434 | BB 4,299 / INTRA 135 · decisive WR: BB 44.2%, INTRA 50.5% |
| ai_memory | 111 | agent findings |
| admin_brain | 18 | coaching rules / edges |
| panda_users | 8 | roles: user/vip/admin, feature_access TEXT[] |
| gap_history | ~25k | **trimmed/purged mid-2026** (was 194k) |
| signal_snapshots | **0** | **purged mid-2026** (was 121k); schema has base_score_tf/quote_score_tf — verify writes before relying |
| pdr_cache | 21 | PDR per pair |
| manual_trades / trade_journal | 0 | **NEVER use** |

Other tables (strength_log, spike_events, engine_logs, panda_sessions, pf_* security tables, etc.) exist — query live counts when needed; May 9 numbers are stale.

---

## 5. NEXT.JS API ROUTES (as of 2026-07-08)

Core: data · gap-chart · heatmap · spikes · calendar · cot · currency-strength · strength-history · engine-health · pdr · signal-log · signal-analytics · signal-tracker · open-trades
Auth/user: login · logout · me · pf-me · pf-signup · pf-log-event · alert-prefs · strategies · notify-telegram · telegram-webhook
AI agents: ai-chat (3 modes) · signal-agent · journal-agent · pattern-agent · run-all-agents · ai-memory · admin-brain
Business: pricing · waitlist · public-signals · indicator-license · indicator-license-request
EA/system: ea-data · ea-result · heartbeat · maintenance · admin-maintenance-access · shadow-log · page-visibility · upcoming-news
Journal: journal · journal-upload
Admin: admin/index · admin/license · admin/pf-approvals · admin/pricing

Rule: import supabase from `../../lib/supabase`.

---

## 6. CODE STYLE & CONVENTIONS

```js
const mono = "'Share Tech Mono',monospace";  // data, labels, badges
const orb  = "'Orbitron',sans-serif";        // headings, titles, scores
const raj  = "'Rajdhani',sans-serif";        // inputs, body text
```
Colors: BUY `#00ff9f` · SELL `#ff4d6d` · accent `#00b4ff` · warning `#ffd166` · cooling `#ffaa44` · AI `#7C3AED`

- All styles inline, single-file dashboard.js, ternary chain tab rendering
- Hooks destructured: `import { useState, useEffect, useCallback, useRef } from 'react'`
- Additive surgical changes ONLY — never modify existing logic

### Scoring logic (LOCKED — NEVER MODIFY)
- GAP = BASE score − QUOTE score across D1/H4/H1 (range ±18) — currency strength differential, NOT price
- BIAS: BUY ≥ 5 · SELL ≤ −5 · else WAIT. EXECUTION: MARKET |gap| ≥ 9, PULLBACK ≥ 5
- TBG zones: ABOVE=BUY valid · BELOW=SELL valid · BETWEEN=always invalid

---

## 7. TOOLING GOTCHAS

1. Mac: `python3.11` · Windows: `py -3.11`
2. `python3.11 check_dupes.py` + `npx next build` MUST pass before every push
3. lib/supabase.js needs env key — build fails "supabaseKey is required" without .env.local (Mac) / Vercel env (prod)
4. Windows git commits: use `.bat` files (cmd breaks on special chars)
5. Restore corrupted dashboard.js: `git show HEAD:pages/dashboard.js > pages/dashboard.js`
6. Engine restarts: Boss-G manually restarts uvicorn on Windows
7. manual_trades: DO NOT query — empty, unused
8. Remote force-pushes happen: back up local branch before hard reset
9. GitHub auth on Mac: gh CLI, logged in as gian101310

---

## 8. OPERATION PLAYBOOKS

### A. Any dashboard edit
1. `python3.11 map_code.py` → find component line range
2. Read that range only → surgical edit
3. `python3.11 check_dupes.py` → `npx next build` → commit → push (Vercel deploys)
4. Update CHANGELOG.md

### B. New tab
Define component before `const TABS` (line ~3277) → add to TABS + TAB_FEATURE → add ternary render case in Dashboard() → checks → push

### C. New API route
`pages/api/name.js` → import supabase from `../../lib/supabase` → default async handler → build → push

### D. Engine change (Windows only, DANGER)
Never touch core scoring (extract_panda_score / compute_scores_all_pairs). Surgical edit → Boss-G restarts uvicorn.

### E. New Supabase table
`apply_migration` on project jxkelchxitwuilpbrwxk → RLS + policies → API route → update Section 4

---

## 9. STRATEGY DEFINITIONS (LOCKED)

### BB
Entry: gap ≥ 5, any time/day, TBG NOT required. No new entry if pair has open BB trade. Exit: gap drops >2 pts from peak.

### INTRA
Entry: gap ≥ 9 + TBG confirmed, 2AM–4AM UAE only. Hard close 10AM UAE, no exceptions. Same concurrent-position rule.

### PDR
pdr_cache (21 rows) updated each cycle. pdr_strong=true → clean impulsive previous-day candle → confluence.

---

## 10. QUICK REFERENCE

- Signal validity: `!hard_invalid && bias in (BUY,SELL) && |gap|>=5 && TBG confirms`
- G1: Red=Strong Sell · Green=Strong Buy · Yellow=Anticipation · White=No Trade
- computeConfidence factors: gap (~25–30) + TBG (+20) + box (+20) + COT (+10) + momentum (+10)

**Admin Brain edges (from admin_brain — use directly):**
- BB gap 7 + Panda Lines = 91% WR (n=27) · BB gap 7 WITHOUT = 0% WR (n=53)
- Alpha pairs: NZDCAD, NZDUSD, AUDJPY, GBPAUD · Avoid: GBPJPY, GBPCAD, GBPUSD, EURUSD
- Best session: Asian 2AM–6AM UAE · optimal hold 6–10h · London bleeds pips
- Note: decisive win rates fell with larger sample (BB 59.9%→44.2%, INTRA 63.8%→50.5% by Jul 2026) — re-validate edges before quoting

---

## 11. PANDA AI / AGENTS — STATE (Jul 2026)

Live: ai-chat.js (insights/review/chat, GPT-4o-mini), PandaAIChat tab, signal-agent, journal-agent, pattern-agent, run-all-agents routes; ai_memory 111 rows; admin_brain 18.
Guardrails: NEVER reveal scoring formulas, thresholds, internals.
Pending: Phase 8 Signal Agent v2 (tracker data requirement now met — 11k+ records), per-user AI analysis (Pro/Elite), signal_tracker price capture via cTrader API.
Read AI_BUILD_PLAN_UPDATED.md before agent work.

---

## 12. KEEPING THIS SKILL UPDATED

After significant changes: rerun `map_code.py` and refresh Section 2; update Section 4 counts after data events; log every session in CHANGELOG.md. If this file changed, re-upload the skill in Claude Settings > Capabilities so installed copy matches.
