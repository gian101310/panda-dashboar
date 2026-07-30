import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath = 'supabase/remove_unused_systems_and_harden_security.sql';

test('security migration removes unused systems and protects exposed tables', () => {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} must exist`);
  const sql = readFileSync(migrationPath, 'utf8');

  assert.match(sql, /drop function if exists public\.get_hermes_learnings\(\)/i);
  assert.match(sql, /drop function if exists public\.insert_hermes_learning\(/i);
  assert.match(sql, /drop table if exists public\.hermes_learnings/i);
  assert.match(sql, /drop table if exists public\.account_guardian_snapshots/i);
  assert.match(sql, /drop table if exists public\.engine_notifications/i);
  assert.match(sql, /alter table public\.pf_waitlist enable row level security/i);
  assert.match(sql, /alter table public\.shadow_tracker enable row level security/i);
  assert.match(sql, /revoke all privileges on table[\s\S]*public\.pf_waitlist[\s\S]*public\.shadow_tracker[\s\S]*from anon, authenticated/i);
});

test('security migration removes public writes and public privileged RPC execution', () => {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} must exist`);
  const sql = readFileSync(migrationPath, 'utf8');

  for (const policy of [
    'anon_write_engine_config',
    'service_role_all',
    'Service role full access',
    'Allow service role full access',
    'Service role can write site_settings',
  ]) {
    assert.match(sql, new RegExp(`drop policy if exists \\"?${policy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\"?`, 'i'));
  }

  for (const fn of [
    'get_dashboard_snapshot',
    'get_ea_executions',
    'get_engine_heartbeat',
    'get_gap_history_sample',
    'get_signal_results_summary',
  ]) {
    assert.match(sql, new RegExp(`revoke execute on function public\\.${fn}\\(`, 'i'));
  }

  assert.match(sql, /from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/i);
});
