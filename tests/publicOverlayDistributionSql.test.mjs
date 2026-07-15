import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const migrationPath = 'supabase/public_overlay_distribution.sql';
const sql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';

test('migration creates download telemetry without visitor identity fields', () => {
  assert.ok(sql, 'public overlay distribution migration must exist');
  assert.match(sql, /create table if not exists public\.indicator_download_events/i);
  assert.match(sql, /product_code text not null/i);
  assert.match(sql, /platform text not null/i);
  assert.match(sql, /downloaded_at timestamptz not null default now\(\)/i);
  assert.doesNotMatch(sql, /ip_address|account_number|contact|email/i);
});

test('migration adds encrypted current-token storage and metadata-only rotations', () => {
  assert.match(sql, /token_ciphertext text/i);
  assert.match(sql, /token_iv text/i);
  assert.match(sql, /token_auth_tag text/i);
  assert.match(sql, /create table if not exists public\.indicator_feed_token_rotations/i);
  assert.match(sql, /token_fingerprint text not null/i);
  assert.doesNotMatch(sql, /old_token|token_plaintext/i);
});

test('migration locks new tables to the service role without privileged functions', () => {
  assert.match(sql, /alter table public\.indicator_download_events enable row level security/i);
  assert.match(sql, /alter table public\.indicator_feed_token_rotations enable row level security/i);
  assert.match(sql, /revoke all on table public\.indicator_download_events from anon, authenticated/i);
  assert.match(sql, /revoke all on table public\.indicator_feed_token_rotations from anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.indicator_download_events to service_role/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.indicator_feed_token_rotations to service_role/i);
  assert.doesNotMatch(sql, /security definer/i);
});

test('migration audits rotations with no recoverable inactive token value', () => {
  assert.match(sql, /create trigger indicator_feed_token_rotation_audit/i);
  assert.match(sql, /substring\(new\.token_hash from 1 for 12\)/i);
  assert.doesNotMatch(sql, /new\.token_ciphertext|new\.token_iv|new\.token_auth_tag/i);
});
