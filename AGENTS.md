# PANDA ENGINE — CODEX HARD INSTRUCTIONS

> **LOCKED.** Do NOT modify, skip, or override any section below.
> These rules exist because past violations caused full production outages.
> Read this ENTIRE file before touching ANY code. No exceptions.

---

## 0. WHO YOU ARE & WHO ELSE WORKS HERE

You (Codex) and Claude (Cowork/Claude Code) both work on this project.
Boss-G is the sole operator. His word is final.

**Division of labor:**
- **Claude (Cowork)** — primary builder. Edits dashboard.js, app.py, API routes, Supabase schema, styling, new features. Deploys via git push from local machine.
- **Codex** — assists with targeted tasks Boss-G assigns in GitHub. Typically: bug fixes, small API routes, refactors, reviews.
- **Both** must follow the EXACT same rules below. No agent gets exceptions.

---

## 1. SINGLE REPO — ONE FOLDER, ONE REPO, ONE BRANCH

### Local folder
```
C:\Users\Admin\Documents\Claude\Projects\Panda Engine
```

### GitHub repo
```
https://github.com/gian101310/panda-dashboar.git   (branch: main)
```

### Vercel binding
```
panda-dashboar repo  →  panda-dashboard Vercel project  →  pandaengine.app
```

| Item | Value |
|------|-------|
| Local folder | `C:\Users\Admin\Documents\Claude\Projects\Panda Engine` |
| GitHub repo | `gian101310/panda-dashboar` |
| Branch | `main` |
| Vercel project | `panda-dashboard` |
| Domain | `pandaengine.app` / `www.pandaengine.app` |

### HARD RULES

- **`assistant-server` repo is DEAD.** Do not push to it, deploy from it, or reference it.
- **Only push to `panda-dashboar`** — it auto-deploys to Vercel on every push.
- **Only edit files in the local folder above.** Desktop copies (`ctrader_trend_scanner`, etc.) are old/archived.
- A `vercel.json` ignoreCommand guardrail MUST be in place that auto-cancels builds from wrong repos.
  > ⚠️ AUDIT FINDING (2026-06-14): The `ignoreCommand` is currently ABSENT from `vercel.json`. Restoration is pending Boss-G approval. Do NOT remove it once restored.

### WHY THIS RULE EXISTS

On 2026-05-28, a Codex deploy from `assistant-server` overwrote the `panda-dashboard` production build.
On 2026-06-03, having two repos caused login alerts to silently stop working (code was pushed to the wrong repo).
Both repos are now consolidated into `panda-dashboar` only.

---

## 2. CRITICAL FILES — NEVER DELETE

These files are load-bearing for Vercel builds. Deleting ANY of them = full site outage:

```
package.json        — NEVER DELETE
package-lock.json   — NEVER DELETE (also: do NOT add to .gitignore — it must be committed)
vercel.json         — NEVER DELETE (contains deploy guardrail)
next.config.js      — NEVER DELETE
```

> ⚠️ KNOWN ISSUE (2026-06-14 audit): `package-lock.json` is currently listed in `.gitignore`.
> This contradicts the NEVER DELETE rule and prevents `npm audit` from running.
> Fix: remove `package-lock.json` from `.gitignore` and commit it (pending Boss-G approval).

### WHY THIS RULE EXISTS

On 2026-05-25, a cleanup commit accidentally deleted all three config files.
Vercel "built" in 2 seconds (nothing to build), every URL returned 404.

### Pre-push checklist

Before ANY commit that involves file deletions:
1. Run `git status` and visually confirm these 4 files are NOT staged for deletion
2. Never use wildcards for bulk deletes (`git rm *.bat *.tmp`) — use explicit file lists
3. After push, verify Vercel build time >20 seconds (2-second build = broken)

---

## 3. LOCKED CODE — NEVER MODIFY

### app.py scoring engine (lines ~421–536)

```
extract_panda_score()
compute_scores_all_pairs()
```

These functions are **LOCKED FOREVER**. Do not edit, refactor, optimize, rename, or "improve" them.
They are the core gap-scoring algorithm. Any change breaks all 21 pairs.

### Strategy definitions

- **BB Strategy**: gap ≥5, any time, any day. TBG NOT required. Exit: gap drops >2 from peak.
- **INTRA Strategy**: gap ≥9 + TBG confirmed. Window: 2AM–4AM UAE only. Exit: 10AM hard close.

Do NOT change entry/exit logic, thresholds, or TBG requirements.

### vercel.json ignoreCommand

The `ignoreCommand` field in `vercel.json` is a deploy guardrail. **NEVER remove or modify it.**

---

## 4. WORKFLOW — MANDATORY ORDER

Every code change follows this sequence. No shortcuts.

```
1. READ the source files before editing (use offset/length for large files)
2. EDIT carefully — never rewrite dashboard.js wholesale (it's ~3300+ lines)
3. RUN check_dupes.py       →  py -3.11 check_dupes.py
4. RUN next build            →  npx next build
5. COMMIT with descriptive message (kebab-case, e.g., "fix-gap-chart-null-check")
6. PUSH to correct repo      →  git push origin main
7. VERIFY Vercel build succeeds (>20 seconds, state: READY)
```

### Commit rules

- One feature per commit. No mega-commits.
- Message format: `kebab-case-description` (e.g., `fix-signal-tracker-null-bias`)
- Never combine cleanup with feature work in the same commit
- Update CHANGELOG.md for significant changes

---

## 5. TECHNICAL GOTCHAS

### None vs empty string

```python
# WRONG — returns None when key exists but value is None
row.get("key", "")

# CORRECT
row.get("key") or ""
```

This has caused bugs in box_h1_trend, PL values, and MQ4 file writes.

### Supabase

- All API routes use shared client from `../../lib/supabase` — never `process.env` directly
- Missing columns → `PGRST204` → fails entire batch silently. Verify schema before writes.
- Auth gates required on ALL data-returning routes (`validateSession` + role check)
- `signal-tracker` POST: dual auth (session cookie OR `ENGINE_SECRET` header)
- 31 tables in production — verify table exists before writing migrations

### API routes

- Auth: `isAdmin` from session cookie server-side, NOT from request body
- Telegram webhook: validate `TG_WEBHOOK_SECRET` header
- External APIs: Twelve Data 8 req/min, 10s delay between batches

### Frontend (dashboard.js)

- All styles are inline — no CSS modules
- Ternary chain for tab rendering
- Fonts: Share Tech Mono (data), Orbitron (headings), Rajdhani (body)
- Colors: BUY=#00ff9f, SELL=#ff4d6d, accent=#00b4ff, warn=#ffd166
- `isMobile` breakpoint: 768px
- 13 tabs: OVERVIEW, PANELS, SIGNALS, TABLE, GAP CHART, RESEARCH, CALCULATOR, SETUPS, VALID PAIRS, CHART, ANALYTICS, LOGS, PANDA AI

---

## 6. ENGINE — DO NOT START VIA TERMINAL

Never start `app.py` via shell/terminal/subprocess.
The engine uses APScheduler which gets killed by non-interactive shells.

**Only start via:** `START_PANDA.bat` (double-click or CMD)

---

## 7. SECURITY RULES (LOCKED APR 25)

- `validateSession()` enforces `expires_at`
- Telegram webhook: `TG_WEBHOOK_SECRET` header validation
- `isAdmin` from session cookie server-side, NOT request body
- AI output rule: "If output could be screenshotted as financial advice — rewrite it"
- Never expose Supabase service key, ENGINE_SECRET, or API keys in client code

---

## 8. ENVIRONMENT

| Key | Value |
|-----|-------|
| Runtime | Python 3.11 (`py -3.11`) |
| Node | Next.js 14 |
| DB | Supabase project `jxkelchxitwuilpbrwxk` |
| Vercel team | `team_yI8pvA0JfHlIj3f2B8dlphgh` |
| Git repo | `github.com/gian101310/panda-dashboar` (no trailing 'd') |
| Domain | `pandaengine.app` / `www.pandaengine.app` |
| MT4 data | `C:\Users\Admin\AppData\Roaming\MetaQuotes\Terminal\Common\Files` |

---

## 9. CONFLICT RESOLUTION

If Claude and Codex are both working on the same file:

1. **Check git log first** — see if the other agent pushed recently
2. **Pull before editing** — `git pull origin main` before any work
3. **Never force push** — no `git push --force`, ever
4. **Small commits** — easier to merge, easier to revert
5. **If in doubt, stop** — ask Boss-G before overwriting another agent's work

---

## 10. WHAT TO DO IF SOMETHING BREAKS

1. **Site down?** Check Vercel dashboard → is the latest build from `panda-dashboar`? If not, push an empty commit from the correct repo: `git commit --allow-empty -m "redeploy-from-correct-repo" && git push origin main`
2. **Build fails in 2 seconds?** Check if `package.json`, `package-lock.json`, `vercel.json` were deleted. Restore them.
3. **Features missing?** A wrong-repo deploy may have overwritten. Redeploy from `panda-dashboar`.
4. **Engine not scoring?** Check if `app.py` is running via `START_PANDA.bat`. Never restart via shell.

---

## FINAL WARNING

These rules are non-negotiable. They were written in blood (production outages).
If a task conflicts with any rule above, **stop and ask Boss-G**.
Do NOT rationalize exceptions. Do NOT "improve" locked code.
Follow the rules. Ship clean. Keep Panda alive.
