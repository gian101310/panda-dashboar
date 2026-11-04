import { supabase } from '../../lib/supabase';
import { sanitizeOverlayRows } from '../../lib/ctraderOverlay.mjs';
import { normalizeTradingAccountNumber } from '../../lib/indicatorLicense.mjs';
import { confluencePlatform, decideConfluenceAccess } from '../../lib/trendConfluenceLicense.mjs';

const requests = new Map();
function header(req, name) {
  const value = req.headers?.[name];
  return Array.isArray(value) ? value[0] : String(value || '').trim();
}
function limited(ip) {
  const now = Date.now();
  const recent = (requests.get(ip) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 90) return true;
  recent.push(now);
  requests.set(ip, recent);
  if (requests.size > 1000) for (const [key, values] of requests) if (!values.some((time) => now - time < 60_000)) requests.delete(key);
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).end();
  const ip = header(req, 'x-forwarded-for').split(',')[0] || req.socket?.remoteAddress || 'unknown';
  if (limited(ip)) return res.status(429).json({ status: 'RATE_LIMITED' });
  const productCode = header(req, 'x-panda-product-code');
  const platform = confluencePlatform(productCode);
  const account = normalizeTradingAccountNumber(header(req, 'x-panda-account-number'));
  const token = header(req, 'x-panda-confluence-token');
  if (!platform || !account || !/^[a-f0-9]{64}$/i.test(token)) return res.status(401).json({ status: 'AUTH_REQUIRED' });
  try {
    const { data: license, error: licenseError } = await supabase.from('indicator_licenses')
      .select('id,product_code,platform,trading_account_number,status,paid_confirmed,expires_at')
      .eq('platform', platform).eq('trading_account_number', account).eq('product_code', productCode)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (licenseError) throw licenseError;
    let credential = null;
    if (license) {
      const result = await supabase.from('indicator_confluence_tokens')
        .select('license_id,product_code,platform,token_hash').eq('license_id', license.id).maybeSingle();
      if (result.error) throw result.error;
      credential = result.data;
    }
    const decision = decideConfluenceAccess({ account, token, license, credential, productCode });
    if (!decision.ok) return res.status(403).json({ status: decision.status });
    const { data: rows, error: dashboardError } = await supabase.from('dashboard').select(`
      symbol, gap, bias, hard_invalid, box_h4_trend, box_h1_trend,
      pl_zone, pl_bias, pl_g1_valid, base_currency, base_score_tf,
      quote_currency, quote_score_tf, updated_at
    `);
    if (dashboardError) throw dashboardError;
    const now = new Date().toISOString();
    await supabase.from('indicator_licenses').update({ last_verified_at: now }).eq('id', license.id);
    return res.status(200).json({ schema_version: 1, server_time: now, max_age_seconds: 600, pairs: sanitizeOverlayRows(rows) });
  } catch (error) {
    console.error('Trend Confluence feed failed:', error?.message || 'unknown');
    return res.status(500).json({ status: 'FEED_UNAVAILABLE' });
  }
}
