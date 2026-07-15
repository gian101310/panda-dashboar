import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createIndicatorDownloadHandler } from '../lib/indicatorDownload.mjs';
import { createIndicatorDownloadAdminHandler } from '../lib/indicatorDownloadAdminHandler.mjs';

function response() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    redirectTo: '',
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    redirect(code, target) { this.statusCode = code; this.redirectTo = target; return this; },
  };
}

async function invoke(handler, req) {
  const res = response();
  await handler(req, res);
  return res;
}

test('public download rejects unsupported methods and unknown products', async () => {
  const handler = createIndicatorDownloadHandler({ recordDownload: async () => {} });
  assert.equal((await invoke(handler, { method: 'POST', query: {} })).statusCode, 405);
  const missing = await invoke(handler, { method: 'GET', query: { product: 'unknown' } });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.body, { error: 'Download not found' });
});

test('public download records the allowlisted product and redirects with no-store', async () => {
  let recorded;
  const handler = createIndicatorDownloadHandler({
    recordDownload: async (event) => { recorded = event; },
  });
  const res = await invoke(handler, {
    method: 'GET',
    query: { product: 'mt4_dashboard_overlay' },
  });
  assert.deepEqual(recorded, {
    product_code: 'mt4_dashboard_overlay',
    platform: 'MT4',
  });
  assert.equal(res.statusCode, 302);
  assert.equal(res.redirectTo, '/downloads/panda-dashboard-overlay-mt4-licensed.ex4');
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('telemetry failure never blocks the allowlisted download', async () => {
  const handler = createIndicatorDownloadHandler({
    recordDownload: async () => { throw new Error('database unavailable'); },
    logger: { error() {} },
  });
  const res = await invoke(handler, {
    method: 'GET',
    query: { product: 'ctrader_dashboard_overlay' },
  });
  assert.equal(res.statusCode, 302);
  assert.equal(res.redirectTo, '/downloads/panda-dashboard-overlay-ctrader-licensed.algo');
});

test('admin telemetry requires an authenticated admin and GET', async () => {
  const denied = createIndicatorDownloadAdminHandler({
    requireAdmin: async () => null,
    getStats: async () => ({ totals: [], recent: [] }),
  });
  assert.equal((await invoke(denied, { method: 'GET' })).statusCode, 403);

  const allowed = createIndicatorDownloadAdminHandler({
    requireAdmin: async () => ({ username: 'Boss-G' }),
    getStats: async () => ({ totals: [], recent: [] }),
  });
  assert.equal((await invoke(allowed, { method: 'POST' })).statusCode, 405);
});

test('admin telemetry returns only totals and recent allowlisted fields', async () => {
  const handler = createIndicatorDownloadAdminHandler({
    requireAdmin: async () => ({ username: 'Boss-G' }),
    getStats: async () => ({
      totals: [{ product_code: 'mt5_dashboard_overlay', platform: 'MT5', count: 7, secret: 'drop-me' }],
      recent: [{ product_code: 'mt5_dashboard_overlay', platform: 'MT5', downloaded_at: '2026-07-15T12:00:00Z', ip: 'drop-me' }],
    }),
  });
  const res = await invoke(handler, { method: 'GET' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    totals: [{ product_code: 'mt5_dashboard_overlay', platform: 'MT5', count: 7 }],
    recent: [{ product_code: 'mt5_dashboard_overlay', platform: 'MT5', downloaded_at: '2026-07-15T12:00:00Z' }],
  });
  assert.equal(JSON.stringify(res.body).includes('drop-me'), false);
});
