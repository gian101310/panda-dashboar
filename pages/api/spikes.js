import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    // Get spikes from last 20 minutes
    const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('spike_events')
      .select('*')
      .gte('fired_at', since)
      .order('fired_at', { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data || []);
  }

  return res.status(405).end();
}
