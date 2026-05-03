import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

const TWELVEDATA_KEY = process.env.TWELVEDATA_API_KEY || '';
const ALL_PAIRS = [
  'AUDJPY','AUDCAD','AUDNZD','AUDUSD','CADJPY','EURAUD','EURCAD',
  'EURGBP','EURJPY','EURNZD','EURUSD','GBPAUD','GBPCAD','GBPJPY',
  'GBPNZD','GBPUSD','NZDCAD','NZDJPY','NZDUSD','USDCAD','USDJPY'
];

// Fetch D1 candles from Twelve Data (batched)
async function fetchD1Candles(symbols) {
  if (!TWELVEDATA_KEY) return {};
  const results = {};
  for (let i = 0; i < symbols.length; i += 11) {
    const batch = symbols.slice(i, i + 11);
    const tdSymbols = batch.map(s => s.slice(0,3) + '/' + s.slice(3)).join(',');
    try {
      const r = await fetch(
        `https://api.twelvedata.com/time_series?symbol=${tdSymbols}&interval=1day&outputsize=15&apikey=${TWELVEDATA_KEY}`
      );
      const data = await r.json();
      if (batch.length === 1) {
        const sym = batch[0];
        if (data.values && data.values.length >= 2) {
          results[sym] = data.values.map(v => ({
            open: parseFloat(v.open), high: parseFloat(v.high),
            low: parseFloat(v.low), close: parseFloat(v.close),
            datetime: v.datetime
          }));
        }
      } else {
        for (const sym of batch) {
          const td = sym.slice(0,3) + '/' + sym.slice(3);
          const entry = data[td];
          if (entry && entry.values && entry.values.length >= 2) {
            results[sym] = entry.values.map(v => ({
              open: parseFloat(v.open), high: parseFloat(v.high),
              low: parseFloat(v.low), close: parseFloat(v.close),
              datetime: v.datetime
            }));
          }
        }
      }
    } catch (e) {
      console.error('[PDR] Batch fetch error:', e.message);
    }
    if (i + 11 < symbols.length) await new Promise(r => setTimeout(r, 1500));
  }
  return results;
}

function computeATR(candles) {
  if (!candles || candles.length < 2) return null;
  const trs = [];
  for (let i = 0; i < candles.length - 1; i++) {
    const curr = candles[i];
    const prev = candles[i + 1];
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    trs.push(tr);
  }
  const period = Math.min(trs.length, 14);
  const sum = trs.slice(0, period).reduce((a, b) => a + b, 0);
  return sum / period;
}

function computePDR(candles) {
  if (!candles || candles.length < 2) return null;
  const prev = candles[1];
  const body = Math.abs(prev.close - prev.open);
  const range = prev.high - prev.low;
  if (range === 0) return null;

  const atr = computeATR(candles.slice(1));
  if (!atr || atr === 0) return null;

  const strength = body / atr;
  const retracement = (range - body) / range;
  const direction = prev.close > prev.open ? 'BULLISH' : 'BEARISH';

  return {
    symbol: null,
    strength: Math.round(strength * 100) / 100,
    retracement: Math.round(retracement * 100) / 100,
    direction,
    strong: retracement <= 0.50 && body > 0,
    body: Math.round(body * 100000) / 100000,
    range: Math.round(range * 100000) / 100000,
    atr: Math.round(atr * 100000) / 100000,
    prev_open: prev.open,
    prev_close: prev.close,
    prev_high: prev.high,
    prev_low: prev.low,
    date: prev.datetime
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (!TWELVEDATA_KEY) return res.status(200).json({ pdr: {}, error: 'TWELVEDATA_API_KEY not set' });

  try {
    // Check per-symbol cache — 15 min TTL
    const { data: cached } = await supabase
      .from('pdr_cache')
      .select('symbol, pdr_strength, pdr_strong, pdr_direction, retracement, computed_at')
      .order('computed_at', { ascending: false });

    if (cached && cached.length >= 1) {
      const age = (Date.now() - new Date(cached[0].computed_at).getTime()) / 1000;
      if (age < 900) {
        const pdr = {};
        for (const row of cached) {
          pdr[row.symbol] = {
            symbol: row.symbol,
            strength: row.pdr_strength,
            strong: row.pdr_strong,
            direction: row.pdr_direction,
            retracement: row.retracement,
          };
        }
        res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
        return res.status(200).json({
          pdr, computed_at: cached[0].computed_at,
          total: Object.keys(pdr).length,
          strong_count: Object.values(pdr).filter(p => p.strong).length,
          cached: true
        });
      }
    }

    // Cache miss or stale — fetch fresh from Twelve Data
    const candles = await fetchD1Candles(ALL_PAIRS);
    const pdr = {};
    const cacheRows = [];
    let strong_count = 0;
    const now = new Date().toISOString();

    for (const sym of ALL_PAIRS) {
      const result = computePDR(candles[sym]);
      if (result) {
        result.symbol = sym;
        pdr[sym] = result;
        if (result.strong) strong_count++;
        cacheRows.push({
          symbol: sym,
          pdr_strength: result.strength,
          pdr_strong: result.strong,
          pdr_direction: result.direction,
          retracement: result.retracement,
          computed_at: now
        });
      }
    }

    // Write per-symbol rows to pdr_cache (fire and forget)
    if (cacheRows.length > 0) {
      supabase.from('pdr_cache')
        .upsert(cacheRows, { onConflict: 'symbol' })
        .then(() => {}).catch(() => {});
    }

    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
    return res.status(200).json({ pdr, computed_at: now, total: Object.keys(pdr).length, strong_count, cached: false });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
