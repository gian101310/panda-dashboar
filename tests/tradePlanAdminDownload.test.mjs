import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import { createTradePlanAdminDownloadHandler } from '../lib/tradePlanAdminDownload.mjs';

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    send(body) { this.body = body; return this; },
    end() { return this; },
  };
}

test('trade-plan artifact is read from private storage, not served publicly', () => {
  assert.equal(fs.existsSync('public/downloads/Panda Trade Plan v1.3.algo'), false);
  const route = fs.readFileSync('pages/api/admin/trade-plan-download.js', 'utf8');
  assert.match(route, /supabase\.storage\.from\('private-indicators'\)\.download\('panda-trade-plan-v1\.3\.algo'\)/);
  assert.match(route, /requireAdmin/);
});

test('only an authenticated admin can download the trade plan', async () => {
  const artifact = Buffer.from('licensed-algo');
  let reads = 0;
  const handler = createTradePlanAdminDownloadHandler({
    requireAdmin: async (req) => req.admin || null,
    readArtifact: async () => { reads += 1; return artifact; },
  });

  const denied = response();
  await handler({ method: 'GET' }, denied);
  assert.equal(denied.statusCode, 403);
  assert.equal(reads, 0);

  const wrongMethod = response();
  await handler({ method: 'POST', admin: true }, wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(reads, 0);

  const allowed = response();
  await handler({ method: 'GET', admin: true }, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.body, artifact);
  assert.equal(allowed.headers['Content-Disposition'], 'attachment; filename="Panda Trade Plan v1.3.algo"');
  assert.equal(allowed.headers['Cache-Control'], 'private, no-store');
  assert.equal(reads, 1);
});

test('missing artifact returns a safe error', async () => {
  const handler = createTradePlanAdminDownloadHandler({
    requireAdmin: async () => true,
    readArtifact: async () => { throw new Error('private path'); },
  });
  const res = response();
  await handler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: 'Indicator download unavailable' });
});
