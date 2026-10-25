import { createHmac, randomBytes } from 'node:crypto';

import { MT5_PANDA_LEVELS_PRODUCT_CODE } from './indicatorProducts.mjs';
import { normalizeTradingAccountNumber } from './indicatorLicense.mjs';

export const MT5_PANDA_LEVELS_LICENSE_VERSION = 'PANDA_MT5_LEVELS_V1';

export function expiryAtEndOfDubaiDay(value) {
  const date = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const midnightUtc = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(midnightUtc) || new Date(midnightUtc).toISOString().slice(0, 10) !== date) return null;
  // Dubai is UTC+4 throughout the year; the chosen date ends at 19:59:59 UTC.
  return Math.floor((midnightUtc + 20 * 60 * 60 * 1000 - 1000) / 1000);
}

export function createMt5PandaLevelsLicense(license, keyHex, { now = new Date(), nonce = randomBytes(16).toString('hex') } = {}) {
  if (license?.product_code !== MT5_PANDA_LEVELS_PRODUCT_CODE || license?.platform !== 'MT5') {
    throw new Error('Wrong indicator product');
  }
  if (license.status !== 'APPROVED' || license.paid_confirmed !== true) {
    throw new Error('License must be approved and paid');
  }
  const account = normalizeTradingAccountNumber(license.trading_account_number || license.mt4_account_id);
  if (!account) throw new Error('Valid MT5 account required');
  const expires = expiryAtEndOfDubaiDay(license.expires_at);
  if (!expires || expires <= Math.floor(now.getTime() / 1000)) throw new Error('Future expiry date required');
  if (!/^[0-9a-f]{64}$/i.test(String(keyHex || ''))) throw new Error('Offline license key unavailable');
  if (!/^[0-9a-f]{32}$/i.test(nonce)) throw new Error('Invalid nonce');

  const payload = `${MT5_PANDA_LEVELS_LICENSE_VERSION}|${account}|${expires}|${nonce.toLowerCase()}`;
  const mac = createHmac('sha256', Buffer.from(keyHex, 'hex')).update(payload, 'utf8').digest('hex');
  return {
    account,
    expires,
    fileName: `PandaLevelsMT5_${account}.lic`,
    content: `${MT5_PANDA_LEVELS_LICENSE_VERSION}\r\n${account}\r\n${expires}\r\n${nonce.toLowerCase()}\r\n${mac}\r\n`,
  };
}
