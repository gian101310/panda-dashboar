import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('engine monitor migration is service-role-only and stores transition state', async () => {
  const sql = await readFile(new URL('../supabase/engine_stall_monitor.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists public\.engine_monitor_state/i);
  assert.match(sql, /alter table public\.engine_monitor_state enable row level security/i);
  assert.match(sql, /to service_role/i);
  assert.match(sql, /revoke all on table public\.engine_monitor_state from anon, authenticated/i);
  assert.match(sql, /last_alert_at timestamptz/i);
  assert.match(sql, /last_recovery_at timestamptz/i);
});

test('five-minute engine monitor cron is configured and guardrail is unchanged', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.ignoreCommand, '[ ! -f lib/accountGuardian.mjs ]');
  assert.ok(config.crons.some((cron) => cron.path === '/api/cron/engine-stall' && cron.schedule === '*/5 * * * *'));
});

test('engine stall cron fails closed with shared CRON_SECRET authorization', async () => {
  const source = await readFile(new URL('../pages/api/cron/engine-stall.js', import.meta.url), 'utf8');
  assert.match(source, /isCronAuthorized\(req\.headers\.authorization, process\.env\.CRON_SECRET\)/);
  assert.match(source, /status\(401\)/);
});
