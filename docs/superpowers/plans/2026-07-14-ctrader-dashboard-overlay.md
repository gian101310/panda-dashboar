# cTrader Dashboard Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver personal-token and account-licensed cTrader Mac indicators that display authoritative Panda dashboard score, bias, Box, Panda Lines, and XTF values in a draggable/minimizable overlay.

**Architecture:** A minimal authenticated Next.js API returns one cached snapshot for all Panda pairs. Pure JavaScript policy helpers own validation and authorization decisions, the existing admin page controls cTrader licenses and the personal feed token, and one C# indicator codebase uses build-time authentication modes plus cTrader's shared static cache, chart draggables, HTTP API, and local storage.

**Tech Stack:** Next.js 14 pages API, Supabase/Postgres with RLS, Node.js built-in test runner, C#/.NET 6 cTrader Automate API, cTrader Mac compiler/exporter.

## Global Constraints

- Work only in `/Users/gianfx/panda-dashboar` on `main`; push only to `gian101310/panda-dashboar`.
- Never modify `extract_panda_score()` or `compute_scores_all_pairs()` in `app.py`.
- Never alter BB/INTRA strategy definitions or `vercel.json` `ignoreCommand`.
- Never expose Supabase service keys, `ENGINE_SECRET`, dashboard cookies, or the personal feed token.
- Use `lib/supabase` for all server database access and `requireAdmin()` for admin mutations.
- Write a failing test and observe the expected failure before each production behavior.
- Keep the indicator informational; it must never place, modify, or close trades.
- Use `AccessRights.None`; cTrader's supported `Http`, `ChartDraggables`, and `LocalStorage` APIs provide the required capabilities.
- Refresh at most once every 60 seconds per shared indicator process and never perform HTTP work in `Calculate()`.
- Before each push run `/opt/homebrew/bin/python3.11 check_dupes.py`, all Node tests, and `npx next build`.

---

### Task 1: Feed policy and account-license model

**Files:**
- Modify: `lib/indicatorProducts.mjs`
- Modify: `lib/indicatorLicense.mjs`
- Create: `lib/ctraderOverlay.mjs`
- Create: `tests/ctraderOverlay.test.mjs`
- Create: `supabase/ctrader_dashboard_overlay.sql`

**Interfaces:**
- Produces `CTRADER_OVERLAY_PRODUCT_CODE`, `normalizeTradingAccountNumber(value)`, `normalizePandaSymbol(value)`, `sanitizeOverlayRows(rows)`, `decideOverlayCredential(input)`, `hashOverlayToken(token)`, and `safeTokenEqual(actualHash, expectedHash)`.
- Extends license rows with `platform`, `trading_account_number`, and cTrader overlay product metadata while preserving `mt4_account_id`.

- [ ] **Step 1: Write failing policy tests**

Add Node tests that require the new helpers and assert canonical/prefixed/suffixed symbol normalization, ambiguous/unsupported rejection, numeric account validation, allowlisted row output, hard-invalid bias handling, token hashing, constant-time comparison, and approved/pending/expired license decisions.

- [ ] **Step 2: Run the policy test and verify RED**

Run: `node --test tests/ctraderOverlay.test.mjs`

Expected: FAIL because `lib/ctraderOverlay.mjs` does not exist.

- [ ] **Step 3: Implement minimal pure policy helpers and product metadata**

Create the helper module with the exact exported interfaces above. Add product `{ code: 'ctrader_dashboard_overlay', name: 'Panda cTrader Dashboard Overlay', platform: 'CTRADER' }`. Preserve existing MT4 validation paths and add generic account normalization without renaming existing exports.

- [ ] **Step 4: Add an additive idempotent migration**

Create SQL that adds `platform text not null default 'MT4'`, `trading_account_number text`, and a platform/account/product index to `indicator_licenses`; creates `indicator_feed_settings` with singleton key, SHA-256 token hash, rotation metadata, RLS enabled, and a service-role-only policy; and adds no anonymous/authenticated policies.

- [ ] **Step 5: Run policy tests and verify GREEN**

Run: `node --test tests/ctraderOverlay.test.mjs`

Expected: all overlay policy tests pass.

### Task 2: Authenticated cTrader snapshot API

**Files:**
- Create: `pages/api/ctrader-overlay.js`
- Create: `lib/ctraderOverlayHandler.mjs`
- Create: `tests/ctraderOverlayApi.test.mjs`

**Interfaces:**
- `createCtraderOverlayHandler({ supabase, now, rateLimiter })` returns a Next.js handler.
- Accepts either `x-panda-operator-token` or `x-panda-account-number`, never both.
- Returns `{ schema_version: 1, server_time, max_age_seconds: 600, pairs }` only after authorization.

- [ ] **Step 1: Write failing handler tests**

Use an in-memory Supabase-shaped fake to assert method rejection, missing credentials, operator token success/failure, approved commercial account success, pending/expired denial, minimal field allowlist, and 60-second server cache behavior.

- [ ] **Step 2: Run API test and verify RED**

Run: `node --test tests/ctraderOverlayApi.test.mjs`

Expected: FAIL because the handler module does not exist.

- [ ] **Step 3: Implement the injectable handler and thin Next.js route**

Query `indicator_feed_settings`, `indicator_licenses`, and `dashboard` through the shared server client. Use the pure helpers, generic denial responses, no raw-secret logging, `Cache-Control: private, no-store`, and an in-memory 10-second database snapshot cache. Update `last_verified_at` asynchronously only after commercial authorization.

- [ ] **Step 4: Run API and policy tests and verify GREEN**

Run: `node --test tests/ctraderOverlayApi.test.mjs tests/ctraderOverlay.test.mjs`

Expected: all tests pass.

### Task 3: Admin cTrader licensing and token rotation

**Files:**
- Modify: `pages/api/admin/indicator-licenses.js`
- Create: `pages/api/admin/indicator-feed-token.js`
- Modify: `pages/admin/license.js`
- Create: `tests/indicatorFeedAdmin.test.mjs`

**Interfaces:**
- Admin license API accepts `platform` and `trading_account_number`, preserving legacy `mt4_account_id` behavior.
- Token API `GET` returns `{ configured, rotated_at }`; `PUT { token }` validates length, stores SHA-256 only, and returns no secret/hash.

- [ ] **Step 1: Write failing admin token tests**

Assert admin denial, token length validation, SHA-256-only storage, plaintext/hash non-disclosure, and safe status response using an injectable handler factory.

- [ ] **Step 2: Run admin test and verify RED**

Run: `node --test tests/indicatorFeedAdmin.test.mjs`

Expected: FAIL because the admin token handler does not exist.

- [ ] **Step 3: Implement admin handler and extend license API**

Create an injectable handler plus thin route, validate all account fields server-side, and ensure admin identity comes only from `requireAdmin(req)`.

- [ ] **Step 4: Extend the admin page surgically**

Add platform-aware account labels, cTrader product selection, cTrader account creation/editing, and a password-style operator-token rotation card that displays only configured state and rotation time.

- [ ] **Step 5: Run admin and overlay tests and verify GREEN**

Run: `node --test tests/indicatorFeedAdmin.test.mjs tests/ctraderOverlayApi.test.mjs tests/ctraderOverlay.test.mjs`

Expected: all tests pass.

### Task 4: Lightweight cTrader indicator core and panel

**Files:**
- Create: `panda-indicators/2026-07-14/ctrader-dashboard-overlay/PandaDashboardOverlay.Core.cs`
- Create: `panda-indicators/2026-07-14/ctrader-dashboard-overlay/PandaDashboardOverlay.Personal.cs`
- Create: `panda-indicators/2026-07-14/ctrader-dashboard-overlay/PandaDashboardOverlay.Licensed.cs`
- Create: `panda-indicators/2026-07-14/ctrader-dashboard-overlay/PandaDashboardOverlay.csproj`
- Create: `tests/ctraderOverlaySource.test.mjs`

**Interfaces:**
- `OverlaySnapshotParser.Parse(json)` produces immutable pair snapshots.
- `PandaSymbolNormalizer.Normalize(symbol)` maps exactly one supported pair.
- `SharedOverlayFeed` coalesces refreshes and exposes cached snapshots.
- Personal edition reads a `Operator Token` parameter; licensed edition reads `Account.Number` and has no editable account parameter.

- [ ] **Step 1: Write failing C# source-contract tests**

Assert both editions use `AccessRights.None`, neither calls trade APIs, `Calculate()` is empty, personal and licensed authentication modes are separate, the 60-second coordinator is static, the panel uses `ChartDraggables`, local storage persists position/collapse state, and all requested labels are present.

- [ ] **Step 2: Run source-contract test and verify RED**

Run: `node --test tests/ctraderOverlaySource.test.mjs`

Expected: FAIL because the new indicator source files do not exist.

- [ ] **Step 3: Implement the shared core and editions**

Use `System.Text.Json`, cTrader `Http.Send`, a static lock/in-flight guard, `Timer.Start(1)`, and `BeginInvokeOnMainThread` for UI updates. Use `Chart.Draggables.Add` with bottom-left alignment, a 260px expanded panel, a compact minimized row, BUY/SELL/WAIT/INVALID colors, local-storage state, and no work in `Calculate()`.

- [ ] **Step 4: Run source-contract tests and verify GREEN**

Run: `node --test tests/ctraderOverlaySource.test.mjs`

Expected: all source contracts pass.

### Task 5: Database migration, package preparation, and documentation

**Files:**
- Create: `panda-indicators/2026-07-14/ctrader-dashboard-overlay/README.md`
- Create: `panda-indicators/2026-07-14/ctrader-dashboard-overlay/build-packages.sh`
- Modify: `docs/CHANGELOG.md`

**Interfaces:**
- Migration is applied to Supabase project `jxkelchxitwuilpbrwxk` and verified by read-only schema queries.
- Packaging script builds two source-safe `.algo` packages when the cTrader Mac compiler/exporter is available and refuses to package a blank personal token.

- [ ] **Step 1: Apply the additive migration through the connected Supabase tool**

Apply the reviewed SQL once, query the new columns/table, and run security/performance advisors. Do not expose the new table to anon/authenticated roles.

- [ ] **Step 2: Add packaging/install documentation and changelog**

Document cTrader Mac import, personal token setup, commercial account approval, 60-second refresh, panel movement/minimization, stale/error states, and the requirement to export compiled packages from cTrader Mac if the compiler is unavailable in the shell.

- [ ] **Step 3: Prepare packages or record the exact compiler boundary**

If the local cTrader compiler can be invoked, compile/export both `.algo` files and inspect them for accidental token inclusion. If it cannot, keep complete buildable source plus the deterministic packaging script and clearly report that final `.algo` export must occur inside cTrader Mac.

### Task 6: Full verification, commit, push, and deployment

**Files:**
- Verify all files changed by Tasks 1–5.

**Interfaces:**
- Produces one coherent feature commit and a READY Vercel deployment.

- [ ] **Step 1: Run all automated tests**

Run: `node --test tests/*.test.mjs`

Expected: zero failures.

- [ ] **Step 2: Run repository duplicate check**

Run: `/opt/homebrew/bin/python3.11 check_dupes.py`

Expected: `DUPES: NONE` and all checks pass.

- [ ] **Step 3: Run production build**

Run: `npx next build`

Expected: exit 0 with all pages/API routes built.

- [ ] **Step 4: Audit diff and critical files**

Run: `git status --short`, `git diff --check`, and inspect the complete diff. Confirm `package.json`, `package-lock.json`, `vercel.json`, and `next.config.js` are not deleted or staged for deletion; confirm no credential value exists in tracked files.

- [ ] **Step 5: Commit and push**

Stage only feature files, commit as `build-ctrader-dashboard-overlay`, pull `origin/main` with `--ff-only`, then push `origin main` without force.

- [ ] **Step 6: Verify deployment**

Use Vercel CLI to confirm the matching production deployment reaches READY with duration greater than 20 seconds.
