# Remove Hermes, Guardian, and Harden Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove unused Hermes and Guardian runtime surfaces, close exposed Supabase access, and make EA result writes idempotent to reduce wasted Vercel CPU.

**Architecture:** Delete only the unused Hermes feed/knowledge database and the Guardian UI, snapshot agent, autonomous-loop launcher, and watchdog. Preserve `lib/accountGuardian.mjs` because active execution tools use its risk gates. Apply one auditable Supabase migration that drops the unused tables/functions and restricts remaining internal tables/functions to `service_role`; then replace the EA result check-then-insert race with one atomic ticket upsert.

**Tech Stack:** Next.js 14 Pages Router, Node.js test runner, Python 3.11/FastAPI, Supabase Postgres/RLS, Vercel.

## Global Constraints

- Never modify `extract_panda_score()` or `compute_scores_all_pairs()` in `app.py`.
- Never modify or remove the `vercel.json` `ignoreCommand` guardrail.
- Preserve `package.json`, `package-lock.json`, `vercel.json`, and `next.config.js`.
- Keep cTrader/MT4/MT5 device enforcement OFF.
- Use `lib/supabase` for Next.js API database access.
- Do not delete the separate Vercel `hermes-mission-control` project in this change; this plan removes Panda Engine's Hermes integration only.

---

### Task 1: Add deletion and hardening regression tests

**Files:**
- Create: `tests/removedSystemsSource.test.mjs`
- Create: `tests/securityHardeningSource.test.mjs`
- Create: `tests/eaResultSource.test.mjs`
- Modify: `tests/pageVisibility.test.mjs`
- Modify: `tests/accountGuardian.test.mjs`

**Interfaces:**
- Consumes: repository file paths, route source, migration SQL.
- Produces: failing tests that define the exact removal, RLS, and idempotency requirements.

- [ ] **Step 1: Write failing source tests**

Assert that Guardian runtime files no longer exist, Hermes is absent from `app.py`, dashboard/page visibility no longer link `/guardian`, the hardening migration drops unused objects and revokes public access, and `ea-result` uses shared Supabase plus an atomic ticket upsert.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/removedSystemsSource.test.mjs tests/securityHardeningSource.test.mjs tests/eaResultSource.test.mjs tests/pageVisibility.test.mjs tests/accountGuardian.test.mjs`

Expected: failures because the runtime files/references still exist, the migration is absent, and `ea-result` still performs check-then-insert.

### Task 2: Remove Guardian UI and unused runtime system

**Files:**
- Delete: `pages/guardian.js`
- Delete: `pages/account-guardian.js`
- Delete: `pages/api/account-guardian.js`
- Delete: `pages/api/guardian-execute.js`
- Delete: `pages/api/run-command.js`
- Delete: `pages/api/watchdog.js`
- Delete: `tools/account-guardian-agent.mjs`
- Delete: `tools/autonomous-loop.mjs`
- Delete: `guardian-watchdog.bat`
- Delete: `supabase/account_guardian_snapshots.sql`
- Delete: `docs/superpowers/plans/2026-06-11-funded-challenge-guardian.md`
- Modify: `package.json`
- Modify: `pages/dashboard.js`
- Modify: `lib/pageVisibility.mjs`
- Modify: `panda-engine-skill/SKILL.md`

**Interfaces:**
- Consumes: current Guardian navigation, scripts, APIs, and local watchdog.
- Produces: no Guardian page or launcher while retaining the reusable execution risk library.

- [ ] **Step 1: Delete the explicit Guardian runtime files**

Use explicit file deletions only; do not use wildcards.

- [ ] **Step 2: Remove navigation, visibility, and package script references**

Remove `/guardian`, `account:guardian`, and `auto:loop` entries. Keep `lib/accountGuardian.mjs`, `lib/tradeExecutor.mjs`, and execution-tool imports because they enforce live risk limits.

- [ ] **Step 3: Run the focused tests**

Run the Task 1 command and confirm Guardian-removal assertions pass.

### Task 3: Remove Hermes integration and stale handoffs

**Files:**
- Delete: `HERMES_HANDOFF.md`
- Delete: `HERMES_INSTRUCTIONS.md`
- Delete: `HERMES_PHASE1_DATA.md`
- Delete: `docs/HERMES_AGENT_HANDOFF_PROMPT.md`
- Delete: `docs/HERMES_KNOWLEDGE_PACK.md`
- Modify: `app.py`
- Modify: `WATCH_PANDA.bat`
- Modify: `panda-engine-skill/SKILL.md`

**Interfaces:**
- Consumes: the authenticated `/api/hermes/feed` block and Hermes-specific documentation.
- Produces: no Hermes feed or operational instructions in Panda Engine.

- [ ] **Step 1: Remove only the Hermes block at the end of `app.py`**

Delete from the `HERMES FEED` marker through the end of the handler without touching scoring or other routes.

- [ ] **Step 2: Remove Hermes-specific launcher filtering and current-context references**

Retain historical CHANGELOG/AUDIT text as history; remove active handoff documents.

- [ ] **Step 3: Run Python syntax verification**

Run: `python3.11 -m py_compile app.py`

Expected: exit 0.

### Task 4: Apply Supabase emergency hardening

**Files:**
- Create: `supabase/remove_unused_systems_and_harden_security.sql`
- Modify: `supabase/engine_config_and_notifications.sql`

**Interfaces:**
- Consumes: live `public` schema policies/functions and server-side service-role access.
- Produces: no Hermes/Guardian tables, RLS on `pf_waitlist` and `shadow_tracker`, no public writes to internal tables, and service-role-only privileged functions.

- [ ] **Step 1: Write the migration**

The transaction must drop `get_hermes_learnings`, `insert_hermes_learning`, `hermes_learnings`, `account_guardian_snapshots`, and `engine_notifications`; enable RLS and revoke `anon`/`authenticated` access on `pf_waitlist` and `shadow_tracker`; remove permissive public policies from internal tables; revoke public execution on remaining `SECURITY DEFINER` functions; grant only `service_role`; and pin function `search_path`.

- [ ] **Step 2: Verify migration source test passes**

Run: `node --test tests/securityHardeningSource.test.mjs`

Expected: pass.

- [ ] **Step 3: Apply migration to Supabase**

Apply as migration `remove_unused_systems_and_harden_security` through the Supabase connector.

- [ ] **Step 4: Verify live security**

Query `pg_class`, `pg_policies`, and function privileges; then run the Supabase security advisor. Expected: the three `rls_disabled_in_public` errors are gone, removed objects do not exist, and remaining privileged functions are not executable by `anon` or `authenticated`.

### Task 5: Make EA result writes atomic

**Files:**
- Modify: `pages/api/ea-result.js`
- Test: `tests/eaResultSource.test.mjs`

**Interfaces:**
- Consumes: bearer-authenticated EA payload and unique `ea_executions.ticket`.
- Produces: one atomic `.upsert(..., { onConflict: 'ticket' })` using shared Supabase, returning the stored row without duplicate-key errors.

- [ ] **Step 1: Verify the EA regression test is RED**

Run: `node --test tests/eaResultSource.test.mjs`

Expected: fail because current source imports `createClient`, preselects the ticket, and inserts separately.

- [ ] **Step 2: Implement the minimal atomic upsert**

Import `supabase` from `../../lib/supabase`, remove the pre-check query, and replace `.insert(record)` with `.upsert(record, { onConflict: 'ticket' })` followed by `.select('id').single()`.

- [ ] **Step 3: Verify GREEN**

Run: `node --test tests/eaResultSource.test.mjs`

Expected: pass.

### Task 6: Full verification and deployment

**Files:**
- Modify: `docs/CHANGELOG.md`

**Interfaces:**
- Consumes: all changes from Tasks 1-5.
- Produces: two focused commits, deployed production, and verified endpoint/database behavior.

- [ ] **Step 1: Run duplicate and syntax checks**

Run: `python3.11 check_dupes.py` and `python3.11 -m py_compile app.py`.

- [ ] **Step 2: Run the complete JavaScript test suite**

Run: `node --test tests/*.test.mjs`.

Expected: all tests pass, including the corrected missing-SL YELLOW expectation.

- [ ] **Step 3: Run the production build**

Run: `npx next build`.

Expected: exit 0 and no Guardian routes in the generated route list.

- [ ] **Step 4: Commit in two focused commits**

Commit 1: `remove-unused-hermes-guardian-and-harden-security`.

Commit 2: `fix-ea-result-idempotency`.

- [ ] **Step 5: Push and verify Vercel**

Push `main`, confirm Vercel READY with build time over 20 seconds, smoke-test public/auth endpoints, confirm removed routes return 404, and inspect early runtime errors.
