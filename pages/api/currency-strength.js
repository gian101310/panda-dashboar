import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

const CURRENCIES = ['EUR','GBP','AUD','NZD','USD','CAD','JPY'];

const PAIRS = [
  'EURUSD','EURGBP','EURAUD','EURNZD','EURCAD','EURJPY',
  'GBPUSD','GBPAUD','GBPNZD','GBPCAD','GBPJPY',
  'AUDUSD','AUDNZD','AUDCAD','AUDJPY',
  'NZDUSD','NZDCAD','NZDJPY',
  'USDCAD','USDJPY',
  'CADJPY'
];

// Count how many pairs each currency appears in
const PAIR_COUNT = {};
CURRENCIES.forEach(c => PAIR_COUNT[c] = 0);
PAIRS.forEach(p => {
  PAIR_COUNT[p.slice(0,3)]++;
  PAIR_COUNT[p.slice(3,6)]++;
});

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { periods = 48 } = req.query; // default 48 periods = 48h of hourly data

  // Get latest gap_history for all pairs — hourly snapshots
  const { data: gaps } = await supabase
    .from('gap_history')
    .select('timestamp, symbol, gap')
    .order('timestamp', { ascending: false })
    .limit(parseInt(periods) * 25); // enough rows for all pairs

  if (!gaps || gaps.length === 0) {
    return res.status(200).json({ series: {}, ranking: [], timestamps: [] });
  }

  // Group by timestamp (round to nearest hour)
  const byTime = {};
  gaps.forEach(row => {
    const ts = new Date(row.timestamp);
    ts.setMinutes(0, 0, 0);
    const key = ts.toISOString();
    if (!byTime[key]) byTime[key] = {};
    byTime[key][row.symbol] = row.gap;
  });

  // Sort timestamps oldest to newest
  const timestamps = Object.keys(byTime).sort().slice(-parseInt(periods));

  // Calculate currency strength at each timestamp
  // Logic from UltimateStrengthMomentumAuto.cs:
  // For each pair: if gap > 0 (base trending up) → base+1, quote-1
  //               if gap < 0 (quote trending up) → base-1, quote+1
  const series = {};
  CURRENCIES.forEach(c => series[c] = []);

  const SMOOTH = 0.3;
  const prev = {};
  CURRENCIES.forEach(c => prev[c] = 0);

  timestamps.forEach(ts => {
    const snapshot = byTime[ts] || {};
    const raw = {};
    CURRENCIES.forEach(c => raw[c] = 0);

    PAIRS.forEach(pair => {
      const gap = snapshot[pair];
      if (gap === undefined || gap === null) return;
      const base = pair.slice(0,3);
      const quote = pair.slice(3,6);
      if (gap > 0) { raw[base]++; raw[quote]--; }
      else if (gap < 0) { raw[base]--; raw[quote]++; }
    });

    CURRENCIES.forEach(c => {
      // Normalize by pair count
      const normalized = PAIR_COUNT[c] > 0 ? raw[c] / PAIR_COUNT[c] : 0;
      // EMA smoothing
      const smoothed = prev[c] + (normalized - prev[c]) * SMOOTH;
      prev[c] = smoothed;
      series[c].push(parseFloat(smoothed.toFixed(3)));
    });
  });

  // Current ranking (latest values)
  const latest = {};
  CURRENCIES.forEach(c => {
    const arr = series[c];
    latest[c] = arr.length > 0 ? arr[arr.length - 1] : 0;
  });

  const ranking = Object.entries(latest)
    .sort((a, b) => b[1] - a[1])
    .map(([currency, value], idx) => ({ currency, value: parseFloat(value.toFixed(3)), rank: idx + 1 }));

  // Format timestamps for display
  const labels = timestamps.map(ts => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) + ' ' +
           d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  });

  return res.status(200).json({ series, ranking, labels, timestamps });
}
