import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { symbol, timeframe = 'DAILY' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });

  // Determine how many rows to fetch based on timeframe
  const limits = { '1H': 5, '4H': 17, 'DAILY': 100, '1W': 680, 'ALL': 10000 };
  const limit = limits[timeframe] || 100;

  try {
    const { data, error } = await supabase
      .from('gap_history')
      .select('timestamp, gap')
      .eq('symbol', symbol.toUpperCase())
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ error: error.message });

    // Reverse so oldest first for chart
    const rows = (data || []).reverse();

    // Calculate trend arrow: compare latest vs 2 readings ago
    let trend = 'STABLE';
    if (rows.length >= 3) {
      const latest = rows[rows.length - 1]?.gap ?? 0;
      const prev   = rows[rows.length - 3]?.gap ?? 0;
      const diff   = latest - prev;
      if (diff >= 1) trend = 'STRONGER';
      else if (diff <= -1) trend = 'WEAKER';
    }

    return res.status(200).json({ data: rows, trend, symbol: symbol.toUpperCase() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
