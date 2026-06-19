import { supabase } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/auth';

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Admin only' });

  if (req.method === 'GET') {
    const { data } = await supabase
      .from('engine_config')
      .select('value')
      .eq('key', 'telegram_notifications_enabled')
      .single();

    return res.status(200).json({ enabled: data?.value !== 'false' });
  }

  if (req.method === 'POST') {
    const { enabled } = req.body;
    const { error } = await supabase
      .from('engine_config')
      .upsert({ key: 'telegram_notifications_enabled', value: String(!!enabled), updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, enabled: !!enabled });
  }

  return res.status(405).end();
}
