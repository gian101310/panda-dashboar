import { isCronAuthorized } from '../../../lib/edgeRevalidation.mjs';
import { createEdgeRevalidationRuntime } from '../../../lib/edgeRevalidationRuntime.mjs';
import { supabase } from '../../../lib/supabase';

export const config = { maxDuration: 60 };

const runtime = createEdgeRevalidationRuntime({ supabase });

export default async function edgeRevalidationCron(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isCronAuthorized(req.headers.authorization, process.env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    return res.status(200).json(await runtime.run());
  } catch (error) {
    console.error('Edge revalidation cron failed');
    return res.status(500).json({ error: error?.message || 'Edge revalidation failed' });
  }
}
