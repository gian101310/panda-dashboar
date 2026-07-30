import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('shadow-mode migration keeps enforcement OFF and stores no raw device credentials', async () => {
  const sql = await readFile(new URL('../supabase/indicator_device_shadow_mode.sql', import.meta.url), 'utf8');

  assert.match(sql, /add column if not exists mode text/i);
  assert.match(sql, /mode in \('OFF', 'SHADOW', 'ENFORCED'\)/i);
  assert.match(sql, /create table if not exists public\.indicator_device_shadow_events/i);
  assert.match(sql, /alter table public\.indicator_device_shadow_events enable row level security/i);
  assert.match(sql, /revoke all on table public\.indicator_device_shadow_events from anon, authenticated/i);
  assert.match(sql, /to service_role/i);
  assert.match(sql, /record_indicator_device_shadow_event/i);
  assert.match(sql, /on conflict \(license_id, product_code, platform, would_status, bucket_start\)/i);
  assert.doesNotMatch(sql, /device_id_hash|device_token_hash|ip_address/i);
  assert.match(sql, /set enabled = false, mode = 'OFF'/i);
});

test('all overlay routes read mode and write only bounded shadow telemetry', async () => {
  const sources = await Promise.all([
    'ctrader-overlay.js', 'mt4-overlay.js', 'mt5-overlay.js',
  ].map((file) => readFile(new URL(`../pages/api/${file}`, import.meta.url), 'utf8')));

  for (const source of sources) {
    assert.match(source, /select\('mode,enabled'\)/);
    assert.match(source, /record_indicator_device_shadow_event/);
    assert.match(source, /createIndicatorDeviceShadowRecorder/);
  }
});
