import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCtraderOverlayHandler } from '../lib/ctraderOverlayHandler.mjs';
import { hashOverlayToken } from '../lib/ctraderOverlay.mjs';

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

function dependencies(overrides = {}) {
  const calls = { dashboard: 0, touch: 0 };
  return {
    calls,
    deps: {
      now: () => new Date('2026-07-14T10:00:00Z'),
      getTokenSetting: async () => ({ token_hash: hashOverlayToken('operator-token-value-that-is-long-enough-123') }),
      getLicense: async (account) => account === '12345678'
        ? { id: 'license-1', status: 'APPROVED', expires_at: '2026-08-01T00:00:00Z' }
        : account === '22222222' ? { id: 'license-2', status: 'PENDING' } : null,
      getDashboardRows: async () => {
        calls.dashboard += 1;
        return [{
          symbol: 'EURUSD', gap: 8, bias: 'BUY', hard_invalid: false,
          box_h4_trend: 'UPTREND', box_h1_trend: 'UPTREND', pl_zone: 'ABOVE',
          pl_bias: 'BUY', pl_g1_valid: true, base_currency: 'EUR', base_score_tf: 'D1:+5',
          quote_currency: 'USD', quote_score_tf: 'H1:-3', updated_at: '2026-07-14T09:59:00Z',
          service_role_key: 'never-return-this',
        }];
      },
      touchLicense: async () => { calls.touch += 1; },
      rateLimiter: () => true,
      ...overrides,
    },
  };
}

async function invoke(handler, { method = 'GET', headers = {} } = {}) {
  const res = response();
  await handler({ method, headers, socket: { remoteAddress: '127.0.0.1' } }, res);
  return res;
}

test('rejects methods and missing or conflicting credentials', async () => {
  const { deps } = dependencies();
  const handler = createCtraderOverlayHandler(deps);
  assert.equal((await invoke(handler, { method: 'POST' })).statusCode, 405);
  assert.equal((await invoke(handler)).statusCode, 401);
  const both = await invoke(handler, { headers: {
    'x-panda-operator-token': 'operator-token-value-that-is-long-enough-123',
    'x-panda-account-number': '12345678',
  } });
  assert.equal(both.statusCode, 400);
});

test('authorizes a valid operator token without exposing dashboard extras', async () => {
  const { deps } = dependencies();
  const res = await invoke(createCtraderOverlayHandler(deps), { headers: {
    'x-panda-operator-token': 'operator-token-value-that-is-long-enough-123',
  } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  assert.equal(res.body.schema_version, 1);
  assert.equal(res.body.pairs[0].symbol, 'EURUSD');
  assert.equal(res.body.pairs[0].service_role_key, undefined);
});

test('rejects invalid token and non-approved accounts without pair data', async () => {
  const { deps } = dependencies();
  const handler = createCtraderOverlayHandler(deps);
  const token = await invoke(handler, { headers: { 'x-panda-operator-token': 'wrong-token-that-is-still-long-enough-123456' } });
  assert.equal(token.statusCode, 403);
  assert.equal(token.body.pairs, undefined);
  const pending = await invoke(handler, { headers: { 'x-panda-account-number': '22222222' } });
  assert.equal(pending.statusCode, 403);
  assert.equal(pending.body.status, 'PENDING');
  const unknown = await invoke(handler, { headers: { 'x-panda-account-number': '99999999' } });
  assert.equal(unknown.statusCode, 403);
  assert.equal(unknown.body.status, 'LICENSE_REQUIRED');
});

test('authorizes approved account, touches verification, and caches dashboard snapshot', async () => {
  const { deps, calls } = dependencies();
  const handler = createCtraderOverlayHandler(deps);
  const headers = { 'x-panda-account-number': '12345678' };
  assert.equal((await invoke(handler, { headers })).statusCode, 200);
  assert.equal((await invoke(handler, { headers })).statusCode, 200);
  assert.equal(calls.dashboard, 1);
  assert.equal(calls.touch, 2);
});

test('rate limits abusive clients', async () => {
  const { deps } = dependencies({ rateLimiter: () => false });
  const res = await invoke(createCtraderOverlayHandler(deps), { headers: {
    'x-panda-account-number': '12345678',
  } });
  assert.equal(res.statusCode, 429);
});
