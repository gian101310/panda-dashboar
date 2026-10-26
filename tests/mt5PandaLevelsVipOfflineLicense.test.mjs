import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import { createMt5PandaLevelsVipLicense, MT5_PANDA_LEVELS_VIP_LICENSE_VERSION } from '../lib/mt5PandaLevelsVipOfflineLicense.mjs';

const key = 'c3'.repeat(32);
const approved = {
  product_code: 'mt5_panda_levels_vip',
  platform: 'MT5',
  status: 'APPROVED',
  paid_confirmed: true,
  trading_account_number: '12345678',
  expires_at: '2026-12-31',
};

test('VIP license signs its own product version, account, Dubai expiry and nonce', () => {
  const nonce = 'b4'.repeat(16);
  const result = createMt5PandaLevelsVipLicense(approved, key, { now: new Date('2026-10-26T00:00:00Z'), nonce });
  const [version, account, expiry, fileNonce, mac] = result.content.trim().split(/\r?\n/);
  assert.equal(result.fileName, 'PandaLevelsMT5VIP_12345678.lic');
  assert.equal(version, MT5_PANDA_LEVELS_VIP_LICENSE_VERSION);
  assert.equal(account, '12345678');
  assert.equal(expiry, String(Date.parse('2026-12-31T19:59:59Z') / 1000));
  assert.equal(fileNonce, nonce);
  assert.equal(mac, createHmac('sha256', Buffer.from(key, 'hex')).update(`${version}|${account}|${expiry}|${fileNonce}`).digest('hex'));
});

test('VIP license rejects standard Levels, unpaid, disabled and expired records', () => {
  const now = new Date('2026-10-26T00:00:00Z');
  for (const change of [
    { product_code: 'mt5_panda_levels_v1' },
    { paid_confirmed: false },
    { status: 'DISABLED' },
    { expires_at: '2026-10-25' },
  ]) {
    assert.throws(() => createMt5PandaLevelsVipLicense({ ...approved, ...change }, key, { now }), Error);
  }
});
