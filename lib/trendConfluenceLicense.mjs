import { hashOverlayToken, normalizeTradingAccountNumber, safeTokenEqual } from './ctraderOverlay.mjs';
import { decideIndicatorLicense } from './indicatorLicense.mjs';
import { CTRADER_RAW_SCORE_PRODUCT_CODE, CTRADER_TREND_CONFLUENCE_PRODUCT_CODE, MT5_TREND_CONFLUENCE_PRODUCT_CODE } from './indicatorProducts.mjs';

export function confluencePlatform(productCode) {
  if (productCode === CTRADER_RAW_SCORE_PRODUCT_CODE || productCode === CTRADER_TREND_CONFLUENCE_PRODUCT_CODE) return 'CTRADER';
  if (productCode === MT5_TREND_CONFLUENCE_PRODUCT_CODE) return 'MT5';
  return '';
}

export function decideConfluenceAccess({ account, token, license, credential, productCode, now = new Date() }) {
  const platform = confluencePlatform(productCode);
  if (!platform || !normalizeTradingAccountNumber(account)) return { ok: false, status: 'INVALID_ACCOUNT' };
  if (!/^[a-f0-9]{64}$/i.test(String(token || ''))) return { ok: false, status: 'TOKEN_REQUIRED' };
  const licenseDecision = decideIndicatorLicense(license, now);
  if (!licenseDecision.ok) return { ok: false, status: licenseDecision.status };
  if (license.product_code !== productCode || license.platform !== platform || license.trading_account_number !== account)
    return { ok: false, status: 'LICENSE_REQUIRED' };
  if (!credential || credential.license_id !== license.id || credential.product_code !== productCode || credential.platform !== platform ||
      !safeTokenEqual(hashOverlayToken(token), credential.token_hash))
    return { ok: false, status: 'TOKEN_INVALID' };
  return { ok: true, status: 'APPROVED' };
}
