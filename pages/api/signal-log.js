import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { symbol, bias, valid, from, to, limit = 500 } = req.query;

  let query = supabase
    .from('signal_snapshots')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(Math.min(parseInt(limit) || 500, 2000));

  if (symbol) query = query.eq('symbol', symbol);
  if (bias && bias !== 'ALL') query = query.eq('bias', bias);
  if (valid === 'true') query = query.eq('is_valid', true);
  if (valid === 'false') query = query.eq('is_valid', false);
  if (from) query = query.gte('timestamp', from);
  if (to) query = query.lte('timestamp', to);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data || []);
}
