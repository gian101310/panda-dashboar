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

test('scoring dashboard listings replace the old overlay labels and point to their packages', () => {
  const products = productCatalog.PUBLIC_DOWNLOAD_PRODUCTS;
  const ctrader = products.find((product) => product.code === 'ctrader_dashboard_overlay');
  const mt5 = products.find((product) => product.code === 'mt5_dashboard_overlay');
  assert.equal(ctrader?.name, 'Panda cTrader Scoring Dashboard');
  assert.equal(ctrader?.downloadPath, '/downloads/panda-scoring-dashboard-ctrader-licensed.algo');
  assert.equal(mt5?.name, 'Panda MT5 Scoring Dashboard');
  assert.equal(mt5?.downloadPath, '/downloads/panda-scoring-dashboard-mt5-licensed.zip');
});

test('trade plan v1.3 is not in the public indicator or download catalog', () => {
  assert.equal(productCatalog.PUBLIC_INDICATOR_PRODUCTS.some((product) => product.code === 'ctrader_trade_plan_v13'), false);
  assert.equal(productCatalog.PUBLIC_DOWNLOAD_PRODUCTS.some((product) => product.code === 'ctrader_trade_plan_v13'), false);
});
