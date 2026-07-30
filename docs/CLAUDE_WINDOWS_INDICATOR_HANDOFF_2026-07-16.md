# Claude Windows Indicator Handoff - 2026-07-16

This is the source-of-truth handoff for finishing the Panda Dashboard Overlay release on the Windows machine.

## Read First

1. Read root `AGENTS.md` completely. Its locked rules override this handoff.
2. Work only in `C:\Users\Admin\Documents\Claude\Projects\Panda Engine`.
3. Use only `https://github.com/gian101310/panda-dashboar.git`, branch `main`.
4. Never use or deploy `assistant-server`.
5. Never edit the locked `extract_panda_score()` or `compute_scores_all_pairs()` functions in `app.py`.
6. Never start `app.py` from a shell. Start the Windows engine only through `START_PANDA.bat`.

Before editing:

```powershell
cd "C:\Users\Admin\Documents\Claude\Projects\Panda Engine"
git fetch origin
git status --short --branch
git pull --ff-only origin main
git log -5 --oneline
```

Preserve any unrelated Windows-only changes. Never force push.

## What Codex Completed And Deployed

Production is currently `READY` on `pandaengine.app` and `www.pandaengine.app`.

- `f65952b remove-unused-hermes-guardian-and-harden-security`
  - Removed the unused Hermes feed call from `app.py` without touching locked scoring.
  - Removed Hermes DB helpers/table and obsolete Hermes instruction files.
  - Removed Guardian/account-guardian pages, APIs, agent, autonomous launcher, `guardian-watchdog.bat`, package scripts, and Guardian-only tables.
  - Kept `lib/accountGuardian.mjs` and `lib/tradeExecutor.mjs` because current order execution still imports their risk gates.
  - Enabled RLS and removed anonymous/authenticated access on exposed/backend-only Supabase objects.
- `752aa0f fix-ea-result-idempotency`
  - Replaced the select-then-insert EA result race with an atomic ticket upsert through the shared server Supabase client.

Verified before deploy: 197/197 JavaScript tests, `python3.11 check_dupes.py`, Python compilation, `npx next build`, production route checks, and production Supabase security checks. The successful Vercel build took about 30.2 seconds.

Panda no longer uses Hermes. A separate inactive Vercel project called `hermes-mission-control` still exists because deleting an external project is a separate destructive infrastructure operation.

## Exact Open Indicator Work

The source code is device-ready, but the currently published Licensed binaries are not.

Commit `622cbcb add-automatic-device-credential-sources` changed the source after the current distributable files were compiled. Therefore, keep all production modes `OFF` until replacement binaries are built and tested.

The six editions are:

| Platform | Personal source | Licensed source | Replacement output |
|---|---|---|---|
| cTrader | `panda-indicators/2026-07-14/ctrader-dashboard-overlay/PandaDashboardOverlay-Personal/PandaDashboardOverlay-Personal/PandaDashboardOverlay.Personal.csproj` | `panda-indicators/2026-07-14/ctrader-dashboard-overlay/PandaDashboardOverlay-Licensed/PandaDashboardOverlay-Licensed/PandaDashboardOverlay.Licensed.csproj` | `dist/PandaDashboardOverlay-Personal.algo` and `dist/PandaDashboardOverlay-Licensed.algo` |
| MT4 | `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/mt4/PandaDashboardOverlayMT4-Personal.mq4` | `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/mt4/PandaDashboardOverlayMT4-Licensed.mq4` | `dist/PandaDashboardOverlayMT4-Personal.ex4` and `dist/PandaDashboardOverlayMT4-Licensed.ex4` |
| MT5 | `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/mt5/PandaDashboardOverlayMT5-Personal.mq5` | `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/mt5/PandaDashboardOverlayMT5-Licensed.mq5` | `dist/PandaDashboardOverlayMT5-Personal.ex5` and `dist/PandaDashboardOverlayMT5-Licensed.ex5` |

The cTrader projects link the shared Core and edition source automatically. The MT4/MT5 entry file and its matching `Core.mqh` must remain in the same source folder during compilation.

Personal artifacts are private operator files. Only these three Licensed artifacts are public downloads:

- `public/downloads/panda-dashboard-overlay-ctrader-licensed.algo`
- `public/downloads/panda-dashboard-overlay-mt4-licensed.ex4`
- `public/downloads/panda-dashboard-overlay-mt5-licensed.ex5`

Do not publish Personal binaries or embed any Personal token, Supabase key, service key, or engine secret.

## Windows Build Procedure

### 1. Confirm The Windows Engine Is Healthy

The hardened backend requires the Windows engine to use `SUPABASE_SERVICE_KEY`; an anon key can no longer write protected engine tables. Confirm the existing private environment also contains the expected `ENGINE_SECRET`. Do not print or commit either secret.

Start only by double-clicking `START_PANDA.bat` or launching that batch file from normal CMD. Do not start `uvicorn` or `app.py` directly.

Verify:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/status
```

Expected: `status` is `ACTIVE`, dashboard data is current, and production `engine_heartbeat` continues updating. `WATCH_PANDA.bat` is still the valid watcher. `guardian-watchdog.bat` was intentionally deleted.

### 2. Build cTrader Personal And Licensed

Use cTrader Algo on Windows and build each `.csproj` listed above. Export fresh `.algo` packages and replace the matching files in the cTrader `dist` folder.

Confirm both builds contain the latest linked Core source. The Licensed build must:

- read `Account.Number` automatically;
- create a random installation ID in device-scoped local storage;
- send `x-panda-device-id`;
- store and reuse the one-time `x-panda-device-token` returned by the server.

### 3. Build MT4 Personal And Licensed

Open the two MT4 entry `.mq4` files in MetaEditor 4 and compile each with zero errors. Replace the two `.ex4` files in `dist` and save updated compile logs.

For runtime testing, copy the chosen `.ex4` to `MQL4\Indicators`, refresh Navigator, and add exactly `https://pandaengine.app` under **Tools -> Options -> Expert Advisors -> Allow WebRequest for listed URL**.

The Licensed build must read `AccountNumber()` automatically and persist its generated installation ID/device token under MetaTrader `FILE_COMMON`.

### 4. Build MT5 Personal And Licensed

Open the two MT5 entry `.mq5` files in MetaEditor 5 and compile each with zero errors. Replace the two `.ex5` files in `dist` and save updated compile logs.

For runtime testing, copy the chosen `.ex5` to `MQL5\Indicators`, refresh Navigator, and allow the same exact WebRequest URL.

The Licensed build must read `ACCOUNT_LOGIN` automatically and persist its generated installation ID/device token under MetaTrader `FILE_COMMON`.

### 5. Replace Public Licensed Downloads

After each Licensed build passes its platform smoke test, copy that exact new artifact from `dist` to its matching path under `public/downloads`. Do not replace the public file with an untested build.

Regenerate both `dist/SHA256SUMS` files and verify them. Confirm each public Licensed file has the same SHA-256 hash as its tested `dist` source.

## Smoke Test Matrix

Test one platform at a time. For each platform, first create or reuse a paid, `APPROVED` test license in **Admin -> Indicator Licensing** using the actual numeric trading account. Broker identity is intentionally not required.

For every edition/platform verify:

- panel appears at bottom-left;
- panel is compact, draggable, minimizable, and remembers its location;
- Score, Bias, Box H4, Box H1, Panda Lines, XTF, update time, and connection state render correctly;
- the previously missing Box value is present;
- symbol suffix/prefix normalization works on a supported pair;
- `LIVE`, `STALE`, authorization/license errors, and unsupported-symbol states are sensible;
- attaching to several charts remains lightweight: shared feed refresh no more than once per 60 seconds rather than once per chart;
- no order placement or scoring logic exists in the overlay.

Personal-specific:

- Use **Admin -> Indicator Licensing -> Personal Overlay Token -> Reveal & Copy Active Token**.
- Do not rotate a valid token just because it was forgotten. Rotation invalidates the prior token on cTrader, MT4, and MT5.
- If the old token is hash-only, make one intentional rotation to create the encrypted recovery copy, then use Reveal & Copy afterward.

Licensed-specific while mode is `OFF`:

- account-approved data still works without a device token;
- wrong/unapproved account is rejected;
- pending, unpaid, disabled, and expired statuses remain correct.

## Safe Device Enforcement Rollout

Never change directly from `OFF` to `ENFORCED`.

For each platform independently:

1. Compile and locally smoke-test its new Licensed binary.
2. Replace the matching public download and verify its hash/download counter.
3. Keep the platform `OFF` while confirming normal account-number access.
4. Change only that platform to `SHADOW` in Admin.
5. Reattach/restart the new Licensed indicator. It should send an installation ID, receive a one-time device credential, store it, and remain `LIVE`.
6. Verify the device appears under the correct approved account, respects the configured 1-100 device limit, and reconnects without needing a customer token.
7. Review the SHADOW would-block counters. Resolve `DEVICE_ID_REQUIRED`, `DEVICE_AUTH_ERROR`, or unexpected limit events before continuing.
8. Test device revoke and reset. Confirm a reset permits clean reactivation.
9. Leave SHADOW running long enough to cover the real installations. Then enable `ENFORCED` for only that tested platform.
10. Monitor indicator activity, customer access, and Telegram/admin alerts. Roll back that platform to `SHADOW` or `OFF` immediately if legitimate users are blocked.

Repeat separately for cTrader, MT4, and MT5. One platform passing does not authorize enabling the others.

## Website And Admin Acceptance Checks

- The three Licensed downloads remain visible on the website and still increment their per-product download counters.
- Public activation request instructions ask for the trading account number and platform.
- New requests appear in `/admin/pf-approvals` and send the configured Telegram admin alert.
- Approval/account history remains visible after approval.
- Admin can edit price/payment link, approve/disable/expire licenses, set device count, revoke/reset devices, inspect activity, and change OFF/SHADOW/ENFORCED per platform.
- Personal token reveal/copy remains admin-only and plaintext never appears in logs.

## Required Verification Before Push

Follow the root `AGENTS.md` order. At minimum:

```powershell
py -3.11 check_dupes.py
npx next build
git status --short
```

Also run the JavaScript test suite, verify all six platform builds have zero errors, verify checksums, and visually confirm `package.json`, `package-lock.json`, `vercel.json`, and `next.config.js` are not staged for deletion.

Use small descriptive kebab-case commits. Push only `origin main`. Verify the resulting Vercel deployment is `READY` and took more than 20 seconds. Never force push.

## Definition Of Done

The Windows indicator release is done only when:

- all six current sources compile cleanly;
- Personal and Licensed smoke tests pass on their real platforms;
- the three tested Licensed artifacts replace the public downloads;
- checksums and compile logs match those artifacts;
- SHADOW confirms automatic device activation and reconnection without customer tokens;
- no legitimate approved account would be blocked;
- enforcement is enabled only platform-by-platform after the above evidence;
- the commit is pushed to the correct repo and production is verified READY.
