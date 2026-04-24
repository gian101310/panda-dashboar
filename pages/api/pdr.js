import { supabase } from '../../lib/supabase';

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
  for (let i = 0; i < symbols.length; i += 8) {
    const batch = symbols.slice(i, i + 8);
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
    if (i + 8 < symbols.length) await new Promise(r => setTimeout(r, 1500));
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
    strong: strength >= 0.5 && retracement <= 0.25,
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
  if (!TWELVEDATA_KEY) return res.status(200).json({ pdr: {}, error: 'TWELVEDATA_API_KEY not set' });

  try {
    const candles = await fetchD1Candles(ALL_PAIRS);
    const pdr = {};
    let strong_count = 0;

    for (const sym of ALL_PAIRS) {
      const result = computePDR(candles[sym]);
      if (result) {
        result.symbol = sym;
        pdr[sym] = result;
        if (result.strong) strong_count++;
      }
    }

    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
    return res.status(200).json({
      pdr,
      computed_at: new Date().toISOString(),
      total: Object.keys(pdr).length,
      strong_count
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
