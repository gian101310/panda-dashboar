import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const migrationPath = 'supabase/indicator_device_licensing.sql';

test('device licensing migration is bounded, private, atomic, and idempotent', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration must exist');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /device_limit\s+integer\s+not null\s+default\s+1/i);
  assert.match(sql, /device_limit\s+between\s+1\s+and\s+100/i);
  assert.match(sql, /create table if not exists public\.indicator_license_devices/i);
  assert.match(sql, /create table if not exists public\.indicator_device_enforcement/i);
  assert.match(sql, /alter table public\.indicator_license_devices enable row level security/i);
  assert.match(sql, /alter table public\.indicator_device_enforcement enable row level security/i);
  assert.match(sql, /revoke all on table public\.indicator_license_devices from anon, authenticated/i);
  assert.match(sql, /revoke all on table public\.indicator_device_enforcement from anon, authenticated/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /grant execute on function public\.register_indicator_device/i);
  assert.match(sql, /to service_role/i);
  assert.match(sql, /on conflict \(code\) do nothing/i);
  assert.doesNotMatch(sql, /security definer/i);
});

test('migration restores exactly the three protected overlay store products', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const productCodes = [
    'ctrader_dashboard_overlay',
    'mt4_dashboard_overlay',
    'mt5_dashboard_overlay',
  ];

  for (const code of productCodes) assert.match(sql, new RegExp(`'${code}'`, 'i'));
  assert.match(sql, /contact for price/i);
  assert.match(sql, /device enforcement/i);
});
