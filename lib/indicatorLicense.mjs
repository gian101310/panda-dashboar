import { getIndicatorProduct } from './indicatorProducts.mjs';

export const ACTIVE_LICENSE_STATUSES = ['PENDING', 'APPROVED'];

const INDICATOR_PLATFORMS = new Set(['MT4', 'MT5', 'CTRADER']);

export function normalizeIndicatorPlatform(value) {
  const platform = String(value || 'MT4').trim().toUpperCase();
  return INDICATOR_PLATFORMS.has(platform) ? platform : 'MT4';
}

export function normalizeMt4AccountId(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

export function normalizeProductCode(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeTradingAccountNumber(value) {
  const account = String(value || '').trim();
  return /^[0-9]{3,20}$/.test(account) ? account : '';
}

export function isExpired(expiresAt, now = new Date()) {
  if (!expiresAt) return false;
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return false;
  return now > expiry;
}

export function decideIndicatorLicense(license, now = new Date()) {
  if (!license) return { ok: false, status: 'NOT_FOUND', body: 'DENY|NOT_FOUND' };
  if (license.status === 'DISABLED') return { ok: false, status: 'DISABLED', body: 'DENY|DISABLED' };
  if (license.status === 'PENDING') return { ok: false, status: 'PENDING', body: 'DENY|PENDING' };
  if (license.status === 'EXPIRED' || isExpired(license.expires_at, now)) {
    return { ok: false, status: 'EXPIRED', body: 'DENY|EXPIRED' };
  }
  if (license.status !== 'APPROVED') return { ok: false, status: 'NOT_APPROVED', body: 'DENY|NOT_APPROVED' };
  if (license.paid_confirmed === false) return { ok: false, status: 'PAYMENT_PENDING', body: 'DENY|PAYMENT_PENDING' };
  return { ok: true, status: 'APPROVED', body: 'OK|APPROVED' };
}

export function validateIndicatorRequest(input = {}) {
  const customerName = String(input.customer_name || input.name || '').trim();
  const contact = String(input.contact || '').trim();
  const productCode = normalizeProductCode(input.product_code);
  const product = getIndicatorProduct(productCode);

  if (!customerName) return { ok: false, error: 'Name is required' };
  if (!contact) return { ok: false, error: 'Contact is required' };
  if (!product || product.requestable !== true) return { ok: false, error: 'Unknown indicator product' };

  const platform = product.platform || 'MT4';
  const account = normalizeTradingAccountNumber(
    input.trading_account_number || input.mt4_account_id || input.account_id || input.account_number,
  );
  const accountLabel = platform === 'CTRADER' ? 'cTrader' : platform;
  if (!account) return { ok: false, error: `${accountLabel} account number must be 3-20 digits` };

  return {
    ok: true,
    value: {
      customer_name: customerName,
      contact,
      mt4_account_id: account,
      trading_account_number: account,
      platform,
      account_server: String(input.account_server || '').trim() || null,
      product_code: productCode,
      status: 'PENDING',
      paid_confirmed: false,
      telegram_username: String(input.telegram_username || '').trim().replace(/^@/, '') || null,
      notes: String(input.notes || '').trim() || null,
    },
  };
}
