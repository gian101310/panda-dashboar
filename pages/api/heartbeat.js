import { supabase } from '../../lib/supabase';
import { parse } from 'cookie';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const cookies = parse(req.headers.cookie || '');
  const token = cookies.panda_session;
  if (!token) return res.status(401).json({ error: 'not logged in' });

  // Look up session by token, then get user_id
  const { data: session } = await supabase
    .from('panda_sessions')
    .select('user_id')
    .eq('token', token)
    .eq('is_revoked', false)
    .single();

  if (!session) return res.status(401).json({ error: 'invalid session' });

  await supabase
    .from('panda_users')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', session.user_id);

  return res.status(200).json({ ok: true });
}
