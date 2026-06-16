import { getIndicatorProduct } from './indicatorProducts.mjs';

export const ACTIVE_LICENSE_STATUSES = ['PENDING', 'APPROVED'];

export function normalizeMt4AccountId(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

export function normalizeProductCode(value) {
  return String(value || '').trim().toLowerCase();
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
  const mt4AccountId = normalizeMt4AccountId(input.mt4_account_id || input.account_id || input.account_number);
  const productCode = normalizeProductCode(input.product_code);
  const product = getIndicatorProduct(productCode);

  if (!customerName) return { ok: false, error: 'Name is required' };
  if (!contact) return { ok: false, error: 'Contact is required' };
  if (!mt4AccountId) return { ok: false, error: 'MT4 account ID is required' };
  if (!/^[0-9]{3,20}$/.test(mt4AccountId)) return { ok: false, error: 'MT4 account ID must be numbers only' };
  if (!product) return { ok: false, error: 'Unknown indicator product' };

  return {
    ok: true,
    value: {
      customer_name: customerName,
      contact,
      mt4_account_id: mt4AccountId,
      account_server: String(input.account_server || '').trim() || null,
      product_code: productCode,
      status: 'PENDING',
      paid_confirmed: false,
      notes: String(input.notes || '').trim() || null,
    },
  };
}
