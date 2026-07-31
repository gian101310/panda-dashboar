# CLAUDE.md — Panda Engine Context File
> Cowork and Codex use this shared handoff. Keep it current and never store secrets here.

## SESSION UPDATE — 2026-07-31 (Windows Cowork) ← READ FIRST

- **Divergence RESOLVED.** The old "Panda Engine folder is diverged / push from
  `panda-dashboard`" guidance is OBSOLETE. `C:\Users\Admin\Documents\Claude\Projects\Panda Engine`
  is now the canonical, up-to-date repo on `origin/main` AND the machine running the engine.
  `C:\Users\Admin\panda-dashboard` is now the behind-until-pulled secondary. Full details and
  this session's changes: `docs/CLAUDE_WINDOWS_HANDOFF_2026-07-31.md`.
- **The engine runs HIDDEN** (the watchdog + autopull scheduled tasks are S4U, so no popup
  terminal). Restart it with `RESTART_ENGINE.bat` / `RESTART_ENGINE.ps1` — never a visible
  terminal, never `python app.py`. Any `app.py` change needs a restart via this tool to load.
- **Standing workflow rules (from now on):**
  1. At session start, `git fetch` then `git pull --ff-only origin main` in the engine folder
     FIRST, and check whether Boss-G made changes on the Mac side before doing anything else.
  2. After any engine (`app.py`) change, run `RESTART_ENGINE` so the hidden engine reloads.
  3. Never force-push; keep commits narrowly scoped; verify Vercel READY after UI pushes.
- Shipped this session: FLIP/BOS Telegram alerts, `signal_snapshots` allowlist fix (Signal Log
  populates again), market-closed auto-heal guard, hourly (4h→1h) news alerts + 15m/2m, Overview
  news banner 48h look-ahead, hidden-engine ops, and `Panda_Exporter_v2_BOS.mq4` (v2 price-context
  + BOS; now committed to the repo — do NOT ship the v1-based `Panda_Exporter_BOS.mq4`).
- Later same day: fixed ForexFactory ISO date parsing (banner + news alerts were silently dropping
  ALL events); Phase Guide moved to its own **PHASE GUIDE** tab (removed from Overview); Overview
  "AI Insight" box removed; Panda AI now surfaces exact gaps 9/10/11/12.
- **Telegram routing (current):** MAIN group (`TELEGRAM_*`) = hourly snapshot, AI snapshot, and
  **news alerts**. SPIKE bot (`SIGNAL_*`, "Panda Gap Spike alert") = spike / gap / early-entry /
  FLIP-BOS alerts + the **phase digest**. (Phase digest and news alerts were swapped 2026-07-31.)
  Full map in `docs/CLAUDE_WINDOWS_HANDOFF_2026-07-31.md`.

## OPERATOR

- Boss-G is the sole operator and final approver.
- Location: Dubai, UAE.
- Prefer direct, implementation-ready explanations.

## PRODUCT AND PRODUCTION

Panda Engine is a live forex intelligence SaaS tracking 21 currency pairs. It provides
BUY/SELL/WAIT bias confirmation and is explicitly not financial advice.

- Live: `pandaengine.app` / `www.pandaengine.app`
- GitHub: `gian101310/panda-dashboar` (`main`; no trailing `d`)
- Vercel: `panda-dashboard`, auto-deployed from `main`
- Supabase project: `jxkelchxitwuilpbrwxk`
- Windows engine: started only with `START_PANDA.bat`

## STACK AND KEY FILES

- Engine: FastAPI/Python in `app.py`; runs on the Windows PC, never from this Mac.
- Web app: Next.js 14.
- Database/auth: Supabase.
- Payments: Ziina payment links with admin-editable pricing.
- Main dashboard: `pages/dashboard.js` (4,211 lines on 2026-07-16).
- AI chat: `pages/api/ai-chat.js`.
- Signal tracker: `pages/api/signal-tracker.js`.
- Shared Supabase client: `lib/supabase.js`.

## NON-NEGOTIABLE RULES

1. Follow `AGENTS.md`; it is the authoritative safety document.
2. Never edit `extract_panda_score()` or `compute_scores_all_pairs()` in `app.py`.
3. Never change the locked BB/INTRA strategy definitions.
4. Never start `app.py` from a terminal; use `START_PANDA.bat` on Windows.
5. Never remove or change `vercel.json`'s `ignoreCommand` guardrail.
6. Never delete `package.json`, `package-lock.json`, `vercel.json`, or `next.config.js`.
7. API routes use the shared Supabase client; do not expose service keys in client code.
8. On Mac, use `python3.11`, not the Windows `py -3.11` launcher.
9. Session labels are canonical: `ASIAN`, `LONDON`, `NEW_YORK`.
10. Pull before editing, never force-push, and keep commits narrowly scoped.

## EFFICIENT FILE WORKFLOW

1. Run `python3.11 map_code.py` before navigating large files.
2. Read only the required ranges of `pages/dashboard.js` and other large files.
3. Before every push run `python3.11 check_dupes.py` and `npx next build`.
4. Push only to `origin main`; verify Vercel READY and a build duration over 20 seconds.

## CODE STYLE

```javascript
const mono = "'Share Tech Mono',monospace";
const orb  = "'Orbitron',sans-serif";
const raj  = "'Rajdhani',sans-serif";
```

Colors: BUY `#00ff9f` · SELL `#ff4d6d` · accent `#00b4ff` · warning `#ffd166` · AI `#7C3AED`.

## VERIFIED STATE — 2026-07-17 (after Windows indicator session + parser fix)

- HEAD `31e0d76 fix-overlay-device-activation-token-parsing`; production READY.
- MT4/MT5 ARCHITECTURE CHANGE: MetaTrader forbids WebRequest inside indicators, so the overlay indicator now displays only from the shared common-files cache and a new feed EA (`PandaDashboardFeed{MT4,MT5}-{Personal,Licensed}`, same Core, one chart per terminal, no trading) does the fetching. Overlay shows `ATTACH FEED EA` without it. cTrader unaffected (single .algo).
- MT4/MT5 Licensed public downloads are now ZIPs (overlay + feed EA + INSTALL txt); legacy raw .ex4/.ex5 refreshed; product copy updated.
- Device-activation token parser fixed on all three platforms (`device_activation.token` nested object); regression-tested; private `dist/` rebuilt (2 cTrader + 8 MT artifacts, zero warnings, checksums verify).
- PUBLIC Licensed downloads were intentionally NOT replaced with the parser-fixed builds — pending the per-platform Windows verify sequence in `docs/CODEX_MAC_HANDOFF_2026-07-17.md` (OFF install LIVE → SHADOW one `DEVICE_ACTIVATED` → restart shows `DEVICE_APPROVED` not `DEVICE_REISSUED` → then replace download).
- Windows machines: MT4 Personal overlay+feed LIVE verified (IC Markets Global); MT5 feed EA attach pending (must avoid the chart running PandaEngine_EA_MT5_WRITEBACK). Old clone `C:\...\Documents\Claude\Projects\Panda Engine` is DIVERGED (79 behind / 8 ahead, local app.py edits) — pushes now come from clean `C:\Users\Admin\panda-dashboard`; divergence resolution is Boss-G's call, do not force anything.
- Prior state (2026-07-16, still true):
- Hermes runtime, DB helpers/table, and handoff docs REMOVED (`f65952b`). Do not restore.
- Guardian/account-guardian pages, APIs, agent, launcher, watchdog, and Guardian-only tables REMOVED. Do not restore.
- `lib/accountGuardian.mjs` and `lib/tradeExecutor.mjs` intentionally PRESERVED — active execution risk gates import them.
- EA result ingestion is an atomic ticket upsert (`752aa0f`) via the shared server client.
- Supabase hardened: backend-only tables RLS-locked (advisor shows only INFO "no policy" = deny-all by design; zero ERROR/WARN).
- JS tests: 197/197 pass. `check_dupes.py` passes.
- Device licensing mode is `OFF` for all three platforms (`indicator_device_enforcement`: OFF/SHADOW/ENFORCED per product).
- No Personal artifacts or tokens are public.
- Edge revalidation (`e2ece07`), engine stall alerts (`3b395d9`), shadow mode (`cc18a97`), GitHub scheduler for safety jobs (`28f3ff2`) are shipped.
- `signal_results`: BB 4,562 (481 W / 608 L / 3,471 flat), decisive WR 44.2%; INTRA 145 (57 W / 60 L / 28 flat), decisive WR 48.7%.
- `signal_tracker`: 11,647 total, 11,637 closed; price-confirmed rows remain 0.
- `ai_memory`: 144 rows; Signal Agent v2 complete. Old 91%/0% `admin_brain` edge claims are stale — never present as current.
- Personal operator token recovery configured; old hash-only tokens require one intentional rotation before recovery.

## CURRENT PRIORITIES

1. WINDOWS: install the parser-fixed Licensed `dist/` artifacts and run the 4-step verify sequence per platform (`docs/CODEX_MAC_HANDOFF_2026-07-17.md`), then replace that platform's public Licensed download, then separate OFF → SHADOW → ENFORCED rollout. `docs/CLAUDE_WINDOWS_INDICATOR_HANDOFF_2026-07-16.md` still governs the overall release; the 07-17 doc supersedes it on MT4/MT5 architecture and the verify sequence.
1b. MT5: attach the feed EA on a chart WITHOUT the writeback EA. Decide how to resolve the diverged old Windows clone.
2. Add per-user AI analysis for Pro/Elite.
3. Capture signal-tracker prices from cTrader so price-based validation becomes possible.
4. Decide on deleting the inactive `hermes-mission-control` Vercel project (external destructive action — needs Boss-G's specific final confirmation).

## WORKING FROM MAC VS WINDOWS

- Mac: dashboard/API/docs edits, tests, builds, pushes. Cannot compile .algo/.ex4/.ex5 or run the engine.
- Windows: engine (`START_PANDA.bat` only), MetaEditor/cTrader Algo compilation, platform smoke tests, binary publication.
- Both machines auto-pull `origin main` every 5 min when online (`SETUP_AUTOPULL.md`). Always `git pull --ff-only origin main` before editing anyway.
- Handoffs: read `CODEX_HANDOFF.md` (latest first) at session start; write significant sessions to `CHANGELOG.md`.
- After updating the skill source in `docs/`, re-upload it in Claude Settings > Capabilities so both locations load the same context.

### Two-machine sync workflow (Mac <-> Windows) — ALWAYS FOLLOW

1. **Start of every session, either machine:** `git fetch` then `git pull --ff-only origin main`
   FIRST, and read the newest handoff (`docs/MAC_HANDOFF_*` or `docs/CLAUDE_WINDOWS_HANDOFF_*`,
   latest date first) before touching anything. Assume the other machine may have pushed since.
2. **After any change made ON THE MAC:** before ending the session, write a Mac->Windows handoff at
   `docs/MAC_HANDOFF_<YYYY-MM-DD>.md` (TL;DR / commits this session / feature changes / pending-next /
   locked-unchanged), commit it together with the changes, and push to `main`. Then Boss-G only has to
   tell Windows to pull.
3. **After any change made ON WINDOWS:** same rule in reverse — write/refresh
   `docs/CLAUDE_WINDOWS_HANDOFF_<YYYY-MM-DD>.md`, commit, push; Boss-G tells the Mac to pull.
4. Handoff docs are the source of truth for "what changed and why." Keep them latest-date-first and
   never delete old ones (they form the trail). Never force-push; keep commits narrowly scoped.

## REFERENCE FILES

- `AGENTS.md` — locked operating rules.
- `CODEX_HANDOFF.md` — latest cross-agent handoff (read first each session).
- `docs/CODEX_MAC_HANDOFF_2026-07-17.md` — MT4/MT5 feed-EA architecture + device-token verify sequence (read this before indicator work).
- `docs/CLAUDE_WINDOWS_INDICATOR_HANDOFF_2026-07-16.md` — overall Windows release procedure (superseded by the 07-17 doc where they conflict).
- `docs/SKILL_PANDA_ENGINE.md` — current skill source; re-upload to Claude Settings after edits.
- `docs/AI_BUILD_PLAN_UPDATED.md` — AI architecture and phase history.
- `docs/PENDING_OPTIMIZATIONS_v2.md` — roadmap.
- `CHANGELOG.md` — release history.
