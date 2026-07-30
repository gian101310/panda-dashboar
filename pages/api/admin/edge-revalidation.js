import { requireAdmin } from '../../../lib/auth';
import { createEdgeRevalidationHandler } from '../../../lib/edgeRevalidation.mjs';
import { createEdgeRevalidationRuntime } from '../../../lib/edgeRevalidationRuntime.mjs';
import { supabase } from '../../../lib/supabase';

export const config = { maxDuration: 60 };

const runtime = createEdgeRevalidationRuntime({ supabase });
const handler = createEdgeRevalidationHandler({
  requireAdmin,
  getLatest: runtime.getLatest,
  runRevalidation: runtime.run,
});

export default async function edgeRevalidationRoute(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  return handler(req, res);
}
