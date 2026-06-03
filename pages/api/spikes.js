import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const limit  = Math.min(parseInt(req.query.limit  || '200'), 500);
    const since  = req.query.since  || null;   // ISO string — optional filter
    const symbol = req.query.symbol || null;   // optional symbol filter

    let query = supabase
      .from('spike_events')
      .select('*')
      .order('fired_at', { ascending: false })
      .limit(limit);

    // Only apply time filter when explicitly requested (SPIKE BANNER uses since=20min)
    if (since) query = query.gte('fired_at', since);
    if (symbol) query = query.eq('symbol', symbol);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data || []);
  }

  return res.status(405).end();
}
