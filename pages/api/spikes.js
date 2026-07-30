import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

// Module-level cache keyed by query params — warm containers reuse across polls
const _cache = new Map(); // key -> { rows, ts }
const CACHE_TTL_MS = 10_000;

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const limit  = Math.min(parseInt(req.query.limit  || '200'), 500);
    const since  = req.query.since  || null;   // ISO string — optional filter
    const symbol = req.query.symbol || null;   // optional symbol filter

    // Round `since` down to 10s buckets so different clients share cache entries
    const bucket = since ? String(Math.floor(new Date(since).getTime() / CACHE_TTL_MS)) : 'all';
    const key = `${bucket}|${symbol || ''}|${limit}`;
    const hit = _cache.get(key);
    if (hit && (Date.now() - hit.ts) < CACHE_TTL_MS) {
      return res.status(200).json(hit.rows);
    }

    let query = supabase
      .from('spike_events')
      .select('*')
      .order('fired_at', { ascending: false })
      .limit(limit);

    // Only apply time filter when explicitly requested (SPIKE BANNER uses since=20min)
    if (since) query = query.gte('fired_at', since);
    if (symbol) query = query.eq('symbol', symbol);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    const rows = data || [];
    _cache.set(key, { rows, ts: Date.now() });
    // prevent unbounded growth in warm containers
    if (_cache.size > 40) {
      const oldest = [..._cache.entries()].sort((a,b)=>a[1].ts-b[1].ts)[0];
      if (oldest) _cache.delete(oldest[0]);
    }
    return res.status(200).json(rows);
  }

  return res.status(405).end();
}
