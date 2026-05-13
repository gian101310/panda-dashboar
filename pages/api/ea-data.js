// Panda Engine EA Data Endpoint
// Auth: Bearer token via EA_API_KEY env var (not cookie-based)
// Returns dashboard data for the MT4 Expert Advisor

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jxkelchxitwuilpbrwxk.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || ''
);

export default async function handler(req, res) {
  // Token auth for EA
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '').trim();
  const expected = process.env.EA_API_KEY || '';

  if (!expected || token !== expected) {
    return res.status(401).json({ error: 'Invalid EA token' });
  }

  try {
    const { data, error } = await supabase
      .from('dashboard')
      .select(`
        symbol, gap, state, strength, signal, momentum,
        delta_short, delta_mid, delta_long, close_alert,
        hard_invalid, bias, execution, confidence,
        base_currency, quote_currency,
        base_d1, base_h4, base_h1,
        quote_d1, quote_h4, quote_h1,
        box_h1_trend, box_h4_trend,
        pl_zone, pl_bias, pl_g1_valid,
        atr, spread, updated_at
      `);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
