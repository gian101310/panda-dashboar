import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  try {
    // Fetch all signal results (last 30 days)
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: signals, error } = await supabase
      .from('signal_results')
      .select('*')
      .gte('signal_time', since)
      .order('signal_time', { ascending: false })
      .limit(500);

    if (error) return res.status(500).json({ error: error.message });
    if (!signals || signals.length === 0)
      return res.status(200).json({ signals: [], pending: 0, summary: { total:0, winRate:0, wins:0, losses:0, flats:0, avgPips4h:0, avgPips8h:0, avgPips24h:0 }, pairStats: {}, momentumStats: {} });

    // Only count completed signals for stats
    const done = signals.filter(s => s.status === 'DONE');
    const pending = signals.filter(s => s.status === 'PENDING');

    // Summary stats (use 8h as primary metric)
    const total = done.length;
    const wins8h = done.filter(s => s.result_8h === 'WIN').length;
    const losses8h = done.filter(s => s.result_8h === 'LOSS').length;
    const flats8h = done.filter(s => s.result_8h === 'FLAT').length;
    const winRate8h = total > 0 ? Math.round((wins8h / total) * 100) : 0;
    const avgPips8h = total > 0
      ? Math.round(done.reduce((a, s) => a + (s.pips_8h || 0), 0) / total * 10) / 10
      : 0;
    const avgPips4h = total > 0
      ? Math.round(done.reduce((a, s) => a + (s.pips_4h || 0), 0) / total * 10) / 10
      : 0;
    const avgPips24h = total > 0
      ? Math.round(done.reduce((a, s) => a + (s.pips_24h || 0), 0) / total * 10) / 10
      : 0;
    const avgPips12h = total > 0
      ? Math.round(done.reduce((a, s) => a + (s.pips_12h || 0), 0) / total * 10) / 10
      : 0;

    // Per-pair breakdown
    const pairStats = {};
    for (const s of done) {
      if (!pairStats[s.symbol]) pairStats[s.symbol] = { wins: 0, losses: 0, flats: 0, total: 0, totalPips: 0 };
      const ps = pairStats[s.symbol];
      ps.total++;
      ps.totalPips += s.pips_8h || 0;
      if (s.result_8h === 'WIN') ps.wins++;
      else if (s.result_8h === 'LOSS') ps.losses++;
      else ps.flats++;
    }

    // Per-momentum breakdown
    const momentumStats = {};
    for (const s of done) {
      const m = s.momentum || 'UNKNOWN';
      if (!momentumStats[m]) momentumStats[m] = { wins: 0, losses: 0, flats: 0, total: 0, totalPips: 0 };
      const ms = momentumStats[m];
      ms.total++;
      ms.totalPips += s.pips_8h || 0;
      if (s.result_8h === 'WIN') ms.wins++;
      else if (s.result_8h === 'LOSS') ms.losses++;
      else ms.flats++;
    }

    return res.status(200).json({
      signals: signals.slice(0, 50),
      pending: pending.length,
      summary: {
        total, winRate: winRate8h,
        wins: wins8h, losses: losses8h, flats: flats8h,
        avgPips4h, avgPips8h, avgPips12h, avgPips24h
      },
      pairStats,
      momentumStats
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
