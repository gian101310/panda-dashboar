import { supabase } from '../../lib/supabase';
import { decideIndicatorLicense, normalizeMt4AccountId, normalizeProductCode } from '../../lib/indicatorLicense.mjs';
import { getIndicatorProduct } from '../../lib/indicatorProducts.mjs';

const APPROVED_BODY = 'OK|APPROVED';

function text(res, status, body) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(status).send(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return text(res, 405, 'DENY|METHOD_NOT_ALLOWED');

  const body = req.body || {};
  const productCode = normalizeProductCode(body.product_code);
  const mt4AccountId = normalizeMt4AccountId(body.mt4_account_id || body.account_number);

  if (!getIndicatorProduct(productCode)) return text(res, 400, 'DENY|BAD_PRODUCT');
  if (!mt4AccountId) return text(res, 400, 'DENY|NO_ACCOUNT');

  const { data: license, error } = await supabase
    .from('indicator_licenses')
    .select('*')
    .eq('mt4_account_id', mt4AccountId)
    .eq('product_code', productCode)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return text(res, 500, 'DENY|SERVER_ERROR');

  const decision = decideIndicatorLicense(license);
  if (license?.id) {
    const updates = decision.ok
      ? { last_verified_at: new Date().toISOString(), last_denied_reason: null, account_server: body.account_server || license.account_server || null }
      : { last_denied_reason: decision.status, account_server: body.account_server || license.account_server || null };
    if (decision.status === 'EXPIRED' && license.status !== 'EXPIRED') updates.status = 'EXPIRED';
    await supabase.from('indicator_licenses').update(updates).eq('id', license.id);
  }

  return text(res, decision.ok ? 200 : 403, decision.ok ? APPROVED_BODY : decision.body);
}
