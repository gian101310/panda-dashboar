# cTrader, MT4, and MT5 Dashboard Overlay Handoff

**Updated:** 2026-07-15

**Repository:** `gian101310/panda-dashboar`, branch `main`

## Release artifacts

- `/Users/gianfx/panda-dashboar/panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/dist/PandaDashboardOverlayMT4-Personal.ex4`
  - SHA-256: `91ffd49396a2e91088af6680c6bf2bf0ef802916f819fa590b8774a0314601a8`
- `/Users/gianfx/panda-dashboar/panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/dist/PandaDashboardOverlayMT4-Licensed.ex4`
  - SHA-256: `bb6c70617b8a93963eecd107a2e8eb94d7a16dd42cb5853517db9495a75b234a`
- `/Users/gianfx/panda-dashboar/panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/dist/PandaDashboardOverlayMT5-Personal.ex5`
  - SHA-256: `d0eded99d4573d610364eccd5ba9dd4c20b005d3e40997120ca9154a05b8de68`
- `/Users/gianfx/panda-dashboar/panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/dist/PandaDashboardOverlayMT5-Licensed.ex5`
  - SHA-256: `17b26017894578d825c001397304f10bc343199780885c802696fce1f96a6a5e`

The `dist/` folder also contains one zero-error/zero-warning MetaEditor compile log per artifact and `SHA256SUMS`.

## Panda Engine wiring

| Platform | Fixed route | Licensed product code | Runtime account source |
|---|---|---|---|
| MT4 | `/api/mt4-overlay` | `mt4_dashboard_overlay` | `AccountNumber()` |
| MT5 | `/api/mt5-overlay` | `mt5_dashboard_overlay` | `AccountInfoInteger(ACCOUNT_LOGIN)` |

The server route fixes the product code. A client cannot select another licensed product in a request. Both routes return the same sanitized schema-version-1 snapshot used by the cTrader display and never return dashboard rows to an unauthorized request.

## Personal workflow

One operator token serves cTrader, MT4, and MT5 Personal editions.

1. In Admin → Indicator Licensing click **Generate, Activate & Copy**.
2. Wait for the verified active state.
3. Paste the same value into each Personal indicator's Operator Token input.
4. Later use **Reveal & Copy Active Token**; no memorizing or regeneration is needed.

Rotation invalidates the previous token immediately across all Personal platforms. Feed authorization continues to use `token_hash`. After the 2026-07-15 migration, the one active token is also stored with AES-256-GCM encryption so an authenticated admin can use **Reveal & Copy Active Token** later. The reveal value stays only in browser component memory and clears after 60 seconds. Rotation history contains only timestamp, administrator, and a 12-character fingerprint; old token values are not recoverable.

An existing hash-only token continues working. Admin displays **Recovery requires one rotation** until Boss-G intentionally rotates it; deployment never rotates the active token automatically.

## Licensed workflow

Create or edit a license in Admin → Indicator Licensing:

1. Select `Panda MT4 Dashboard Overlay` or `Panda MT5 Dashboard Overlay`.
2. Enter the numeric trading account number. Broker identity is not required.
3. Confirm payment.
4. Approve the license.

MT4 and MT5 approvals are independent. The server enforces `PENDING`, `APPROVED`, `DISABLED`, `EXPIRED`, payment-pending, and unknown-account states. The compiled Licensed editions expose neither an Operator Token nor an editable account number.

Set **Device Limit** from 1 to 100 on the license row. **Manage Devices** shows only a short fingerprint, platform, status, activation time, and last-seen time. Admin can revoke one installation or reset all installations. Device tokens are generated and stored automatically by the indicator; Boss-G never sends them to customers.

## Device-enforcement rollout boundary

The production schema, API, and admin controls are live, but all three `indicator_device_enforcement` rows intentionally remain `false`. The public `.algo`, `.ex4`, and `.ex5` downloads listed above are the previously verified account-only binaries and continue to work.

Device-ready source is committed for cTrader, MT4, and MT5. Before enabling a platform:

1. Compile the matching Licensed source on cTrader/MetaEditor for Windows with zero errors and warnings.
2. Attach it to an approved account and confirm first-device activation and a second synchronized request.
3. Replace only that platform's public Licensed artifact and update its checksum.
4. Confirm the download returns the new artifact.
5. Enable that platform under **Admin → Indicator Licensing → Device Enforcement**.

Never enable a platform while its old binary is still public; old binaries do not send the new device headers.

## Public download and activation flow

Only the three compiled Licensed overlays are public. Personal builds and sources are never placed in `public/downloads/`.

1. The customer visits the Panda Engine landing page and selects cTrader, MT4, or MT5.
2. The customer clicks **Download Licensed** and installs or imports the matching compiled file.
3. The customer clicks **Request Activation** and submits a name, contact method, platform-specific runtime trading account number, and optional Telegram username.
4. Panda Engine creates a `PENDING` license request and alerts Boss-G on Telegram with the correct platform/account label.
5. Boss-G opens `/admin/license`, confirms payment when applicable, and approves the request.
6. The installed indicator activates during its next synchronization.

Price, currency, description, visibility, sort order, and HTTPS payment link are edited at `/admin/pricing`. A zero price appears publicly as **Contact for price**. System indicator products may be hidden but cannot be deleted.

Admin download cards show **downloads recorded** per indicator plus recent platform/timestamp activity. These are download-button activations, not unique customers. Download telemetry stores no IP address, account number, contact detail, or token.

## Installation requirement

Every terminal must allow `https://pandaengine.app` under **Tools → Options → Expert Advisors → Allow WebRequest for listed URL**. Without it, the panel displays `ALLOW WEBREQUEST`.

## Performance model

The UI timer runs once per second, while HTTP attempts are limited to once per 60 seconds. Indicator instances in one terminal share:

- a sanitized snapshot in the MetaTrader common-files area;
- a credential-scoped cache identity that never contains the plaintext token;
- a terminal global-variable request lock with a 15-second abandonment timeout;
- a last-attempt timestamp that also throttles failures.

This lets the overlay be attached to many charts without creating one HTTP request per chart. `OnCalculate()` performs no network or trading work.

## Future indicator release pattern

Use this same structure for future Panda indicators:

1. Create separate Personal and Licensed entry files; never add a user-switchable authentication mode.
2. Give each commercial platform/product a fixed server-side route identity.
3. Personal sends the rotatable operator token only in an HTTPS header.
4. Licensed reads the numeric trading account directly from the terminal runtime.
5. Return only a purpose-built sanitized feed; never connect a client directly to Supabase.
6. Share parsing, UI, caching, throttling, and error handling in a platform core.
7. Keep `OnCalculate()` informational and free of network or order operations.
8. Write failing API, product, and source-contract tests before implementation.
9. Compile every customer artifact with the target MetaEditor and require zero errors.
10. Publish SHA-256 checksums, installation steps, license steps, and status troubleshooting.
11. Run `check_dupes.py`, the complete Node test suite, and `npx next build` before pushing.
12. Push only `main` in `gian101310/panda-dashboar` and verify Vercel target production reaches READY after more than 20 seconds.

## Protected engine boundaries

The overlays display the existing dashboard snapshot. They do not modify or reproduce `extract_panda_score()`, `compute_scores_all_pairs()`, BB logic, INTRA logic, or any trade-execution behavior.
