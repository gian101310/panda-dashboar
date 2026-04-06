import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  try {
    // Fetch last 7 days of gap history
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: history, error } = await supabase
      .from('gap_history')
      .select('symbol, gap, timestamp')
      .gte('timestamp', since)
      .order('timestamp', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    if (!history || history.length === 0) return res.status(200).json({ signals: [], summary: {} });

    // Group by symbol, ordered by time
    const bySymbol = {};
    for (const row of history) {
      if (!bySymbol[row.symbol]) bySymbol[row.symbol] = [];
      bySymbol[row.symbol].push({ gap: row.gap, ts: row.timestamp });
    }

    // Detect signal events: gap crossing ±5 threshold
    // A signal "wins" if gap moved further in signal direction within next 6 readings
    // A signal "loses" if gap reversed back below threshold
    const signals = [];
    const THRESHOLD = 5;
    const LOOKAHEAD = 6; // ~30 min at 5-min intervals

    for (const [symbol, rows] of Object.entries(bySymbol)) {
      let inSignal = false;
      let signalDir = null;
      let signalGap = 0;
      let signalTs = null;

      for (let i = 0; i < rows.length; i++) {
        const { gap, ts } = rows[i];
        const absGap = Math.abs(gap);
        const dir = gap > 0 ? 'BUY' : gap < 0 ? 'SELL' : null;

        // Signal fires when gap crosses threshold
        if (!inSignal && absGap >= THRESHOLD && dir) {
          inSignal = true;
          signalDir = dir;
          signalGap = gap;
          signalTs = ts;

          // Look ahead for outcome
          let peakGap = gap;
          let endGap = gap;
          const future = rows.slice(i + 1, i + 1 + LOOKAHEAD);
          for (const f of future) {
            if (signalDir === 'BUY') {
              if (f.gap > peakGap) peakGap = f.gap;
            } else {
              if (f.gap < peakGap) peakGap = f.gap;
            }
            endGap = f.gap;
          }

          const continued = signalDir === 'BUY'
            ? peakGap > signalGap
            : peakGap < signalGap;
          const reversed = signalDir === 'BUY'
            ? endGap < THRESHOLD
            : endGap > -THRESHOLD;

          const outcome = continued && !reversed ? 'WIN' : reversed ? 'LOSS' : 'HOLD';
          const pipsGained = Math.abs(peakGap) - Math.abs(signalGap);

          signals.push({
            symbol, direction: signalDir, gap: signalGap,
            peakGap, endGap, outcome, pipsGained: Math.round(pipsGained * 10) / 10,
            timestamp: signalTs
          });

        } else if (inSignal && absGap < THRESHOLD) {
          inSignal = false;
          signalDir = null;
        }
      }
    }

    // Summary stats
    const total = signals.length;
    const wins = signals.filter(s => s.outcome === 'WIN').length;
    const losses = signals.filter(s => s.outcome === 'LOSS').length;
    const holds = signals.filter(s => s.outcome === 'HOLD').length;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    const avgPeakGain = total > 0
      ? Math.round(signals.reduce((a, s) => a + s.pipsGained, 0) / total * 10) / 10
      : 0;

    // Per-pair breakdown
    const pairStats = {};
    for (const s of signals) {
      if (!pairStats[s.symbol]) pairStats[s.symbol] = { wins: 0, losses: 0, holds: 0, total: 0 };
      pairStats[s.symbol].total++;
      if (s.outcome === 'WIN') pairStats[s.symbol].wins++;
      else if (s.outcome === 'LOSS') pairStats[s.symbol].losses++;
      else pairStats[s.symbol].holds++;
    }

    return res.status(200).json({
      signals: signals.slice(-50).reverse(), // last 50, newest first
      summary: { total, wins, losses, holds, winRate, avgPeakGain },
      pairStats
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
