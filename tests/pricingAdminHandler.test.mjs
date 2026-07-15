import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPricingAdminHandler } from '../lib/pricingAdminHandler.mjs';

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

function handler(overrides = {}) {
  return createPricingAdminHandler({
    requireAdmin: async () => ({ username: 'admin' }),
    listTiers: async () => [],
    listProducts: async () => [],
    getProduct: async () => null,
    updateTier: async () => {},
    createProduct: async () => {},
    updateProduct: async () => {},
    deleteProduct: async () => {},
    ...overrides,
  });
}

test('protected overlay products cannot be deleted', async () => {
  const res = response();
  await handler({ getProduct: async () => ({ code: 'ctrader_dashboard_overlay' }) })(
    { method: 'POST', body: { action: 'delete_product', id: 'fixed-id' } }, res,
  );
  assert.equal(res.statusCode, 409);
});

test('product prices cannot be negative', async () => {
  const res = response();
  await handler()({ method: 'POST', body: { action: 'update_product', id: 'one', price: -1 } }, res);
  assert.equal(res.statusCode, 400);
});

test('product payment links must be https when supplied', async () => {
  const res = response();
  await handler()({ method: 'POST', body: { action: 'update_product', id: 'one', pay_link: 'http://unsafe.example' } }, res);
  assert.equal(res.statusCode, 400);
});

test('a protected product may be hidden without being deleted', async () => {
  let saved;
  const res = response();
  await handler({ updateProduct: async (_id, updates) => { saved = updates; } })(
    { method: 'POST', body: { action: 'update_product', id: 'one', active: false, price: 0, pay_link: null } }, res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(saved.active, false);
});
