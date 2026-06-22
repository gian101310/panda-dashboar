import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createAdminMaintenanceAccessToken,
  hasValidAdminMaintenanceAccess,
  isAdminMaintenanceKeyValid,
} from '../lib/adminMaintenanceAccess.mjs';

test('accepts a valid unexpired admin-maintenance access token', () => {
  const now = 1_700_000_000_000;
  const token = createAdminMaintenanceAccessToken('private-maintenance-key', now, 600_000);

  assert.equal(hasValidAdminMaintenanceAccess(token, 'private-maintenance-key', now + 1), true);
});

test('rejects a token with the wrong key or an expired timestamp', () => {
  const now = 1_700_000_000_000;
  const token = createAdminMaintenanceAccessToken('private-maintenance-key', now, 1_000);

  assert.equal(hasValidAdminMaintenanceAccess(token, 'different-key', now + 1), false);
  assert.equal(hasValidAdminMaintenanceAccess(token, 'private-maintenance-key', now + 1_001), false);
});

test('compares the supplied maintenance key without accepting an empty value', () => {
  assert.equal(isAdminMaintenanceKeyValid('private-maintenance-key', 'private-maintenance-key'), true);
  assert.equal(isAdminMaintenanceKeyValid('wrong-key', 'private-maintenance-key'), false);
  assert.equal(isAdminMaintenanceKeyValid('', 'private-maintenance-key'), false);
});
