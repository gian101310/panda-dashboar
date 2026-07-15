import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import * as productCatalog from '../lib/indicatorProducts.mjs';

test('publishes exactly the three Licensed overlay products', () => {
  const products = productCatalog.PUBLIC_DOWNLOAD_PRODUCTS;
  assert.ok(Array.isArray(products), 'PUBLIC_DOWNLOAD_PRODUCTS must be exported');
  assert.deepEqual(
    products.map((product) => product.code),
    ['ctrader_dashboard_overlay', 'mt4_dashboard_overlay', 'mt5_dashboard_overlay'],
  );
  for (const product of products) {
    assert.equal(product.publicDownload, true);
    assert.equal(product.requestable, true);
    assert.match(product.downloadPath, /^\/downloads\//);
    assert.equal(fs.existsSync(`public${product.downloadPath}`), true);
  }
});

test('never exposes Personal artifacts through the public catalog', () => {
  const products = productCatalog.PUBLIC_DOWNLOAD_PRODUCTS || [];
  const serialized = JSON.stringify(products);
  assert.doesNotMatch(serialized, /Personal/i);
  assert.doesNotMatch(serialized, /token/i);
  assert.equal(fs.existsSync('public/downloads/PandaDashboardOverlay-Personal.algo'), false);
  assert.equal(fs.existsSync('public/downloads/PandaDashboardOverlayMT4-Personal.ex4'), false);
  assert.equal(fs.existsSync('public/downloads/PandaDashboardOverlayMT5-Personal.ex5'), false);
});
