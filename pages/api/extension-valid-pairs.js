import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

let cache = { rows: null, ts: 0 };

function plStatus(row) {
  const zone = row.pl_zone;
  if (zone === 'BETWEEN') return 'BETWEEN';
  if (zone !== 'ABOVE' && zone !== 'BELOW') return 'UNVERIFIED';
  const price = Number(row.pl_price);
  const st = Number(row.pl_st);
  const fl = Number(row.pl_fl);
  if (![price, st, fl].every(value => Number.isFinite(value) && value > 0)) return 'UNVERIFIED';
  const buffer = (row.symbol?.includes('JPY') ? 0.01 : 0.0001) * 10;
  if (zone === 'ABOVE' && price > Math.max(st, fl))
    return price - Math.max(st, fl) + 1e-10 >= buffer ? 'BELOW' : 'NEAR';
  if (zone === 'BELOW' && price < Math.min(st, fl))
    return Math.min(st, fl) - price + 1e-10 >= buffer ? 'ABOVE' : 'NEAR';
  return price >= Math.min(st, fl) && price <= Math.max(st, fl) ? 'BETWEEN' : 'UNVERIFIED';
}

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
        .select('symbol,gap,bias,hard_invalid,updated_at,box_h1_trend,box_h4_trend,base_currency,quote_currency,base_score_tf,quote_score_tf,pl_zone,pl_price,pl_st,pl_fl');
      if (error) throw error;
      cache = { rows: data || [], ts: Date.now() };
    }

    const pairs = cache.rows
      .filter(row => {
        const gap = Number(row.gap);
        return /^[A-Z]{6}$/.test(row.symbol || '') && !row.hard_invalid && Number.isFinite(gap) && Math.abs(gap) >= 5;
      })
      .map(row => {
        const bias = Number(row.gap) >= 5 ? 'BUY' : 'SELL';
        const status = plStatus(row);
        const xtf = [
          row.base_score_tf && `${row.base_currency || row.symbol.slice(0, 3)} ${row.base_score_tf.trim()}`,
          row.quote_score_tf && `${row.quote_currency || row.symbol.slice(3, 6)} ${row.quote_score_tf.trim()}`,
        ].filter(Boolean).join(' | ') || 'NONE';
        return {
          symbol: row.symbol,
          gap: Number(row.gap),
          bias,
          box_h1: row.box_h1_trend || 'UNKNOWN',
          box_h4: row.box_h4_trend || 'UNKNOWN',
          xtf,
          pl_status: status,
          pl_verdict: status === 'UNVERIFIED' ? 'N/A' : status === 'NEAR' ? 'NEAR'
            : status === (bias === 'BUY' ? 'BELOW' : 'ABOVE') ? 'VALID' : 'INVALID',
          // The engine stores UTC as timezone-less text; make that explicit for browsers.
          updated_at: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row.updated_at || '')
            ? `${row.updated_at.replace(' ', 'T')}Z`
            : row.updated_at,
        };
      })
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || a.symbol.localeCompare(b.symbol));

    return res.status(200).json({ pairs });
  } catch (error) {
    console.error('Extension valid pairs fetch failed:', error);
    return res.status(500).json({ error: 'Pair data unavailable' });
  }
}
