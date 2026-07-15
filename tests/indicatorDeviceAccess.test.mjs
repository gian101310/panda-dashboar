import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createIndicatorDeviceAccess,
  hashDeviceValue,
} from '../lib/indicatorDeviceAccess.mjs';

const license = { id: 'license-1', device_limit: 2 };
const deviceId = '9f17989d-0d75-4d4d-9337-63fc35dd5db2';

test('allows legacy account access only while enforcement is disabled', async () => {
  const access = createIndicatorDeviceAccess({
    getEnforcement: async () => false,
  });

  const result = await access.authorize({
    license,
    productCode: 'mt5_dashboard_overlay',
    platform: 'MT5',
    deviceId: '',
    deviceToken: '',
  });

  assert.deepEqual(result, { ok: true, status: 'LEGACY_APPROVED' });
});

test('requires a valid random installation id when enforcement is enabled', async () => {
  const access = createIndicatorDeviceAccess({
    getEnforcement: async () => true,
  });

  const result = await access.authorize({
    license,
    productCode: 'mt5_dashboard_overlay',
    platform: 'MT5',
    deviceId: 'short',
    deviceToken: '',
  });

  assert.deepEqual(result, { ok: false, status: 'DEVICE_ID_REQUIRED' });
});

test('automatically issues a token for the first allowed device', async () => {
  let registration;
  const access = createIndicatorDeviceAccess({
    getEnforcement: async () => true,
    registerDevice: async (row) => {
      registration = row;
      return 'DEVICE_ACTIVATED';
    },
    randomBytesImpl: () => Buffer.alloc(32, 7),
  });

  const result = await access.authorize({
    license,
    productCode: 'mt5_dashboard_overlay',
    platform: 'MT5',
    deviceId,
    deviceToken: '',
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'DEVICE_ACTIVATED');
  assert.equal(result.issuedToken, '07'.repeat(32));
  assert.equal(registration.licenseId, license.id);
  assert.equal(registration.deviceIdHash, hashDeviceValue(deviceId));
  assert.equal(registration.deviceTokenHash, hashDeviceValue(result.issuedToken));
  assert.equal(registration.deviceFingerprint.length, 12);
});

test('propagates atomic device-limit denial without issuing a token', async () => {
  const access = createIndicatorDeviceAccess({
    getEnforcement: async () => true,
    registerDevice: async () => 'DEVICE_LIMIT_REACHED',
    randomBytesImpl: () => Buffer.alloc(32, 8),
  });

  const result = await access.authorize({
    license,
    productCode: 'ctrader_dashboard_overlay',
    platform: 'CTRADER',
    deviceId,
    deviceToken: '',
  });

  assert.deepEqual(result, { ok: false, status: 'DEVICE_LIMIT_REACHED' });
});

test('authorizes a matching active device token and touches the device', async () => {
  let touched = false;
  const token = 'ab'.repeat(32);
  const access = createIndicatorDeviceAccess({
    getEnforcement: async () => true,
    getDevice: async () => ({ id: 'device-1', status: 'ACTIVE', device_token_hash: hashDeviceValue(token) }),
    touchDevice: async (device) => { touched = device.id === 'device-1'; },
  });

  const result = await access.authorize({
    license,
    productCode: 'mt4_dashboard_overlay',
    platform: 'MT4',
    deviceId,
    deviceToken: token,
  });

  assert.deepEqual(result, { ok: true, status: 'DEVICE_APPROVED' });
  assert.equal(touched, true);
});

test('rejects missing, revoked, or mismatched device tokens', async () => {
  const missing = createIndicatorDeviceAccess({
    getEnforcement: async () => true,
    getDevice: async () => null,
  });
  const revoked = createIndicatorDeviceAccess({
    getEnforcement: async () => true,
    getDevice: async () => ({ id: 'device-1', status: 'REVOKED', device_token_hash: hashDeviceValue('ab'.repeat(32)) }),
  });
  const wrong = createIndicatorDeviceAccess({
    getEnforcement: async () => true,
    getDevice: async () => ({ id: 'device-1', status: 'ACTIVE', device_token_hash: hashDeviceValue('ab'.repeat(32)) }),
  });
  const request = { license, productCode: 'mt4_dashboard_overlay', platform: 'MT4', deviceId };

  assert.equal((await missing.authorize({ ...request, deviceToken: 'cd'.repeat(32) })).status, 'DEVICE_AUTH_ERROR');
  assert.equal((await revoked.authorize({ ...request, deviceToken: 'ab'.repeat(32) })).status, 'DEVICE_REVOKED');
  assert.equal((await wrong.authorize({ ...request, deviceToken: 'cd'.repeat(32) })).status, 'DEVICE_AUTH_ERROR');
});
