import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateIndicatorRequest } from '../lib/indicatorLicense.mjs';
import { createIndicatorLicenseRequestHandler } from '../lib/indicatorLicenseRequestHandler.mjs';
import { buildIndicatorRequestAlertMessage } from '../lib/indicatorRequestAlert.mjs';

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

async function invoke(handler, req) {
  const res = response();
  await handler(req, res);
  return res;
}

test('derives platform and normalized account from every overlay product', () => {
  const cases = [
    ['ctrader_dashboard_overlay', 'CTRADER'],
    ['mt4_dashboard_overlay', 'MT4'],
    ['mt5_dashboard_overlay', 'MT5'],
  ];

  for (const [productCode, platform] of cases) {
    const parsed = validateIndicatorRequest({
      customer_name: 'Client One',
      contact: 'client@example.com',
      telegram_username: '@clientone',
      trading_account_number: ' 12345678 ',
      product_code: productCode,
    });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.value, {
      customer_name: 'Client One',
      contact: 'client@example.com',
      mt4_account_id: '12345678',
      trading_account_number: '12345678',
      platform,
      account_server: null,
      product_code: productCode,
      status: 'PENDING',
      paid_confirmed: false,
      telegram_username: 'clientone',
      notes: null,
    });
  }
});

test('rejects malformed platform accounts and unknown products', () => {
  const malformed = validateIndicatorRequest({
    customer_name: 'Client One',
    contact: 'client@example.com',
    trading_account_number: 'abc-123',
    product_code: 'ctrader_dashboard_overlay',
  });
  assert.deepEqual(malformed, { ok: false, error: 'cTrader account number must be 3-20 digits' });

  const unknown = validateIndicatorRequest({
    customer_name: 'Client One',
    contact: 'client@example.com',
    trading_account_number: '12345678',
    product_code: 'private_unknown_product',
  });
  assert.deepEqual(unknown, { ok: false, error: 'Unknown indicator product' });
});

test('request workflow scopes duplicate lookup to product platform and account', async () => {
  let lookup;
  let inserted;
  let notified;
  const handler = createIndicatorLicenseRequestHandler({
    findExisting: async (criteria) => { lookup = criteria; return null; },
    insertRequest: async (row) => { inserted = row; return { id: 'req-1', status: row.status }; },
    notify: async (row) => { notified = row; },
  });
  const res = await invoke(handler, {
    method: 'POST',
    body: {
      customer_name: 'Client One',
      contact: 'client@example.com',
      trading_account_number: '12345678',
      product_code: 'mt5_dashboard_overlay',
    },
  });
  assert.deepEqual(lookup, {
    product_code: 'mt5_dashboard_overlay',
    platform: 'MT5',
    trading_account_number: '12345678',
  });
  assert.equal(inserted.platform, 'MT5');
  assert.equal(notified.id, 'req-1');
  assert.deepEqual(res.body, { ok: true, id: 'req-1', status: 'PENDING' });
});

test('request workflow returns existing state without inserting a duplicate', async () => {
  let inserted = false;
  const handler = createIndicatorLicenseRequestHandler({
    findExisting: async () => ({ id: 'existing-1', status: 'PENDING' }),
    insertRequest: async () => { inserted = true; },
    notify: async () => {},
  });
  const res = await invoke(handler, {
    method: 'POST',
    body: {
      customer_name: 'Client One',
      contact: 'client@example.com',
      trading_account_number: '12345678',
      product_code: 'ctrader_dashboard_overlay',
    },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.status, 'PENDING');
  assert.equal(inserted, false);
});

test('notification failure does not roll back an inserted request', async () => {
  const handler = createIndicatorLicenseRequestHandler({
    findExisting: async () => null,
    insertRequest: async (row) => ({ id: 'req-2', status: row.status }),
    notify: async () => { throw new Error('telegram unavailable'); },
    logger: { error() {} },
  });
  const res = await invoke(handler, {
    method: 'POST',
    body: {
      customer_name: 'Client One',
      contact: 'client@example.com',
      trading_account_number: '12345678',
      product_code: 'mt4_dashboard_overlay',
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, 'req-2');
});

test('Telegram request alert uses the product platform account label', () => {
  const message = buildIndicatorRequestAlertMessage({
    request: {
      customer_name: 'Client One',
      contact: 'client@example.com',
      telegram_username: 'clientone',
      trading_account_number: '12345678',
      platform: 'CTRADER',
      product_code: 'ctrader_dashboard_overlay',
      status: 'PENDING',
    },
    time: new Date('2026-07-15T08:00:00Z'),
  });
  assert.match(message, /<b>cTrader Account:<\/b> 12345678/);
  assert.doesNotMatch(message, /<b>MT4 Account:/);
});
