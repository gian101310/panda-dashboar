import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  // Shadow tracker is opt-in: admin always, others only with 'shadow' feature
  const u = session.panda_users || {};
  if (u.role !== 'admin' && !(u.feature_access || []).includes('shadow')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { symbol, tier, status, limit = 300 } = req.query;

  let query = supabase
    .from('shadow_tracker')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(parseInt(limit) || 300, 1000));

  if (symbol) query = query.eq('symbol', symbol);
  if (tier) query = query.eq('tier', parseInt(tier));
  if (status && status !== 'ALL') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Summary stats for closed entries
  const done = (data || []).filter(r => r.status === 'DONE' && r.pips != null);
  const wins = done.filter(r => r.pips > 5).length;
  const losses = done.filter(r => r.pips < -5).length;
  const netPips = done.reduce((s, r) => s + (r.pips || 0), 0);

  return res.status(200).json({
    rows: data || [],
    summary: {
      total: (data || []).length,
      open: (data || []).filter(r => r.status === 'PENDING').length,
      done: done.length,
      wins, losses,
      net_pips: Math.round(netPips * 10) / 10,
      avg_pips: done.length ? Math.round((netPips / done.length) * 100) / 100 : 0,
    },
  });
}
