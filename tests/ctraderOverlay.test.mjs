import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CTRADER_OVERLAY_PRODUCT_CODE,
  decideOverlayCredential,
  hashOverlayToken,
  normalizePandaSymbol,
  normalizeTradingAccountNumber,
  safeTokenEqual,
  sanitizeOverlayRows,
} from '../lib/ctraderOverlay.mjs';

test('normalizes canonical and broker-decorated Panda symbols', () => {
  assert.equal(normalizePandaSymbol('EURUSD'), 'EURUSD');
  assert.equal(normalizePandaSymbol('mEURUSD'), 'EURUSD');
  assert.equal(normalizePandaSymbol('EURUSD.c'), 'EURUSD');
  assert.equal(normalizePandaSymbol('EURUSD-ECN'), 'EURUSD');
});

test('rejects unsupported or ambiguous symbols', () => {
  assert.equal(normalizePandaSymbol('XAUUSD'), '');
  assert.equal(normalizePandaSymbol('EURUSDGBPJPY'), '');
  assert.equal(normalizePandaSymbol(''), '');
});

test('accepts only numeric cTrader account numbers', () => {
  assert.equal(normalizeTradingAccountNumber(' 12345678 '), '12345678');
  assert.equal(normalizeTradingAccountNumber('12 345'), '');
  assert.equal(normalizeTradingAccountNumber('abc123'), '');
  assert.equal(normalizeTradingAccountNumber('12'), '');
});

test('sanitizes dashboard rows to the cTrader allowlist and fails closed on invalid bias', () => {
  const [row] = sanitizeOverlayRows([{
    symbol: 'EURUSD', gap: 8, bias: 'BUY', hard_invalid: false,
    box_h4_trend: 'UPTREND', box_h1_trend: 'UPTREND',
    pl_zone: 'ABOVE', pl_bias: 'BUY', pl_g1_valid: true,
    base_currency: 'EUR', base_score_tf: 'D1:+5',
    quote_currency: 'USD', quote_score_tf: 'H1:-3',
    updated_at: '2026-07-14T10:32:00Z', secret: 'must-not-leak',
  }]);

  assert.deepEqual(Object.keys(row), [
    'symbol', 'gap', 'bias', 'hard_invalid', 'box_h4_trend', 'box_h1_trend',
    'pl_zone', 'pl_bias', 'pl_g1_valid', 'base_currency', 'base_score_tf',
    'quote_currency', 'quote_score_tf', 'updated_at',
  ]);
  assert.equal(row.secret, undefined);
  assert.equal(row.bias, 'BUY');

  const [invalid] = sanitizeOverlayRows([{ symbol: 'GBPUSD', gap: 10, bias: 'BUY', hard_invalid: true }]);
  assert.equal(invalid.bias, 'INVALID');
});

test('hashes tokens deterministically and compares hashes safely', () => {
  const hash = hashOverlayToken('a-very-long-private-token-value-1234567890');
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(safeTokenEqual(hashOverlayToken('a-very-long-private-token-value-1234567890'), hash), true);
  assert.equal(safeTokenEqual(hashOverlayToken('different-token-value-123456789012345'), hash), false);
  assert.equal(safeTokenEqual('', hash), false);
});

test('decides commercial license status without changing strategy logic', () => {
  const now = new Date('2026-07-14T10:00:00Z');
  assert.equal(CTRADER_OVERLAY_PRODUCT_CODE, 'ctrader_dashboard_overlay');
  assert.deepEqual(decideOverlayCredential(null, now), { ok: false, status: 'LICENSE_REQUIRED' });
  assert.deepEqual(decideOverlayCredential({ status: 'PENDING' }, now), { ok: false, status: 'PENDING' });
  assert.deepEqual(decideOverlayCredential({ status: 'DISABLED' }, now), { ok: false, status: 'DISABLED' });
  assert.deepEqual(decideOverlayCredential({ status: 'APPROVED', expires_at: '2026-07-13T00:00:00Z' }, now), { ok: false, status: 'EXPIRED' });
  assert.deepEqual(decideOverlayCredential({ status: 'APPROVED', expires_at: '2026-08-01T00:00:00Z' }, now), { ok: true, status: 'APPROVED' });
});
