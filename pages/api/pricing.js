import { supabase } from '../../lib/supabase';

// Public pricing feed — read by pricing page, landing, funnel, and bots.
// Edited from /admin/pricing. 60s in-memory cache per instance.
let _cache = null;
let _cacheAt = 0;
const TTL = 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    if (_cache && Date.now() - _cacheAt < TTL) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return res.status(200).json(_cache);
    }
    const [{ data: tiers }, { data: products }] = await Promise.all([
      supabase.from('pricing_tiers').select('*').eq('active', true).order('sort'),
      supabase.from('store_products').select('*').eq('active', true).order('sort'),
    ]);
    const payload = { tiers: tiers || [], products: products || [] };
    _cache = payload; _cacheAt = Date.now();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(payload);
  } catch (err) {
    console.error('pricing_api_err', err);
    return res.status(500).json({ tiers: [], products: [] });
  }
}
