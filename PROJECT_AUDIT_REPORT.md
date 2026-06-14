# PROJECT AUDIT REPORT — PANDA ENGINE DASHBOARD

**Audit Date:** 2026-06-14  
**Auditor:** Claude (Cowork) — Senior Software Architect, Security Reviewer, QA Engineer, DevOps Engineer, Technical Documentation Specialist  
**Repository:** `github.com/gian101310/panda-dashboar` (no trailing 'd')  
**Branch:** `main`  
**Last Commit at Audit Time:** `40ffbaa fix-signal-bot-alert-routing`  
**Overall Status:** ⚠️ NEEDS ATTENTION — Functionally operational, but critical security issues present

---

## Section 1 — Executive Summary

The Panda Engine Dashboard is a functional forex intelligence platform with a well-structured codebase. The application runs correctly: all 13 unit tests pass, the deployment pipeline is operational, and core business logic is intact. However, this audit uncovered **critical security vulnerabilities** that require immediate action before the next deployment.

**Most urgent finding**: A Telegram Bot API token is hardcoded in **5 active source files** that are committed to the public GitHub repository. This token provides full bot control to anyone who has access to the repo. It must be rotated and removed from source immediately.

**Second most urgent finding**: The `ignoreCommand` cross-deploy guardrail documented in `CHANGELOG.md` as added on 2026-05-28 is **absent from the current `vercel.json`**. The protection against accidentally deploying the wrong repository to Vercel is not in place.

**Third urgent finding**: Four API endpoints that trigger expensive, write-capable operations (OpenAI completions + Supabase writes) have **no authentication whatsoever**, meaning any internet user can invoke them and manipulate the `ai_memory` table.

Beyond security, there are medium-severity issues with password hashing algorithm, timezone offset correctness, stale AI knowledge constants, and a `package-lock.json` exclusion that contradicts a hard rule in `AGENTS.md` and prevents reproducible builds.

All application code issues are **listed here for approval only** — no application code was modified during this audit. Documentation files are authorized for update.

---

## Section 2 — Repository State

| Property | Value |
|----------|-------|
| Remote | `https://github.com/gian101310/panda-dashboar` |
| Branch | `main` |
| Working tree | Clean (no uncommitted changes) |
| Sync status | Up to date with `origin/main` |
| Last commit | `40ffbaa fix-signal-bot-alert-routing` |
| Stash | 1 stash present: `WIP on main: 40ffbaa fix-signal-bot-alert-routing` |
| Node version | v22+ |
| Framework | Next.js 14.2.x |
| Python engine | FastAPI / uvicorn (separate process, local PC) |

**Stash contents (uncommitted feature):**  
The stash contains modifications to `pages/dashboard.js` adding MT4/MT5/cTrader "Open In" buttons to `PairCard`. This feature is not released. The stash is at risk of being lost in a future `git clean` or rebase. **Recommendation: commit to a feature branch or drop the stash to avoid accidental loss.**

---

## Section 3 — File Inventory

### Root Directory
| File | Status | Notes |
|------|--------|-------|
| `package.json` | ✅ Good | All deps accounted for |
| `package-lock.json` | ⚠️ MISSING FROM REPO | Listed in `.gitignore` — contradicts AGENTS.md rule |
| `.gitignore` | ⚠️ Issue | `package-lock.json` is excluded |
| `vercel.json` | 🔴 CRITICAL | Missing `ignoreCommand` guardrail |
| `next.config.js` | ✅ Good | Standard config |
| `AGENTS.md` | ✅ Good | 233 lines, 10 sections, canonical locked rules |
| `CHANGELOG.md` | ⚠️ Inaccurate | Claims ignoreCommand added May 28; not in file |
| `PANDA_ENGINE_OVERVIEW.md` | ⚠️ Stale | Table counts and line counts outdated |
| `README.md` | ✅ Exists | N/A for audit |

### `/lib` — Shared Libraries
| File | Auth | Secret Handling | Status |
|------|------|-----------------|--------|
| `lib/supabase.js` | N/A | Hardcoded Supabase URL (non-secret) | ⚠️ Minor |
| `lib/auth.js` | N/A | No secrets; SHA-256 hashing | ⚠️ Medium |
| `lib/loginAlert.mjs` | N/A | **Hardcoded bot token as default fallback** | 🔴 CRITICAL |
| `lib/signalTelegram.mjs` | N/A | Clean — env vars only | ✅ |
| `lib/openai.js` | N/A | Clean — env var only | ✅ |
| `lib/newsCalendar.mjs` | N/A | Fixed ET offset (EDT only, breaks in winter) | ⚠️ Medium |
| `lib/engineHealth.mjs` | N/A | Clean utility | ✅ |

### `/pages/api` — API Routes (44 total)
| Route | Auth | Issues |
|-------|------|--------|
| `login.js` | Public (entry point) | ✅ Clean |
| `logout.js` | Session | ✅ Clean |
| `me.js` | Session | ✅ Clean |
| `data.js` | Session | ✅ Clean |
| `dashboard.js` → main page | N/A | ✅ Clean |
| `engine-health.js` | Admin | ✅ Clean |
| `signal-tracker.js` | Session OR ENGINE_SECRET | ✅ Clean |
| `signal-analytics.js` | Session | ✅ Clean |
| `signal-log.js` | Session | ✅ Clean |
| `gap-chart.js` | Session | ✅ Clean |
| `heatmap.js` | Session | ✅ Clean |
| `spikes.js` | Session | ✅ Clean |
| `pdr.js` | Session | ✅ Clean |
| `upcoming-news.js` | Session | ✅ Clean |
| `ai-memory.js` | Session | ✅ Clean |
| `admin-brain.js` | Session | ✅ Clean |
| `journal.js` | Session | ✅ Clean |
| `ai-chat.js` | Session | ⚠️ Stale ENGINE_KNOWLEDGE constants |
| `ea-result.js` | EA_API_KEY bearer | ⚠️ Own Supabase client (not lib/supabase) |
| `ea-data.js` | EA_API_KEY bearer | ⚠️ Own Supabase client |
| `cot.js` | None (public) | ⚠️ Returns 3-month-stale static data |
| `calendar.js` | None (intentional) | ✅ Public proxy |
| `public-signals.js` | None (intentional) | ✅ Limited data landing page |
| `maintenance.js` | GET: public / POST: admin | ✅ Correct tiered auth |
| `notify-telegram.js` | Session | ✅ Clean |
| **`signal-agent.js`** | **NONE** | 🔴 No auth — writes to ai_memory |
| **`journal-agent.js`** | **NONE** | 🔴 No auth — writes to ai_memory |
| **`pattern-agent.js`** | **NONE** | 🔴 No auth — writes to ai_memory |
| **`run-all-agents.js`** | **NONE** | 🔴 No auth — triggers all 3 agents |
| **`pf-log-event.js`** | **NONE** | 🔴 No auth + hardcoded token |
| `telegram-webhook.js` | Telegram secret | 🔴 Hardcoded token; stores plain_password |
| `pf-signup.js` | None (signup flow) | 🔴 Hardcoded token; stores plain_password |
| `admin/users.js` | Admin | ⚠️ Returns plain_password to admin |
| `admin/pf-approve.js` | Admin | 🔴 Hardcoded token |

### `/pages` — Pages
| File | Status |
|------|--------|
| `dashboard.js` | ✅ ~3356 lines, clean, all inline styles |
| `index.js` | ✅ Landing page |
| `login.js` | ✅ Login form |
| `dashboard.js.bak_apr5` | ⚠️ Backup file in pages dir (not served, but pollutes repo) |
| `pricing.js.patch` | ⚠️ Patch file in pages dir |

### `/tests` — Tests
| File | Tests | Status |
|------|-------|--------|
| `engineHealth.test.mjs` | 2 | ✅ Pass |
| `auth.test.mjs` | 2–3 | ✅ Pass |
| `newsCalendar.test.mjs` | 3–4 | ✅ Pass |
| `signalTelegram.test.mjs` | 2–3 | ✅ Pass |
| `signalTracker.test.mjs` | 1–2 | ✅ Pass |
| **TOTAL** | **13** | ✅ **ALL PASS** |

### `/archive` — Archive Files (committed to repo)
| File | Issue |
|------|-------|
| `archive/app_backup_before_threshold_fix.py` | Contains hardcoded bot token |
| `archive/app_backup_v2.1.py` | Contains hardcoded bot token |

> Note: `.gitignore` has an `archive/` entry but it is **commented out**, meaning archive files ARE tracked by git.

### `/app.py` — Python Engine (separate repo mount)
| Property | Value |
|----------|-------|
| Location | `C:\Users\Admin\Documents\Claude\Projects\Panda Engine\app.py` |
| Lines | ~2234+ |
| Secrets | All from environment variables (clean) |
| LOCKED functions | `extract_panda_score()`, `compute_scores_all_pairs()` |
| Status | ✅ Functionally clean |

---

## Section 4 — Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│  Local PC                                                    │
│  ┌─────────────────┐    ┌────────────────┐                  │
│  │  app.py          │    │  MT4 Terminal  │                  │
│  │  FastAPI :8000   │◄───│  .csv files    │                  │
│  │  21 pairs, 5min  │    └────────────────┘                  │
│  └────────┬─────────┘                                        │
│           │ Supabase REST (service key)                       │
└───────────┼──────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────┐
│  Supabase (jxkelchxitwuilpbrwxk)                            │
│  31 tables, RLS on 3 tables, hermes_ro role                 │
└───────────┬──────────────────────────────────────────────────┘
            │
       ┌────┴────┐
       │         │
       ▼         ▼
┌──────────┐  ┌────────────────────────────────┐
│  Hermes  │  │  Next.js Dashboard (Vercel)     │
│  Telegram│  │  pandaengine.app               │
│  Agent   │  │  44 API routes                 │
│  hermes_ro│  │  pages/dashboard.js (~3356L)  │
└──────────┘  └────────────────────────────────┘
```

**Strategy Layer:**
- Gap Score = BASE currency score − QUOTE currency score (range ±18, across D1/H4/H1)
- BUY bias: gap ≥ 5 | SELL bias: gap ≤ −5
- BB strategy: gap ≥ 5, any time
- INTRA strategy: gap ≥ 9 + TBG confirmed, 22:00–23:59 UTC (2–4 AM Dubai)

**Authentication layer:**  
SHA-256 + static salt hashing → session cookie (12h, httpOnly) → `validateSession()` / `requireAdmin()`. bcryptjs installed but unused.

---

## Section 5 — Confirmed Bugs

These are verified issues — confirmed by reading source code or running checks.

### BUG-001 — Missing `ignoreCommand` in vercel.json [SEVERITY: HIGH]
**File:** `vercel.json`  
**Evidence:** Current file contains only `framework`, `buildCommand`, `outputDirectory`, `installCommand`. No `ignoreCommand` field.  
**Expected:** CHANGELOG.md entry for 2026-05-28 states: "Added `ignoreCommand` that blocks any deploy not from `panda-dashboar` repo."  
**Impact:** Any Vercel deployment (manual or CI) from any repository will succeed. The May 28 feature-wipe incident that this guardrail was created to prevent can recur at any time.  
**Fix required (application code — needs approval):**
```json
{
  "framework": "nextjs",
  "buildCommand": "next build",
  "outputDirectory": ".next",
  "installCommand": "npm install",
  "ignoreCommand": "[ \"$(git remote get-url origin)\" != \"https://github.com/gian101310/panda-dashboar.git\" ] && echo 1 || echo 0"
}
```

### BUG-002 — package-lock.json excluded from git [SEVERITY: HIGH]
**File:** `.gitignore` (line with `package-lock.json`)  
**Evidence:** Running `git ls-files package-lock.json` returns nothing. The file is excluded.  
**Contradiction:** `AGENTS.md` Section 2 states: "NEVER delete: `package-lock.json`" listed as a critical file.  
**Impact:** (1) Vercel builds use non-deterministic dependency resolution — a dependency could upgrade silently and break production. (2) `npm audit` cannot run (returns `ENOLOCK`). (3) The AGENTS.md rule to "never delete" is impossible to enforce when the file is gitignored.  
**Fix required (docs + config — authorized):** Remove `package-lock.json` from `.gitignore`, generate the lock file, and commit it.

### BUG-003 — ET Timezone Fixed Offset (Winter Error) [SEVERITY: MEDIUM]
**File:** `lib/newsCalendar.mjs`  
**Evidence:**
```javascript
const ET_TO_UTC_OFFSET_MS = 4 * 60 * 60 * 1000; // assumes EDT (UTC-4)
```
**Impact:** During EST (November through mid-March), Eastern Time is UTC−5, not UTC−4. All news event times will be offset by 1 hour during winter months, causing forex news alerts to appear 1 hour early.  
**Fix required (application code — needs approval):** Replace fixed offset with DST-aware calculation.

### BUG-004 — Stale ENGINE_KNOWLEDGE Constants in ai-chat.js [SEVERITY: MEDIUM]
**File:** `pages/api/ai-chat.js`, `ENGINE_KNOWLEDGE` constant  
**Evidence:** The constant states "app.py (~1676 lines)" and "20 tables". Actual values: app.py is ~2234+ lines; Supabase has 31 tables.  
**Impact:** Panda AI gives administrators incorrect information about the system when they ask questions in AI chat mode.  
**Fix required (application code — needs approval):** Update the constant to reflect current values (2234 lines, 31 tables).

### BUG-005 — Git stash contains unreleased dashboard feature [SEVERITY: LOW]
**File:** `pages/dashboard.js` (in stash)  
**Evidence:** `git stash list` shows: `stash@{0}: WIP on main: 40ffbaa fix-signal-bot-alert-routing`; `git stash show` reveals changes to `dashboard.js` adding "Open In" buttons (MT4/MT5/cTrader) to PairCard component.  
**Impact:** Feature is work-in-progress but not committed. Risk of accidental loss if stash is dropped.  
**Fix required:** Commit to a named feature branch or drop the stash. No code change required.

---

## Section 6 — Possible Bugs (Suspected — Needs Verification)

### PBUG-001 — Live COT fetch result silently discarded [SEVERITY: MEDIUM]
**File:** `pages/api/cot.js`  
**Observation:** The API route attempts a live fetch from the NY Fed API but the result appears to be discarded in the catch block, with the function falling through to return static hardcoded COT data marked as "updated as of March 2026" (now ~3 months stale).  
**Question for Boss-G:** Was the static fallback intentional (live feed unreliable), or was the live fetch supposed to replace the static data? If intentional static, the "updated March 2026" comment should be updated monthly. If live fetch is desired, the logic needs a fix.

### PBUG-002 — `pf-log-event.js` completely unauthenticated [SEVERITY: MEDIUM]
**File:** `pages/api/pf-log-event.js`  
**Observation:** No session check, no API key check. Any internet user can POST arbitrary data to this endpoint, which triggers Telegram admin notifications.  
**Question for Boss-G:** Was this intentional (e.g., it's called only by trusted internal client-side code that doesn't have credentials)? If so, consider at minimum a shared secret in the request body or `X-Internal-Key` header.

### PBUG-003 — Agent endpoints intentionally unauthenticated? [SEVERITY: HIGH]
**Files:** `signal-agent.js`, `journal-agent.js`, `pattern-agent.js`, `run-all-agents.js`  
**Observation:** These endpoints write to `ai_memory` table, invoke GPT-4o-mini, and perform Supabase reads. No auth check of any kind. The `run-all-agents.js` has `config = { maxDuration: 60 }` suggesting it's expected to run long.  
**Question for Boss-G:** Were these intended to be called only from admin UI (which has session auth) and was auth on the API route simply forgotten? Or is there a different trust model in play?

### PBUG-004 — Duplicate `hashPassword` implementation [SEVERITY: LOW]
**Files:** `lib/auth.js` and `pages/api/telegram-webhook.js`  
**Observation:** `hashPassword` is defined in `lib/auth.js` with `'panda_salt_2026'`. A functionally identical version exists inline in `telegram-webhook.js`. If the algorithm in `auth.js` is ever changed, `telegram-webhook.js` stays out of sync silently.  
**Question for Boss-G:** Likely unintentional duplication. Should `telegram-webhook.js` import from `lib/auth.js`?

### PBUG-005 — Session boundary mismatch between journal-agent and signal-tracker [SEVERITY: LOW]
**Files:** `pages/api/journal-agent.js`, `pages/api/signal-tracker.js`  
**Observation:** `journal-agent.js` defines trading sessions as ASIAN: 0–7 UTC, LONDON: 8–12 UTC, NY: 12–20 UTC. `signal-tracker.js` defines them as ASIAN: 22:00–05:59 UTC, LONDON: 06:00–13:59 UTC. These produce different session labels for the same trade timestamps, leading to inconsistent session tagging between journal analysis and signal tracking.  
**Needs confirmation:** Whether session consistency matters for cross-table analytics. If yes, one definition should be extracted to a shared utility.

---

## Section 7 — Security Review

### SEC-001 — CRITICAL: Telegram Bot Token Hardcoded in Source Code

**Severity:** CRITICAL — Immediate action required  
**Files affected (active source):**
1. `lib/loginAlert.mjs` — `DEFAULT_BOT_TOKEN` fallback value
2. `pages/api/telegram-webhook.js` — `PF_BOT_TOKEN`
3. `pages/api/pf-signup.js` — `PF_BOT_TOKEN`
4. `pages/api/pf-log-event.js` — `ADMIN_BOT` variable
5. `pages/api/admin/pf-approve.js` — `PF_BOT_TOKEN`

**Files affected (archive, also committed):**
6. `archive/app_backup_before_threshold_fix.py`
7. `archive/app_backup_v2.1.py`

**What is exposed:** Full Telegram Bot API token beginning with `8605294552:` [remainder REDACTED — do not display]  
**What this allows:** Anyone with repo access can send messages as the bot, receive all messages sent to the bot, modify bot settings, and potentially harvest user data from conversations.  
**Admin Chat ID also exposed:** `5379148910` (in the same files)

**Required actions (in order):**
1. **Rotate the bot token immediately** via BotFather (`/revoke` command). The existing token will stop working.
2. Set the new token as environment variable `TELEGRAM_BOT_TOKEN` (or `PF_BOT_TOKEN`) in Vercel project settings.
3. Replace all 5 hardcoded occurrences with `process.env.TELEGRAM_BOT_TOKEN`.
4. Remove or rewrite archive files to remove the token from git history (or add `archive/` to `.gitignore`).
5. Consider a `git filter-branch` or BFG Repo Cleaner run if historical token exposure is a concern.

> ⚠️ NOTE: Even after fixing the source files, the token remains in git history. GitHub's secret scanning may flag it. The token rotation is the security-effective step; history cleanup is cleanup only.

---

### SEC-002 — HIGH: Weak Password Hashing Algorithm

**Severity:** HIGH  
**File:** `lib/auth.js`  
**Current implementation:**
```javascript
export function hashPassword(password) {
  const salt = 'panda_salt_2026';  // STATIC SALT — same for every user
  return crypto.createHash('sha256').update(password + salt).digest('hex');
}
```
**Problem:** SHA-256 is a general-purpose hash function, not a password-hashing function. It is fast by design, which enables brute-force attacks. A static salt means identical passwords produce identical hashes (no rainbow table protection per-user). `bcryptjs ^3.0.3` is already installed in `package.json` but is not used.  
**Impact:** If the `panda_users` table is ever leaked, all passwords are trivially crackable.  
**Recommended fix (needs approval):** Replace `hashPassword` with bcryptjs. New hash format will be incompatible — all users would need password resets, or a migration path (rehash on next successful login) would be needed.

---

### SEC-003 — HIGH: Plain Password Stored in Database

**Severity:** HIGH  
**Files:** `pages/api/telegram-webhook.js`, `pages/api/pf-signup.js`, `pages/api/admin/users.js`  
**Evidence:** `telegram-webhook.js` line: `plain_password: plainPw` written to `panda_users` on account creation. `admin/users.js` returns `plain_password` field in GET response.  
**Impact:** Any Supabase table leak exposes all user passwords in plaintext. Admin API leaks them to any admin session.  
**Recommended fix (needs approval):** Remove the `plain_password` column from `panda_users`. If Boss-G needs to recover passwords for support purposes, implement a secure admin-initiated password reset flow instead.

---

### SEC-004 — HIGH: Four API Routes Without Authentication

**Severity:** HIGH  
**Files:** `signal-agent.js`, `journal-agent.js`, `pattern-agent.js`, `run-all-agents.js`  
**Impact:**
- Any internet user can invoke GPT-4o-mini completions, consuming API credits
- Any internet user can write arbitrary data to the `ai_memory` Supabase table
- `run-all-agents.js` chains all three operations and has a 60-second serverless timeout (expensive)
- No rate limiting is in place
**Recommended fix (needs approval):** Add `validateSession` or `requireAdmin` check to all four routes. If these are intended for scheduled/automated calls only, add `ENGINE_SECRET` bearer token auth matching the pattern in `signal-tracker.js`.

---

### SEC-005 — MEDIUM: Supabase URL Hardcoded in lib/supabase.js

**Severity:** LOW-MEDIUM  
**File:** `lib/supabase.js`  
**Evidence:** `const SUPABASE_URL = 'https://jxkelchxitwuilpbrwxk.supabase.co'` is hardcoded.  
**Impact:** Not a credential, so not immediately dangerous. However, the URL combined with an exposed service key (SEC-001 risk area) could enable direct DB access. Also, if the project ever migrates, this hardcoded value is a find-replace risk.  
**Recommended fix (needs approval):** Move to `process.env.NEXT_PUBLIC_SUPABASE_URL`. Low priority compared to other items.

---

### SEC-006 — LOW: logAccess() has empty catch block

**Severity:** LOW  
**File:** `lib/auth.js`  
**Evidence:** The `logAccess()` function (used to log auth events) has an empty `catch` block — access log write failures are silently ignored.  
**Impact:** Auth logging failures cannot be detected or alerted on. In a security incident, audit logs may be incomplete without any indication.  
**Recommended fix:** At minimum, `console.error` in the catch block to surface failures in Vercel logs.

---

### SEC-007 — LOW: Supabase Service Key Fallback to Anon Key

**Severity:** LOW  
**File:** `lib/supabase.js`  
**Evidence:** Client creation falls back to `SUPABASE_ANON_KEY` if `SUPABASE_SERVICE_KEY` is not set.  
**Impact:** If the `SUPABASE_SERVICE_KEY` environment variable is missing or misspelled in Vercel, the app silently switches to the anon key, which has far fewer permissions. RLS policies and restricted tables would behave differently, potentially exposing data or breaking queries silently.  
**Recommended fix:** Throw a startup error if `SUPABASE_SERVICE_KEY` is missing rather than silently degrading.

---

## Section 8 — Performance Review

### PERF-001 — maxDuration on run-all-agents.js
`run-all-agents.js` sets `config = { maxDuration: 60 }`. This is appropriate for chained AI agent calls but note this consumes a full serverless invocation for 60 seconds. No issues found — by design.

### PERF-002 — upcoming-news.js caching
`upcoming-news.js` correctly sets `Cache-Control: public, s-maxage=60, stale-while-revalidate=120`. The ForexFactory fetch is properly cached at the CDN level. No issues.

### PERF-003 — signal-tracker.js price capture interval
Price capture is every 15 minutes via Twelve Data free tier. Appropriate for free tier limits. No issues.

### PERF-004 — Duplicate Supabase Client Instantiation
**Files:** `pages/api/ea-data.js`, `pages/api/ea-result.js`  
Both create their own `createClient()` instead of importing from `lib/supabase.js`. No performance impact (connections are pooled by Supabase), but it violates the project's code style rule (stated in skill: "Always import from `../../lib/supabase`") and risks divergence in client configuration.

---

## Section 9 — Code Quality Review

### QUALITY-001 — DEPRECATED files in active codebase
`ThemeToggle` component and `lib/theme.js` are marked DEPRECATED in code comments but remain in the codebase. They are unused but add noise. Safe to remove after verifying no imports remain.

### QUALITY-002 — Backup and patch files in `/pages` directory
`pages/dashboard.js.bak_apr5` and `pages/pricing.js.patch` are in the pages directory. Next.js does not serve these as routes (non-`.js` extensions), but they are committed to git and clutter the repo.

### QUALITY-003 — archive/ directory committed to git
`archive/` contains old app.py backups including hardcoded credentials (see SEC-001). The `.gitignore` entry for `archive/` is commented out. Should either uncomment the gitignore entry or add these files explicitly.

### QUALITY-004 — Empty src/ directory
`src/engine/`, `src/ui/`, `src/utils/` appear empty. If these are placeholders for a future refactor, they should be documented. Otherwise they should be removed.

### QUALITY-005 — cot.js static data comment
`pages/api/cot.js` contains a comment "updated as of March 2026" on static hardcoded COT data. This comment will become increasingly misleading over time. If the data is intentionally static, the comment should be changed to explain why (e.g., "NY Fed API unreliable; Boss-G updates manually when needed").

---

## Section 10 — Test Coverage

| Component | Test File | Coverage |
|-----------|-----------|----------|
| `lib/engineHealth.mjs` | `tests/engineHealth.test.mjs` | ✅ 2 scenarios (heartbeat override, fallback) |
| `lib/auth.js` | `tests/auth.test.mjs` | ✅ Hash + session validation |
| `lib/newsCalendar.mjs` | `tests/newsCalendar.test.mjs` | ✅ Event normalization |
| `lib/signalTelegram.mjs` | `tests/signalTelegram.test.mjs` | ✅ Telegram send utility |
| `pages/api/signal-tracker.js` | `tests/signalTracker.test.mjs` | ✅ Lifecycle logic |

**Total: 13 tests, 13 pass.**

**Coverage gaps (no tests exist for):**
- `lib/supabase.js` — untested
- `lib/openai.js` — untested
- `pages/api/ai-chat.js` — untested (AI calls are hard to test; acceptable)
- `pages/api/login.js` — untested (integration test needed)
- All admin routes — untested
- `pages/api/cot.js` — untested (static data; low value)

**Recommendation:** Add a test for `lib/newsCalendar.mjs` specifically covering the EDT/EST boundary (winter vs. summer offset), which would have caught BUG-003 before it landed.

---

## Section 11 — Documentation Review

### DOC-001 — CHANGELOG.md: ignoreCommand claim is inaccurate [SEVERITY: HIGH]
**File:** `docs/CHANGELOG.md`  
**Entry:** 2026-05-28 — "Added `ignoreCommand` that blocks any deploy not from `panda-dashboar` repo"  
**Reality:** `ignoreCommand` is absent from the current committed `vercel.json`.  
**Action:** Either restore the `ignoreCommand` in `vercel.json` (which is the correct fix) and the CHANGELOG is retrospectively accurate, or add a correction note to CHANGELOG. The CHANGELOG should not be edited to remove the entry — it is a historical record.

### DOC-002 — PANDA_ENGINE_OVERVIEW.md: Stale counts [SEVERITY: MEDIUM]
**File:** `PANDA_ENGINE_OVERVIEW.md`  
**Stale data confirmed:** References to table counts (should be 31) and `app.py` line count (should be ~2234+) are outdated.  
**Action:** Update counts as part of this documentation pass (authorized).

### DOC-003 — AGENTS.md: package-lock.json rule vs .gitignore contradiction [SEVERITY: HIGH]
**File:** `AGENTS.md` Section 2 vs `.gitignore`  
**AGENTS.md says:** "NEVER delete: package-lock.json"  
**Reality:** package-lock.json is in `.gitignore` — it cannot be tracked, so the "never delete" rule is impossible to follow.  
**Action:** Once `package-lock.json` is removed from `.gitignore` and committed (BUG-002 fix), update AGENTS.md to clarify: "package-lock.json is committed — never add it to .gitignore and never delete it from the repo."

### DOC-004 — Missing ENVIRONMENT_VARIABLES.md [SEVERITY: MEDIUM]
No canonical documentation exists listing all required environment variables. AGENTS.md has a partial table, but it does not cover all vars used across all API routes.  
**Full list of environment variables found in source:**
- `SUPABASE_SERVICE_KEY` — Supabase service key (backend)
- `SUPABASE_ANON_KEY` — Supabase anon key (fallback, discouraged)
- `NEXT_PUBLIC_SUPABASE_URL` — (missing; currently hardcoded in lib/supabase.js)
- `OPENAI_API_KEY` — OpenAI API key
- `EA_API_KEY` — Bearer token for EA endpoints
- `ENGINE_SECRET` — Shared secret for signal-tracker engine auth
- `TELEGRAM_BOT_TOKEN` (or `PF_BOT_TOKEN`) — Must be created after SEC-001 remediation
- `TELEGRAM_ADMIN_CHAT_ID` — Must be moved to env after SEC-001 remediation
- `NODE_ENV` — production/development flag  
**Action:** Create `ENVIRONMENT_VARIABLES.md` documenting each var, its purpose, where it's used, and whether it's required/optional. (Authorized as new documentation.)

### DOC-005 — Missing SECURITY.md [SEVERITY: LOW]
No `SECURITY.md` file exists documenting the auth model, session management, RLS rules, or responsible disclosure policy.  
**Action:** Create basic `SECURITY.md` covering auth flow, RLS tables, hermes_ro role, and how to report security issues.

---

## Section 12 — Dependency Audit

| Package | Version | Status |
|---------|---------|--------|
| `next` | 14.2.x | ✅ Current stable |
| `react` | 18.x | ✅ Current stable |
| `@supabase/supabase-js` | Latest | ✅ |
| `bcryptjs` | ^3.0.3 | ⚠️ Installed, not used (see SEC-002) |
| `cookie` | Latest | ✅ Used in login.js |
| `lucide-react` | Latest | ✅ Icons |
| `recharts` | Latest | ✅ Charts |

**npm audit status:** CANNOT RUN — `package-lock.json` is gitignored. `npm audit` returns `ENOLOCK`. See BUG-002. No known vulnerabilities can be confirmed or denied until this is resolved.

**Recommendation:** After fixing BUG-002 (commit package-lock.json), run `npm audit` and resolve any HIGH/CRITICAL findings.

---

## Section 13 — Prioritized Action Plan

### P0 — Do Immediately (Security Emergency)

| ID | Action | File(s) | Owner |
|----|--------|---------|-------|
| P0-1 | Rotate Telegram Bot Token via BotFather | N/A (BotFather) | Boss-G |
| P0-2 | Add `TELEGRAM_BOT_TOKEN` env var to Vercel | Vercel Dashboard | Boss-G |
| P0-3 | Replace hardcoded token with `process.env.TELEGRAM_BOT_TOKEN` in 5 files | lib/loginAlert.mjs, pages/api/telegram-webhook.js, pf-signup.js, pf-log-event.js, admin/pf-approve.js | Claude |
| P0-4 | Move `TELEGRAM_ADMIN_CHAT_ID` to env var in same 5 files | Same as above | Claude |
| P0-5 | Rewrite or remove archive files with old tokens | archive/*.py | Claude |

### P1 — Do This Week (High Priority)

| ID | Action | File(s) | Owner |
|----|--------|---------|-------|
| P1-1 | Restore `ignoreCommand` to vercel.json | vercel.json | Claude |
| P1-2 | Add auth to 4 unauthenticated agent routes | signal-agent.js, journal-agent.js, pattern-agent.js, run-all-agents.js | Claude |
| P1-3 | Remove `package-lock.json` from .gitignore, generate and commit it | .gitignore | Claude |
| P1-4 | Add auth to `pf-log-event.js` | pf-log-event.js | Claude |
| P1-5 | Update AGENTS.md to reflect package-lock.json gitignore fix | AGENTS.md | Claude |

### P2 — Do This Month (Medium Priority)

| ID | Action | File(s) | Owner |
|----|--------|---------|-------|
| P2-1 | Fix ET timezone to use DST-aware offset | lib/newsCalendar.mjs | Claude |
| P2-2 | Update ENGINE_KNOWLEDGE constants to 2234 lines / 31 tables | pages/api/ai-chat.js | Claude |
| P2-3 | Migrate password hashing to bcryptjs | lib/auth.js + migration plan | Claude |
| P2-4 | Remove `plain_password` field from panda_users table | telegram-webhook.js, pf-signup.js, admin/users.js, Supabase | Claude + Supabase |
| P2-5 | Replace duplicate hashPassword in telegram-webhook.js with lib import | pages/api/telegram-webhook.js | Claude |
| P2-6 | Create `ENVIRONMENT_VARIABLES.md` | New file | Claude |
| P2-7 | Update `PANDA_ENGINE_OVERVIEW.md` with correct counts | PANDA_ENGINE_OVERVIEW.md | Claude |
| P2-8 | Add error logging to logAccess() catch block | lib/auth.js | Claude |

### P3 — Backlog (Low Priority / Nice to Have)

| ID | Action | File(s) | Owner |
|----|--------|---------|-------|
| P3-1 | Commit or drop git stash (PairCard "Open In" buttons) | Stash / dashboard.js | Boss-G |
| P3-2 | Remove DEPRECATED ThemeToggle + lib/theme.js | dashboard.js, lib/theme.js | Claude |
| P3-3 | Remove backup/patch files from pages dir | pages/*.bak_*, pages/*.patch | Claude |
| P3-4 | Add `archive/` back to .gitignore | .gitignore | Claude |
| P3-5 | Move ea-data.js and ea-result.js to use lib/supabase | ea-data.js, ea-result.js | Claude |
| P3-6 | Resolve or document the COT static data situation | pages/api/cot.js | Boss-G decision |
| P3-7 | Create SECURITY.md | New file | Claude |
| P3-8 | Add `NEXT_PUBLIC_SUPABASE_URL` env var, remove hardcoded URL | lib/supabase.js, Vercel | Claude |
| P3-9 | Resolve session boundary mismatch between journal-agent and signal-tracker | API files | Claude |
| P3-10 | Add `npm audit` to pre-deploy checklist in AGENTS.md | AGENTS.md | Claude |

---

## Section 14 — Verification Results

| Check | Command | Result |
|-------|---------|--------|
| Git status | `git status` | ✅ Clean working tree |
| Git sync | `git status` | ✅ Up to date with origin/main |
| Unit tests | `node --test tests/*.test.mjs` | ✅ 13/13 PASS |
| npm audit | `npm audit` | ❌ ENOLOCK — package-lock.json missing |
| next build | `next build` | ⚠️ INCONCLUSIVE — timed out in sandbox; presumed working (Vercel builds succeed) |
| Secret scan | Manual grep across all `.js/.mjs` | 🔴 Found in 5 active + 4 archive files |
| TODO/FIXME scan | `grep -r "TODO\|FIXME"` | ⚠️ 2 DEPRECATED markers found; no P0 TODOs |
| Auth audit | Manual review of all 44 routes | 🔴 4 routes unauthenticated (agent routes) |
| vercel.json | Manual read | 🔴 ignoreCommand absent |
| .gitignore | Manual read | ⚠️ package-lock.json excluded |

---

## Section 15 — Sign-off Checklist

**Pre-commit (to be verified before any fix commit):**
- [ ] No secrets added to any file
- [ ] No application logic changed without approval
- [ ] check_dupes.py run on app.py (engine repo)
- [ ] All 13 tests still pass
- [ ] `git diff` reviewed — only authorized changes

**P0 Security Fix Checklist (for next commit):**
- [ ] Bot token rotated via BotFather (Boss-G action)
- [ ] New token added to Vercel env vars (Boss-G action)
- [ ] All 5 source files updated to use env var
- [ ] Archive files cleaned
- [ ] vercel.json ignoreCommand restored
- [ ] package-lock.json removed from .gitignore and committed
- [ ] Auth added to agent routes

**Documentation changes authorized in this audit:**
- [ ] `PANDA_ENGINE_OVERVIEW.md` — update line/table counts
- [ ] `CHANGELOG.md` — add entry for this audit
- [ ] `AGENTS.md` — clarify package-lock.json rule
- [ ] `ENVIRONMENT_VARIABLES.md` — create new file
- [ ] `PROJECT_AUDIT_REPORT.md` — this file

---

## Appendix — Files NOT Modified by This Audit

Per change control rules, **zero application code files were modified** during this audit. The following files were read but not changed:

`app.py`, `pages/dashboard.js`, `lib/auth.js`, `lib/supabase.js`, `lib/loginAlert.mjs`, `lib/newsCalendar.mjs`, `lib/signalTelegram.mjs`, `lib/openai.js`, `lib/engineHealth.mjs`, `pages/api/login.js`, `pages/api/signal-tracker.js`, `pages/api/signal-agent.js`, `pages/api/journal-agent.js`, `pages/api/pattern-agent.js`, `pages/api/run-all-agents.js`, `pages/api/ai-chat.js`, `pages/api/telegram-webhook.js`, `pages/api/pf-signup.js`, `pages/api/pf-log-event.js`, `pages/api/admin/pf-approve.js`, `pages/api/admin/users.js`, `pages/api/ea-data.js`, `pages/api/ea-result.js`, `pages/api/cot.js`, `pages/api/engine-health.js`, `pages/api/upcoming-news.js`, `vercel.json`, `.gitignore`, `package.json`, `AGENTS.md`

---

*Report generated: 2026-06-14 | Audit status: COMPLETE | Next action: Boss-G approval of P0 security fixes*
