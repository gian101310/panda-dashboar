import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { data: user } = await supabase
    .from('panda_users')
    .select('role')
    .eq('id', session.user_id)
    .single();

  if (user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const { data, error } = await supabase
    .from('trade_journal')
    .select('*')
    .eq('status', 'OPEN')
    .order('entry_time', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Enrich with current gap/momentum from dashboard
  const symbols = [...new Set((data || []).map(t => t.symbol).filter(Boolean))];
  let dashData = {};
  if (symbols.length > 0) {
    const { data: dash } = await supabase
      .from('dashboard')
      .select('symbol, gap, bias, momentum, state, strength, execution, box_h1_trend, box_h4_trend')
      .in('symbol', symbols);
    (dash || []).forEach(d => { dashData[d.symbol] = d; });
  }

  const enriched = (data || []).map(t => ({
    ...t,
    current_gap:      dashData[t.symbol]?.gap ?? null,
    current_bias:     dashData[t.symbol]?.bias ?? null,
    current_momentum: dashData[t.symbol]?.momentum ?? null,
    current_state:    dashData[t.symbol]?.state ?? null,
    current_strength: dashData[t.symbol]?.strength ?? null,
    current_execution:dashData[t.symbol]?.execution ?? null,
    box_h1_trend:     dashData[t.symbol]?.box_h1_trend ?? null,
    box_h4_trend:     dashData[t.symbol]?.box_h4_trend ?? null,
  }));

  return res.status(200).json(enriched);
}
