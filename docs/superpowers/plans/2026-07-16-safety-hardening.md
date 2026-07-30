# Panda Engine Safety Hardening Implementation Plan

> Approved implementation plan. Execute in isolated commits and keep device enforcement OFF.

## Task 1: Repository hygiene

- Track `package-lock.json` and verify its root dependencies match `package.json`.
- Ignore `.superpowers/` local state.
- Refresh `CLAUDE.md` and commit this design/plan.
- Run `python3.11 check_dupes.py` and `npx next build`.
- Commit as `track-lockfile-and-refresh-project-context`.

## Task 2: Edge revalidation

- Add failing tests for edge aggregation, stale-claim classification, admin/cron authorization,
  AI prompt safety, and replacement of public stale claims.
- Add pure aggregation and report-building helpers.
- Add a Supabase-backed revalidation service, admin route, and weekly cron route.
- Persist the latest report in `ai_memory` and optionally alert via the existing admin Telegram bot.
- Retire the two stale `admin_brain` edge records with a narrowly scoped SQL update.
- Remove the hardcoded 91%/0% claims from `ai-chat.js` and `portfolio.js`.
- Run focused tests, duplicate checks, and the production build.
- Commit as `add-automated-edge-revalidation`.

## Task 3: Engine stall monitor

- Add failing tests for healthy, first-stale, repeated-stale, recovery, and Telegram-failure cases.
- Add a pure transition decision helper and dependency-injected monitor service.
- Add the `engine_monitor_state` migration with service-role-only access.
- Add the authenticated cron route and five-minute production schedule.
- Apply the migration, run tests/checks/build, and commit as `add-engine-stall-alerts`.

## Task 4: Licensing shadow mode

- Add failing tests for OFF, SHADOW allow, SHADOW would-block, ENFORCED, admin mode changes,
  event deduplication, and schema security.
- Extend enforcement policy with `OFF`, `SHADOW`, and `ENFORCED` modes while preserving `enabled`.
- Add a deduplicated, service-role-only shadow-event table.
- Update all three platform routes, the admin API, and the existing licensing UI.
- Apply the migration but leave all production policies `OFF`.
- Run focused and full licensing tests, duplicate checks, and the production build.
- Commit as `add-device-licensing-shadow-mode`.

## Task 5: Deployment verification

- Confirm protected files are not staged for deletion.
- Confirm `main` is current, then push each completed commit to `origin main`.
- Verify the Vercel deployment reaches READY and the build duration exceeds 20 seconds.
- Smoke-test the public site, admin routes, and cron endpoints' unauthorized behavior.
- Report migrations, commits, deployment, tests, and the intentionally deferred Windows binaries.

## Deployment adaptation

Vercel rejected the five-minute cron schedule because the project plan only permits daily cron jobs.
The authenticated routes are therefore invoked by a public-repository GitHub Actions schedule instead.
This preserves the five-minute engine check and weekly edge run without a paid plan change; `vercel.json`
retains only the locked repository guardrail and normal build settings.
