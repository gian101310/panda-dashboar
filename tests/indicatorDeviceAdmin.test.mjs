import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createIndicatorDeviceAdminHandler } from '../lib/indicatorDeviceAdminHandler.mjs';

const licenseId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

async function invoke(handler, { method = 'GET', body = {}, query = {} } = {}) {
  const res = response();
  await handler({ method, body, query }, res);
  return res;
}

function dependencies(overrides = {}) {
  const calls = [];
  return {
    calls,
    handler: createIndicatorDeviceAdminHandler({
      requireAdmin: async () => ({ username: 'Boss-G' }),
      listPolicies: async () => [{ product_code: 'mt5_dashboard_overlay', enabled: false }],
      listDevices: async () => [{
        id: deviceId,
        license_id: licenseId,
        product_code: 'mt5_dashboard_overlay',
        platform: 'MT5',
        device_fingerprint: 'abcdef123456',
        device_id_hash: 'private-id-hash',
        device_token_hash: 'private-token-hash',
        status: 'ACTIVE',
        activated_at: '2026-07-15T10:00:00Z',
        last_seen_at: '2026-07-15T10:05:00Z',
      }],
      getActiveDeviceCount: async () => 2,
      setLicenseLimit: async (...args) => { calls.push(['limit', ...args]); },
      setEnforcement: async (...args) => { calls.push(['enforcement', ...args]); },
      revokeDevice: async (...args) => { calls.push(['revoke', ...args]); },
      resetDevices: async (...args) => { calls.push(['reset', ...args]); },
      ...overrides,
    }),
  };
}

test('requires an authenticated admin', async () => {
  const { handler } = dependencies({ requireAdmin: async () => null });
  assert.equal((await invoke(handler)).statusCode, 403);
});

test('lists policies and sanitized device metadata without credential hashes', async () => {
  const { handler } = dependencies();
  const res = await invoke(handler, { query: { license_id: licenseId } });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.devices[0].device_fingerprint, 'abcdef123456');
  assert.equal(res.body.devices[0].device_id_hash, undefined);
  assert.equal(res.body.devices[0].device_token_hash, undefined);
  assert.equal(res.body.policies[0].enabled, false);
});

test('validates device limit and refuses to lower it below active usage', async () => {
  const { handler } = dependencies();
  const tooLow = await invoke(handler, { method: 'PATCH', body: { action: 'set_limit', license_id: licenseId, device_limit: 1 } });
  const outOfRange = await invoke(handler, { method: 'PATCH', body: { action: 'set_limit', license_id: licenseId, device_limit: 101 } });

  assert.equal(tooLow.statusCode, 409);
  assert.match(tooLow.body.error, /revoke devices first/i);
  assert.equal(outOfRange.statusCode, 400);
});

test('updates a valid limit and a fixed product enforcement policy', async () => {
  const { handler, calls } = dependencies({ getActiveDeviceCount: async () => 1 });
  assert.equal((await invoke(handler, { method: 'PATCH', body: { action: 'set_limit', license_id: licenseId, device_limit: 3 } })).statusCode, 200);
  assert.equal((await invoke(handler, { method: 'PATCH', body: { action: 'set_enforcement', product_code: 'mt5_dashboard_overlay', enabled: true } })).statusCode, 200);
  assert.deepEqual(calls, [
    ['limit', licenseId, 3],
    ['enforcement', 'mt5_dashboard_overlay', true, 'Boss-G'],
  ]);
});

test('rejects unknown enforcement products', async () => {
  const { handler } = dependencies();
  const res = await invoke(handler, { method: 'PATCH', body: { action: 'set_enforcement', product_code: 'unknown', enabled: true } });
  assert.equal(res.statusCode, 400);
});

test('revokes one device or resets every device without deleting audit rows', async () => {
  const { handler, calls } = dependencies();
  assert.equal((await invoke(handler, { method: 'POST', body: { action: 'revoke', device_id: deviceId } })).statusCode, 200);
  assert.equal((await invoke(handler, { method: 'POST', body: { action: 'reset', license_id: licenseId } })).statusCode, 200);
  assert.deepEqual(calls.map((call) => call.slice(0, 2)), [
    ['revoke', deviceId],
    ['reset', licenseId],
  ]);
});
