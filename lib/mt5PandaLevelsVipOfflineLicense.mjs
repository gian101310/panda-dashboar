import { createHmac, randomBytes } from 'node:crypto';

import { MT5_PANDA_LEVELS_VIP_PRODUCT_CODE } from './indicatorProducts.mjs';
import { normalizeTradingAccountNumber } from './indicatorLicense.mjs';
import { expiryAtEndOfDubaiDay } from './mt5PandaLevelsOfflineLicense.mjs';

export const MT5_PANDA_LEVELS_VIP_LICENSE_VERSION = 'PANDA_MT5_LEVELS_VIP_V1';

export function createMt5PandaLevelsVipLicense(license, keyHex, { now = new Date(), nonce = randomBytes(16).toString('hex') } = {}) {
  if (license?.product_code !== MT5_PANDA_LEVELS_VIP_PRODUCT_CODE || license?.platform !== 'MT5') {
    throw new Error('Wrong indicator product');
  }
  if (license.status !== 'APPROVED' || license.paid_confirmed !== true) {
    throw new Error('License must be approved and paid');
  }
  const account = normalizeTradingAccountNumber(license.trading_account_number || license.mt4_account_id);
  if (!account) throw new Error('Valid MT5 account required');
  const expires = expiryAtEndOfDubaiDay(license.expires_at);
  if (!expires || expires <= Math.floor(now.getTime() / 1000)) throw new Error('Future expiry date required');
  if (!/^[0-9a-f]{64}$/i.test(String(keyHex || ''))) throw new Error('Offline VIP license key unavailable');
  if (!/^[0-9a-f]{32}$/i.test(nonce)) throw new Error('Invalid nonce');

  const payload = `${MT5_PANDA_LEVELS_VIP_LICENSE_VERSION}|${account}|${expires}|${nonce.toLowerCase()}`;
  const mac = createHmac('sha256', Buffer.from(keyHex, 'hex')).update(payload, 'utf8').digest('hex');
  return {
    account,
    expires,
    fileName: `PandaLevelsMT5VIP_${account}.lic`,
    content: `${MT5_PANDA_LEVELS_VIP_LICENSE_VERSION}\r\n${account}\r\n${expires}\r\n${nonce.toLowerCase()}\r\n${mac}\r\n`,
  };
}
