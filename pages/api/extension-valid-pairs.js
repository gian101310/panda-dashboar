import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

let cache = { rows: null, ts: 0 };

export default async function handler(req, res) {
  // Chrome may omit Origin on extension requests with host permission. The
  // bearer session is required; credentials are never sent automatically.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const match = /^Bearer ([a-f0-9]{96})$/i.exec(req.headers.authorization || '');
  const session = await validateSession(match?.[1]);
  if (!session) return res.status(401).json({ error: 'Sign in to Panda Engine first' });

  try {
    if (!cache.rows || Date.now() - cache.ts >= 60_000) {
      const { data, error } = await supabase
        .from('dashboard')
        .select('symbol,gap,bias,hard_invalid,updated_at');
      if (error) throw error;
      cache = { rows: data || [], ts: Date.now() };
    }

    const pairs = cache.rows
      .filter(row => {
        const gap = Number(row.gap);
        return /^[A-Z]{6}$/.test(row.symbol || '') && !row.hard_invalid && Number.isFinite(gap) && Math.abs(gap) >= 5;
      })
      .map(row => ({
        symbol: row.symbol,
        gap: Number(row.gap),
        bias: Number(row.gap) >= 5 ? 'BUY' : 'SELL',
        // The engine stores UTC as timezone-less text; make that explicit for browsers.
        updated_at: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row.updated_at || '')
          ? `${row.updated_at.replace(' ', 'T')}Z`
          : row.updated_at,
      }))
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || a.symbol.localeCompare(b.symbol));

    return res.status(200).json({ pairs });
  } catch (error) {
    console.error('Extension valid pairs fetch failed:', error);
    return res.status(500).json({ error: 'Pair data unavailable' });
  }
}
