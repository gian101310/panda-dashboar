import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import {
  INDICATOR_PRODUCTS,
  MT4_OVERLAY_PRODUCT_CODE,
  MT5_OVERLAY_PRODUCT_CODE,
} from '../lib/indicatorProducts.mjs';
import { normalizeIndicatorPlatform } from '../lib/indicatorLicense.mjs';

test('registers separate admin-only MT4 and MT5 overlay products', () => {
  assert.equal(MT4_OVERLAY_PRODUCT_CODE, 'mt4_dashboard_overlay');
  assert.equal(MT5_OVERLAY_PRODUCT_CODE, 'mt5_dashboard_overlay');
  assert.deepEqual(
    INDICATOR_PRODUCTS
      .filter((product) => product.code.endsWith('_dashboard_overlay'))
      .map((product) => [product.code, product.platform, product.adminOnly]),
    [
      ['ctrader_dashboard_overlay', 'CTRADER', true],
      ['mt4_dashboard_overlay', 'MT4', true],
      ['mt5_dashboard_overlay', 'MT5', true],
    ],
  );
});

test('normalizes only supported indicator platforms', () => {
  assert.equal(normalizeIndicatorPlatform('mt4'), 'MT4');
  assert.equal(normalizeIndicatorPlatform('mt5'), 'MT5');
  assert.equal(normalizeIndicatorPlatform('ctrader'), 'CTRADER');
  assert.equal(normalizeIndicatorPlatform('unknown'), 'MT4');
});

test('admin page describes one cross-platform personal token', () => {
  const source = fs.readFileSync('pages/admin/license.js', 'utf8');
  assert.match(source, /PERSONAL OVERLAY TOKEN/);
  assert.match(source, /cTrader, MT4 and MT5/);
  assert.match(source, /MT5 ACCOUNT NUMBER/);
});
