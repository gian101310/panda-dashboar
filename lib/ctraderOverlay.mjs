import crypto from 'node:crypto';
import { normalizeTradingAccountNumber } from './indicatorLicense.mjs';

export { normalizeTradingAccountNumber };

export const CTRADER_OVERLAY_PRODUCT_CODE = 'ctrader_dashboard_overlay';

const PANDA_PAIRS = Object.freeze([
  'AUDCAD', 'AUDJPY', 'AUDNZD', 'AUDUSD', 'CADJPY', 'CHFJPY', 'EURAUD',
  'EURCAD', 'EURGBP', 'EURJPY', 'EURNZD', 'EURUSD', 'GBPAUD', 'GBPCAD',
  'GBPJPY', 'GBPNZD', 'GBPUSD', 'NZDCAD', 'NZDJPY', 'NZDUSD', 'USDCAD',
  'USDCHF', 'USDJPY',
]);

const PAIR_SET = new Set(PANDA_PAIRS);
const VALID_BIASES = new Set(['BUY', 'SELL', 'WAIT', 'INVALID']);

export function normalizePandaSymbol(value) {
  const compact = String(value ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  const matches = PANDA_PAIRS.filter((pair) => compact.includes(pair));
  return matches.length === 1 ? matches[0] : '';
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function cleanNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function sanitizeOverlayRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((source) => {
    const symbol = normalizePandaSymbol(source?.symbol);
    if (!symbol || !PAIR_SET.has(symbol)) return [];
    const hardInvalid = source?.hard_invalid === true;
    const rawBias = cleanText(source?.bias).toUpperCase();
    const bias = hardInvalid ? 'INVALID' : (VALID_BIASES.has(rawBias) ? rawBias : 'INVALID');
    return [{
      symbol,
      gap: cleanNumber(source?.gap),
      bias,
      hard_invalid: hardInvalid,
      box_h4_trend: cleanText(source?.box_h4_trend) || 'UNKNOWN',
      box_h1_trend: cleanText(source?.box_h1_trend) || 'UNKNOWN',
      pl_zone: cleanText(source?.pl_zone) || 'UNKNOWN',
      pl_bias: cleanText(source?.pl_bias) || 'UNKNOWN',
      pl_g1_valid: source?.pl_g1_valid === true,
      base_currency: cleanText(source?.base_currency),
      base_score_tf: cleanText(source?.base_score_tf),
      quote_currency: cleanText(source?.quote_currency),
      quote_score_tf: cleanText(source?.quote_score_tf),
      updated_at: cleanText(source?.updated_at) || null,
    }];
  });
}

export function hashOverlayToken(token) {
  return crypto.createHash('sha256').update(String(token ?? ''), 'utf8').digest('hex');
}

export function safeTokenEqual(actualHash, expectedHash) {
  const actual = String(actualHash ?? '');
  const expected = String(expectedHash ?? '');
  if (!/^[a-f0-9]{64}$/i.test(actual) || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

export function decideOverlayCredential(license, now = new Date()) {
  if (!license) return { ok: false, status: 'LICENSE_REQUIRED' };
  if (license.status === 'PENDING') return { ok: false, status: 'PENDING' };
  if (license.status === 'DISABLED') return { ok: false, status: 'DISABLED' };
  if (license.status !== 'APPROVED') return { ok: false, status: 'LICENSE_REQUIRED' };
  if (license.paid_confirmed === false) return { ok: false, status: 'PAYMENT_PENDING' };
  const expiresAt = license.expires_at ? new Date(license.expires_at) : null;
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && now > expiresAt) return { ok: false, status: 'EXPIRED' };
  return { ok: true, status: 'APPROVED' };
}
