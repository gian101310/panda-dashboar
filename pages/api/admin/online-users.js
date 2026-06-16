import { supabase } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/auth';

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Admin only' });

  // Online = active in last 3 minutes
  const cutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('panda_users')
    .select('username, role, pf_tier, last_active_at')
    .gt('last_active_at', cutoff)
    .order('last_active_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ online: data || [], count: (data || []).length });
}
