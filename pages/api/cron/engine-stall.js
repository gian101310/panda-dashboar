import { isCronAuthorized } from '../../../lib/cronAuth.mjs';
import { createEngineStallRuntime } from '../../../lib/engineStallRuntime.mjs';
import { supabase } from '../../../lib/supabase';

export const config = { maxDuration: 30 };

const monitor = createEngineStallRuntime({ supabase });

export default async function engineStallCron(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isCronAuthorized(req.headers.authorization, process.env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    return res.status(200).json(await monitor());
  } catch (error) {
    console.error('Engine stall monitor failed');
    return res.status(500).json({ error: error?.message || 'Engine stall monitor failed' });
  }
}
