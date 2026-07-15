import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

test('landing page exposes tracked Licensed downloads and platform activation', () => {
  const landing = fs.readFileSync('pages/index.js', 'utf8');
  assert.match(landing, /PUBLIC_DOWNLOAD_PRODUCTS/);
  assert.match(landing, /\/api\/indicator-download\?product=/);
  assert.match(landing, /DOWNLOAD LICENSED/);
  assert.match(landing, /REQUEST ACTIVATION/);
  assert.match(landing, /trading_account_number/);
  assert.match(landing, /cTrader account number/);
  assert.match(landing, /installed indicator will activate after approval/i);
  assert.doesNotMatch(landing, /send you the payment link and indicator file/i);
});

test('license admin exposes download telemetry and recoverable active-token controls', () => {
  const admin = fs.readFileSync('pages/admin/license.js', 'utf8');
  assert.match(admin, /fetch\('\/api\/admin\/indicator-downloads'\)/);
  assert.match(admin, /DOWNLOADS RECORDED/);
  assert.match(admin, /method: 'POST'/);
  assert.match(admin, /action: 'reveal'/);
  assert.match(admin, /navigator\.clipboard\.writeText\(data\.token\)/);
  assert.match(admin, /RECOVERY REQUIRES ONE ROTATION/);
  assert.match(admin, /TOKEN ROTATION HISTORY/);
  assert.match(admin, /setTimeout/);
  assert.match(admin, /60000/);
});
