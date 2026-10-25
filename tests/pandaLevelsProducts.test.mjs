import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CTRADER_PANDA_LEVELS_PRODUCT_CODE,
  MT5_PANDA_LEVELS_PRODUCT_CODE,
  PUBLIC_DOWNLOAD_PRODUCTS,
  getIndicatorProduct,
} from '../lib/indicatorProducts.mjs';
import { decideIndicatorLicense } from '../lib/indicatorLicense.mjs';

test('Panda Levels products are separate Admin licenses and never public downloads', () => {
  for (const code of [CTRADER_PANDA_LEVELS_PRODUCT_CODE, MT5_PANDA_LEVELS_PRODUCT_CODE]) {
    const product = getIndicatorProduct(code);
    assert.ok(product);
    assert.equal(product.adminOnly, true);
    assert.equal(product.requestable, false);
    assert.equal(PUBLIC_DOWNLOAD_PRODUCTS.some((item) => item.code === code), false);
  }
  assert.equal(getIndicatorProduct(CTRADER_PANDA_LEVELS_PRODUCT_CODE).platform, 'CTRADER');
  assert.equal(getIndicatorProduct(MT5_PANDA_LEVELS_PRODUCT_CODE).platform, 'MT5');
});

test('Panda Levels approval can be disabled or expired through existing license decisions', () => {
  const approved = { status: 'APPROVED', paid_confirmed: true };
  assert.equal(decideIndicatorLicense(approved).ok, true);
  assert.equal(decideIndicatorLicense({ ...approved, status: 'DISABLED' }).status, 'DISABLED');
  assert.equal(decideIndicatorLicense({ ...approved, expires_at: '2020-01-01T00:00:00Z' }).status, 'EXPIRED');
  assert.equal(decideIndicatorLicense({ ...approved, paid_confirmed: false }).status, 'PAYMENT_PENDING');
});
