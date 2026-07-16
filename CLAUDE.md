# CLAUDE.md — Panda Engine Context File
> Cowork and Codex use this shared handoff. Keep it current and never store secrets here.

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
- Main dashboard: `pages/dashboard.js` (4,213 lines on 2026-07-16).
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

## VERIFIED STATE — 2026-07-16

- `signal_results`: BB 4,562 (481 W / 608 L / 3,471 flat), decisive WR 44.2%.
- `signal_results`: INTRA 145 (57 W / 60 L / 28 flat), decisive WR 48.7%.
- BB gap 7 with Panda Lines: 87 W / 111 L, decisive WR 43.9% (n=198 decisive).
- BB gap 7 without Panda Lines: 38 W / 63 L, decisive WR 37.6% (n=101 decisive).
- `signal_tracker`: 11,647 total, 11,637 closed; price-confirmed rows remain 0.
- `ai_memory`: 144 rows; Signal Agent v2 is complete and producing memory.
- Old 91%/0% `admin_brain` edge claims are stale and must not be presented as current.
- cTrader/MT4/MT5 device enforcement is OFF. Replacement Windows binaries are not yet compiled and smoke-tested.
- Personal operator token recovery is configured; old hash-only tokens require one intentional rotation before recovery.
- Licensing admin already includes downloads, device policies, revocations, and approved-account history.

## CURRENT PRIORITIES

1. Automatically recompute and flag decayed statistical edges.
2. Alert the operator if the Windows engine heartbeat stalls for 15 minutes, plus recovery alerting.
3. Add report-only device licensing shadow mode while keeping enforcement OFF.
4. Compile and smoke-test replacement cTrader/MT4/MT5 Windows binaries before enforcement.
5. Add per-user AI analysis for Pro/Elite.
6. Capture signal-tracker prices from cTrader so price-based validation becomes possible.

## REFERENCE FILES

- `AGENTS.md` — locked operating rules.
- `SKILL.md` — project component map and playbooks (line numbers may be stale).
- `docs/AI_BUILD_PLAN_UPDATED.md` — AI architecture and phase history.
- `PENDING_OPTIMIZATIONS_v2.md` — roadmap.
- `CHANGELOG.md` — release history.
