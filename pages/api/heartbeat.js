import { supabase } from '../../lib/supabase';
import { parse } from 'cookie';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const cookies = parse(req.headers.cookie || '');
  const session = cookies.panda_session;
  if (!session) return res.status(401).json({ error: 'not logged in' });

  const { data: user } = await supabase
    .from('panda_users')
    .select('id, username')
    .eq('id', session)
    .single();

  if (!user) return res.status(401).json({ error: 'invalid session' });

  await supabase
    .from('panda_users')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', user.id);

  return res.status(200).json({ ok: true });
}
