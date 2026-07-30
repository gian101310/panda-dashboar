# Codex Handoff

Latest entries first. Keep this short so Claude can read it before work.

## 2026-07-16 - Security Cleanup And Windows Indicator Release

- Commits already deployed: `f65952b remove-unused-hermes-guardian-and-harden-security`, `752aa0f fix-ea-result-idempotency`
- Repo: `gian101310/panda-dashboar`, branch `main`
- Vercel deployment: `dpl_C7nUowKgBZ2VzNt9KzZ216HsuEND`
- Production status: `READY` on `pandaengine.app` and `www.pandaengine.app`
- Build duration: about 30.2 seconds

Completed:

- Removed the unused Hermes runtime integration, Hermes database table/helpers, and obsolete Hermes handoff documents.
- Removed the Guardian/account-guardian pages, APIs, autonomous agent/launcher, watchdog batch file, and Guardian-only database tables.
- Preserved `lib/accountGuardian.mjs` and `lib/tradeExecutor.mjs` because active order-execution tools still use their risk gates; these are not the deleted Guardian product UI.
- Hardened `pf_waitlist` and `shadow_tracker` with RLS and removed anonymous/authenticated access from backend-only tables and RPCs.
- Changed EA result ingestion to a shared server client plus atomic ticket upsert, removing the historical duplicate-ticket error loop.
- Verified 197/197 JavaScript tests, `check_dupes.py`, Python compilation, Next build, production routes, and the live Supabase security state.

Important remaining Windows release:

- The July 14 cTrader/MT4/MT5 Licensed downloads were compiled **before** commit `622cbcb add-automatic-device-credential-sources`.
- Device-ready source exists, but replacement `.algo`, `.ex4`, and `.ex5` files must be rebuilt and smoke-tested on Windows before device enforcement is enabled.
- Production device mode remains `OFF` for all three platforms. Do not jump directly to `ENFORCED`.
- Full Windows procedure, source/output matrix, rollout order, and acceptance checks: `docs/CLAUDE_WINDOWS_INDICATOR_HANDOFF_2026-07-16.md`.

Infrastructure note:

- Panda no longer calls Hermes. The separate inactive Vercel project named `hermes-mission-control` was not deleted as part of the code cleanup; deleting that external project is a separate destructive infrastructure action.

## 2026-06-17 - Login And Security Alert Routing

- Commit: `48cfc1b fix-login-security-alert-routing`
- Repo: `gian101310/panda-dashboar`, branch `main`
- Vercel deployment: `dpl_21rk6UZ9TG8eGybf66HEqS3QDMkv`
- Production status: `READY` on `pandaengine.app` and `www.pandaengine.app`
- Build duration: about 27.6 seconds

Changed:

- `lib/securityAlert.mjs`
- `pages/api/pf-log-event.js`
- `tests/loginAlert.test.mjs`
- `tests/securityAlert.test.mjs`

Result:

- Login/security alerts now use `PF_APPROVE_BOT_TOKEN` plus `PF_ADMIN_CHAT`.
- New signup alerts remain on `PF_BOT_TOKEN` plus `PF_ADMIN_CHAT`.
- Boss-G confirmed login alert works after deployment.

Verified:

- `node --test tests\loginAlert.test.mjs tests\securityAlert.test.mjs` - passed 7/7
- `py -3.11 check_dupes.py` - passed
- `npx next build` - passed locally
- Vercel production deployment - `READY`

Not intentionally pushed:

- `SKILL_v2.md`
- `.gitignore`
- `snapshot.png`
- `watch_panda.log`

## Current Local Notes

- `SKILL_v2.md` is a Claude/project skill handoff file from Boss-G.
- Codex copied `SKILL_v2.md` into `C:\Users\Admin\.codex\AGENTS.md` as a personal minimal handoff.
- Codex also created personal skills:
  - `C:\Users\Admin\.codex\skills\panda-engine-guardrails`
  - `C:\Users\Admin\.codex\skills\panda-multi-agent-coordination`
- These personal Codex files are not part of the Panda repo.

## Standard Handoff Template

Use this for future Codex entries:

```md
## YYYY-MM-DD - short-title

- Commit:
- Deployment:
- Files changed:
- Result:
- Verified:
- Not staged / not pushed:
- Blockers:
```
