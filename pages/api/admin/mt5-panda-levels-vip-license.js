import { requireAdmin } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { createMt5PandaLevelsVipLicense } from '../../../lib/mt5PandaLevelsVipOfflineLicense.mjs';

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Admin only' });
  if (req.method !== 'GET') return res.status(405).end();
  const id = String(req.query?.license_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'License ID required' });

  const { data, error } = await supabase.from('indicator_licenses').select('*').eq('id', id).maybeSingle();
  if (error) return res.status(500).json({ error: 'Could not read license' });
  if (!data) return res.status(404).json({ error: 'License not found' });

  try {
    const file = createMt5PandaLevelsVipLicense(data, process.env.PANDA_MT5_LEVELS_VIP_OFFLINE_KEY);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(file.content);
  } catch (cause) {
    const message = cause?.message === 'Offline VIP license key unavailable' ? 'VIP license file service unavailable' : cause?.message;
    return res.status(400).json({ error: message || 'Could not issue VIP license file' });
  }
}
