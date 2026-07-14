# MT4 and MT5 Dashboard Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Personal and account-licensed Panda Dashboard Overlay indicators for MT4 and MT5, wired to fixed Panda Engine API routes and the existing admin approval system.

**Architecture:** Two fixed Next.js routes use one injected MetaTrader feed handler so the server, not the client, selects the licensed product. Each MetaTrader platform has a shared MQL core and two compile-time entry editions; terminal-wide file caching and a global request lock keep many attached charts to one HTTPS refresh per minute.

**Tech Stack:** Next.js 14 API routes, Node.js built-in test runner, Supabase shared client, MQL4, MQL5, MetaEditor, SHA-256 release checksums.

## Global Constraints

- Work only in `/Users/gianfx/panda-dashboar` on `main`; push only `gian101310/panda-dashboar`.
- Do not modify `extract_panda_score()` or `compute_scores_all_pairs()` in `app.py`.
- Do not modify BB or INTRA strategy rules.
- Preserve the cTrader endpoint and existing indicator products.
- Personal editions use the existing operator token; Licensed editions use the runtime numeric account without broker identity.
- MT4 and MT5 Licensed approvals use separate fixed server-side product codes.
- No compiled or source artifact may contain an operator token, Supabase key, or `ENGINE_SECRET`.
- Do not stage the existing untracked `.superpowers/`, `CLAUDE.md`, or root `package-lock.json` files.
- Use `apply_patch` for repository edits.
- Before every release push run `/opt/homebrew/bin/python3.11 check_dupes.py` and `npx next build`.
- Confirm `package.json`, `package-lock.json`, `vercel.json`, and `next.config.js` are not staged for deletion.
- Use kebab-case commit messages and never force-push.

---

### Task 1: Register MT4 and MT5 products and normalize admin platforms

**Files:**
- Create: `tests/metatraderOverlayAdmin.test.mjs`
- Modify: `lib/indicatorProducts.mjs`
- Modify: `lib/indicatorLicense.mjs`
- Modify: `pages/api/admin/indicator-licenses.js`
- Modify: `pages/admin/license.js`

**Interfaces:**
- Consumes: existing `INDICATOR_PRODUCTS`, `getIndicatorProduct()`, and admin license CRUD.
- Produces: `MT4_OVERLAY_PRODUCT_CODE`, `MT5_OVERLAY_PRODUCT_CODE`, and `normalizeIndicatorPlatform(value)`.

- [ ] **Step 1: Write the failing admin/product test**

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import {
  INDICATOR_PRODUCTS,
  MT4_OVERLAY_PRODUCT_CODE,
  MT5_OVERLAY_PRODUCT_CODE,
} from '../lib/indicatorProducts.mjs';
import { normalizeIndicatorPlatform } from '../lib/indicatorLicense.mjs';

test('registers separate admin-only MT4 and MT5 overlay products', () => {
  assert.equal(MT4_OVERLAY_PRODUCT_CODE, 'mt4_dashboard_overlay');
  assert.equal(MT5_OVERLAY_PRODUCT_CODE, 'mt5_dashboard_overlay');
  assert.deepEqual(
    INDICATOR_PRODUCTS.filter((p) => p.code.endsWith('_dashboard_overlay'))
      .map((p) => [p.code, p.platform, p.adminOnly]),
    [
      ['ctrader_dashboard_overlay', 'CTRADER', true],
      ['mt4_dashboard_overlay', 'MT4', true],
      ['mt5_dashboard_overlay', 'MT5', true],
    ],
  );
});

test('normalizes only supported indicator platforms', () => {
  assert.equal(normalizeIndicatorPlatform('mt4'), 'MT4');
  assert.equal(normalizeIndicatorPlatform('mt5'), 'MT5');
  assert.equal(normalizeIndicatorPlatform('ctrader'), 'CTRADER');
  assert.equal(normalizeIndicatorPlatform('unknown'), 'MT4');
});

test('admin page describes one cross-platform personal token', () => {
  const source = fs.readFileSync('pages/admin/license.js', 'utf8');
  assert.match(source, /PERSONAL OVERLAY TOKEN/);
  assert.match(source, /cTrader, MT4 and MT5/);
  assert.match(source, /MT5 ACCOUNT NUMBER/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/metatraderOverlayAdmin.test.mjs`

Expected: FAIL because the two constants and `normalizeIndicatorPlatform` are not exported.

- [ ] **Step 3: Add product constants and records**

Add above `INDICATOR_PRODUCTS` in `lib/indicatorProducts.mjs`:

```js
export const MT4_OVERLAY_PRODUCT_CODE = 'mt4_dashboard_overlay';
export const MT5_OVERLAY_PRODUCT_CODE = 'mt5_dashboard_overlay';
```

Append after the cTrader product record:

```js
  {
    code: MT4_OVERLAY_PRODUCT_CODE,
    name: 'Panda MT4 Dashboard Overlay',
    priceLabel: 'Admin approved',
    platform: 'MT4',
    adminOnly: true,
  },
  {
    code: MT5_OVERLAY_PRODUCT_CODE,
    name: 'Panda MT5 Dashboard Overlay',
    priceLabel: 'Admin approved',
    platform: 'MT5',
    adminOnly: true,
  },
```

- [ ] **Step 4: Centralize platform normalization and admin account handling**

Add to `lib/indicatorLicense.mjs`:

```js
const INDICATOR_PLATFORMS = new Set(['MT4', 'MT5', 'CTRADER']);

export function normalizeIndicatorPlatform(value) {
  const platform = String(value || 'MT4').trim().toUpperCase();
  return INDICATOR_PLATFORMS.has(platform) ? platform : 'MT4';
}
```

Import and use it in `pages/api/admin/indicator-licenses.js`. Treat all three overlay platforms as numeric trading accounts:

```js
const platform = normalizeIndicatorPlatform(req.body?.platform);
const isOverlayPlatform = ['MT4', 'MT5', 'CTRADER'].includes(platform)
  && String(productCode || '').endsWith('_dashboard_overlay');
const account = isOverlayPlatform
  ? normalizeTradingAccountNumber(trading_account_number || mt4_account_id)
  : normalizeMt4AccountId(mt4_account_id);
```

When changing a product in PATCH, set both product code and its registered platform. Continue writing the numeric account to `mt4_account_id` and `trading_account_number` for schema compatibility.

- [ ] **Step 5: Update admin labels without changing token security**

Change the token-card heading and helper text to:

```jsx
<div style={{ fontFamily: orb, fontSize: 10, letterSpacing: 2, color: '#00b4ff' }}>PERSONAL OVERLAY TOKEN</div>
<div style={{ fontFamily: mono, fontSize: 8, color: '#2a3550', marginTop: 8 }}>
  One token serves cTrader, MT4 and MT5 Personal editions. Copy it before rotation; Panda Engine stores only its SHA-256 hash.
</div>
```

Derive the account label and input binding from the selected platform:

```js
const accountLabel = form.platform === 'CTRADER'
  ? 'CTRADER ACCOUNT NUMBER *'
  : form.platform === 'MT5'
    ? 'MT5 ACCOUNT NUMBER *'
    : 'MT4 ACCOUNT ID *';
const usesTradingAccount = ['CTRADER', 'MT5'].includes(form.platform)
  || String(form.product_code).endsWith('_dashboard_overlay');
```

- [ ] **Step 6: Run focused and existing admin tests**

Run:

```bash
node --test tests/metatraderOverlayAdmin.test.mjs tests/indicatorFeedAdmin.test.mjs tests/indicatorTokenGenerator.test.mjs tests/ctraderOverlay.test.mjs
```

Expected: all tests PASS.

---

### Task 2: Add fixed MT4 and MT5 Panda Engine feed routes

**Files:**
- Create: `lib/metatraderOverlayHandler.mjs`
- Create: `pages/api/mt4-overlay.js`
- Create: `pages/api/mt5-overlay.js`
- Create: `tests/metatraderOverlayApi.test.mjs`

**Interfaces:**
- Consumes: `hashOverlayToken()`, `safeTokenEqual()`, `sanitizeOverlayRows()`, `normalizeTradingAccountNumber()`, and `decideOverlayCredential()` from `lib/ctraderOverlay.mjs`.
- Produces: `createMetatraderOverlayHandler({ platform, productCode, ...dependencies })` and schema-version-1 feed routes.

- [ ] **Step 1: Write failing route-isolation tests**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMetatraderOverlayHandler } from '../lib/metatraderOverlayHandler.mjs';
import { hashOverlayToken } from '../lib/ctraderOverlay.mjs';

function response() {
  return { statusCode: 200, headers: {}, body: undefined,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

async function invoke(handler, headers = {}) {
  const res = response();
  await handler({ method: 'GET', headers, socket: { remoteAddress: '127.0.0.1' } }, res);
  return res;
}

function make(platform, productCode) {
  const lookups = [];
  return {
    lookups,
    handler: createMetatraderOverlayHandler({
      platform,
      productCode,
      now: () => new Date('2026-07-14T10:00:00Z'),
      getTokenSetting: async () => ({ token_hash: hashOverlayToken('operator-token-value-that-is-long-enough-123') }),
      getLicense: async (account, requestedProduct, requestedPlatform) => {
        lookups.push([account, requestedProduct, requestedPlatform]);
        return account === '12345678' ? { id: 'license-1', status: 'APPROVED' } : null;
      },
      getDashboardRows: async () => [{ symbol: 'EURUSD', gap: 8, bias: 'BUY' }],
      touchLicense: async () => {},
      rateLimiter: () => true,
    }),
  };
}

test('personal token authorizes both fixed MetaTrader routes', async () => {
  for (const [platform, product] of [['MT4', 'mt4_dashboard_overlay'], ['MT5', 'mt5_dashboard_overlay']]) {
    const { handler } = make(platform, product);
    const res = await invoke(handler, { 'x-panda-operator-token': 'operator-token-value-that-is-long-enough-123' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.pairs[0].symbol, 'EURUSD');
  }
});

test('licensed lookup receives the route-fixed product and platform', async () => {
  const mt4 = make('MT4', 'mt4_dashboard_overlay');
  const mt5 = make('MT5', 'mt5_dashboard_overlay');
  assert.equal((await invoke(mt4.handler, { 'x-panda-account-number': '12345678' })).statusCode, 200);
  assert.equal((await invoke(mt5.handler, { 'x-panda-account-number': '12345678' })).statusCode, 200);
  assert.deepEqual(mt4.lookups, [['12345678', 'mt4_dashboard_overlay', 'MT4']]);
  assert.deepEqual(mt5.lookups, [['12345678', 'mt5_dashboard_overlay', 'MT5']]);
});

test('denials contain no pair rows', async () => {
  const { handler } = make('MT4', 'mt4_dashboard_overlay');
  const missing = await invoke(handler);
  const wrong = await invoke(handler, { 'x-panda-account-number': '99999999' });
  assert.equal(missing.statusCode, 401);
  assert.equal(wrong.statusCode, 403);
  assert.equal(wrong.body.pairs, undefined);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/metatraderOverlayApi.test.mjs`

Expected: FAIL with module-not-found for `lib/metatraderOverlayHandler.mjs`.

- [ ] **Step 3: Implement the injected MetaTrader handler**

Create `createMetatraderOverlayHandler` with this public contract:

```js
export function createMetatraderOverlayHandler({
  platform,
  productCode,
  now = () => new Date(),
  getTokenSetting,
  getLicense,
  getDashboardRows,
  touchLicense = async () => {},
  rateLimiter = () => true,
})
```

Its request sequence is exact:

```js
if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
if (!rateLimiter(ip)) return res.status(429).json({ error: 'Too many requests' });
if (token && rawAccount) return res.status(400).json({ error: 'Use one credential type' });
if (!token && !rawAccount) return res.status(401).json({ error: 'Authentication required' });

if (token) {
  if (token.length < 32 || token.length > 256) return res.status(403).json({ status: 'AUTH_ERROR' });
  const setting = await getTokenSetting();
  if (!setting?.token_hash || !safeTokenEqual(hashOverlayToken(token), setting.token_hash))
    return res.status(403).json({ status: 'AUTH_ERROR' });
} else {
  const account = normalizeTradingAccountNumber(rawAccount);
  if (!account) return res.status(400).json({ status: 'INVALID_ACCOUNT' });
  const license = await getLicense(account, productCode, platform);
  const decision = decideOverlayCredential(license, now());
  if (!decision.ok) return res.status(403).json({ status: decision.status });
  await touchLicense(license.id, now().toISOString());
}
```

Return the same allowlisted schema version 1 response as cTrader and cache sanitized dashboard rows for 10 seconds inside the handler factory.

- [ ] **Step 4: Add fixed routes**

Each route imports the shared Supabase client and factory. The license query is fixed to the route platform and product:

```js
.eq('platform', PLATFORM)
.eq('trading_account_number', account)
.eq('product_code', PRODUCT_CODE)
```

Both routes read `indicator_feed_settings.setting_key = 'ctrader_operator_token'`, select the existing dashboard allowlist, update `last_verified_at`, use a 90-request-per-IP rolling minute limiter, and return generic `Feed unavailable` on server errors.

- [ ] **Step 5: Run API and cTrader regression tests**

Run:

```bash
node --test tests/metatraderOverlayApi.test.mjs tests/ctraderOverlayApi.test.mjs tests/ctraderOverlay.test.mjs
```

Expected: all tests PASS and cTrader behavior is unchanged.

- [ ] **Step 6: Commit and push the backend/admin slice**

```bash
git add lib/indicatorProducts.mjs lib/indicatorLicense.mjs lib/metatraderOverlayHandler.mjs pages/api/admin/indicator-licenses.js pages/admin/license.js pages/api/mt4-overlay.js pages/api/mt5-overlay.js tests/metatraderOverlayAdmin.test.mjs tests/metatraderOverlayApi.test.mjs
git commit -m "add-metatrader-overlay-licensing"
git push origin main
```

Verify that Vercel reaches READY and the deployment takes more than 20 seconds.

---

### Task 3: Build MT4 Personal and Licensed indicators

**Files:**
- Create: `tests/metatraderOverlaySource.test.mjs`
- Create: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/mt4/PandaDashboardOverlayMT4.Core.mqh`
- Create: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/mt4/PandaDashboardOverlayMT4-Personal.mq4`
- Create: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/mt4/PandaDashboardOverlayMT4-Licensed.mq4`

**Interfaces:**
- Consumes: `GET https://pandaengine.app/api/mt4-overlay`, schema version 1, and either Panda auth header.
- Produces: two MT4 custom indicators using one `PandaOverlayMT4` core class.

- [ ] **Step 1: Write failing MT4 source contracts**

The test reads all three files and asserts:

```js
assert.match(personal4, /input string OperatorToken/);
assert.match(personal4, /x-panda-operator-token/);
assert.doesNotMatch(personal4, /AccountNumber\s*\(/);
assert.match(licensed4, /AccountNumber\s*\(\s*\)/);
assert.match(licensed4, /x-panda-account-number/);
assert.doesNotMatch(licensed4, /OperatorToken/);
assert.match(core4, /https:\/\/pandaengine\.app\/api\/mt4-overlay/);
assert.match(core4, /EventSetTimer\s*\(\s*1\s*\)/);
assert.match(core4, /FILE_COMMON/);
assert.match(core4, /GlobalVariableSetOnCondition/);
assert.match(core4, /60/);
for (const label of ['SCORE', 'BIAS', 'BOX H4', 'BOX H1', 'PANDA LINES', 'XTF'])
  assert.ok(core4.includes(label));
assert.doesNotMatch(`${core4}\n${personal4}\n${licensed4}`, /ENGINE_SECRET|SUPABASE_SERVICE|service_role/i);
```

- [ ] **Step 2: Run the source test and verify RED**

Run: `node --test tests/metatraderOverlaySource.test.mjs`

Expected: FAIL because the MT4 files do not exist.

- [ ] **Step 3: Implement the shared MT4 core**

Define these exact public methods in `PandaOverlayMT4`:

```cpp
bool Initialize(const string edition, const string headerName, const string credential);
void Shutdown();
void OnTimer();
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam);
int OnCalculate(const int rates_total, const int prev_calculated);
```

The core uses these exact state rules:

```cpp
const string PANDA_MT4_ENDPOINT = "https://pandaengine.app/api/mt4-overlay";
const int PANDA_REFRESH_SECONDS = 60;
const int PANDA_LOCK_TIMEOUT_SECONDS = 15;
const ENUM_BASE_CORNER PANDA_DEFAULT_CORNER = CORNER_LEFT_LOWER;
```

`OnTimer()` normalizes `_Symbol`, checks the credential, reads a fresh credential-scoped `FILE_COMMON` JSON cache, and acquires a terminal global lock with `GlobalVariableSetOnCondition` only when the last attempt is at least 60 seconds old. `WebRequest` sends one custom header plus `Accept: application/json`. HTTP 200 replaces the cache atomically; HTTP 401/403 clears protected values; network, permission, or parse failures preserve the last valid snapshot and update status. All failed attempts record their timestamp so the one-second timer cannot retry before 60 seconds.

The parser locates the canonical symbol object in the schema-version-1 JSON and extracts `gap`, `bias`, `box_h4_trend`, `box_h1_trend`, `pl_zone`, `pl_g1_valid`, `base_currency`, `base_score_tf`, `quote_currency`, `quote_score_tf`, `updated_at`, and `max_age_seconds`. Missing values become an em dash.

Chart objects use one unique prefix derived from `ChartID()`. Create a `OBJ_RECTANGLE_LABEL` background, draggable header, minimize button, value labels, and footer. All objects use `CORNER_LEFT_LOWER`; default X/Y distances are 12. A header drag copies the new X/Y delta to every object and stores the offsets in terminal global variables. Minimize hides expanded rows and keeps symbol, Score, Bias, and status.

- [ ] **Step 4: Implement separate MT4 entry editions**

Personal entry credential binding:

```cpp
#property strict
#property indicator_chart_window
#include "PandaDashboardOverlayMT4.Core.mqh"
input string OperatorToken = "";
PandaOverlayMT4 Overlay;
int OnInit() { EventSetTimer(1); return Overlay.Initialize("PERSONAL", "x-panda-operator-token", OperatorToken) ? INIT_SUCCEEDED : INIT_FAILED; }
void OnDeinit(const int reason) { EventKillTimer(); Overlay.Shutdown(); }
void OnTimer() { Overlay.OnTimer(); }
void OnChartEvent(const int id,const long &l,const double &d,const string &s) { Overlay.OnChartEvent(id,l,d,s); }
int OnCalculate(const int total,const int previous,const datetime &time[],const double &open[],const double &high[],const double &low[],const double &close[],const long &tick_volume[],const long &volume[],const int &spread[]) { return Overlay.OnCalculate(total, previous); }
```

Licensed entry uses the same lifecycle but calls:

```cpp
Overlay.Initialize("LICENSED", "x-panda-account-number", IntegerToString(AccountNumber()))
```

and contains no `OperatorToken` input.

- [ ] **Step 5: Run MT4 source contracts**

Run: `node --test tests/metatraderOverlaySource.test.mjs`

Expected: MT4 assertions PASS; MT5 assertions remain pending only until Task 4 adds their files.

---

### Task 4: Build MT5 Personal and Licensed indicators

**Files:**
- Create: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/mt5/PandaDashboardOverlayMT5.Core.mqh`
- Create: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/mt5/PandaDashboardOverlayMT5-Personal.mq5`
- Create: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/mt5/PandaDashboardOverlayMT5-Licensed.mq5`
- Modify: `tests/metatraderOverlaySource.test.mjs`

**Interfaces:**
- Consumes: `GET https://pandaengine.app/api/mt5-overlay`, schema version 1, and either Panda auth header.
- Produces: two MT5 custom indicators using one `PandaOverlayMT5` core class.

- [ ] **Step 1: Add failing MT5 contracts**

```js
assert.match(personal5, /input string OperatorToken/);
assert.match(personal5, /x-panda-operator-token/);
assert.match(licensed5, /AccountInfoInteger\s*\(\s*ACCOUNT_LOGIN\s*\)/);
assert.match(licensed5, /x-panda-account-number/);
assert.doesNotMatch(licensed5, /OperatorToken/);
assert.match(core5, /https:\/\/pandaengine\.app\/api\/mt5-overlay/);
assert.match(core5, /EventSetTimer\s*\(\s*1\s*\)/);
assert.match(core5, /FILE_COMMON/);
assert.match(core5, /GlobalVariableSetOnCondition/);
for (const label of ['SCORE', 'BIAS', 'BOX H4', 'BOX H1', 'PANDA LINES', 'XTF'])
  assert.ok(core5.includes(label));
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/metatraderOverlaySource.test.mjs`

Expected: FAIL because the MT5 source files do not exist.

- [ ] **Step 3: Implement the MT5 core with the same observable contract**

Use the same method names, state machine, cache schema, lock timeout, object names, colors, refresh interval, parsing fields, drag behavior, minimization, and failure semantics as MT4. Use MT5-compatible `WebRequest`, `FileOpen`, chart-object, and account APIs. The fixed endpoint is:

```cpp
const string PANDA_MT5_ENDPOINT = "https://pandaengine.app/api/mt5-overlay";
```

The MT5 `OnCalculate` signature returns `Overlay.OnCalculate(rates_total, prev_calculated)` and never performs HTTP work.

- [ ] **Step 4: Implement separate MT5 entry editions**

Personal calls:

```cpp
Overlay.Initialize("PERSONAL", "x-panda-operator-token", OperatorToken)
```

Licensed calls:

```cpp
Overlay.Initialize("LICENSED", "x-panda-account-number", (string)AccountInfoInteger(ACCOUNT_LOGIN))
```

Both start a one-second timer in `OnInit`, stop it in `OnDeinit`, delegate chart events, and contain no trading functions.

- [ ] **Step 5: Run all package contracts and API tests**

Run:

```bash
node --test tests/metatraderOverlaySource.test.mjs tests/metatraderOverlayApi.test.mjs tests/metatraderOverlayAdmin.test.mjs tests/ctraderOverlaySource.test.mjs tests/ctraderOverlayApi.test.mjs
```

Expected: all tests PASS.

---

### Task 5: Compile four MetaTrader binaries and create release checksums

**Files:**
- Create: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/dist/PandaDashboardOverlayMT4-Personal.ex4`
- Create: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/dist/PandaDashboardOverlayMT4-Licensed.ex4`
- Create: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/dist/PandaDashboardOverlayMT5-Personal.ex5`
- Create: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/dist/PandaDashboardOverlayMT5-Licensed.ex5`
- Create: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/dist/MT4-compile.log`
- Create: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/dist/MT5-compile.log`
- Create: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/dist/SHA256SUMS`

**Interfaces:**
- Consumes: the four source entry files and two shared includes.
- Produces: four non-empty MetaTrader binaries with clean compile logs and checksums.

- [ ] **Step 1: Resolve bundled Wine and MetaEditor paths**

Compile directly from the repository so the shared include resolves beside each entry file. Define absolute Windows paths with each bundle's `winepath`:

```bash
ROOT="$PWD/panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay"
MT4_WINE="/Applications/MetaTrader 4.app/Contents/SharedSupport/wine/bin/wine64"
MT4_WINEPATH="/Applications/MetaTrader 4.app/Contents/SharedSupport/wine/bin/winepath"
MT5_WINE="/Applications/MetaTrader 5.app/Contents/SharedSupport/wine/bin/wine64"
MT5_WINEPATH="/Applications/MetaTrader 5.app/Contents/SharedSupport/wine/bin/winepath"
```

- [ ] **Step 2: Compile MT4 with its bundled MetaEditor**

Use these exact commands for Personal, then change `Personal` to `Licensed` and repeat:

```bash
MT4_SOURCE="$ROOT/mt4/PandaDashboardOverlayMT4-Personal.mq4"
MT4_LOG="$ROOT/dist/MT4-Personal-compile.log"
MT4_SOURCE_WIN="$(WINEPREFIX="$HOME/Library/Application Support/net.metaquotes.wine.metatrader4" "$MT4_WINEPATH" -w "$MT4_SOURCE")"
MT4_LOG_WIN="$(WINEPREFIX="$HOME/Library/Application Support/net.metaquotes.wine.metatrader4" "$MT4_WINEPATH" -w "$MT4_LOG")"
WINEPREFIX="$HOME/Library/Application Support/net.metaquotes.wine.metatrader4" \
  "$MT4_WINE" \
  'C:\Program Files (x86)\MetaTrader 4\metaeditor.exe' \
  /compile:"$MT4_SOURCE_WIN" /log:"$MT4_LOG_WIN"
```

Expected logs contain `0 error(s)` and the two `.ex4` files exist beside their entry sources with non-zero size. Move those two binaries explicitly into `dist/` after both compiles succeed.

- [ ] **Step 3: Compile MT5 with its bundled MetaEditor**

Use these exact commands for Personal, then change `Personal` to `Licensed` and repeat:

```bash
MT5_SOURCE="$ROOT/mt5/PandaDashboardOverlayMT5-Personal.mq5"
MT5_LOG="$ROOT/dist/MT5-Personal-compile.log"
MT5_SOURCE_WIN="$(WINEPREFIX="$HOME/Library/Application Support/net.metaquotes.wine.metatrader5" "$MT5_WINEPATH" -w "$MT5_SOURCE")"
MT5_LOG_WIN="$(WINEPREFIX="$HOME/Library/Application Support/net.metaquotes.wine.metatrader5" "$MT5_WINEPATH" -w "$MT5_LOG")"
WINEPREFIX="$HOME/Library/Application Support/net.metaquotes.wine.metatrader5" \
  "$MT5_WINE" \
  'C:\Program Files\MetaTrader 5\metaeditor64.exe' \
  /compile:"$MT5_SOURCE_WIN" /log:"$MT5_LOG_WIN"
```

Expected logs contain `0 error(s)` and the two `.ex5` files exist beside their entry sources with non-zero size. Move those two binaries explicitly into `dist/` after both compiles succeed.

- [ ] **Step 4: Copy verified binaries and generate checksums**

Run from `dist/`:

```bash
shasum -a 256 PandaDashboardOverlayMT4-Personal.ex4 PandaDashboardOverlayMT4-Licensed.ex4 PandaDashboardOverlayMT5-Personal.ex5 PandaDashboardOverlayMT5-Licensed.ex5 > SHA256SUMS
shasum -a 256 -c SHA256SUMS
```

Expected: all four artifacts report `OK`.

- [ ] **Step 5: Scan release sources and binaries for secret markers**

```bash
rg -n -i "ENGINE_SECRET|SUPABASE_SERVICE|service_role|ctrader_operator_token" panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay
```

Expected: only documentation references to the setting name are allowed; no plaintext token or secret value appears.

---

### Task 6: Document, hand off, verify, commit, push, and deploy

**Files:**
- Create: `panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/README.md`
- Create: `docs/MT4_MT5_DASHBOARD_OVERLAY_HANDOFF.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: final routes, product codes, artifacts, compile logs, and checksums.
- Produces: operator installation guide and reusable future-indicator handoff.

- [ ] **Step 1: Write the release README**

Document these exact operator actions:

1. Copy the matching `.ex4` or `.ex5` into the terminal's `MQL4/Indicators` or `MQL5/Indicators` folder.
2. Restart or refresh Navigator.
3. Add `https://pandaengine.app` under Tools → Options → Expert Advisors → Allow WebRequest.
4. Personal: paste the same operator token used by cTrader.
5. Licensed: create the correct MT4 or MT5 product approval using the numeric account only.
6. Attach to charts, drag the header, and use the minimize button.
7. Interpret `AUTH REQUIRED`, `AUTH ERROR`, `LICENSE REQUIRED`, `PENDING`, `DISABLED`, `EXPIRED`, `ALLOW WEBREQUEST`, `STALE`, and `LIVE`.

- [ ] **Step 2: Write the reusable handoff**

Record:

- Four absolute repository artifact paths and their SHA-256 values.
- Routes `/api/mt4-overlay` and `/api/mt5-overlay`.
- Products `mt4_dashboard_overlay` and `mt5_dashboard_overlay`.
- Personal copy-before-rotate procedure and shared token behavior across cTrader, MT4, and MT5.
- Licensed runtime-account binding with no broker requirement.
- Terminal-wide cache and lock design.
- Future-indicator rule: separate Personal/Licensed entry files, fixed server product identity, shared sanitized feed, no embedded credential, runtime account binding, TDD contracts, compiler verification, checksums, and Vercel verification.

- [ ] **Step 3: Update the changelog**

Add under `2026-07-14`:

```md
- Added Panda Dashboard Overlay Personal and account-licensed editions for MT4 and MT5.
- Added fixed Panda Engine MT4/MT5 feed routes with separate platform product approvals and shared Personal token authentication.
- Added terminal-wide one-minute snapshot caching, movable/minimizable panels, compiled release artifacts, checksums, and operator handoff documentation.
```

- [ ] **Step 4: Run the full verification gate**

```bash
node --test tests/*.test.mjs
/opt/homebrew/bin/python3.11 check_dupes.py
npx next build
shasum -a 256 -c panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay/dist/SHA256SUMS
git diff --check
git status --short
```

Confirm all tests pass, duplicate check passes, Next build exits 0, all four checksums are `OK`, compile logs contain zero errors, and critical files are not staged for deletion.

- [ ] **Step 5: Commit the indicator release**

```bash
git add CHANGELOG.md docs/MT4_MT5_DASHBOARD_OVERLAY_HANDOFF.md tests/metatraderOverlaySource.test.mjs panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay
git commit -m "build-mt4-mt5-dashboard-overlays"
git push origin main
```

- [ ] **Step 6: Verify production deployment**

Inspect the deployment created by the pushed commit. It must be target `production`, state `READY`, aliased to `pandaengine.app`, and have elapsed build time greater than 20 seconds. Then make authenticated live requests without printing the token to confirm both Personal routes return 200, and confirm an unknown numeric account returns 403 with no `pairs` field.
