import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import { createCtraderOverlayHandler } from '../lib/ctraderOverlayHandler.mjs';
import { CTRADER_TRADE_PLAN_V13_PRODUCT_CODE, getIndicatorProduct } from '../lib/indicatorProducts.mjs';
import { validateIndicatorRequest } from '../lib/indicatorLicense.mjs';

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function invoke(handler, headers = {}) {
  const res = response();
  await handler({ method: 'GET', headers, socket: { remoteAddress: '127.0.0.1' } }, res);
  return res;
}

test('trade-plan product is admin-only and supports manual cTrader licenses', () => {
  assert.equal(CTRADER_TRADE_PLAN_V13_PRODUCT_CODE, 'ctrader_trade_plan_v13');
  const product = getIndicatorProduct(CTRADER_TRADE_PLAN_V13_PRODUCT_CODE);
  assert.equal(product.platform, 'CTRADER');
  assert.equal(product.adminOnly, true);
  assert.equal(product.requestable, false);
  const request = validateIndicatorRequest({
    customer_name: 'Client',
    trading_account_number: '2243677',
    product_code: CTRADER_TRADE_PLAN_V13_PRODUCT_CODE,
  });
  assert.deepEqual(request, { ok: false, error: 'Unknown indicator product' });
  const adminRoute = fs.readFileSync('pages/api/admin/indicator-licenses.js', 'utf8');
  assert.match(adminRoute, /product\.platform === 'CTRADER' \|\| product\.platform === 'MT5'/);
});

test('trade-plan feed accepts only approved accounts for its own product', async () => {
  let dashboardReads = 0;
  const licenses = new Map([
    ['11111111', { id: 'approved', status: 'APPROVED', paid_confirmed: true }],
    ['22222222', { id: 'pending', status: 'PENDING' }],
    ['33333333', { id: 'disabled', status: 'DISABLED' }],
    ['44444444', { id: 'unpaid', status: 'APPROVED', paid_confirmed: false }],
    ['55555555', { id: 'expired', status: 'APPROVED', expires_at: '2026-01-01T00:00:00Z' }],
  ]);
  const handler = createCtraderOverlayHandler({
    now: () => new Date('2026-10-20T00:00:00Z'),
    productCode: CTRADER_TRADE_PLAN_V13_PRODUCT_CODE,
    allowOperatorToken: false,
    getLicense: async (account, productCode) => {
      assert.equal(productCode, CTRADER_TRADE_PLAN_V13_PRODUCT_CODE);
      return licenses.get(account) || null;
    },
    getDashboardRows: async () => {
      dashboardReads += 1;
      return [{ symbol: 'EURUSD', gap: 8, bias: 'BUY' }];
    },
  });

  for (const [account, status] of [
    ['22222222', 'PENDING'],
    ['33333333', 'DISABLED'],
    ['44444444', 'PAYMENT_PENDING'],
    ['55555555', 'EXPIRED'],
    ['99999999', 'LICENSE_REQUIRED'],
  ]) {
    const denied = await invoke(handler, { 'x-panda-account-number': account });
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.body.status, status);
    assert.equal(denied.body.pairs, undefined);
  }
  const token = await invoke(handler, { 'x-panda-operator-token': 'a'.repeat(64) });
  assert.equal(token.statusCode, 403);
  assert.equal(token.body.status, 'ACCOUNT_LICENSE_REQUIRED');
  assert.equal(dashboardReads, 0);

  const approved = await invoke(handler, { 'x-panda-account-number': '11111111' });
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.body.pairs[0].symbol, 'EURUSD');
  assert.equal(dashboardReads, 1);
});

test('v1.3 gates plan rendering and broker submission without an operator token', () => {
  const root = 'panda-indicators/2026-10-16/panda-trade-plan';
  const plan = fs.readFileSync(`${root}/PandaTradePlan.cs`, 'utf8');
  const execution = fs.readFileSync(`${root}/PandaTradePlan.Execution.cs`, 'utf8');
  const dashboard = fs.readFileSync(`${root}/PandaTradePlan.Dashboard.cs`, 'utf8');
  const gate = fs.readFileSync(`${root}/PandaTradePlan.V13License.cs`, 'utf8');
  const feed = fs.readFileSync('panda-indicators/2026-07-14/ctrader-dashboard-overlay/PandaDashboardOverlay.Core.cs', 'utf8');

  assert.match(dashboard, /api\/ctrader-trade-plan/);
  assert.match(dashboard, /#if !TRADE_PLAN_V13\s+\[Parameter\("Operator token"/);
  assert.match(dashboard, /x-panda-account-number/);
  assert.match(gate, /Account\.Number/);
  assert.match(dashboard, /InitializeLicenseAccount\(\)/);
  assert.match(dashboard, /licenseGeneration!=_licenseGeneration/);
  assert.match(plan, /"v13 "\+Account\.Number\.ToString/);
  assert.match(gate, /RemoveDrawings\(\)/);
  assert.match(plan, /private void Tick\(\)[\s\S]*?if\(!LicenseActive\)\{UpdateStatus\(\);return;\}/);
  assert.match(plan, /private void Render\(\)[\s\S]*?if\(!LicenseActive\)return;/);
  assert.match(plan, /LimitOrderReady\[index\]=0;PlannedVolumeUnits\[index\]=double\.NaN/);
  assert.match(execution, /private OrderTicket PrepareOrder\([^)]*\)[\s\S]*?if\(!LicenseActive\)/);
  assert.match(feed, /var key = endpoint \+ ":" \+ headerName/);
  assert.match(feed, /entry\.LastResult = result\.Success \? result : null/);
});
