import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_PAGE_VISIBILITY, normalizePageVisibility } from '../lib/pageVisibility.mjs';

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
