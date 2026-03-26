import { supabase } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/auth';

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Admin only' });

  const limit = parseInt(req.query.limit) || 100;
  const username = req.query.username || null;

  let query = supabase
    .from('panda_access_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (username) query = query.eq('username', username);

  const { data } = await query;
  return res.status(200).json(data || []);
}
