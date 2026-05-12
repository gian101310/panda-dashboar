import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data, error } = await supabase
      .from('dashboard')
      .select(`
        symbol, gap, state, strength, signal, updated_at,
        momentum, delta_short, delta_mid, delta_long, close_alert,
        hard_invalid, bias, execution, confidence, conflict_detail,
        base_currency, base_d1, base_h4, base_h1,
        quote_currency, quote_d1, quote_h4, quote_h1,
        adv_base_d1, adv_base_h4, adv_base_h1,
        adv_quote_d1, adv_quote_h4, adv_quote_h1,
        atr, atr_reference, spread,
        box_h1_trend, box_h4_trend,
        pl_zone, pl_bias, pl_g1_valid,
        pdh, pdl, pwh, pwl, pmh, pml, pyh, pyl
      `);

    if (error) return res.status(500).json({ error: error.message });

    const rows = data || [];

    rows.sort((a, b) => {
      const aValid = Math.abs(a.gap || 0) >= 5 && !a.hard_invalid;
      const bValid = Math.abs(b.gap || 0) >= 5 && !b.hard_invalid;
      if (aValid && !bValid) return -1;
      if (!aValid && bValid) return 1;
      if (aValid && bValid) return (b.strength || 0) - (a.strength || 0);
      return Math.abs(b.gap || 0) - Math.abs(a.gap || 0);
    });

    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
