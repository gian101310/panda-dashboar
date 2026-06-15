import { supabase } from '../../lib/supabase';
import { PAGE_VISIBILITY_KEY, normalizePageVisibility } from '../../lib/pageVisibility.mjs';

// Public (no auth) — returns page visibility settings so _app.js can gate pages for visitors
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const { data, error } = await supabase
    .from('site_config')
    .select('value')
    .eq('key', PAGE_VISIBILITY_KEY)
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'Failed to load' });

  // Cache for 10s to avoid hammering Supabase on every page nav
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
  return res.status(200).json(normalizePageVisibility(data?.value));
}
