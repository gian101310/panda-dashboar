import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { symbol, from, to } = req.query;
    let query = supabase
      .from('signal_results')
      .select('*')
      .order('created_at', { ascending: false });

    if (symbol && symbol !== 'ALL') query = query.eq('symbol', symbol);
    if (from) query = query.gte('created_at', new Date(from).toISOString());
    if (to) {
      const toEnd = new Date(to);
      toEnd.setHours(23,59,59,999);
      query = query.lte('created_at', toEnd.toISOString());
    }
    query = query.limit(5000);

    const { data: signals, error } = await query;

    if (error) return res.status(500).json({ error: error.message });
    if (!signals || signals.length === 0)
      return res.status(200).json({
        signals: [], pending: 0,
        summary: { total:0, winRate:0, wins:0, losses:0, flat:0, avgPips:0, avgDuration:0, avgPeakGap:0 },
        byStrategy: {}, byPair: {}, byExitReason: {}
      });

    const done = signals.filter(s => s.status === 'DONE');
    const pending = signals.filter(s => s.status === 'PENDING');
    const wins = done.filter(s => s.outcome === 'WIN');
    const losses = done.filter(s => s.outcome === 'LOSS');

    const avgPips = done.length > 0 ? Math.round(done.reduce((a,s) => a + (s.pips||0), 0) / done.length * 10) / 10 : 0;
    const avgDuration = done.length > 0 ? Math.round(done.reduce((a,s) => a + (s.duration_min||0), 0) / done.length) : 0;
    const avgPeakGap = done.length > 0 ? Math.round(done.reduce((a,s) => a + (s.peak_gap||0), 0) / done.length * 10) / 10 : 0;

    // Per-strategy breakdown
    const byStrategy = {};
    for (const s of done) {
      const st = s.strategy || 'BB';
      if (!byStrategy[st]) byStrategy[st] = { wins:0, losses:0, flat:0, total:0, totalPips:0, avgDuration:0, durSum:0 };
      const b = byStrategy[st];
      b.total++;
      b.totalPips += s.pips || 0;
      b.durSum += s.duration_min || 0;
      if (s.outcome === 'WIN') b.wins++;
      else if (s.outcome === 'LOSS') b.losses++;
      else b.flat++;
    }
    Object.values(byStrategy).forEach(b => { b.avgDuration = b.total > 0 ? Math.round(b.durSum / b.total) : 0; });

    // Per-pair breakdown
    const byPair = {};
    for (const s of done) {
      if (!byPair[s.symbol]) byPair[s.symbol] = { wins:0, losses:0, flat:0, total:0, totalPips:0 };
      const p = byPair[s.symbol];
      p.total++; p.totalPips += s.pips || 0;
      if (s.outcome === 'WIN') p.wins++;
      else if (s.outcome === 'LOSS') p.losses++;
      else p.flat++;
    }

    // By exit reason
    const byExitReason = {};
    for (const s of done) {
      const r = s.exit_reason || 'UNKNOWN';
      if (!byExitReason[r]) byExitReason[r] = { count:0, wins:0, totalPips:0 };
      const e = byExitReason[r];
      e.count++; e.totalPips += s.pips || 0;
      if (s.outcome === 'WIN') e.wins++;
    }

    // Format signals for display
    const formatted = signals.map(s => ({
      symbol: s.symbol, direction: s.direction, strategy: s.strategy,
      entryGap: s.entry_gap, peakGap: s.peak_gap, exitGap: s.exit_gap,
      entryPrice: s.entry_price, exitPrice: s.exit_price, pips: s.pips,
      exitReason: s.exit_reason, outcome: s.outcome, status: s.status,
      durationMin: s.duration_min, bias: s.bias, plZone: s.pl_zone,
      baseScore: s.base_score, quoteScore: s.quote_score,
      snapshotCount: (s.snapshots || []).length,
      timestamp: s.created_at, closedAt: s.closed_at
    }));

    return res.status(200).json({
      summary: {
        total: done.length, pending: pending.length,
        wins: wins.length, losses: losses.length, flat: done.length - wins.length - losses.length,
        winRate: done.length > 0 ? Math.round(wins.length / done.length * 100) : 0,
        avgPips, avgDuration, avgPeakGap
      },
      signals: formatted, byStrategy, byPair, byExitReason
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
