---
name: panda-engine
description: >
  Complete project context for the Panda Engine forex intelligence platform.
  Use this skill for ANY task involving Panda Engine, the trading dashboard,
  app.py engine, cTrader journal, Supabase backend, or Vercel deployment.
  Trigger on dashboard.js edits, new tabs, component fixes, API routes,
  Supabase queries, engine scoring, TBG indicator, momentum states, gap
  analysis, deployment, git push, or any mention of "panda", "dashboard",
  "engine", "pairs", "gap score", "momentum", "TBG", "cTrader", "trade
  journal", "spike", "strength", "signals". ALWAYS read this skill before
  touching any Panda Engine file.
---

# Panda Engine — Project Skill

> **Purpose**: Eliminate redundant file scanning. Jump straight to the correct
> line and edit.
>
> **Last audited**: 2026-07-17 (Mac session — after Windows indicator session:
> MT4/MT5 feed-EA architecture + device-token parser fix; HEAD `31e0d76`)

---

## 0. TOKEN-SAVING WORKFLOW (READ FIRST)

1. **NEVER read big files end-to-end.** dashboard.js is ~4,211 lines.
2. Run `python3.11 map_code.py` (Mac) / `py -3.11 map_code.py` (Windows) from repo
   root — prints a fresh component→line index in one cheap call.
   Other files: `python3.11 map_code.py pages/pricing.js pages/api/ai-chat.js`
3. Read ONLY the exact line range you need, then edit surgically.
4. Line numbers drift after edits; map_code.py output is always current.
5. Auto-pull: both machines pull origin/main every 5 min when online
   (Mac cron + Windows Task Scheduler — see SETUP_AUTOPULL.md).
6. Session start: read `CLAUDE.md` (auto-loaded in Cowork) + latest entry of
   `CODEX_HANDOFF.md`. Session end: update `CHANGELOG.md`.

---

## 1. FILE MAP

### Engine (Python/FastAPI — Windows PC only, via START_PANDA.bat)
| File | Path | Purpose |
|------|------|---------|
| app.py | `C:\Users\Admin\Documents\Claude\Projects\Panda Engine\app.py` | Core engine: MT4 parser, scoring, momentum, Supabase push, Telegram, scheduler. Hermes feed call REMOVED Jul 2026. |
| check_dupes.py | repo root (cross-platform) | **RUN BEFORE EVERY PUSH** |

### Dashboard (Next.js 14 — Vercel; edit from Mac or Windows)
| File | Purpose |
|------|---------|
| `pages/dashboard.js` (~4,211 lines) | Main dashboard — 14 tabs, ~90 components, all inline styles |
| `pages/index.js` | Landing page; shows indicator products incl. 3 public Licensed overlay downloads |
| `pages/pricing.js`, `pages/get-started.js` | Ziina pricing, signup funnel |
| `pages/journal.js`, `pages/portfolio.js`, `pages/strength.js`, `pages/stream.js`, `pages/legal.js`, `pages/pending.js`, `pages/admin/` | Other pages |
| `lib/supabase.js` | Env-based: SUPABASE_SERVICE_KEY \|\| SUPABASE_ANON_KEY |
| `lib/auth.js` | requireAdmin + auth helpers |
| `lib/indicatorProducts.mjs` | Product catalog: scoring_v3, panda_full_v3 (panda-vip.ex4), 3 overlay products |
| `lib/indicatorDeviceAccess.mjs` | Device licensing modes OFF/SHADOW/ENFORCED per product |
| `lib/accountGuardian.mjs`, `lib/tradeExecutor.mjs` | **PRESERVED risk gates** — Guardian product UI was deleted, these libs are still imported by execution tools. Do not delete. |
| `map_code.py` | Component→line index generator |

### REMOVED Jul 2026 — DO NOT RESTORE
- Hermes: runtime integration, DB helpers + `hermes_learnings` table, all HERMES_*.md docs.
  (Separate `hermes-mission-control` Vercel project still exists; deleting it is an
  external destructive action needing Boss-G's specific confirmation.)
- Guardian: `pages/guardian.js`, `pages/account-guardian.js`, guardian APIs, autonomous
  agent/launcher, `guardian-watchdog.bat`, Guardian-only tables.
  `WATCH_PANDA.bat` is still the valid engine watcher.

### Key References
- Repo: `github.com/gian101310/panda-dashboar` (no trailing 'd'), branch `main` only
- Live: `pandaengine.app` (Vercel auto-deploys main)
- Supabase project: `jxkelchxitwuilpbrwxk`
- Mac repo: `~/panda-dashboar` · Windows: `C:\Users\Admin\Documents\Claude\Projects\Panda Engine`

---

## 2. DASHBOARD.JS COMPONENT INDEX

> Line numbers drift — regenerate anytime with `python3.11 map_code.py`.
> 14 tabs: OVERVIEW, PANELS, SIGNALS, TABLE, GAP CHART, RESEARCH, CALCULATOR,
> SETUPS, VALID PAIRS, CHART, ANALYTICS, SHADOW, LOGS, PANDA AI.
> Structure anchors: `ALL_PAIRS` (top), `const TABS` (~line 3290), `Dashboard()`
> main component (last ~650 lines). Mobile breakpoint 768px.

Key components (find exact lines via map_code.py): PairCard, PairCardModal,
MomentumHeatmap, GapChart, OverviewTab suite (Ov*), ValidSetupsTab, ValidPairsTab,
SpikeLogTab, ShadowTab, SignalLogTab, PandaAIChat, TrackerPanel, SignalAnalytics,
computeVerdict, computePhase, computeConfidence, advScore.

---

## 3. APP.PY ENGINE (Windows only)

| Function | Purpose |
|----------|---------|
| parse_tf_score / parse_mt4_file | mt4_SYMBOL.txt → D1/H4/H1/ADV/ATR/BOX |
| parse_tbg_file | tbg_SYMBOL.txt → ST/FL/BIAS/ZONE/G1 |
| compute_box_trends | UPTREND/DOWNTREND/RANGING |
| **extract_panda_score / compute_scores_all_pairs** | **CORE SCORING — LOCKED FOREVER** |
| classify_momentum / classify_structural_state | momentum engine |
| run_gap_once_v3 | main 5-min loop → Supabase upsert |
| master_scheduler | 5-min gap / 60-min snapshot |

Engine env (Windows, private): must use `SUPABASE_SERVICE_KEY` (anon key can no
longer write protected engine tables after Jul 2026 hardening) + `ENGINE_SECRET`.

---

## 4. SUPABASE — KEY TABLES (verified 2026-07-16)

| Table | State | Notes |
|-------|-------|-------|
| dashboard | 21 rows | live pairs, upserted every 5 min |
| signal_tracker | 11,647 (10 open) | BB + INTRA live tracking; price capture still 0 |
| signal_results | 4,707 | BB 4,562 decisive WR 44.2% · INTRA 145 decisive WR 48.7% |
| ai_memory | 144 | Signal Agent v2 producing memory |
| admin_brain | 18 | old 91%/0% edge claims STALE — never quote as current |
| panda_users | — | roles: user/vip/admin, feature_access TEXT[] |
| indicator_device_enforcement | 3 rows | per-product mode: OFF/SHADOW/ENFORCED — **all OFF** |
| pdr_cache | 21 | PDR per pair |
| manual_trades / trade_journal | empty | **NEVER use** |
| hermes_learnings | **DELETED** | do not recreate |

Security posture: backend-only tables have RLS enabled with no policies
(deny-all for anon/authenticated; service role bypasses). This is intentional —
Supabase advisor INFO "RLS Enabled No Policy" on these tables is expected.

---

## 5. INDICATOR / OVERLAY DISTRIBUTION (updated 2026-07-17)

Sources under `panda-indicators/2026-07-14/`.

### Architecture (CRITICAL — changed 2026-07-17)
- **MetaTrader forbids `WebRequest()` inside custom indicators** (error
  4014/4060). MT4/MT5 overlay indicators therefore display ONLY from the
  shared common-files snapshot cache (`MQL_PROGRAM_TYPE` guard in Core).
- Fetching is done by **feed EAs**: `PandaDashboardFeed{MT4,MT5}-{Personal,
  Licensed}` — same Core, same credentials, attach to ONE chart per terminal,
  refresh cache every 60s, place no orders. Overlay shows `ATTACH FEED EA`
  when the cache is absent.
- cTrader is unaffected: single `.algo`, indicator fetches directly.
- Object prefixes include program type (`.I.` / `.F.`); `PanelCorner` input
  on all MT4/MT5 entries (4 corners, default bottom left).

### Editions & auth
| Platform | Personal (private) | Licensed (public) |
|---|---|---|
| cTrader | Overlay .algo | Overlay .algo |
| MT4 | Overlay .ex4 + Feed EA .ex4 | zip: overlay + feed EA + INSTALL |
| MT5 | Overlay .ex5 + Feed EA .ex5 | zip: overlay + feed EA + INSTALL |

- Personal auth: `x-panda-operator-token` input parameter — never embedded.
- Licensed auth: `x-panda-account-number` read automatically; device ID/token
  persisted (cTrader LocalStorage device scope; MT4/MT5 FILE_COMMON).
- Device credential response is NESTED: extract `device_activation.token`
  (string-parsing bug fixed `31e0d76` on all three platforms — regression
  tests in `tests/metatraderOverlaySource.test.mjs` + cTrader model).
- Feed endpoints: `/api/ctrader-overlay`, `/api/mt4-overlay`, `/api/mt5-overlay`.
- Public downloads: cTrader .algo, MT4/MT5 Licensed zips (+ refreshed legacy
  raw .ex4/.ex5), `panda-vip.ex4`. Personal binaries are NEVER public.

### Release state & procedure
- Parser-fixed builds exist in private `dist/` (checksums verify) but the
  PUBLIC Licensed downloads were intentionally NOT replaced yet.
- Per-platform verify sequence before replacing a public download
  (`docs/CODEX_MAC_HANDOFF_2026-07-17.md`, supersedes the 07-16 handoff on
  MT4/MT5): OFF + install → LIVE; SHADOW → one `DEVICE_ACTIVATED`; full
  restart (reattach feed EA) → LIVE + `DEVICE_APPROVED` (NOT
  `DEVICE_REISSUED`); any failure → back to OFF.
- Enforcement rollout stays per-platform and staged: OFF → SHADOW → ENFORCED.
  Never OFF → ENFORCED directly.
- Windows note: MT5 feed EA must go on a chart WITHOUT
  `PandaEngine_EA_MT5_WRITEBACK`. Old Windows clone
  `C:\...\Documents\Claude\Projects\Panda Engine` is diverged — clean clone
  is `C:\Users\Admin\panda-dashboard`; divergence resolution is Boss-G's call.

---

## 6. CODE STYLE & CONVENTIONS

```js
const mono = "'Share Tech Mono',monospace";  // data, labels, badges
const orb  = "'Orbitron',sans-serif";        // headings, titles, scores
const raj  = "'Rajdhani',sans-serif";        // inputs, body text
```
Colors: BUY `#00ff9f` · SELL `#ff4d6d` · accent `#00b4ff` · warning `#ffd166` · cooling `#ffaa44` · AI `#7C3AED`

- All styles inline, single-file dashboard.js, ternary chain tab rendering
- Additive surgical changes ONLY — never modify existing logic

### Scoring logic (LOCKED — NEVER MODIFY)
- GAP = BASE score − QUOTE score across D1/H4/H1 (range ±18) — currency strength differential, NOT price
- BIAS: BUY ≥ 5 · SELL ≤ −5 · else WAIT. EXECUTION: MARKET |gap| ≥ 9, PULLBACK ≥ 5
- TBG zones: ABOVE=BUY valid · BELOW=SELL valid · BETWEEN=always invalid

### Strategies (LOCKED)
- **BB**: gap ≥ 5, any time/day, TBG NOT required. Exit: gap drops >2 from peak.
- **INTRA**: gap ≥ 9 + TBG confirmed, 2AM–4AM UAE only. Hard close 10AM UAE.

---

## 7. TOOLING GOTCHAS

1. Mac: `python3.11` · Windows: `py -3.11`
2. `python3.11 check_dupes.py` + full JS tests (`node --test tests/*.test.mjs`,
   currently 197/197) + `npx next build` MUST pass before every push
3. lib/supabase.js needs env key — build fails "supabaseKey is required" without
   .env.local (Mac) / Vercel env (prod)
4. Windows git commits: use `.bat` files (cmd breaks on special chars)
5. Restore corrupted dashboard.js: `git show HEAD:pages/dashboard.js > pages/dashboard.js`
6. Engine restarts: Boss-G manually restarts via START_PANDA.bat
7. EA results: `pages/api/ea-result.js` uses atomic ticket upsert (onConflict:
   'ticket') — keep it atomic; never revert to select-then-insert
8. Remote force-pushes have happened historically: back up local branch before hard reset
9. GitHub auth on Mac: gh CLI, logged in as gian101310
10. `python3` (3.10) works for check_dupes in sandboxes if 3.11 is unavailable

---

## 8. OPERATION PLAYBOOKS

### A. Any dashboard edit
1. `python3.11 map_code.py` → find component line range
2. Read that range only → surgical edit
3. `python3.11 check_dupes.py` → JS tests → `npx next build` → commit → push
4. Verify Vercel READY, build >20s. Update CHANGELOG.md.

### B. New tab
Define component before `const TABS` → add to TABS + TAB_FEATURE → add ternary
render case in Dashboard() → checks → push

### C. New API route
`pages/api/name.js` → import supabase from `../../lib/supabase` → default async
handler → build → push. (Exception: `ea-*` routes use service key directly.)

### D. Engine change (Windows only, DANGER)
Never touch core scoring. Surgical edit → Boss-G restarts via START_PANDA.bat.

### E. New Supabase table
`apply_migration` on `jxkelchxitwuilpbrwxk` → RLS + policies (or deny-all for
backend-only) → API route → update Section 4.

### F. Indicator release (Windows)
Follow `docs/CLAUDE_WINDOWS_INDICATOR_HANDOFF_2026-07-16.md` end to end:
build six editions → smoke test → replace 3 public Licensed files → regenerate
SHA256SUMS → verify hashes → staged SHADOW → ENFORCED per platform.

---

## 9. CURRENT PRIORITIES (2026-07-17)

1. Windows: install parser-fixed Licensed `dist/` artifacts, run the 4-step
   verify sequence per platform, replace that platform's public download,
   then staged OFF → SHADOW → ENFORCED rollout.
2. MT5: attach feed EA (chart without the writeback EA); resolve the diverged
   old Windows clone (Boss-G's call).
3. Per-user AI analysis for Pro/Elite.
4. Signal-tracker price capture from cTrader (price-confirmed rows still 0).
5. Decision pending: delete inactive `hermes-mission-control` Vercel project
   (needs Boss-G's specific final confirmation).

---

## 10. KEEPING THIS SKILL UPDATED

This file (`docs/SKILL_PANDA_ENGINE.md`) is the skill source of truth in the repo.
After significant changes: update this file, commit it, and re-upload it in
Claude Settings > Capabilities on BOTH the Mac and any other Claude install so
remote and home sessions load identical context. Log every session in CHANGELOG.md.
