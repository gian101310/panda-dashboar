# Personal Token Recovery, Automatic Device Licensing, and Indicator Store Design

**Date:** 2026-07-15  
**Status:** Approved architecture; written specification pending operator review  
**Repository:** `gian101310/panda-dashboar` / `main`

## Objective

Deliver three related outcomes without mixing the Personal and Licensed indicator security models:

1. Repair the Personal-token workflow so Boss-G can rotate a forgotten token once and recover it securely later.
2. Add automatic, per-device licensing for customer cTrader, MT4, and MT5 indicators while letting admin control the allowed device count for each license.
3. Restore the three overlay products to the public website and wire their price, currency, payment link, description, and visibility to Pricing admin.

The locked scoring engine and trading strategy definitions are out of scope.

## Current-State Findings

- The production Personal token record was last rotated on 2026-07-14 and contains only a hash. It cannot be recovered.
- The admin screen currently separates `GENERATE TOKEN`, `COPY TOKEN`, and `ROTATE TOKEN`. Generating and copying creates a browser-only candidate; it does not activate that value on the server. This explains why a newly generated and pasted token was rejected.
- Encrypted token recovery is deployed and configured, but it becomes usable only after one successful post-deployment rotation.
- Licensed cTrader, MT4, and MT5 files are already public and authenticate by approved trading account number.
- `store_products` is empty. Pricing admin can edit products, but the three system overlay products are absent, so the public Pricing page has no indicator store cards.
- The home-page overlay cards use static product labels rather than the values managed in Pricing admin.

## Chosen Architecture

### 1. Personal Edition: One-Click Rotation and Encrypted Recovery

Personal indicators remain private and token-based. They do not use customer account licensing or device limits.

The admin workflow becomes:

1. Click `GENERATE, ACTIVATE & COPY`.
2. Confirm that the previous Personal token will stop working immediately.
3. The browser generates a cryptographically secure 64-character token.
4. Admin sends the token to the authenticated token-rotation API.
5. The API stores the SHA-256 hash for indicator authentication and an AES-256-GCM encrypted copy for admin-only recovery.
6. The API reads the record back and verifies that the stored hash matches before returning success.
7. Only after verified activation does the browser copy the token and show it temporarily.
8. The visible value clears from browser memory after 60 seconds.

Future recovery uses the existing `REVEAL & COPY ACTIVE TOKEN` action. The decrypted value is returned only to an authenticated admin with `private, no-store` caching and is cleared from the page after 60 seconds.

The UI must not say that a token is active after generation alone. If clipboard access fails, the already activated token stays temporarily visible so Boss-G can copy it manually.

### 2. Licensed Edition: Automatic Device Tokens

Licensed indicators remain account-based customer products. Each license is scoped to one product/platform/account combination and gains an admin-controlled `device_limit`.

The customer never receives or types a device token.

#### First activation

1. The compiled Licensed indicator reads the runtime trading account number automatically.
2. It loads or creates a random installation ID in persistent terminal/device storage.
3. It calls the fixed platform feed route with the account number and installation ID.
4. The server verifies that the matching license is `APPROVED`, paid, unexpired, and not disabled.
5. The server checks for an existing active device bound to that installation ID.
6. If none exists and the active-device count is below `device_limit`, the server creates a cryptographically secure device token, stores only its hash, and returns the raw value once.
7. The indicator stores the returned device token in the same persistent device storage.
8. The feed response includes the normal sanitized dashboard snapshot.

#### Later requests

Every later feed request includes:

- the runtime trading account number;
- the persistent installation ID;
- the device token.

The server requires all three values to match the active device record. It updates `last_seen_at` with rate limiting so normal one-minute refreshes do not create excessive writes.

#### Device storage

- cTrader uses a random installation identifier and token stored with device-level `LocalStorage`.
- MT4 and MT5 use a small platform/account/product-specific record under `FILE_COMMON`, allowing all charts on the same terminal installation to reuse one activation.
- The identifier is random and application-specific. No hardware serial number, MAC address, hostname, broker name, or operating-system fingerprint is collected.
- Reinstalling the terminal or clearing persistent storage may create a new device and consume a new slot. Admin can revoke the stale device first.

#### Device-limit behavior

- Admin chooses the allowed count per license from `1` through `100`. Default: `1`.
- Admin may raise the limit at any time.
- Admin may lower the limit only when the new value is not below the current active-device count. Devices must be explicitly revoked first; the system never chooses devices to revoke silently.
- When the limit is reached, the indicator shows `DEVICE LIMIT REACHED` and returns no pair data.
- Revoking one device invalidates only that device token.
- `RESET DEVICES` revokes every device for that license but preserves the license itself. New installations can then register up to the configured limit.
- Disabling, expiring, or deleting the parent license denies every associated device immediately.

#### Concurrency and token security

Device registration must be atomic. Two simultaneous first-run requests must not exceed the configured limit. A service-role-only database operation locks the license row, checks the count, and creates at most one record for a license/installation pair.

Raw device tokens are returned once and never stored in the database or admin UI. Only SHA-256 hashes and short non-secret fingerprints are retained. Constant-time comparison is used during authentication.

### 3. Admin Licensing Controls

Each license row gains:

- `DEVICE LIMIT` numeric control;
- active-device count;
- `MANAGE DEVICES` action.

The device manager shows:

- platform and product;
- short device fingerprint;
- activation time;
- last connection time;
- status (`ACTIVE` or `REVOKED`);
- `REVOKE` action.

It also provides `RESET DEVICES`. No raw device token or raw installation ID is displayed.

### 4. Public Store and Pricing Admin

The following protected system products are restored in `store_products` using their existing product codes:

- `ctrader_dashboard_overlay`
- `mt4_dashboard_overlay`
- `mt5_dashboard_overlay`

The seed is idempotent and does not overwrite prices or links already set by admin.

For these three system products:

- Pricing admin can edit name, description, price, currency, payment link, sort order, and active visibility.
- Pricing admin cannot permanently delete them. It can hide them by turning `LIVE` off.
- Server validation accepts only non-negative prices and empty or HTTPS payment links.
- The product code and platform remain fixed so pricing cannot become detached from licensing.

The public home page and `/pricing` both consume `/api/pricing` and match products by code:

- price and currency come from Pricing admin;
- payment links produce a `BUY NOW` button when configured;
- a missing link leaves the activation-request flow available;
- a zero/unset price displays `CONTACT FOR PRICE`, never `$0`;
- cards cover cTrader, MT4, and MT5 rather than MetaTrader only;
- the tracked Licensed download and account-approval request remain available.

The user flow is:

1. Select the platform product.
2. Open the configured payment link when available.
3. Download the Licensed file.
4. Submit the runtime trading account number for approval.
5. Admin confirms payment, approves the account, and chooses the device limit.
6. The indicator registers devices automatically up to that limit.

## Data Model

### `indicator_licenses`

Add:

- `device_limit integer not null default 1` with a `1 <= device_limit <= 100` check;

The license remains the authority for product, platform, account, approval, payment, expiry, and enabled status.

### `indicator_license_devices`

Create a service-role-only table containing:

- `id`
- `license_id`
- `product_code`
- `platform`
- `device_id_hash`
- `device_token_hash`
- `device_fingerprint`
- `status`
- `activated_at`
- `last_seen_at`
- `revoked_at`
- `created_at`
- `updated_at`

Constraints include a partial unique index for one active record per license/device identifier and checks for valid platform/status values. RLS is enabled. Access is denied to `anon` and `authenticated`; server routes use the shared service-role client.

### `indicator_device_enforcement`

Create a service-role-only policy table with one fixed row per overlay product:

- `product_code`
- `enabled boolean not null default false`
- `updated_by`
- `updated_at`

License admin exposes the three enforcement switches. The API permits legacy account-only requests only while the matching product switch is off. The switch cannot be enabled accidentally from the public pricing API.

Atomic device registration uses a `SECURITY INVOKER` database function with an empty `search_path`, explicit schema qualification, and execute permission granted only to `service_role`. The function locks the parent license row before checking and consuming a device slot.

### Store products

No new pricing table is required. The existing `store_products` table remains the single source for public product prices and payment links. The migration restores only missing system rows.

## API Behavior

### Personal token admin API

- `PUT /api/admin/indicator-feed-token`: rotates, persists, rereads, and verifies the Personal token before success.
- `POST /api/admin/indicator-feed-token` with `action: reveal`: unchanged admin-only recovery behavior.
- Responses never include the hash, encryption fields, or plaintext token from the server-side rotation operation.

### Licensed feed routes

- `/api/ctrader-overlay`
- `/api/mt4-overlay`
- `/api/mt5-overlay`

The platform remains fixed by route; clients cannot select another platform or product through a parameter.

New Licensed requests use dedicated headers for account number, installation ID, and device token. Personal requests continue to use only the Personal operator-token header. A request cannot mix Personal and Licensed credential types.

Denials return a small status payload with no pair rows, including:

- `PENDING`
- `PAYMENT_PENDING`
- `DISABLED`
- `EXPIRED`
- `DEVICE_LIMIT_REACHED`
- `DEVICE_REVOKED`
- `DEVICE_AUTH_ERROR`

### Admin license API

Admin-only operations add:

- update device limit;
- list devices for a license;
- revoke a selected device;
- reset all devices.

The server derives admin authority from the authenticated session, never from the request body.

## Compatibility and Rollout

The current public Licensed binaries send only an account number. Enforcing device tokens before replacement binaries are compiled would break them.

Rollout therefore occurs in this order:

1. Deploy the schema, APIs, Personal-token fix, Pricing admin wiring, website cards, admin device controls, and updated indicator source.
2. Keep legacy account-only feed access enabled during artifact preparation.
3. Compile and test new Licensed artifacts on Windows using cTrader and MetaEditor. This Mac workspace does not contain those compilers.
4. Publish the verified replacement `.algo`, `.ex4`, and `.ex5` artifacts and checksums.
5. Enable device enforcement per platform only after its replacement artifact is live and smoke-tested.

The transition control is server-side and admin-only. Personal binaries are unaffected.

## Error Handling and Observability

- A failed Personal-token save or read-back verification leaves the candidate visible and clearly reports that it was not activated.
- Device-registration failures do not create partial device records.
- Device-limit and license denials never return dashboard pair data.
- Token values, hashes, encryption material, account credentials, and raw installation identifiers are not logged.
- Admin may view short fingerprints, device counts, activation times, last-seen times, and denial statuses.
- Download telemetry continues to count only allowlisted products and stores no visitor identity.

## Testing Strategy

Implementation follows test-first development.

Automated tests cover:

- Personal generation does not claim activation before the verified server response;
- one-click Personal rotation activates and copies only after success;
- failed rotation leaves a copyable candidate and reports failure;
- encrypted recovery remains admin-only and no-store;
- device registration within the limit;
- repeat registration reuses the existing device;
- concurrent registration cannot exceed the limit;
- valid and invalid device-token authentication;
- revoked devices and disabled/expired/unpaid licenses;
- limit reduction protection and device reset;
- no pair data in denial responses;
- platform-fixed routes and credential separation;
- persistent-device behavior in cTrader, MT4, and MT5 source checks;
- system store-product restoration and deletion protection;
- Pricing admin validation and public price/link mapping;
- absence of Personal artifacts from public downloads.

Verification before deployment includes:

- focused Node tests;
- SQL migration tests and Supabase security advisors;
- `python3 check_dupes.py` on this Mac;
- `npx next build`;
- compiled-artifact checksums;
- live feed, download, pricing, admin-auth, and device-limit smoke tests;
- Vercel production state `READY` with build duration greater than 20 seconds.

## Out of Scope

- Broker-name licensing.
- Hardware fingerprint collection.
- Customer login accounts or a customer license portal.
- Automatic payment confirmation or payment-provider webhooks.
- Changes to scoring, BB, INTRA, TBG, or dashboard market calculations.

## Success Criteria

- Boss-G can perform one deliberate Personal-token rotation and subsequently recover/copy that token without remembering it.
- Generating a Personal token can no longer be mistaken for activating it.
- Customer Licensed indicators register and authenticate devices automatically without admin sending tokens.
- Admin controls the allowed device count independently for every license and can revoke/reset devices.
- Sharing a Licensed file with a different trading account does not authorize it.
- The three platform products are visible on the website and editable from Pricing admin.
- Deleting a protected system product can no longer silently remove the corresponding store card.
