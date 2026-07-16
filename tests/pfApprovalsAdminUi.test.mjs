import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

test('approval API returns a bounded approved-account list and exact count', () => {
  const api = fs.readFileSync('pages/api/admin/pf-approve.js', 'utf8');
  assert.match(api, /approvedUsers/);
  assert.match(api, /eq\('pf_approved', true\)/);
  assert.match(api, /count: 'exact'/);
  assert.match(api, /limit\(500\)/);
  assert.match(api, /approved_users: approvedUsers \|\| \[\]/);
  assert.match(api, /approved_users: approvedCount \|\| 0/);
});

test('approvals page shows approved accounts with a counter and revoke action', () => {
  const page = fs.readFileSync('pages/admin/pf-approvals.js', 'utf8');
  assert.match(page, /pfApprovedUsers/);
  assert.match(page, /APPROVED ACCOUNTS/);
  assert.match(page, /pfCounts\.approved_users/);
  assert.match(page, /pfTab === 'approved'/);
  assert.match(page, /REVOKE/);
  assert.match(page, /MAX DEVICES/);
});
