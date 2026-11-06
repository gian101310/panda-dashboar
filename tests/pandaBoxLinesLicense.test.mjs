import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPandaBoxLinesLicenseHandler } from '../lib/pandaBoxLinesLicense.mjs';

function response() {
  return {
    statusCode: 200, body: '', headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    send(value) { this.body = value; return this; },
  };
}

const request = (account = '12345678') => ({ method: 'POST', body: `account_number=${account}`, headers: {}, socket: { remoteAddress: '127.0.0.1' } });

test('approval alone activates the registered MT4 account without a token', async () => {
  let checked = '';
  let touched = '';
  const handler = createPandaBoxLinesLicenseHandler({
    getLicense: async (account) => { checked = account; return { id: 'license-1', status: 'APPROVED', paid_confirmed: true }; },
    touchLicense: async (id) => { touched = id; },
  });
  const res = response();
  await handler(request(), res);
  assert.equal(checked, '12345678');
  assert.equal(touched, 'license-1');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, 'OK|APPROVED');
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
});

test('pending, disabled, unpaid and expired licenses deny access', async () => {
  const rows = [
    { status: 'PENDING', paid_confirmed: false },
    { status: 'DISABLED', paid_confirmed: true },
    { status: 'APPROVED', paid_confirmed: false },
    { status: 'APPROVED', paid_confirmed: true, expires_at: '2026-01-01T00:00:00Z' },
  ];
  const expected = ['DENY|PENDING', 'DENY|DISABLED', 'DENY|PAYMENT_PENDING', 'DENY|EXPIRED'];
  for (let i = 0; i < rows.length; i++) {
    const handler = createPandaBoxLinesLicenseHandler({ getLicense: async () => rows[i], now: () => new Date('2026-11-07T00:00:00Z') });
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body, expected[i]);
  }
});

test('invalid account and rate limit do not query license data', async () => {
  let reads = 0;
  const handler = createPandaBoxLinesLicenseHandler({ getLicense: async () => { reads++; return null; }, allowRequest: () => false });
  const invalid = response();
  await handler(request('bad-account'), invalid);
  assert.equal(invalid.statusCode, 400);
  const limited = response();
  await handler(request(), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(reads, 0);
});
