import { supabase } from '../../lib/supabase';
import { createCtraderOverlayHandler } from '../../lib/ctraderOverlayHandler.mjs';
import { CTRADER_TRADE_PLAN_V13_PRODUCT_CODE } from '../../lib/indicatorProducts.mjs';

const requests = new Map();

function allowRequest(key) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const recent = (requests.get(key) || []).filter((timestamp) => timestamp > windowStart);
  if (recent.length >= 90) return false;
  recent.push(now);
  requests.set(key, recent);
  if (requests.size > 1000) {
    for (const [storedKey, timestamps] of requests) {
      if (!timestamps.some((timestamp) => timestamp > windowStart)) requests.delete(storedKey);
    }
  }
  return true;
}

const handler = createCtraderOverlayHandler({
  productCode: CTRADER_TRADE_PLAN_V13_PRODUCT_CODE,
  allowOperatorToken: false,
  getLicense: async (account, productCode) => {
    const { data, error } = await supabase
      .from('indicator_licenses')
      .select('id,status,expires_at,paid_confirmed')
      .eq('platform', 'CTRADER')
      .eq('trading_account_number', account)
      .eq('product_code', productCode)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  getDashboardRows: async () => {
    const { data, error } = await supabase.from('dashboard').select(`
      symbol, gap, bias, hard_invalid, box_h4_trend, box_h1_trend,
      pl_zone, pl_bias, pl_g1_valid, base_currency, base_score_tf,
      quote_currency, quote_score_tf, updated_at
    `);
    if (error) throw error;
    return data || [];
  },
  touchLicense: async (id, timestamp) => {
    await supabase.from('indicator_licenses').update({ last_verified_at: timestamp }).eq('id', id);
  },
  rateLimiter: allowRequest,
});

export default async function ctraderTradePlanRoute(req, res) {
  try {
    return await handler(req, res);
  } catch (error) {
    console.error('cTrader trade plan license error:', error?.message || 'unknown');
    return res.status(500).json({ status: 'LICENSE_UNAVAILABLE' });
  }
}
