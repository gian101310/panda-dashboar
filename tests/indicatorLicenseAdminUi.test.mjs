import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

test('landing page exposes tracked Licensed downloads and platform activation', () => {
  const landing = fs.readFileSync('pages/index.js', 'utf8');
  assert.match(landing, /mergePublicOverlayProducts/);
  assert.match(landing, /\/api\/indicator-download\?product=/);
  assert.match(landing, /DOWNLOAD LICENSED/);
  assert.match(landing, /REQUEST ACTIVATION/);
  assert.match(landing, /trading_account_number/);
  assert.match(landing, /cTrader account number/);
  assert.match(landing, /installed indicator will activate after approval/i);
  assert.doesNotMatch(landing, /send you the payment link and indicator file/i);
});

test('pricing surfaces cTrader, MT4 and MT5 with tracked download and activation actions', () => {
  const pricing = fs.readFileSync('pages/pricing.js', 'utf8');
  const adminPricing = fs.readFileSync('pages/admin/pricing.js', 'utf8');
  assert.match(pricing, /cTRADER \/ MT4 \/ MT5 INDICATORS/);
  assert.match(pricing, /\/api\/indicator-download\?product=/);
  assert.match(pricing, /REQUEST ACTIVATION/);
  assert.match(pricing, /CONTACT FOR PRICE|priceLabel/);
  assert.match(adminPricing, /SYSTEM INDICATOR/);
  assert.match(adminPricing, /PAYMENT LINK \(HTTPS\)/);
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
  assert.match(admin, /GENERATE, ACTIVATE & COPY/);
  assert.match(admin, /Token is active\. Copy the visible value manually/);
  assert.match(admin, /setTimeout/);
  assert.match(admin, /60000/);
  assert.match(admin, /showDownloadActivity/);
  assert.match(admin, /SHOW ACTIVITY/);
  assert.match(admin, /HIDE ACTIVITY/);
  assert.match(admin, /maxHeight: 320/);
  assert.match(admin, /overflowY: 'auto'/);
});

test('license admin exposes safe device-limit and enforcement controls', () => {
  const admin = fs.readFileSync('pages/admin/license.js', 'utf8');
  assert.match(admin, /fetch\('\/api\/admin\/indicator-license-devices'/);
  assert.match(admin, /DEVICE LIMIT/);
  assert.match(admin, /MANAGE DEVICES/);
  assert.match(admin, /RESET DEVICES/);
  assert.match(admin, /ACTIVE DEVICES/);
  assert.match(admin, /DEVICE ENFORCEMENT/);
  assert.match(admin, /action: 'set_limit'/);
  assert.match(admin, /action: 'set_enforcement'/);
  assert.match(admin, /action: 'revoke'/);
  assert.match(admin, /action: 'reset'/);
  assert.doesNotMatch(admin, /device_token_hash|device_id_hash/);
});
