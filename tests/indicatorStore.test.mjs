import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatIndicatorPrice, mergePublicOverlayProducts } from '../lib/indicatorStore.mjs';

test('public overlay catalog keeps all three fixed products and merges live pricing', () => {
  const products = mergePublicOverlayProducts([
    { code: 'ctrader_dashboard_overlay', name: 'Live cTrader', price: 250, currency: 'USD', pay_link: 'https://pay.example/ctrader', active: true },
    { code: 'mt4_dashboard_overlay', price: 999, currency: 'USD', active: false },
  ]);
  assert.equal(products.length, 2);
  assert.equal(products[0].name, 'Live cTrader');
  assert.equal(products[0].priceLabel, '$250 USD');
  assert.equal(products[0].paymentLink, 'https://pay.example/ctrader');
  assert.equal(products[1].code, 'mt5_dashboard_overlay');
});

test('zero prices become contact-for-price and unsafe links are not exposed', () => {
  const [product] = mergePublicOverlayProducts([
    { code: 'mt4_dashboard_overlay', price: 0, currency: 'AED', pay_link: 'javascript:alert(1)', active: true },
  ]);
  assert.equal(formatIndicatorPrice(0, 'AED'), 'CONTACT FOR PRICE');
  assert.equal(product.priceLabel, 'CONTACT FOR PRICE');
  assert.equal(product.paymentLink, null);
});
