import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_PAGE_VISIBILITY,
  getPageAccessDecision,
  normalizePageVisibility,
  ROUTE_TO_PAGE_KEY,
} from '../lib/pageVisibility.mjs';

test('normalizePageVisibility keeps all public pages open by default', () => {
  assert.deepEqual(normalizePageVisibility(null), DEFAULT_PAGE_VISIBILITY);
});

test('normalizePageVisibility only accepts boolean page flags', () => {
  assert.deepEqual(normalizePageVisibility({
    landing: false,
    funnel: 'off',
    pricing: true,
    portfolio: 0,
    login: false,
    bypass_enabled: false,
    unknown: false,
  }), {
    ...DEFAULT_PAGE_VISIBILITY,
    landing: false,
    pricing: true,
    login: false,
    bypass_enabled: false,
  });
});

test('maintenance blocks login unless the user has a bypass', () => {
  assert.equal(
    getPageAccessDecision({ maintenanceEnabled: true, pageKey: 'login' }),
    'maintenance',
  );
  assert.equal(
    getPageAccessDecision({ maintenanceEnabled: true, pageKey: 'login', hasMaintenanceBypass: true }),
    'allow',
  );
});

test('page controls apply only when global bypass is off', () => {
  assert.equal(
    getPageAccessDecision({ pageKey: 'login', visibility: { login: false, bypass_enabled: false } }),
    'coming_soon',
  );
  assert.equal(
    getPageAccessDecision({ pageKey: 'login', visibility: { login: false, bypass_enabled: true } }),
    'allow',
  );
});

test('administrators bypass maintenance and disabled public pages', () => {
  assert.equal(
    getPageAccessDecision({
      isAdmin: true,
      maintenanceEnabled: true,
      pageKey: 'login',
      visibility: { login: false, bypass_enabled: false },
    }),
    'allow',
  );
});

test('admin-maintenance access unlocks only the normal login page', () => {
  assert.equal(
    getPageAccessDecision({ maintenanceEnabled: true, pageKey: 'login', hasAdminLoginAccess: true }),
    'allow',
  );
  assert.equal(
    getPageAccessDecision({ maintenanceEnabled: true, pageKey: 'dashboard', hasAdminLoginAccess: true }),
    'maintenance',
  );
});

test('maps every dashboard-controlled public route', () => {
  assert.equal(ROUTE_TO_PAGE_KEY['/guardian'], 'guardian');
  assert.equal(ROUTE_TO_PAGE_KEY['/stream'], 'stream');
});
