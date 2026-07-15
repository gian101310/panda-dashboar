import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createIndicatorFeedAdminHandler } from '../lib/indicatorFeedAdminHandler.mjs';

function response() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
  };
}

async function invoke(handler, { method = 'GET', body = {} } = {}) {
  const res = response();
  await handler({ method, body }, res);
  return res;
}

test('requires an authenticated admin', async () => {
  const handler = createIndicatorFeedAdminHandler({
    requireAdmin: async () => null,
    getSetting: async () => null,
    saveSetting: async () => {},
  });
  assert.equal((await invoke(handler)).statusCode, 403);
});

test('returns token configuration status without returning the hash', async () => {
  const handler = createIndicatorFeedAdminHandler({
    requireAdmin: async () => ({ username: 'Boss-G' }),
    getSetting: async () => ({
      token_hash: 'a'.repeat(64),
      token_ciphertext: 'ciphertext',
      token_iv: 'iv',
      token_auth_tag: 'tag',
      rotated_at: '2026-07-14T10:00:00Z',
    }),
    getRotations: async () => [{
      rotated_at: '2026-07-14T10:00:00Z',
      rotated_by: 'Boss-G',
      token_fingerprint: 'aaaaaaaaaaaa',
      token_ciphertext: 'drop-me',
    }],
    saveSetting: async () => {},
  });
  const res = await invoke(handler);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    configured: true,
    recoverable: true,
    rotated_at: '2026-07-14T10:00:00Z',
    rotations: [{
      rotated_at: '2026-07-14T10:00:00Z',
      rotated_by: 'Boss-G',
      token_fingerprint: 'aaaaaaaaaaaa',
    }],
  });
  assert.equal(JSON.stringify(res.body).includes('a'.repeat(64)), false);
  assert.equal(JSON.stringify(res.body).includes('drop-me'), false);
});

test('reports a legacy hash-only token as not recoverable', async () => {
  const handler = createIndicatorFeedAdminHandler({
    requireAdmin: async () => ({ username: 'Boss-G' }),
    getSetting: async () => ({ token_hash: 'b'.repeat(64), rotated_at: '2026-07-14T10:00:00Z' }),
    getRotations: async () => [],
    saveSetting: async () => {},
  });
  const res = await invoke(handler);
  assert.equal(res.body.configured, true);
  assert.equal(res.body.recoverable, false);
});

test('validates token length before storage', async () => {
  let saved = false;
  const handler = createIndicatorFeedAdminHandler({
    requireAdmin: async () => ({ username: 'Boss-G' }),
    getSetting: async () => null,
    saveSetting: async () => { saved = true; },
  });
  const res = await invoke(handler, { method: 'PUT', body: { token: 'short' } });
  assert.equal(res.statusCode, 400);
  assert.equal(saved, false);
});

test('stores only a SHA-256 hash and never echoes plaintext or hash', async () => {
  let stored;
  const token = 'new-private-operator-token-value-1234567890';
  const handler = createIndicatorFeedAdminHandler({
    requireAdmin: async () => ({ username: 'Boss-G' }),
    getSetting: async () => null,
    saveSetting: async (value) => { stored = value; },
    encryptToken: async () => ({
      token_ciphertext: 'encrypted-value',
      token_iv: 'random-iv',
      token_auth_tag: 'auth-tag',
    }),
    now: () => new Date('2026-07-14T11:00:00Z'),
  });
  const res = await invoke(handler, { method: 'PUT', body: { token } });
  assert.equal(res.statusCode, 200);
  assert.match(stored.token_hash, /^[a-f0-9]{64}$/);
  assert.equal(stored.token_hash.includes(token), false);
  assert.equal(stored.token_ciphertext, 'encrypted-value');
  assert.equal(stored.rotated_by, 'Boss-G');
  assert.deepEqual(res.body, { ok: true, configured: true, recoverable: true, rotated_at: '2026-07-14T11:00:00.000Z' });
  assert.equal(JSON.stringify(res.body).includes(token), false);
  assert.equal(JSON.stringify(res.body).includes(stored.token_hash), false);
});

test('reveals only a recoverable active token to an authenticated admin with no-store', async () => {
  const token = 'recoverable-active-token-value-123456789';
  const handler = createIndicatorFeedAdminHandler({
    requireAdmin: async () => ({ username: 'Boss-G' }),
    getSetting: async () => ({
      token_hash: 'c'.repeat(64),
      token_ciphertext: 'ciphertext',
      token_iv: 'iv',
      token_auth_tag: 'tag',
    }),
    getRotations: async () => [],
    saveSetting: async () => {},
    decryptToken: async () => token,
  });
  const res = await invoke(handler, { method: 'POST', body: { action: 'reveal' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { token });
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
});

test('refuses to reveal a legacy hash-only token', async () => {
  const handler = createIndicatorFeedAdminHandler({
    requireAdmin: async () => ({ username: 'Boss-G' }),
    getSetting: async () => ({ token_hash: 'd'.repeat(64) }),
    getRotations: async () => [],
    saveSetting: async () => {},
  });
  const res = await invoke(handler, { method: 'POST', body: { action: 'reveal' } });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /Rotate it once/);
});
