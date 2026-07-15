import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const root = 'panda-indicators/2026-07-14';

test('cTrader Licensed source persists automatic per-device credentials', () => {
  const core = fs.readFileSync(`${root}/ctrader-dashboard-overlay/PandaDashboardOverlay.Core.cs`, 'utf8');
  const licensed = fs.readFileSync(`${root}/ctrader-dashboard-overlay/PandaDashboardOverlay.Licensed.cs`, 'utf8');
  const personal = fs.readFileSync(`${root}/ctrader-dashboard-overlay/PandaDashboardOverlay.Personal.cs`, 'utf8');
  assert.match(core, /x-panda-device-id/);
  assert.match(core, /x-panda-device-token/);
  assert.match(core, /device_activation/);
  assert.match(licensed, /LocalStorageScope\.Device/);
  assert.match(licensed, /Guid\.NewGuid/);
  assert.doesNotMatch(personal, /DeviceId|DeviceToken|device_activation/);
});

for (const platform of ['mt4', 'mt5']) {
  test(`${platform.toUpperCase()} Licensed source persists automatic per-device credentials`, () => {
    const upper = platform.toUpperCase();
    const core = fs.readFileSync(`${root}/mt4-mt5-dashboard-overlay/${platform}/PandaDashboardOverlay${upper}.Core.mqh`, 'utf8');
    const licensed = fs.readFileSync(`${root}/mt4-mt5-dashboard-overlay/${platform}/PandaDashboardOverlay${upper}-Licensed.mq${platform === 'mt4' ? '4' : '5'}`, 'utf8');
    const personal = fs.readFileSync(`${root}/mt4-mt5-dashboard-overlay/${platform}/PandaDashboardOverlay${upper}-Personal.mq${platform === 'mt4' ? '4' : '5'}`, 'utf8');
    assert.match(core, /x-panda-device-id/);
    assert.match(core, /x-panda-device-token/);
    assert.match(core, /device_activation/);
    assert.match(core, /FILE_COMMON/);
    assert.match(licensed, /"LICENSED"/);
    assert.match(personal, /"PERSONAL"/);
    assert.doesNotMatch(personal, /x-panda-device-id|x-panda-device-token/);
  });
}
