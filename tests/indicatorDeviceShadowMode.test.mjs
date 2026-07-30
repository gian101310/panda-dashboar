import test from 'node:test';
import assert from 'node:assert/strict';

import { createIndicatorDeviceShadowRecorder } from '../lib/indicatorDeviceShadowRecorder.mjs';

test('shadow recorder throttles the same license/product/outcome without retaining device credentials', async () => {
  const writes = [];
  let now = 1000;
  const record = createIndicatorDeviceShadowRecorder({
    writeEvent: async (event) => writes.push(event),
    now: () => now,
    throttleMs: 300000,
  });
  const event = {
    licenseId: 'license-1',
    productCode: 'mt5_dashboard_overlay',
    platform: 'MT5',
    wouldStatus: 'DEVICE_ID_REQUIRED',
    installationPresent: false,
    tokenPresent: false,
  };

  await record(event);
  await record(event);
  now += 300001;
  await record(event);

  assert.equal(writes.length, 2);
  assert.equal('deviceId' in writes[0], false);
  assert.equal('deviceToken' in writes[0], false);
});
