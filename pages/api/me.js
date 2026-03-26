import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { data: user } = await supabase
    .from('panda_users')
    .select('id, username, role, feature_access, max_devices')
    .eq('id', session.user_id)
    .single();

  if (!user) return res.status(401).json({ error: 'User not found' });

  return res.status(200).json({
    id: user.id,
    username: user.username,
    role: user.role,
    feature_access: user.feature_access || ['dashboard','cot','calendar','calculator'],
  });
}
