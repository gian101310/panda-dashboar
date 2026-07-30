# Personal Token, Device Licensing, and Indicator Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair Boss-G's Personal token workflow, add automatic server-issued device tokens with admin-controlled device limits to Licensed cTrader/MT4/MT5 overlays, and restore all three products to the website with Pricing admin as the source of price and payment-link data.

**Architecture:** Personal indicators keep one shared recoverable operator token and gain a verified one-click rotation UI. Licensed indicators remain account-bound, create a random local installation ID, and automatically receive a hashed server-side device token up to the license's device limit. Store products use their existing product codes so the public home and Pricing pages can merge commercial data with fixed download/licensing metadata.

**Tech Stack:** Next.js 14 Pages Router, React inline styles, Node.js ES modules and `node:test`, Supabase/Postgres with RLS, C# cTrader indicator source, MQL4/MQL5 indicator source, Vercel production deployment.

## Global Constraints

- Work only in `/Users/gianfx/panda-dashboar`, repository `gian101310/panda-dashboar`, branch `main`.
- Never modify `extract_panda_score()`, `compute_scores_all_pairs()`, BB/INTRA definitions, or `vercel.json` `ignoreCommand`.
- Never delete `package.json`, `package-lock.json`, `vercel.json`, or `next.config.js`.
- Preserve untracked `.superpowers/`, `CLAUDE.md`, and `package-lock.json`.
- All database access uses the shared server client from `lib/supabase`; no service key or token enters client code.
- Personal artifacts remain private. Only compiled Licensed artifacts may be published.
- Device limits are integers from 1 through 100, defaulting to 1.
- Raw Personal and device tokens must never be logged. Raw device tokens are returned once and stored only on the customer's device.
- Legacy account-only access stays enabled for a platform until its replacement Licensed binary is compiled, published, and smoke-tested.
- New cTrader and MetaTrader binaries require Windows cTrader/MetaEditor compilation; do not replace live artifacts with uncompiled source.
- Every production behavior change follows red-green TDD, `python3 check_dupes.py`, `npx next build`, a kebab-case commit, push to `origin main`, and Vercel READY verification over 20 seconds.

---

### Task 1: Verified One-Click Personal Token Rotation

**Files:**
- Modify: `lib/indicatorFeedAdminHandler.mjs`
- Modify: `pages/admin/license.js`
- Modify: `tests/indicatorFeedAdmin.test.mjs`
- Modify: `tests/indicatorTokenGenerator.test.mjs`
- Modify: `tests/indicatorLicenseAdminUi.test.mjs`

**Interfaces:**
- Consumes: `hashOverlayToken(token)`, `generateIndicatorToken()`, existing `getSetting()` and `saveSetting()` dependencies.
- Produces: `PUT /api/admin/indicator-feed-token` response `{ ok, configured, recoverable, verified, rotated_at }` and one UI action named `GENERATE, ACTIVATE & COPY`.

- [ ] **Step 1: Write the failing read-back verification tests**

Add tests that save a candidate, return the saved record from `getSetting()`, and require `verified: true`. Add a mismatch test that expects status 503 and no success claim:

```js
test('verifies the persisted token hash before reporting rotation success', async () => {
  let stored = null;
  const handler = createIndicatorFeedAdminHandler({
    requireAdmin: async () => ({ username: 'Boss-G' }),
    getSetting: async () => stored,
    saveSetting: async (row) => { stored = row; },
    encryptToken: async () => ({ token_ciphertext: 'c', token_iv: 'i', token_auth_tag: 'a' }),
  });
  const res = await invoke(handler, { method: 'PUT', body: { token: 'x'.repeat(64) } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.verified, true);
});

test('does not report activation when the persisted hash cannot be verified', async () => {
  const handler = createIndicatorFeedAdminHandler({
    requireAdmin: async () => ({ username: 'Boss-G' }),
    getSetting: async () => ({ token_hash: '0'.repeat(64) }),
    saveSetting: async () => {},
    encryptToken: async () => ({ token_ciphertext: 'c', token_iv: 'i', token_auth_tag: 'a' }),
  });
  const res = await invoke(handler, { method: 'PUT', body: { token: 'x'.repeat(64) } });
  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /not be verified/i);
});
```

- [ ] **Step 2: Write the failing UI-source tests**

Require one handler that generates locally, asks for confirmation, sends PUT, checks `data.verified`, copies only after success, retains the activated candidate for manual copy, and clears it after 60 seconds. Require removal of the misleading standalone generate/copy/rotate sequence.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
node --test tests/indicatorFeedAdmin.test.mjs tests/indicatorTokenGenerator.test.mjs tests/indicatorLicenseAdminUi.test.mjs
```

Expected: failures for missing `verified` response and missing `GENERATE, ACTIVATE & COPY` flow.

- [ ] **Step 4: Implement verified rotation**

After `saveSetting`, call `getSetting()` and compare the stored hash with the candidate hash using `safeTokenEqual`. Return 503 on mismatch. In `pages/admin/license.js`, replace the three-step controls with:

```js
async function generateActivateAndCopyOperatorToken() {
  if (!confirm('Activate a new Personal token? The previous token will stop working immediately.')) return;
  const candidate = generateIndicatorToken();
  setNewToken(candidate);
  const res = await fetch('/api/admin/indicator-feed-token', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: candidate }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.verified !== true) {
    setError(data.error || 'Token was not activated');
    return;
  }
  setRevealedToken(candidate);
  try { await navigator.clipboard.writeText(candidate); }
  catch { setError('Token is active. Copy the visible value manually.'); }
  await load();
  clearTimeout(revealTimerRef.current);
  revealTimerRef.current = setTimeout(() => { setNewToken(''); setRevealedToken(''); }, 60000);
}
```

- [ ] **Step 5: Run tests and verify GREEN**

Run the Task 1 test command. Expected: all tests pass with zero failures.

- [ ] **Step 6: Commit**

```bash
git add lib/indicatorFeedAdminHandler.mjs pages/admin/license.js tests/indicatorFeedAdmin.test.mjs tests/indicatorTokenGenerator.test.mjs tests/indicatorLicenseAdminUi.test.mjs
git commit -m "fix-personal-token-activation-flow"
```

---

### Task 2: Device Licensing Schema, Atomic Registration, and Store Restoration

**Files:**
- Create: `supabase/indicator_device_licensing.sql`
- Create: `tests/indicatorDeviceLicensingSql.test.mjs`

**Interfaces:**
- Produces: `indicator_licenses.device_limit`, `indicator_license_devices`, `indicator_device_enforcement`, protected store rows, and RPC `register_indicator_device(...) returns text`.

- [ ] **Step 1: Write the failing SQL contract test**

Read the migration text and assert all required controls:

```js
test('device licensing migration is bounded, private, atomic, and idempotent', () => {
  assert.match(sql, /device_limit integer not null default 1/i);
  assert.match(sql, /device_limit between 1 and 100/i);
  assert.match(sql, /create table if not exists public\.indicator_license_devices/i);
  assert.match(sql, /create table if not exists public\.indicator_device_enforcement/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all .* from anon, authenticated/is);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /grant execute .* to service_role/is);
  assert.match(sql, /on conflict \(code\) do nothing/i);
});
```

- [ ] **Step 2: Run the SQL test and verify RED**

Run `node --test tests/indicatorDeviceLicensingSql.test.mjs`.

Expected: failure because the migration does not exist.

- [ ] **Step 3: Write the migration**

The migration must:

```sql
alter table public.indicator_licenses
  add column if not exists device_limit integer not null default 1;
alter table public.indicator_licenses
  drop constraint if exists indicator_licenses_device_limit_check;
alter table public.indicator_licenses
  add constraint indicator_licenses_device_limit_check check (device_limit between 1 and 100);

create table if not exists public.indicator_license_devices (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.indicator_licenses(id) on delete cascade,
  product_code text not null,
  platform text not null check (platform in ('CTRADER','MT4','MT5')),
  device_id_hash text not null check (length(device_id_hash) = 64),
  device_token_hash text not null check (length(device_token_hash) = 64),
  device_fingerprint text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED')),
  activated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists indicator_license_devices_active_unique
  on public.indicator_license_devices (license_id, device_id_hash) where status = 'ACTIVE';

create table if not exists public.indicator_device_enforcement (
  product_code text primary key,
  enabled boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now()
);
```

Enable RLS, add service-role-only policies/grants, seed three enforcement rows as false, seed the three `store_products` rows with price `0`, HTTPS link `null`, category `indicator`, and `ON CONFLICT (code) DO NOTHING`. Create a `SECURITY INVOKER`, empty-search-path RPC that locks the license row, rechecks approval/payment/expiry/platform/product, refreshes the token hash for an existing active installation, rejects a full limit, or inserts one device.

- [ ] **Step 4: Run the SQL test and verify GREEN**

Run `node --test tests/indicatorDeviceLicensingSql.test.mjs`. Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/indicator_device_licensing.sql tests/indicatorDeviceLicensingSql.test.mjs
git commit -m "add-indicator-device-licensing-schema"
```

---

### Task 3: Device Credential Service

**Files:**
- Create: `lib/indicatorDeviceAccess.mjs`
- Create: `tests/indicatorDeviceAccess.test.mjs`

**Interfaces:**
- Produces: `createIndicatorDeviceAccess(dependencies)` returning `authorize({ license, productCode, platform, deviceId, deviceToken })`.
- Returns: `{ ok, status, issuedToken? }` without dashboard rows.

- [ ] **Step 1: Write failing behavior tests**

Cover invalid installation IDs, first registration, existing valid token, wrong token, revoked device, full limit, and enforcement-off legacy access. Use deterministic random bytes and real SHA-256 comparison:

```js
test('automatically issues a token for the first allowed device', async () => {
  const access = createIndicatorDeviceAccess({
    getEnforcement: async () => true,
    getDevice: async () => null,
    registerDevice: async (row) => ({ status: 'CREATED', row }),
    randomBytesImpl: () => Buffer.alloc(32, 7),
  });
  const result = await access.authorize({
    license: approvedLicense({ device_limit: 2 }),
    productCode: 'mt5_dashboard_overlay', platform: 'MT5',
    deviceId: '9f17989d-0d75-4d4d-9337-63fc35dd5db2', deviceToken: '',
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'DEVICE_ACTIVATED');
  assert.match(result.issuedToken, /^[a-f0-9]{64}$/);
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --test tests/indicatorDeviceAccess.test.mjs`.

Expected: module-not-found failure.

- [ ] **Step 3: Implement the credential service**

Export strict normalizers for the random installation ID, SHA-256 hashing, a 12-character display fingerprint, token generation from 32 secure bytes, and constant-time hash comparison. Behavior:

```js
if (!enforcementEnabled) return { ok: true, status: 'LEGACY_APPROVED' };
if (!normalizedDeviceId) return { ok: false, status: 'DEVICE_ID_REQUIRED' };
if (!deviceToken) return registerFirstDevice();
if (!device || device.status !== 'ACTIVE') return { ok: false, status: 'DEVICE_REVOKED' };
if (!safeHashEqual(hashDeviceValue(deviceToken), device.device_token_hash)) {
  return { ok: false, status: 'DEVICE_AUTH_ERROR' };
}
await touchDeviceIfStale(device);
return { ok: true, status: 'DEVICE_APPROVED' };
```

- [ ] **Step 4: Run and verify GREEN**

Run the Task 3 test command. Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/indicatorDeviceAccess.mjs tests/indicatorDeviceAccess.test.mjs
git commit -m "add-automatic-device-credential-service"
```

---

### Task 4: Integrate Device Authentication into Fixed Platform Feeds

**Files:**
- Modify: `lib/ctraderOverlayHandler.mjs`
- Modify: `lib/metatraderOverlayHandler.mjs`
- Modify: `pages/api/ctrader-overlay.js`
- Modify: `pages/api/mt4-overlay.js`
- Modify: `pages/api/mt5-overlay.js`
- Modify: `tests/ctraderOverlayApi.test.mjs`
- Modify: `tests/metatraderOverlayApi.test.mjs`

**Interfaces:**
- Consumes: Task 3 `authorize(...)` and Task 2 RPC/table contracts.
- Produces: feed response optional `device_activation: { token }` only on first activation and denial statuses without `pairs`.

- [ ] **Step 1: Write failing handler tests**

Add tests proving:

```js
assert.equal(first.body.device_activation.token, issuedToken);
assert.equal(valid.body.device_activation, undefined);
assert.equal(limit.statusCode, 403);
assert.equal(limit.body.status, 'DEVICE_LIMIT_REACHED');
assert.equal(limit.body.pairs, undefined);
```

Also prove legacy account-only access works only when the per-product enforcement dependency returns false, Personal token requests cannot include device headers, and route-fixed platform/product values reach the device service.

- [ ] **Step 2: Run and verify RED**

Run:

```bash
node --test tests/ctraderOverlayApi.test.mjs tests/metatraderOverlayApi.test.mjs
```

Expected: device activation assertions fail.

- [ ] **Step 3: Extend common handlers**

Read headers `x-panda-device-id` and `x-panda-device-token`. Keep Personal-token behavior unchanged. For Licensed requests, first run `decideOverlayCredential(license)`, then call Task 3. Add `device_activation` only when `issuedToken` is present.

- [ ] **Step 4: Wire Supabase dependencies in all three API routes**

Each route reads its fixed enforcement row, queries active device records, invokes `register_indicator_device`, and touches `last_seen_at` only when older than five minutes. Never accept product or platform from query/body input.

- [ ] **Step 5: Run and verify GREEN**

Run the Task 4 test command. Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/ctraderOverlayHandler.mjs lib/metatraderOverlayHandler.mjs pages/api/ctrader-overlay.js pages/api/mt4-overlay.js pages/api/mt5-overlay.js tests/ctraderOverlayApi.test.mjs tests/metatraderOverlayApi.test.mjs
git commit -m "wire-device-auth-to-overlay-feeds"
```

---

### Task 5: Admin Device Management API

**Files:**
- Create: `lib/indicatorDeviceAdminHandler.mjs`
- Create: `pages/api/admin/indicator-license-devices.js`
- Modify: `pages/api/admin/indicator-licenses.js`
- Create: `tests/indicatorDeviceAdmin.test.mjs`

**Interfaces:**
- Produces authenticated operations: GET devices/policies, PATCH device limit or enforcement, POST revoke/reset.

- [ ] **Step 1: Write failing authorization and state tests**

Test unauthenticated 403, device-limit bounds, refusal to lower below active count, selected-device revoke, reset-all, and fixed-product enforcement validation.

```js
const lowered = await invoke(handler, {
  method: 'PATCH', body: { action: 'set_limit', license_id: 'license-1', device_limit: 1 },
});
assert.equal(lowered.statusCode, 409);
assert.match(lowered.body.error, /revoke devices first/i);
```

- [ ] **Step 2: Run and verify RED**

Run `node --test tests/indicatorDeviceAdmin.test.mjs`.

Expected: module-not-found failure.

- [ ] **Step 3: Implement injectable handler and thin API adapter**

Validate UUIDs, integer limits 1-100, product codes against the three fixed overlay codes, and session-derived admin identity. Revoke operations set `status='REVOKED'`, `revoked_at`, and `updated_at`; they do not delete audit rows.

- [ ] **Step 4: Allow `device_limit` through the existing license admin update path**

Add server-side bounds and active-count protection. Do not trust a client-provided active count.

- [ ] **Step 5: Run and verify GREEN**

Run Task 5 tests plus `tests/indicatorLicenseRequest.test.mjs`. Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/indicatorDeviceAdminHandler.mjs pages/api/admin/indicator-license-devices.js pages/api/admin/indicator-licenses.js tests/indicatorDeviceAdmin.test.mjs
git commit -m "add-admin-device-license-controls"
```

---

### Task 6: Admin Device and Enforcement UI

**Files:**
- Modify: `pages/admin/license.js`
- Modify: `tests/indicatorLicenseAdminUi.test.mjs`

**Interfaces:**
- Consumes: Task 5 admin API.
- Produces: per-license device limit/count, device manager, revoke/reset, and three platform enforcement switches.

- [ ] **Step 1: Write failing source-level UI tests**

Require labels `DEVICE LIMIT`, `MANAGE DEVICES`, `RESET DEVICES`, `ACTIVE DEVICES`, and `DEVICE ENFORCEMENT`; require fetches to `/api/admin/indicator-license-devices`; ensure no `device_token_hash` or raw ID rendering exists.

- [ ] **Step 2: Run and verify RED**

Run `node --test tests/indicatorLicenseAdminUi.test.mjs`.

Expected: missing-label assertions fail.

- [ ] **Step 3: Implement the controls in the existing inline-style pattern**

Add a numeric input constrained to 1-100, a modal/section listing short fingerprints and timestamps, explicit confirmation for revoke/reset, and disabled enforcement toggles with an explanatory message until the operator confirms the replacement binary is live.

- [ ] **Step 4: Run and verify GREEN**

Run Task 6 tests. Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add pages/admin/license.js tests/indicatorLicenseAdminUi.test.mjs
git commit -m "add-license-device-management-ui"
```

---

### Task 7: Protected Pricing Products and Public Store Wiring

**Files:**
- Create: `lib/indicatorStore.mjs`
- Create: `lib/pricingAdminHandler.mjs`
- Modify: `pages/api/admin/pricing.js`
- Modify: `pages/admin/pricing.js`
- Modify: `pages/index.js`
- Modify: `pages/pricing.js`
- Create: `tests/indicatorStore.test.mjs`
- Create: `tests/pricingAdminHandler.test.mjs`
- Modify: `tests/indicatorLicenseAdminUi.test.mjs`

**Interfaces:**
- Produces: `mergePublicOverlayProducts(products)` and protected system-product admin validation.

- [ ] **Step 1: Write failing store mapping tests**

```js
test('maps admin price and payment link onto fixed overlay metadata', () => {
  const [product] = mergePublicOverlayProducts([{ code: 'ctrader_dashboard_overlay', price: 250, currency: 'USD', pay_link: 'https://pay.example/test', active: true }]);
  assert.equal(product.priceLabel, '$250');
  assert.equal(product.paymentLink, 'https://pay.example/test');
});

test('shows contact pricing and never zero-dollar copy', () => {
  const [product] = mergePublicOverlayProducts([{ code: 'mt4_dashboard_overlay', price: 0, currency: 'USD', active: true }]);
  assert.equal(product.priceLabel, 'CONTACT FOR PRICE');
});
```

Add admin tests rejecting deletion of fixed codes, negative price, and non-HTTPS links while allowing `active: false`.

- [ ] **Step 2: Run and verify RED**

Run:

```bash
node --test tests/indicatorStore.test.mjs tests/pricingAdminHandler.test.mjs tests/indicatorLicenseAdminUi.test.mjs
```

Expected: module-not-found/missing behavior failures.

- [ ] **Step 3: Implement store and admin helpers**

Use the three codes exported from `lib/indicatorProducts.mjs`. Format USD/EUR/AED safely, return `CONTACT FOR PRICE` for non-positive values, accept only `https:` payment URLs, and reject `delete_product` for protected codes with 409.

- [ ] **Step 4: Refactor the pricing API into the injectable handler**

Keep `requireAdmin` server-side and use the shared Supabase client. Preserve tier behavior. Return sanitized error messages.

- [ ] **Step 5: Update Pricing admin**

Show code/platform, active toggle, sort, price, currency, description, and payment link. Replace `DEL` with a disabled `SYSTEM PRODUCT` badge for protected rows. The three migrated rows load automatically.

- [ ] **Step 6: Update public pages**

Have `pages/index.js` store `j.products`, merge them into fixed download metadata, show `BUY NOW` only for a configured HTTPS link, and keep `DOWNLOAD LICENSED` plus `REQUEST ACTIVATION`. Update `/pricing` heading to `CTRADER / MT4 / MT5 INDICATORS`, use contact pricing for zero, and link each product to its tracked download and approval flow.

- [ ] **Step 7: Run and verify GREEN**

Run the Task 7 tests. Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add lib/indicatorStore.mjs lib/pricingAdminHandler.mjs pages/api/admin/pricing.js pages/admin/pricing.js pages/index.js pages/pricing.js tests/indicatorStore.test.mjs tests/pricingAdminHandler.test.mjs tests/indicatorLicenseAdminUi.test.mjs
git commit -m "wire-overlay-products-to-admin-pricing"
```

---

### Task 8: Licensed Indicator Device Persistence Sources

**Files:**
- Modify: `panda-indicators/2026-07-14/ctrader-dashboard-overlay/PandaDashboardOverlay.Core.cs`
- Modify: `panda-indicators/2026-07-14/ctrader-dashboard-overlay/PandaDashboardOverlay.Licensed.cs`
- Modify: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/mt4/PandaDashboardOverlayMT4.Core.mqh`
- Modify: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/mt4/PandaDashboardOverlayMT4-Licensed.mq4`
- Modify: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/mt5/PandaDashboardOverlayMT5.Core.mqh`
- Modify: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/mt5/PandaDashboardOverlayMT5-Licensed.mq5`
- Modify: `tests/ctraderOverlaySource.test.mjs`
- Modify: `tests/metatraderOverlaySource.test.mjs`

**Interfaces:**
- Consumes: Task 4 headers and `device_activation.token` response.
- Produces persistent random installation ID and device token for each platform/account/product.

- [ ] **Step 1: Write failing source contract tests**

Require Licensed sources to send `x-panda-device-id` and `x-panda-device-token`, parse `device_activation.token`, persist the values, and never embed a raw token. Require Personal source to remain operator-token-only.

- [ ] **Step 2: Run and verify RED**

Run:

```bash
node --test tests/ctraderOverlaySource.test.mjs tests/metatraderOverlaySource.test.mjs
```

Expected: missing device-header/persistence assertions fail.

- [ ] **Step 3: Implement cTrader device storage**

Use device-level `LocalStorage` keys scoped by product and account. Generate a GUID when absent, flush it, add device headers, parse a one-time activation token, store it, and retry normal polling. Multiple chart instances reuse the same values.

- [ ] **Step 4: Implement MT4/MT5 device storage**

Use `FILE_COMMON` text records named by platform/product/account. Store exactly two lines: random installation ID and issued token. Add the two headers to WebRequest, persist a returned activation token, and keep the existing terminal-wide snapshot cache and request lock.

- [ ] **Step 5: Run and verify GREEN**

Run Task 8 tests and existing overlay tests. Expected: all pass.

- [ ] **Step 6: Commit source changes only**

Do not replace compiled artifacts on this Mac.

```bash
git add panda-indicators/2026-07-14/ctrader-dashboard-overlay panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/mt4 panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/mt5 tests/ctraderOverlaySource.test.mjs tests/metatraderOverlaySource.test.mjs
git commit -m "add-overlay-device-token-persistence"
```

---

### Task 9: Database Apply, Documentation, Verification, and Safe Deployment

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/MT4_MT5_DASHBOARD_OVERLAY_HANDOFF.md`
- Modify: `panda-indicators/2026-07-14/ctrader-dashboard-overlay/README.md`
- Modify: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/README.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: applied production schema, deployed Personal/pricing/admin/server code, documented Windows compilation handoff, enforcement still disabled until binaries are replaced.

- [ ] **Step 1: Run the focused test suite**

```bash
node --test tests/indicatorFeedAdmin.test.mjs tests/indicatorTokenGenerator.test.mjs tests/indicatorLicenseAdminUi.test.mjs tests/indicatorDeviceLicensingSql.test.mjs tests/indicatorDeviceAccess.test.mjs tests/indicatorDeviceAdmin.test.mjs tests/ctraderOverlayApi.test.mjs tests/metatraderOverlayApi.test.mjs tests/indicatorStore.test.mjs tests/pricingAdminHandler.test.mjs tests/ctraderOverlaySource.test.mjs tests/metatraderOverlaySource.test.mjs tests/indicatorPublicProducts.test.mjs
```

Expected: zero failures.

- [ ] **Step 2: Apply the migration through Supabase and verify**

Apply `supabase/indicator_device_licensing.sql` to project `jxkelchxitwuilpbrwxk`. Query the new columns/tables, confirm the three store rows exist, confirm enforcement is false, run security/performance advisors, and fix only findings introduced by this migration.

- [ ] **Step 3: Run mandatory repository verification**

```bash
python3 check_dupes.py
npx next build
git diff --check
git status --short
git diff --name-only --diff-filter=D origin/main...HEAD
```

Expected: no duplicate definitions, successful Next build, no whitespace errors, and no critical-file deletions.

- [ ] **Step 4: Update docs**

Document the Personal one-click recovery, admin device-limit flow, store pricing flow, legacy compatibility state, exact Windows compilation commands already used by the project, checksums, and the rule that enforcement remains off until each new artifact passes platform smoke testing.

- [ ] **Step 5: Commit docs**

```bash
git add CHANGELOG.md docs/MT4_MT5_DASHBOARD_OVERLAY_HANDOFF.md panda-indicators/2026-07-14/ctrader-dashboard-overlay/README.md panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/README.md
git commit -m "document-device-licensed-overlay-rollout"
```

- [ ] **Step 6: Push and verify Vercel**

```bash
git push origin main
npx vercel ls panda-dashboard --scope team_yI8pvA0JfHlIj3f2B8dlphgh
```

Wait for the GitHub-triggered production deployment to reach READY with duration greater than 20 seconds. Confirm aliases include `pandaengine.app` and `www.pandaengine.app`.

- [ ] **Step 7: Run production smoke tests**

Verify public pricing returns the three products, all tracked downloads return 302 to existing compiled Licensed files, static files return 200, admin endpoints deny unauthenticated requests, Personal token status is available only to admin, device enforcement rows remain false, and no device-token denial affects the current binaries.

- [ ] **Step 8: Windows artifact handoff**

On the authorized Windows machine, compile the updated cTrader, MT4, and MT5 Licensed sources, confirm zero compiler errors, replace only the three Licensed artifacts, regenerate SHA-256 checksums, deploy, smoke-test first activation and repeat authentication on each platform, then enable that platform's enforcement switch. This step is not executable from the current Mac because cTrader and MetaEditor are absent.

