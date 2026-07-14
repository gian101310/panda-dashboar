import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hashOverlayToken } from '../lib/ctraderOverlay.mjs';
import { createMetatraderOverlayHandler } from '../lib/metatraderOverlayHandler.mjs';

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

async function invoke(handler, { method = 'GET', headers = {} } = {}) {
  const res = response();
  await handler({ method, headers, socket: { remoteAddress: '127.0.0.1' } }, res);
  return res;
}

function make(platform, productCode, overrides = {}) {
  const calls = { lookups: [], dashboard: 0, touch: 0 };
  return {
    calls,
    handler: createMetatraderOverlayHandler({
      platform,
      productCode,
      now: () => new Date('2026-07-14T10:00:00Z'),
      getTokenSetting: async () => ({ token_hash: hashOverlayToken('operator-token-value-that-is-long-enough-123') }),
      getLicense: async (account, requestedProduct, requestedPlatform) => {
        calls.lookups.push([account, requestedProduct, requestedPlatform]);
        return account === '12345678' ? { id: 'license-1', status: 'APPROVED' } : null;
      },
      getDashboardRows: async () => {
        calls.dashboard += 1;
        return [{ symbol: 'EURUSD', gap: 8, bias: 'BUY', service_role_key: 'never-return-this' }];
      },
      touchLicense: async () => { calls.touch += 1; },
      rateLimiter: () => true,
      ...overrides,
    }),
  };
}

test('rejects unsupported methods and conflicting credentials', async () => {
  const { handler } = make('MT4', 'mt4_dashboard_overlay');
  assert.equal((await invoke(handler, { method: 'POST' })).statusCode, 405);
  assert.equal((await invoke(handler)).statusCode, 401);
  const both = await invoke(handler, { headers: {
    'x-panda-operator-token': 'operator-token-value-that-is-long-enough-123',
    'x-panda-account-number': '12345678',
  } });
  assert.equal(both.statusCode, 400);
});

test('personal token authorizes both fixed MetaTrader routes', async () => {
  for (const [platform, product] of [['MT4', 'mt4_dashboard_overlay'], ['MT5', 'mt5_dashboard_overlay']]) {
    const { handler } = make(platform, product);
    const res = await invoke(handler, { headers: {
      'x-panda-operator-token': 'operator-token-value-that-is-long-enough-123',
    } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.pairs[0].symbol, 'EURUSD');
    assert.equal(res.body.pairs[0].service_role_key, undefined);
  }
});

test('licensed lookup receives the route-fixed product and platform', async () => {
  const mt4 = make('MT4', 'mt4_dashboard_overlay');
  const mt5 = make('MT5', 'mt5_dashboard_overlay');
  assert.equal((await invoke(mt4.handler, { headers: { 'x-panda-account-number': '12345678' } })).statusCode, 200);
  assert.equal((await invoke(mt5.handler, { headers: { 'x-panda-account-number': '12345678' } })).statusCode, 200);
  assert.deepEqual(mt4.calls.lookups, [['12345678', 'mt4_dashboard_overlay', 'MT4']]);
  assert.deepEqual(mt5.calls.lookups, [['12345678', 'mt5_dashboard_overlay', 'MT5']]);
  assert.equal(mt4.calls.touch, 1);
  assert.equal(mt5.calls.touch, 1);
});

test('denials contain no pair rows', async () => {
  const { handler } = make('MT4', 'mt4_dashboard_overlay');
  const wrongToken = await invoke(handler, { headers: {
    'x-panda-operator-token': 'wrong-token-that-is-still-long-enough-123456',
  } });
  const unknown = await invoke(handler, { headers: { 'x-panda-account-number': '99999999' } });
  assert.equal(wrongToken.statusCode, 403);
  assert.equal(wrongToken.body.status, 'AUTH_ERROR');
  assert.equal(wrongToken.body.pairs, undefined);
  assert.equal(unknown.statusCode, 403);
  assert.equal(unknown.body.status, 'LICENSE_REQUIRED');
  assert.equal(unknown.body.pairs, undefined);
});

test('rejects an approved account until payment is confirmed', async () => {
  const { handler } = make('MT4', 'mt4_dashboard_overlay', {
    getLicense: async () => ({ id: 'license-unpaid', status: 'APPROVED', paid_confirmed: false }),
  });
  const res = await invoke(handler, { headers: { 'x-panda-account-number': '12345678' } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.status, 'PAYMENT_PENDING');
  assert.equal(res.body.pairs, undefined);
});

test('caches the sanitized dashboard snapshot and rate limits abusive clients', async () => {
  const normal = make('MT5', 'mt5_dashboard_overlay');
  const headers = { 'x-panda-account-number': '12345678' };
  assert.equal((await invoke(normal.handler, { headers })).statusCode, 200);
  assert.equal((await invoke(normal.handler, { headers })).statusCode, 200);
  assert.equal(normal.calls.dashboard, 1);

  const limited = make('MT5', 'mt5_dashboard_overlay', { rateLimiter: () => false });
  assert.equal((await invoke(limited.handler, { headers })).statusCode, 429);
});
