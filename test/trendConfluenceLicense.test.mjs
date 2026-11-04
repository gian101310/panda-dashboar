import test from 'node:test';
import assert from 'node:assert/strict';
import { hashOverlayToken } from '../lib/ctraderOverlay.mjs';
import { decideConfluenceAccess } from '../lib/trendConfluenceLicense.mjs';
import { CTRADER_TREND_CONFLUENCE_PRODUCT_CODE, MT5_TREND_CONFLUENCE_PRODUCT_CODE } from '../lib/indicatorProducts.mjs';

const token = 'a'.repeat(64);
const account = '12345678';
function fixture(productCode = CTRADER_TREND_CONFLUENCE_PRODUCT_CODE) {
  const platform = productCode.startsWith('ctrader') ? 'CTRADER' : 'MT5';
  return {
    account, token, productCode,
    license: { id: 'license-1', product_code: productCode, platform, trading_account_number: account, status: 'APPROVED', paid_confirmed: true, expires_at: null },
    credential: { license_id: 'license-1', product_code: productCode, platform, token_hash: hashOverlayToken(token) },
  };
}

test('approved account and its own token permit both platform editions', () => {
  for (const code of [CTRADER_TREND_CONFLUENCE_PRODUCT_CODE, MT5_TREND_CONFLUENCE_PRODUCT_CODE]) {
    assert.equal(decideConfluenceAccess(fixture(code)).ok, true);
  }
});
test('token is mandatory, individually bound, and revocable', () => {
  assert.equal(decideConfluenceAccess({ ...fixture(), token: '' }).status, 'TOKEN_REQUIRED');
  assert.equal(decideConfluenceAccess({ ...fixture(), token: 'b'.repeat(64) }).status, 'TOKEN_INVALID');
  assert.equal(decideConfluenceAccess({ ...fixture(), credential: null }).status, 'TOKEN_INVALID');
  assert.equal(decideConfluenceAccess({ ...fixture(), account: '99999999' }).status, 'LICENSE_REQUIRED');
});
test('disabled, unpaid, and expired licenses stop a valid token', () => {
  const disabled = fixture(); disabled.license.status = 'DISABLED';
  assert.equal(decideConfluenceAccess(disabled).status, 'DISABLED');
  const unpaid = fixture(); unpaid.license.paid_confirmed = false;
  assert.equal(decideConfluenceAccess(unpaid).status, 'PAYMENT_PENDING');
  const expired = fixture(); expired.license.expires_at = '2020-01-01T00:00:00Z';
  assert.equal(decideConfluenceAccess(expired).status, 'EXPIRED');
});
test('a token from another product or platform cannot activate this package', () => {
  const wrongProduct = fixture(); wrongProduct.credential.product_code = MT5_TREND_CONFLUENCE_PRODUCT_CODE;
  assert.equal(decideConfluenceAccess(wrongProduct).status, 'TOKEN_INVALID');
  const wrongPlatform = fixture(); wrongPlatform.credential.platform = 'MT5';
  assert.equal(decideConfluenceAccess(wrongPlatform).status, 'TOKEN_INVALID');
});
