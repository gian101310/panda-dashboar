import { supabase } from '../../lib/supabase';

// Public endpoint — returns limited signal data for landing page social proof
// No auth required, returns top 5 strongest pairs only
// No internal scores, no TBG data, no strategy details
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    const { data, error } = await supabase
      .from('dashboard')
      .select('symbol, gap, bias, momentum, strength, state')
      .order('updated_at', { ascending: false });

    if (error) return res.status(500).json({ error: 'Fetch failed' });

    // Filter valid signals only, sort by absolute gap descending, return top 5
    const valid = (data || [])
      .filter(r => r.bias && r.bias !== 'WAIT' && Math.abs(r.gap || 0) >= 5)
      .sort((a, b) => Math.abs(b.gap || 0) - Math.abs(a.gap || 0))
      .slice(0, 5)
      .map(r => ({
        symbol: r.symbol,
        direction: r.gap > 0 ? 'BUY' : 'SELL',
        gap: Math.round(Math.abs(r.gap || 0) * 10) / 10,
        momentum: r.momentum || 'NEUTRAL',
        strength: Math.round(Math.abs(r.strength || 0) * 10) / 10,
      }));

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ signals: valid, count: valid.length, updated: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
}
