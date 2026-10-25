import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import { createMt5PandaLevelsLicense, expiryAtEndOfDubaiDay } from '../lib/mt5PandaLevelsOfflineLicense.mjs';

const key = 'a1'.repeat(32);
const approved = {
  product_code: 'mt5_panda_levels_v1',
  platform: 'MT5',
  status: 'APPROVED',
  paid_confirmed: true,
  trading_account_number: '12345678',
  expires_at: '2026-12-31',
};

test('MT5 license date includes the whole selected Dubai day', () => {
  assert.equal(expiryAtEndOfDubaiDay('2026-12-31'), Date.parse('2026-12-31T19:59:59Z') / 1000);
  assert.equal(expiryAtEndOfDubaiDay('2026-02-30'), null);
});

test('approved MT5 license file binds product, account, expiry and nonce', () => {
  const nonce = 'b2'.repeat(16);
  const result = createMt5PandaLevelsLicense(approved, key, { now: new Date('2026-10-26T00:00:00Z'), nonce });
  const [version, account, expiry, fileNonce, mac] = result.content.trim().split(/\r?\n/);
  assert.equal(result.fileName, 'PandaLevelsMT5_12345678.lic');
  assert.equal(version, 'PANDA_MT5_LEVELS_V1');
  assert.equal(account, '12345678');
  assert.equal(expiry, String(Date.parse('2026-12-31T19:59:59Z') / 1000));
  assert.equal(fileNonce, nonce);
  const expected = createHmac('sha256', Buffer.from(key, 'hex')).update(`${version}|${account}|${expiry}|${fileNonce}`).digest('hex');
  assert.equal(mac, expected);
});

test('offline license cannot be issued for unpaid, disabled, expired or other products', () => {
  const now = new Date('2026-10-26T00:00:00Z');
  for (const change of [
    { paid_confirmed: false },
    { status: 'DISABLED' },
    { expires_at: '2026-10-25' },
    { product_code: 'mt5_dashboard_overlay' },
  ]) {
    assert.throws(() => createMt5PandaLevelsLicense({ ...approved, ...change }, key, { now }), Error);
  }
});
