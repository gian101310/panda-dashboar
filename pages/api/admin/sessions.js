import { supabase } from '../../../lib/supabase';
import { requireAdmin, logAccess } from '../../../lib/auth';

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Admin only' });

  // GET - list all active sessions
  if (req.method === 'GET') {
    const { data } = await supabase
      .from('panda_sessions')
      .select('*')
      .eq('is_revoked', false)
      .order('last_seen', { ascending: false })
      .limit(200);
    return res.status(200).json(data || []);
  }

  // DELETE - revoke session(s)
  if (req.method === 'DELETE') {
    const { session_id, user_id, revoke_all } = req.body;

    if (revoke_all && user_id) {
      await supabase.from('panda_sessions').update({ is_revoked: true }).eq('user_id', user_id);
      await logAccess(admin.username, 'REVOKE_ALL_SESSIONS', req, true, `User ID: ${user_id}`);
    } else if (session_id) {
      await supabase.from('panda_sessions').update({ is_revoked: true }).eq('id', session_id);
      await logAccess(admin.username, 'REVOKE_SESSION', req, true, `Session: ${session_id}`);
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
