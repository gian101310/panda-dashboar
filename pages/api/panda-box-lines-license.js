import { supabase } from '../../lib/supabase';
import { MT4_PANDA_BOX_LINES_PRODUCT_CODE } from '../../lib/indicatorProducts.mjs';
import { createPandaBoxLinesLicenseHandler } from '../../lib/pandaBoxLinesLicense.mjs';

const requests = new Map();
function allowRequest(ip) {
  const now = Date.now();
  const recent = (requests.get(ip) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 30) return false;
  recent.push(now);
  requests.set(ip, recent);
  if (requests.size > 1000) {
    for (const [key, times] of requests) if (!times.some((time) => now - time < 60_000)) requests.delete(key);
  }
  return true;
}

const handler = createPandaBoxLinesLicenseHandler({
  allowRequest,
  getLicense: async (account) => {
    const { data, error } = await supabase.from('indicator_licenses')
      .select('id,status,paid_confirmed,expires_at')
      .eq('platform', 'MT4')
      .eq('trading_account_number', account)
      .eq('product_code', MT4_PANDA_BOX_LINES_PRODUCT_CODE)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },
  touchLicense: async (id) => {
    await supabase.from('indicator_licenses').update({ last_verified_at: new Date().toISOString() }).eq('id', id);
  },
});

export default async function pandaBoxLinesLicenseRoute(req, res) {
  try {
    return await handler(req, res);
  } catch {
    console.error('Panda Box and Lines license check failed');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(503).send('DENY|SERVER_ERROR');
  }
}
