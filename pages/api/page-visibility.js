import { supabase } from '../../lib/supabase';
import { requireAdmin } from '../../lib/auth';
import { PAGE_VISIBILITY_KEY, normalizePageVisibility } from '../../lib/pageVisibility.mjs';

export default async function handler(req, res) {
  const session = await requireAdmin(req);
  if (!session) return res.status(403).json({ error: 'Admin only' });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('site_config')
      .select('value')
      .eq('key', PAGE_VISIBILITY_KEY)
      .maybeSingle();

    if (error) return res.status(500).json({ error: 'Failed to load page visibility' });
    return res.status(200).json(normalizePageVisibility(data?.value));
  }

  if (req.method === 'POST') {
    const value = normalizePageVisibility(req.body);
    const { error } = await supabase
      .from('site_config')
      .upsert({
        key: PAGE_VISIBILITY_KEY,
        value,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (error) return res.status(500).json({ error: 'Failed to update page visibility' });
    return res.status(200).json({ ok: true, ...value });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}
