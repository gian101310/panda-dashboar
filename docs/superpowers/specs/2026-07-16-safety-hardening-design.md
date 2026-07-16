# Panda Engine Safety Hardening Design

**Date:** 2026-07-16  
**Status:** Approved by Boss-G

## Goal

Add four low-risk safeguards without changing the locked scoring engine, strategy rules,
or currently distributed Windows indicator binaries.

## 1. Repository hygiene

- Commit the valid npm lockfile for reproducible Vercel installs.
- Ignore `.superpowers/`, which contains local runtime markers.
- Keep the shared project handoff accurate.
- Preserve all four load-bearing build files and the Vercel repository guardrail.

## 2. Automated edge revalidation

The job recomputes descriptive statistics from resolved `signal_results`. It is report-only:
it cannot create trades, change thresholds, or write to dashboard scoring tables.

- Compute overall decisive BB and INTRA win rates.
- Compute BB gap-7 statistics with and without Panda Lines confirmation.
- Compare current results with the historical 91%/0% claims.
- Store one replaceable `ai_memory` report and notify the admin when an old claim has decayed.
- Remove hardcoded stale performance claims from AI and public marketing copy.
- Keep historical `admin_brain` records, but label them retired instead of deleting evidence.
- Support an authenticated weekly Vercel Cron run and an admin-only manual run.

## 3. Engine stall alerts

An authenticated Vercel Cron checks `engine_heartbeat` every five minutes.

- A heartbeat age of 15 minutes changes the monitor to `STALE` and sends one Telegram alert.
- Continued staleness does not repeat the alert.
- A new heartbeat changes the monitor to `HEALTHY` and sends one recovery alert.
- Persistent transition state lives in a service-role-only Supabase table.
- The monitor reads engine state only; it never starts, stops, or modifies `app.py`.

## 4. Device licensing shadow mode

Device policy becomes a three-state mode while retaining the existing `enabled` column for
backward compatibility:

- `OFF`: existing account-only behavior; no device decision is recorded.
- `SHADOW`: evaluate and record the decision, but always return indicator data.
- `ENFORCED`: retain the current device-token enforcement behavior.

Shadow events store only the license, product, outcome, and hourly bucket. They do not store
raw device IDs, device tokens, account tokens, or IP addresses. Events are deduplicated by
license/product/outcome/hour to limit volume.

The production policy remains `OFF` until replacement cTrader/MT4/MT5 binaries have been
compiled and smoke-tested on Windows. The admin UI exposes the safe modes and shadow counts,
but no automatic mode switch is permitted.

## Security and failure behavior

- Admin routes use server-side session authorization.
- Cron routes require `Authorization: Bearer <CRON_SECRET>`.
- Missing configuration fails closed for cron execution, not for indicator downloads.
- Telegram failures are reported by the route and retried on the next monitor transition check.
- All schema objects enable RLS and grant access only to `service_role`.
- No secrets or recoverable license tokens are logged.

## Verification

- Unit tests cover aggregation, monitor transitions, cron authentication, and all three device modes.
- Existing licensing tests remain green.
- Run duplicate checks, focused tests, the full test suite, and the Next.js production build.
- Apply migrations through Supabase tooling.
- Push isolated commits to `main` and verify Vercel READY with a build duration over 20 seconds.
