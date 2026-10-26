import { requireAdmin } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';

const ARTIFACTS = {
  ctrader: { key: 'panda-levels-v2-ctrader-licensed.algo', name: 'Panda Levels V2 cTrader Licensed.algo' },
  mt5: { key: 'panda-levels-v2-14-mt5-offline-20261026.zip', name: 'Panda Levels MT5 Licensed Offline.zip' },
  'mt5-vip': { key: 'panda-level-mt5-vip-v1-01-20261026.zip', name: 'Panda Level MT5 VIP.zip' },
};

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Admin only' });
  if (req.method !== 'GET') return res.status(405).end();

  const artifact = ARTIFACTS[String(req.query?.platform || '').toLowerCase()];
  if (!artifact) return res.status(400).json({ error: 'Choose cTrader, MT5, or MT5 VIP' });

  try {
    const { data, error } = await supabase.storage.from('private-indicators').download(artifact.key);
    if (error || !data) throw error || new Error('Artifact missing');
    const bytes = Buffer.from(await data.arrayBuffer());
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${artifact.name}"`);
    res.setHeader('Content-Length', bytes.length);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(bytes);
  } catch {
    return res.status(503).json({ error: 'Indicator download unavailable' });
  }
}
