# Public Overlay Downloads and Admin Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the three account-licensed Panda Dashboard Overlay builds, accept platform-correct activation requests, count recorded downloads in Admin, and let an authenticated administrator recover and copy the current Personal token from encrypted storage.

**Architecture:** The product catalog is the allowlist for public downloads and activation requests. Small injectable handlers isolate download telemetry, request creation, and token-vault policy from Next.js/Supabase adapters; the landing page and Indicator Licensing admin consume those APIs. The active Personal token remains SHA-256 hashed for feed authorization and is separately AES-256-GCM encrypted for admin-only recovery.

**Tech Stack:** Next.js 14 Pages Router, React 18, Node.js ESM helpers and `node:test`, Supabase/Postgres with RLS, AES-256-GCM from `node:crypto`, Vercel production deployment.

## Global Constraints

- Work only in `/Users/gianfx/panda-dashboar` on `main`; pull `origin/main` before implementation and never force-push.
- Publish only compiled Licensed `.algo`, `.ex4`, and `.ex5` files. Never publish Personal builds or source packages.
- Never expose a raw token, token hash, ciphertext, IV, authentication tag, Supabase key, `ENGINE_SECRET`, or `INDICATOR_TOKEN_ENCRYPTION_KEY` in client code, logs, static files, API status responses, commits, or test output.
- Use the shared Supabase client from `lib/supabase`; do not instantiate clients from environment variables in API routes.
- Require `requireAdmin(req)` for download telemetry, token status, token reveal, and rotation history.
- Do not modify `extract_panda_score()`, `compute_scores_all_pairs()`, BB/INTRA rules, `vercel.json`'s `ignoreCommand`, `package.json`, `next.config.js`, or the user's untracked `.superpowers/`, `CLAUDE.md`, and `package-lock.json`.
- Download metrics count recorded download-button activations, not unique users; do not store IP addresses, account numbers, or contact details in download events.
- An existing hash-only token must continue authorizing Personal indicators. It becomes recoverable only after an intentional admin rotation.
- Before every implementation commit, stage only the files named by that task and confirm the four critical build files are not staged for deletion.

---

## File Structure

- `lib/indicatorProducts.mjs` — authoritative product metadata and public-download/request allowlists.
- `lib/indicatorDownload.mjs` — pure public-download selection and redirect handler.
- `lib/indicatorDownloadAdminHandler.mjs` — pure admin telemetry policy/response handler.
- `pages/api/indicator-download.js` — Supabase event insert plus redirect adapter.
- `pages/api/admin/indicator-downloads.js` — authenticated count/recent-event adapter.
- `lib/indicatorLicense.mjs` — platform/account normalization for public requests.
- `lib/indicatorLicenseRequestHandler.mjs` — injectable duplicate-check/insert/notification workflow.
- `pages/api/indicator-license-request.js` — Supabase adapter for the public request workflow.
- `lib/indicatorRequestAlert.mjs` — platform-aware Telegram message formatting.
- `lib/indicatorTokenVault.mjs` — server-only AES-256-GCM encryption/decryption.
- `lib/indicatorFeedAdminHandler.mjs` — admin status, rotation, reveal, and sanitized rotation history policy.
- `pages/api/admin/indicator-feed-token.js` — Supabase/env adapter for the token handler.
- `pages/index.js` — public download cards and platform-aware activation modal.
- `pages/admin/license.js` — download summary/recent activity and active-token controls.
- `supabase/public_overlay_distribution.sql` — events table, token-vault columns, rotation audit table, trigger, indexes, RLS, and grants.
- `public/downloads/panda-dashboard-overlay-ctrader-licensed.algo` — public cTrader Licensed artifact.
- `public/downloads/panda-dashboard-overlay-mt4-licensed.ex4` — public MT4 Licensed artifact.
- `public/downloads/panda-dashboard-overlay-mt5-licensed.ex5` — public MT5 Licensed artifact.
- `tests/indicatorPublicProducts.test.mjs` — catalog and artifact exposure contracts.
- `tests/indicatorDownload.test.mjs` — public redirect and authenticated telemetry tests.
- `tests/indicatorLicenseRequest.test.mjs` — cross-platform request and alert tests.
- `tests/indicatorTokenVault.test.mjs` — encryption/decryption and tamper tests.
- `tests/indicatorLicenseAdminUi.test.mjs` — landing/admin source contracts.

---

### Task 1: Public product allowlist and Licensed release artifacts

**Files:**
- Modify: `lib/indicatorProducts.mjs`
- Create: `tests/indicatorPublicProducts.test.mjs`
- Create: `public/downloads/panda-dashboard-overlay-ctrader-licensed.algo`
- Create: `public/downloads/panda-dashboard-overlay-mt4-licensed.ex4`
- Create: `public/downloads/panda-dashboard-overlay-mt5-licensed.ex5`

**Interfaces:**
- Produces: `CTRADER_OVERLAY_PRODUCT_CODE`, `PUBLIC_DOWNLOAD_PRODUCTS`, and product fields `requestable`, `publicDownload`, `fileName`, `downloadPath`, `platform`, `installNote`.
- Consumes: existing `INDICATOR_PRODUCTS`, `PUBLIC_INDICATOR_PRODUCTS`, and `getIndicatorProduct(code)`.

- [ ] **Step 1: Write the failing catalog/artifact test**

Create `tests/indicatorPublicProducts.test.mjs` with exact assertions:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { PUBLIC_DOWNLOAD_PRODUCTS } from '../lib/indicatorProducts.mjs';

test('publishes exactly the three Licensed overlay products', () => {
  assert.deepEqual(
    PUBLIC_DOWNLOAD_PRODUCTS.map((product) => product.code),
    ['ctrader_dashboard_overlay', 'mt4_dashboard_overlay', 'mt5_dashboard_overlay'],
  );
  for (const product of PUBLIC_DOWNLOAD_PRODUCTS) {
    assert.equal(product.publicDownload, true);
    assert.equal(product.requestable, true);
    assert.match(product.downloadPath, /^\/downloads\//);
    assert.equal(fs.existsSync(`public${product.downloadPath}`), true);
  }
});

test('never exposes Personal artifacts through the public catalog', () => {
  const serialized = JSON.stringify(PUBLIC_DOWNLOAD_PRODUCTS);
  assert.doesNotMatch(serialized, /Personal/i);
  assert.doesNotMatch(serialized, /token/i);
  assert.equal(fs.existsSync('public/downloads/PandaDashboardOverlay-Personal.algo'), false);
  assert.equal(fs.existsSync('public/downloads/PandaDashboardOverlayMT4-Personal.ex4'), false);
  assert.equal(fs.existsSync('public/downloads/PandaDashboardOverlayMT5-Personal.ex5'), false);
});
```

- [ ] **Step 2: Run the test and verify the missing export/artifacts fail**

Run: `node --test tests/indicatorPublicProducts.test.mjs`

Expected: FAIL because `PUBLIC_DOWNLOAD_PRODUCTS` and the public files do not exist.

- [ ] **Step 3: Add explicit product metadata**

Modify `lib/indicatorProducts.mjs` so the overlay entries have these exact public fields while preserving `adminOnly: true`:

```js
export const CTRADER_OVERLAY_PRODUCT_CODE = 'ctrader_dashboard_overlay';
export const MT4_OVERLAY_PRODUCT_CODE = 'mt4_dashboard_overlay';
export const MT5_OVERLAY_PRODUCT_CODE = 'mt5_dashboard_overlay';

// Add requestable: true to both existing legacy products.
// Use these fields on the three existing overlay entries:
{
  code: CTRADER_OVERLAY_PRODUCT_CODE,
  name: 'Panda cTrader Dashboard Overlay',
  priceLabel: 'Activation by approval',
  platform: 'CTRADER',
  adminOnly: true,
  requestable: true,
  publicDownload: true,
  fileName: 'panda-dashboard-overlay-ctrader-licensed.algo',
  downloadPath: '/downloads/panda-dashboard-overlay-ctrader-licensed.algo',
  installNote: 'Import the .algo file in cTrader, then attach it to a supported chart.',
}
```

Use these exact MT4 and MT5 entries:

```js
{
  code: MT4_OVERLAY_PRODUCT_CODE,
  name: 'Panda MT4 Dashboard Overlay',
  priceLabel: 'Activation by approval',
  platform: 'MT4',
  adminOnly: true,
  requestable: true,
  publicDownload: true,
  fileName: 'panda-dashboard-overlay-mt4-licensed.ex4',
  downloadPath: '/downloads/panda-dashboard-overlay-mt4-licensed.ex4',
  installNote: 'Copy the .ex4 file into MQL4/Indicators and allow WebRequest for https://pandaengine.app.',
},
{
  code: MT5_OVERLAY_PRODUCT_CODE,
  name: 'Panda MT5 Dashboard Overlay',
  priceLabel: 'Activation by approval',
  platform: 'MT5',
  adminOnly: true,
  requestable: true,
  publicDownload: true,
  fileName: 'panda-dashboard-overlay-mt5-licensed.ex5',
  downloadPath: '/downloads/panda-dashboard-overlay-mt5-licensed.ex5',
  installNote: 'Copy the .ex5 file into MQL5/Indicators and allow WebRequest for https://pandaengine.app.',
},
```

Add the allowlist export:

```js
export const PUBLIC_DOWNLOAD_PRODUCTS = INDICATOR_PRODUCTS.filter(
  (product) => product.publicDownload === true && product.downloadPath,
);
```

- [ ] **Step 4: Copy only the three Licensed binaries with explicit file names**

Run these commands individually; do not use wildcards:

```bash
cp panda-indicators/2026-07-14/ctrader-dashboard-overlay/dist/PandaDashboardOverlay-Licensed.algo public/downloads/panda-dashboard-overlay-ctrader-licensed.algo
cp panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/dist/PandaDashboardOverlayMT4-Licensed.ex4 public/downloads/panda-dashboard-overlay-mt4-licensed.ex4
cp panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/dist/PandaDashboardOverlayMT5-Licensed.ex5 public/downloads/panda-dashboard-overlay-mt5-licensed.ex5
```

- [ ] **Step 5: Verify catalog, artifacts, and checksums**

Run:

```bash
node --test tests/indicatorPublicProducts.test.mjs
shasum -a 256 public/downloads/panda-dashboard-overlay-ctrader-licensed.algo public/downloads/panda-dashboard-overlay-mt4-licensed.ex4 public/downloads/panda-dashboard-overlay-mt5-licensed.ex5
```

Expected: tests PASS; hashes match the corresponding Licensed entries in the two release `SHA256SUMS` files.

- [ ] **Step 6: Commit the public catalog and artifacts**

```bash
git add lib/indicatorProducts.mjs tests/indicatorPublicProducts.test.mjs public/downloads/panda-dashboard-overlay-ctrader-licensed.algo public/downloads/panda-dashboard-overlay-mt4-licensed.ex4 public/downloads/panda-dashboard-overlay-mt5-licensed.ex5
git diff --cached --check
git commit -m "add-public-overlay-artifacts"
```

---

### Task 2: Distribution and token-vault database schema

**Files:**
- Create: `supabase/public_overlay_distribution.sql`
- Create: `tests/publicOverlayDistributionSql.test.mjs`

**Interfaces:**
- Produces: `indicator_download_events`, nullable encrypted-token columns on `indicator_feed_settings`, `indicator_feed_token_rotations`, and an audit trigger.
- Consumes: existing `indicator_feed_settings(setting_key, token_hash, rotated_at, rotated_by)`.

- [ ] **Step 1: Write the failing SQL contract test**

Create a Node test that reads the migration and asserts every security contract:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const sql = fs.readFileSync('supabase/public_overlay_distribution.sql', 'utf8');

test('migration creates download telemetry without visitor identity fields', () => {
  assert.match(sql, /create table if not exists public\.indicator_download_events/i);
  assert.match(sql, /product_code text not null/i);
  assert.match(sql, /platform text not null/i);
  assert.match(sql, /downloaded_at timestamptz not null default now\(\)/i);
  assert.doesNotMatch(sql, /ip_address|account_number|contact|email/i);
});

test('migration adds encrypted current-token storage and metadata-only rotations', () => {
  assert.match(sql, /token_ciphertext text/i);
  assert.match(sql, /token_iv text/i);
  assert.match(sql, /token_auth_tag text/i);
  assert.match(sql, /create table if not exists public\.indicator_feed_token_rotations/i);
  assert.match(sql, /token_fingerprint text not null/i);
  assert.doesNotMatch(sql, /old_token|token_plaintext/i);
});

test('migration locks all new tables to the service role', () => {
  assert.match(sql, /alter table public\.indicator_download_events enable row level security/i);
  assert.match(sql, /alter table public\.indicator_feed_token_rotations enable row level security/i);
  assert.match(sql, /revoke all on table public\.indicator_download_events from anon, authenticated/i);
  assert.match(sql, /revoke all on table public\.indicator_feed_token_rotations from anon, authenticated/i);
  assert.doesNotMatch(sql, /security definer/i);
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `node --test tests/publicOverlayDistributionSql.test.mjs`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create the complete idempotent migration**

Create `supabase/public_overlay_distribution.sql` with:

```sql
create table if not exists public.indicator_download_events (
  id bigint generated by default as identity primary key,
  product_code text not null,
  platform text not null check (platform in ('CTRADER', 'MT4', 'MT5')),
  downloaded_at timestamptz not null default now()
);

create index if not exists idx_indicator_download_events_product_time
  on public.indicator_download_events (product_code, downloaded_at desc);

alter table public.indicator_download_events enable row level security;
drop policy if exists "service_role_indicator_download_events" on public.indicator_download_events;
create policy "service_role_indicator_download_events"
  on public.indicator_download_events for all to service_role
  using (true) with check (true);
revoke all on table public.indicator_download_events from anon, authenticated;

alter table public.indicator_feed_settings
  add column if not exists token_ciphertext text,
  add column if not exists token_iv text,
  add column if not exists token_auth_tag text;

create table if not exists public.indicator_feed_token_rotations (
  id bigint generated by default as identity primary key,
  setting_key text not null,
  rotated_at timestamptz not null,
  rotated_by text not null,
  token_fingerprint text not null check (char_length(token_fingerprint) = 12)
);

create index if not exists idx_indicator_feed_token_rotations_time
  on public.indicator_feed_token_rotations (rotated_at desc);

alter table public.indicator_feed_token_rotations enable row level security;
drop policy if exists "service_role_indicator_feed_token_rotations" on public.indicator_feed_token_rotations;
create policy "service_role_indicator_feed_token_rotations"
  on public.indicator_feed_token_rotations for all to service_role
  using (true) with check (true);
revoke all on table public.indicator_feed_token_rotations from anon, authenticated;

create or replace function public.log_indicator_feed_token_rotation()
returns trigger language plpgsql as $$
begin
  insert into public.indicator_feed_token_rotations (
    setting_key, rotated_at, rotated_by, token_fingerprint
  ) values (
    new.setting_key,
    new.rotated_at,
    coalesce(nullif(new.rotated_by, ''), 'admin'),
    substring(new.token_hash from 1 for 12)
  );
  return new;
end;
$$;

drop trigger if exists indicator_feed_token_rotation_audit on public.indicator_feed_settings;
create trigger indicator_feed_token_rotation_audit
after insert or update of token_hash on public.indicator_feed_settings
for each row execute function public.log_indicator_feed_token_rotation();
```

- [ ] **Step 4: Run the SQL contract test**

Run: `node --test tests/publicOverlayDistributionSql.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit the migration contract**

```bash
git add supabase/public_overlay_distribution.sql tests/publicOverlayDistributionSql.test.mjs
git diff --cached --check
git commit -m "add-overlay-distribution-schema"
```

---

### Task 3: Tracked public download and admin telemetry APIs

**Files:**
- Create: `lib/indicatorDownload.mjs`
- Create: `lib/indicatorDownloadAdminHandler.mjs`
- Create: `pages/api/indicator-download.js`
- Create: `pages/api/admin/indicator-downloads.js`
- Create: `tests/indicatorDownload.test.mjs`

**Interfaces:**
- Consumes: `getIndicatorProduct(code)`, `PUBLIC_DOWNLOAD_PRODUCTS`, shared `supabase`, and `requireAdmin(req)`.
- Produces: `createIndicatorDownloadHandler({ recordDownload })` and `createIndicatorDownloadAdminHandler({ requireAdmin, getStats })`.
- HTTP: `GET /api/indicator-download?product=...` returns a 302 redirect; `GET /api/admin/indicator-downloads` returns `{ totals, recent }`.

- [ ] **Step 1: Write failing handler tests**

Cover method rejection, unknown-product rejection, successful event/redirect, telemetry-failure redirect, admin denial, and sanitized stats. Use this response fake:

```js
function response() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    redirectTo: '',
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    redirect(code, target) { this.statusCode = code; this.redirectTo = target; return this; },
  };
}
```

Assert that a valid MT4 request records exactly:

```js
{
  product_code: 'mt4_dashboard_overlay',
  platform: 'MT4',
}
```

Assert the redirect target is `/downloads/panda-dashboard-overlay-mt4-licensed.ex4`, and assert the same redirect occurs when `recordDownload` throws.

- [ ] **Step 2: Run the tests and verify missing-module failure**

Run: `node --test tests/indicatorDownload.test.mjs`

Expected: FAIL because both handler modules are missing.

- [ ] **Step 3: Implement the public handler**

Create `lib/indicatorDownload.mjs`:

```js
import { getIndicatorProduct } from './indicatorProducts.mjs';

export function getPublicDownloadProduct(value) {
  const code = String(value || '').trim().toLowerCase();
  const product = getIndicatorProduct(code);
  return product?.publicDownload === true && product.downloadPath ? product : null;
}

export function createIndicatorDownloadHandler({ recordDownload }) {
  return async function indicatorDownloadHandler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    const product = getPublicDownloadProduct(req.query?.product);
    if (!product) return res.status(404).json({ error: 'Download not found' });

    try {
      await recordDownload({ product_code: product.code, platform: product.platform });
    } catch {
      console.error('Indicator download telemetry failed');
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, product.downloadPath);
  };
}
```

- [ ] **Step 4: Implement the admin handler and both adapters**

`lib/indicatorDownloadAdminHandler.mjs` must authenticate before calling `getStats` and return only `product_code`, `platform`, `count`, and `downloaded_at`. Reject non-GET methods with 405.

In `pages/api/indicator-download.js`, inject:

```js
recordDownload: async (event) => {
  const { error } = await supabase.from('indicator_download_events').insert(event);
  if (error) throw error;
}
```

In `pages/api/admin/indicator-downloads.js`, use `PUBLIC_DOWNLOAD_PRODUCTS` to run exact head-count queries per product and fetch the 50 newest rows:

```js
const totals = await Promise.all(PUBLIC_DOWNLOAD_PRODUCTS.map(async (product) => {
  const { count, error } = await supabase
    .from('indicator_download_events')
    .select('id', { count: 'exact', head: true })
    .eq('product_code', product.code);
  if (error) throw error;
  return { product_code: product.code, platform: product.platform, count: count || 0 };
}));

const { data: recent, error } = await supabase
  .from('indicator_download_events')
  .select('product_code,platform,downloaded_at')
  .order('downloaded_at', { ascending: false })
  .limit(50);
if (error) throw error;
return { totals, recent: recent || [] };
```

Catch adapter errors, log only a generic message, and return `{ error: 'Download telemetry unavailable' }` with status 500.

- [ ] **Step 5: Run the focused tests**

Run: `node --test tests/indicatorPublicProducts.test.mjs tests/indicatorDownload.test.mjs`

Expected: all tests PASS.

- [ ] **Step 6: Commit the telemetry APIs**

```bash
git add lib/indicatorDownload.mjs lib/indicatorDownloadAdminHandler.mjs pages/api/indicator-download.js pages/api/admin/indicator-downloads.js tests/indicatorDownload.test.mjs
git diff --cached --check
git commit -m "add-indicator-download-telemetry"
```

---

### Task 4: Cross-platform activation request workflow

**Files:**
- Modify: `lib/indicatorLicense.mjs`
- Create: `lib/indicatorLicenseRequestHandler.mjs`
- Modify: `pages/api/indicator-license-request.js`
- Modify: `lib/indicatorRequestAlert.mjs`
- Create: `tests/indicatorLicenseRequest.test.mjs`

**Interfaces:**
- Consumes: catalog `requestable`/`platform`, `ACTIVE_LICENSE_STATUSES`, shared Supabase, and Telegram sender.
- Produces: `validateIndicatorRequest(input)` values containing `platform`, `trading_account_number`, and backward-compatible `mt4_account_id`; `createIndicatorLicenseRequestHandler({ findExisting, insertRequest, notify })`.

- [ ] **Step 1: Write failing platform and workflow tests**

Test all three overlay products with the same numeric input key `trading_account_number`. For cTrader, assert:

```js
assert.deepEqual(parsed.value, {
  customer_name: 'Client One',
  contact: 'client@example.com',
  mt4_account_id: '12345678',
  trading_account_number: '12345678',
  platform: 'CTRADER',
  account_server: null,
  product_code: 'ctrader_dashboard_overlay',
  status: 'PENDING',
  paid_confirmed: false,
  telegram_username: 'clientone',
  notes: null,
});
```

Also assert invalid nonnumeric values return `cTrader account number must be 3-20 digits`, crafted non-requestable products are rejected, the handler passes product/platform/account to `findExisting`, duplicate PENDING returns 409, insert success returns 200, and notification failure does not roll back the inserted request.

Assert `buildIndicatorRequestAlertMessage()` contains `CTRADER Account: 12345678` and does not contain `MT4 Account` for that request.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests/indicatorLicenseRequest.test.mjs`

Expected: FAIL because current validation and alert formatting are MT4-only and the injectable handler is missing.

- [ ] **Step 3: Make request validation product-derived and platform-aware**

In `validateIndicatorRequest`, look up the product before validating the account. Reject when `!product || product.requestable !== true`. Derive `platform = product.platform || 'MT4'`, normalize:

```js
const account = normalizeTradingAccountNumber(
  input.trading_account_number || input.mt4_account_id || input.account_id || input.account_number,
);
const accountLabel = platform === 'CTRADER' ? 'cTrader' : platform;
```

Return the platform-specific error `${accountLabel} account number must be 3-20 digits` and include both account fields in the accepted row.

- [ ] **Step 4: Extract and wire the injectable workflow**

Create `lib/indicatorLicenseRequestHandler.mjs` with this contract:

```js
export function createIndicatorLicenseRequestHandler({ findExisting, insertRequest, notify }) {
  return async function indicatorLicenseRequestHandler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    const parsed = validateIndicatorRequest(req.body || {});
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const row = parsed.value;
    const existing = await findExisting({
      product_code: row.product_code,
      platform: row.platform,
      trading_account_number: row.trading_account_number,
    });
    if (existing) {
      return res.status(409).json({
        error: existing.status === 'APPROVED'
          ? 'This account is already approved for this indicator'
          : 'This account already has a pending request',
        id: existing.id,
        status: existing.status,
      });
    }
    const data = await insertRequest(row);
    try { await notify({ ...row, ...data }); }
    catch { console.error('Indicator request alert failed'); }
    return res.status(200).json({ ok: true, id: data.id, status: data.status });
  };
}
```

The Next.js route supplies a duplicate query filtered by `product_code`, `platform`, `trading_account_number`, and `ACTIVE_LICENSE_STATUSES`, plus the existing insert and alert adapters. Return generic 500 errors without request secrets.

- [ ] **Step 5: Make Telegram labels platform-aware**

Use:

```js
const platform = product?.platform || request?.platform || 'MT4';
const account = request?.trading_account_number || request?.mt4_account_id;
```

Render `<b>${platform === 'CTRADER' ? 'cTrader' : platform} Account:</b>` with the escaped account.

- [ ] **Step 6: Run cross-platform tests**

Run: `node --test tests/indicatorLicenseRequest.test.mjs tests/ctraderOverlayApi.test.mjs tests/metatraderOverlayApi.test.mjs`

Expected: all tests PASS.

- [ ] **Step 7: Commit the request workflow**

```bash
git add lib/indicatorLicense.mjs lib/indicatorLicenseRequestHandler.mjs pages/api/indicator-license-request.js lib/indicatorRequestAlert.mjs tests/indicatorLicenseRequest.test.mjs
git diff --cached --check
git commit -m "wire-cross-platform-license-requests"
```

---

### Task 5: Public landing-page downloads and activation modal

**Files:**
- Modify: `pages/index.js:1-159`
- Modify: `pages/index.js:482-508`
- Modify: `pages/index.js:627-662`
- Create: `tests/indicatorLicenseAdminUi.test.mjs`

**Interfaces:**
- Consumes: `PUBLIC_DOWNLOAD_PRODUCTS`, product `installNote`, tracked download route, and `/api/indicator-license-request`.
- Produces: three public platform cards and a product-derived account request form.

- [ ] **Step 1: Write the failing landing-page source contract**

Read `pages/index.js` and assert it imports `PUBLIC_DOWNLOAD_PRODUCTS`, maps those products, uses `/api/indicator-download?product=`, renders `DOWNLOAD LICENSED` and `REQUEST ACTIVATION`, sends `trading_account_number`, contains platform-aware account labels, and no longer promises to send the already-public file manually.

```js
assert.match(landing, /PUBLIC_DOWNLOAD_PRODUCTS/);
assert.match(landing, /\/api\/indicator-download\?product=/);
assert.match(landing, /DOWNLOAD LICENSED/);
assert.match(landing, /REQUEST ACTIVATION/);
assert.match(landing, /trading_account_number/);
assert.match(landing, /cTrader ACCOUNT NUMBER|CTRADER ACCOUNT NUMBER/);
assert.doesNotMatch(landing, /send you the payment link and indicator file/);
```

- [ ] **Step 2: Run the UI contract and verify it fails**

Run: `node --test tests/indicatorLicenseAdminUi.test.mjs`

Expected: FAIL because the landing page exposes only the old MT4 request cards.

- [ ] **Step 3: Add the public overlay catalog and tracked download buttons**

Import both catalogs with distinct names:

```js
import {
  PUBLIC_DOWNLOAD_PRODUCTS,
  PUBLIC_INDICATOR_PRODUCTS as LEGACY_INDICATOR_PRODUCTS,
} from '../lib/indicatorProducts.mjs';
```

Replace the MT4-only heading/copy with `PANDA DASHBOARD OVERLAYS` and explain that files can be downloaded now but activate only after account approval. Render three cards from `PUBLIC_DOWNLOAD_PRODUCTS`; each card must contain:

```jsx
<a
  href={`/api/indicator-download?product=${encodeURIComponent(product.code)}`}
  style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
>
  DOWNLOAD LICENSED
</a>
<button onClick={() => openLicenseRequest(product)}>REQUEST ACTIVATION</button>
```

Keep the two legacy request-only cards in a clearly separated `LEGACY_INDICATOR_PRODUCTS` block so their existing paid flow is not removed.

- [ ] **Step 4: Make modal state and copy platform-aware**

Initialize/reset:

```js
const [licenseForm, setLicenseForm] = useState({
  customer_name: '',
  contact: '',
  trading_account_number: '',
  telegram_username: '',
});
```

Derive:

```js
const requestPlatform = licenseModal?.platform || 'MT4';
const requestAccountLabel = requestPlatform === 'CTRADER'
  ? 'cTrader account number'
  : `${requestPlatform} account number`;
```

Use `requestAccountLabel` for instructions/placeholders. On success say the request is pending and the installed indicator will activate after approval. Submit `product_code` plus `trading_account_number`.

- [ ] **Step 5: Run UI and catalog tests**

Run: `node --test tests/indicatorPublicProducts.test.mjs tests/indicatorLicenseAdminUi.test.mjs`

Expected: all tests PASS.

- [ ] **Step 6: Commit the public UI**

```bash
git add pages/index.js tests/indicatorLicenseAdminUi.test.mjs
git diff --cached --check
git commit -m "add-public-overlay-download-cards"
```

---

### Task 6: Encrypted active-token recovery backend

**Files:**
- Create: `lib/indicatorTokenVault.mjs`
- Modify: `lib/indicatorFeedAdminHandler.mjs`
- Modify: `pages/api/admin/indicator-feed-token.js`
- Create: `tests/indicatorTokenVault.test.mjs`
- Modify: `tests/indicatorFeedAdmin.test.mjs`

**Interfaces:**
- Consumes: `INDICATOR_TOKEN_ENCRYPTION_KEY` as exactly 32 bytes encoded in base64, shared Supabase, and existing `hashOverlayToken(token)`.
- Produces: `encryptIndicatorToken(token, encodedKey, randomBytesImpl?)`, `decryptIndicatorToken(setting, encodedKey)`, GET status `{ configured, recoverable, rotated_at, rotations }`, POST reveal `{ token }`, and encrypted PUT rotation.

- [ ] **Step 1: Write failing encryption and handler tests**

Use a deterministic 32-byte key and 12-byte IV:

```js
const key = Buffer.alloc(32, 7).toString('base64');
const ivSource = (size) => Buffer.alloc(size, 9);
const encrypted = encryptIndicatorToken('operator-token-value-that-is-long-enough-123', key, ivSource);
assert.equal(decryptIndicatorToken(encrypted, key), 'operator-token-value-that-is-long-enough-123');
assert.throws(
  () => decryptIndicatorToken({ ...encrypted, token_auth_tag: Buffer.alloc(16).toString('base64') }, key),
);
```

Also assert invalid key lengths fail, GET never returns encrypted fields, a hash-only setting returns `recoverable: false`, POST reveal requires admin and recoverable ciphertext, reveal sets `Cache-Control: private, no-store`, PUT saves a hash plus encrypted fields, and no response contains the token hash/ciphertext.

- [ ] **Step 2: Run the tests and verify missing encryption behavior fails**

Run: `node --test tests/indicatorTokenVault.test.mjs tests/indicatorFeedAdmin.test.mjs`

Expected: FAIL because vault helpers and reveal/status behavior do not exist.

- [ ] **Step 3: Implement AES-256-GCM helpers**

Create `lib/indicatorTokenVault.mjs`:

```js
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function decodeKey(encodedKey) {
  const key = Buffer.from(String(encodedKey || ''), 'base64');
  if (key.length !== 32) throw new Error('Indicator token encryption is not configured');
  return key;
}

export function encryptIndicatorToken(token, encodedKey, randomBytesImpl = randomBytes) {
  const key = decodeKey(encodedKey);
  const iv = randomBytesImpl(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()]);
  return {
    token_ciphertext: ciphertext.toString('base64'),
    token_iv: iv.toString('base64'),
    token_auth_tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptIndicatorToken(setting, encodedKey) {
  const key = decodeKey(encodedKey);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(setting.token_iv, 'base64'));
  decipher.setAuthTag(Buffer.from(setting.token_auth_tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(setting.token_ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
```

- [ ] **Step 4: Extend the pure admin handler**

Add injected `encryptToken`, `decryptToken`, and `getRotations`. GET maps rotation rows to only `rotated_at`, `rotated_by`, and `token_fingerprint`. POST accepts only `{ action: 'reveal' }`, fetches the setting, returns 409 for legacy hash-only rows, sets no-store, and returns the decrypted token. PUT calls `encryptToken(token)` and saves:

```js
{
  setting_key: 'ctrader_operator_token',
  token_hash: hashOverlayToken(token),
  ...encrypted,
  rotated_at: rotatedAt,
  rotated_by: adminName,
}
```

Status responses must never include plaintext, hash, ciphertext, IV, or authentication tag.

- [ ] **Step 5: Wire the Supabase/env adapter**

Select `token_hash,token_ciphertext,token_iv,token_auth_tag,rotated_at` from settings. Fetch the newest 20 rotation rows selecting only `rotated_at,rotated_by,token_fingerprint`. Inject:

```js
encryptToken: (token) => encryptIndicatorToken(token, process.env.INDICATOR_TOKEN_ENCRYPTION_KEY),
decryptToken: (setting) => decryptIndicatorToken(setting, process.env.INDICATOR_TOKEN_ENCRYPTION_KEY),
```

Set `Cache-Control: private, no-store` on every response from this route. Log only generic error text and return `Token operation failed` on unexpected errors.

- [ ] **Step 6: Run token tests and existing feed authorization tests**

Run:

```bash
node --test tests/indicatorTokenVault.test.mjs tests/indicatorFeedAdmin.test.mjs tests/indicatorTokenGenerator.test.mjs tests/ctraderOverlayApi.test.mjs tests/metatraderOverlayApi.test.mjs
```

Expected: all tests PASS; existing SHA-256 feed authorization remains unchanged.

- [ ] **Step 7: Commit the token backend**

```bash
git add lib/indicatorTokenVault.mjs lib/indicatorFeedAdminHandler.mjs pages/api/admin/indicator-feed-token.js tests/indicatorTokenVault.test.mjs tests/indicatorFeedAdmin.test.mjs
git diff --cached --check
git commit -m "add-encrypted-active-token-recovery"
```

---

### Task 7: Indicator Licensing admin telemetry and token controls

**Files:**
- Modify: `pages/admin/license.js:1-197`
- Modify: `pages/admin/license.js` immediately before the license status filters/table
- Modify: `tests/indicatorLicenseAdminUi.test.mjs`

**Interfaces:**
- Consumes: `/api/admin/indicator-downloads` and the extended `/api/admin/indicator-feed-token` GET/POST/PUT contract.
- Produces: recorded-download cards, recent activity, recoverability status, reveal/copy action, and non-secret rotation history.

- [ ] **Step 1: Extend the failing admin UI contract**

Assert the admin source fetches `/api/admin/indicator-downloads`, renders `DOWNLOADS RECORDED`, calls the token endpoint with `method: 'POST'` and `action: 'reveal'`, uses `navigator.clipboard.writeText(revealedToken)`, shows `RECOVERY REQUIRES ONE ROTATION` for legacy status, renders `TOKEN ROTATION HISTORY`, and clears revealed state with `setTimeout`.

- [ ] **Step 2: Run the UI contract and verify it fails**

Run: `node --test tests/indicatorLicenseAdminUi.test.mjs`

Expected: FAIL because telemetry/reveal/history controls are absent.

- [ ] **Step 3: Load telemetry and expanded token status**

Add states:

```js
const [downloadStats, setDownloadStats] = useState({ totals: [], recent: [] });
const [revealedToken, setRevealedToken] = useState('');
const [revealStatus, setRevealStatus] = useState('REVEAL & COPY ACTIVE TOKEN');
const revealTimerRef = useRef(null);
```

In `load()`, fetch the telemetry endpoint after license/token status and set only array values. Add an effect cleanup that clears `revealTimerRef.current` on unmount.

- [ ] **Step 4: Implement reveal/copy with a 60-second memory lifetime**

```js
async function revealAndCopyOperatorToken() {
  setError('');
  const res = await fetch('/api/admin/indicator-feed-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reveal' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { setError(data.error || 'Token recovery failed'); return; }
  setRevealedToken(data.token);
  try {
    await navigator.clipboard.writeText(data.token);
    setRevealStatus('COPIED · CLEARS IN 60S');
  } catch {
    setRevealStatus('SELECT TOKEN MANUALLY · CLEARS IN 60S');
  }
  clearTimeout(revealTimerRef.current);
  revealTimerRef.current = setTimeout(() => {
    setRevealedToken('');
    setRevealStatus('REVEAL & COPY ACTIVE TOKEN');
  }, 60000);
}
```

Render the revealed value in a read-only password input only while it exists. Disable reveal when `tokenStatus.recoverable !== true`; show `RECOVERY REQUIRES ONE ROTATION` without changing the active token.

- [ ] **Step 5: Render download summaries, recent events, and rotation metadata**

Map `downloadStats.totals` into three responsive cards with product name/platform and `${count} DOWNLOADS RECORDED`. Render the newest events in a compact table with indicator, platform, and `formatDate(downloaded_at)`. Render `tokenStatus.rotations` with timestamp, administrator, and 12-character fingerprint; do not render any other token field.

- [ ] **Step 6: Run admin and token UI tests**

Run:

```bash
node --test tests/indicatorLicenseAdminUi.test.mjs tests/indicatorTokenGenerator.test.mjs tests/indicatorFeedAdmin.test.mjs tests/metatraderOverlayAdmin.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 7: Commit the admin UI**

```bash
git add pages/admin/license.js tests/indicatorLicenseAdminUi.test.mjs
git diff --cached --check
git commit -m "add-license-admin-download-token-controls"
```

---

### Task 8: Documentation, full verification, production migration, and deployment

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/MT4_MT5_DASHBOARD_OVERLAY_HANDOFF.md`
- Verify only: `package.json`, `package-lock.json`, `vercel.json`, `next.config.js`

**Interfaces:**
- Consumes: all previous tasks, Supabase project `jxkelchxitwuilpbrwxk`, Vercel project `panda-dashboard`, and production domain `pandaengine.app`.
- Produces: operator/customer flow documentation, applied database schema, configured production encryption key, pushed `main`, and verified Vercel production deployment.

- [ ] **Step 1: Document the exact customer and operator flow**

Add to the handoff:

1. Customer downloads only the Licensed build for their platform.
2. Customer attaches/installs it and submits platform plus runtime trading account number.
3. Admin receives Telegram notice, opens `/admin/license`, confirms payment when applicable, and approves.
4. Indicator activates on its next sync.
5. Admin download cards count recorded button activations, not unique customers.
6. Personal builds remain private and share one operator token.
7. The current token becomes recoverable only after the first post-migration rotation; reveal clears from browser memory after 60 seconds.
8. Rotation invalidates the prior token on cTrader, MT4, and MT5.

Record the feature in `CHANGELOG.md` without claiming deployment before verification succeeds.

- [ ] **Step 2: Run security scans and focused tests**

Run:

```bash
rg -n -i "ENGINE_SECRET|SUPABASE_SERVICE|service_role|INDICATOR_TOKEN_ENCRYPTION_KEY" public/downloads lib pages tests
node --test tests/indicatorPublicProducts.test.mjs tests/publicOverlayDistributionSql.test.mjs tests/indicatorDownload.test.mjs tests/indicatorLicenseRequest.test.mjs tests/indicatorTokenVault.test.mjs tests/indicatorFeedAdmin.test.mjs tests/indicatorTokenGenerator.test.mjs tests/indicatorLicenseAdminUi.test.mjs tests/ctraderOverlay.test.mjs tests/ctraderOverlayApi.test.mjs tests/ctraderOverlaySource.test.mjs tests/metatraderOverlayAdmin.test.mjs tests/metatraderOverlayApi.test.mjs tests/metatraderOverlaySource.test.mjs
```

Expected: no secret values in public/client artifacts; documentation and server-only environment-variable-name references are acceptable; all tests PASS.

- [ ] **Step 3: Run mandatory repository checks**

Run:

```bash
python3 check_dupes.py
npx next build
test -f package.json
test -f package-lock.json
test -f vercel.json
test -f next.config.js
git status --short
```

Expected: duplicate check PASS, Next build succeeds, all four critical files exist, none is staged for deletion, and only scoped feature files plus the user's pre-existing untracked files are present.

- [ ] **Step 4: Commit documentation and verification record**

```bash
git add CHANGELOG.md docs/MT4_MT5_DASHBOARD_OVERLAY_HANDOFF.md
git diff --cached --check
git commit -m "document-public-overlay-license-flow"
```

- [ ] **Step 5: Apply and verify the production Supabase migration**

Execute the entire checked-in `supabase/public_overlay_distribution.sql` against project `jxkelchxitwuilpbrwxk` using the connected Supabase SQL runner. Then run these read-only verification queries:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('indicator_download_events', 'indicator_feed_token_rotations')
order by table_name;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'indicator_feed_settings'
  and column_name in ('token_ciphertext', 'token_iv', 'token_auth_tag')
order by column_name;
```

Expected: two table rows and three column rows. Do not rotate the active Personal token during deployment.

- [ ] **Step 6: Configure the production encryption key without printing it**

From the already-linked Vercel project, run:

```bash
openssl rand -base64 32 | npx vercel env add INDICATOR_TOKEN_ENCRYPTION_KEY production
```

Expected: Vercel confirms the environment variable was added. Do not echo, inspect, or commit the generated value.

- [ ] **Step 7: Final pre-push deletion check and push**

Run:

```bash
git status --short
git diff --name-status origin/main...HEAD
git push origin main
```

Expected: `package.json`, `package-lock.json`, `vercel.json`, and `next.config.js` are not deleted; push to `gian101310/panda-dashboar` `main` succeeds without force.

- [ ] **Step 8: Verify Vercel production and live public flow**

Inspect the deployment created by the pushed commit. It must target production, reach `READY`, be aliased to `pandaengine.app`, and take longer than 20 seconds to build.

Run:

```bash
curl -sS -D - -o /dev/null 'https://pandaengine.app/api/indicator-download?product=ctrader_dashboard_overlay'
curl -sS -D - -o /dev/null 'https://pandaengine.app/api/indicator-download?product=mt4_dashboard_overlay'
curl -sS -D - -o /dev/null 'https://pandaengine.app/api/indicator-download?product=mt5_dashboard_overlay'
curl -sS -o /dev/null -w '%{http_code}\n' 'https://pandaengine.app/api/indicator-download?product=unknown_product'
```

Expected: the three allowlisted requests return 302 with their platform-specific `/downloads/` locations; the unknown product returns 404. These three checks increment recorded counts.

As an authenticated admin, open `/admin/license` and verify the three totals show at least one recorded download, recent activity shows all three platforms, the legacy hash-only token says recovery requires one rotation, and rotation history contains no token values. Do not rotate the token as part of verification.

- [ ] **Step 9: Record deployment verification**

If the deployment and live checks pass, add the verified production URL, Vercel state, and build duration to `CHANGELOG.md`, then run:

```bash
git add CHANGELOG.md
git diff --cached --check
git commit -m "verify-public-overlay-production"
git push origin main
```

Verify the documentation-only deployment also reaches `READY` with a build duration greater than 20 seconds.
