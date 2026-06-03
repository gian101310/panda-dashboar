import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

export default async function handler(req, res) {
  // GET — anyone can check maintenance status (no auth needed)
  if (req.method === 'GET') {
    const { data } = await supabase
      .from('site_config')
      .select('value')
      .eq('key', 'maintenance_mode')
      .single();
    return res.status(200).json({ maintenance: data?.value === true });
  }

  // POST — admin-only toggle
  if (req.method === 'POST') {
    const token = req.cookies?.panda_session;
    const session = await validateSession(token);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });

    const { data: user } = await supabase
      .from('panda_users')
      .select('role')
      .eq('id', session.user_id)
      .single();

    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { enabled } = req.body;
    const { error } = await supabase
      .from('site_config')
      .update({ value: enabled === true, updated_at: new Date().toISOString() })
      .eq('key', 'maintenance_mode');

    if (error) return res.status(500).json({ error: 'Failed to update' });
    return res.status(200).json({ ok: true, maintenance: enabled === true });
  }

  return res.status(405).end();
}
