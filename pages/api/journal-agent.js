import { supabase } from '../../lib/supabase';

const MIN_SAMPLE = 20;

// Factor names — MUST match what gets inserted and deleted
const FACTORS = [
  'overall_performance', 'pair_trading_performance', 'monthly_pnl',
  'session_performance', 'hold_duration_performance', 'direction_performance',
  'strategy_performance', 'gap_entry_performance'
];

function winRate(wins, losses) {
  const total = wins + losses;
  return total > 0 ? Math.round((wins / total) * 10000) / 100 : null;
}

function sessionFromHour(h) {
  if (h >= 0 && h <= 7) return 'ASIAN';
  if (h >= 8 && h <= 12) return 'LONDON';
  if (h >= 13 && h <= 16) return 'OVERLAP';
  if (h >= 17 && h <= 21) return 'NEW_YORK';
  return 'OFF_HOURS';
}

function holdBucket(mins) {
  if (mins == null) return null;
  if (mins < 60) return 'under_1h';
  if (mins < 240) return '1h_to_4h';
  if (mins < 720) return '4h_to_12h';
  if (mins < 1440) return '12h_to_24h';
  if (mins < 4320) return '1d_to_3d';
  return 'over_3d';
}

function gapBucket(gap) {
  if (gap == null) return null;
  const g = Math.floor(Math.abs(gap));
  return g >= 12 ? '12+' : String(g);
}

// --- ANALYSIS FUNCTIONS ---

function analyzeOverall(trades) {
  const wins = trades.filter(t => t.profit_loss_pips > 0).length;
  const losses = trades.filter(t => t.profit_loss_pips < 0).length;
  const totalPips = trades.reduce((s, t) => s + (t.profit_loss_pips || 0), 0);
  const avgPips = Math.round((totalPips / trades.length) * 100) / 100;
  const avgDur = Math.round(trades.reduce((s, t) => s + (t.duration_minutes || 0), 0) / trades.length);
  return [{
    type: 'behavior', factor: 'overall_performance',
    win_rate: winRate(wins, losses), sample_size: trades.length,
    metadata: { wins, losses, total_pips: Math.round(totalPips * 100) / 100,
      avg_pips: avgPips, avg_duration_min: avgDur,
      description: 'Overall trading performance across all pairs' }
  }];
}

function analyzeByPair(trades) {
  const buckets = {};
  for (const t of trades) {
    if (!buckets[t.symbol]) buckets[t.symbol] = { wins: 0, losses: 0, pips: 0, dur: 0, n: 0 };
    const b = buckets[t.symbol];
    if (t.profit_loss_pips > 0) b.wins++; else if (t.profit_loss_pips < 0) b.losses++;
    b.pips += t.profit_loss_pips || 0;
    b.dur += t.duration_minutes || 0;
    b.n++;
  }
  const memories = [];
  for (const [pair, b] of Object.entries(buckets)) {
    if (b.n < MIN_SAMPLE) continue;
    memories.push({
      type: 'behavior', factor: 'pair_trading_performance', pair,
      win_rate: winRate(b.wins, b.losses), sample_size: b.n,
      metadata: { wins: b.wins, losses: b.losses,
        total_pips: Math.round(b.pips * 100) / 100,
        avg_pips: Math.round((b.pips / b.n) * 100) / 100,
        avg_duration_min: Math.round(b.dur / b.n),
        description: `${pair} trading performance` }
    });
  }
  return memories;
}

function analyzeByMonth(trades) {
  const buckets = {};
  for (const t of trades) {
    if (!t.entry_time) continue;
    const m = typeof t.entry_time === 'string' ? t.entry_time.slice(0, 7) : new Date(t.entry_time).toISOString().slice(0, 7);
    if (!buckets[m]) buckets[m] = { wins: 0, losses: 0, pips: 0, n: 0 };
    const b = buckets[m];
    if (t.profit_loss_pips > 0) b.wins++; else if (t.profit_loss_pips < 0) b.losses++;
    b.pips += t.profit_loss_pips || 0;
    b.n++;
  }
  const memories = [];
  const monthlyData = Object.entries(buckets).sort().map(([month, b]) => ({
    month, trades: b.n, wins: b.wins, losses: b.losses,
    win_rate: winRate(b.wins, b.losses),
    total_pips: Math.round(b.pips * 100) / 100
  }));
  if (monthlyData.length >= 2) {
    const bestMonth = monthlyData.reduce((a, b) => b.total_pips > a.total_pips ? b : a);
    const worstMonth = monthlyData.reduce((a, b) => b.total_pips < a.total_pips ? b : a);
    memories.push({
      type: 'behavior', factor: 'monthly_pnl',
      win_rate: null, sample_size: trades.length,
      metadata: { months: monthlyData, best_month: bestMonth.month,
        best_month_pips: bestMonth.total_pips, worst_month: worstMonth.month,
        worst_month_pips: worstMonth.total_pips,
        description: 'Monthly P&L breakdown' }
    });
  }
  return memories;
}

function analyzeBySession(trades) {
  const buckets = {};
  for (const t of trades) {
    if (!t.entry_time) continue;
    const h = new Date(t.entry_time).getUTCHours();
    const sess = sessionFromHour(h);
    if (!buckets[sess]) buckets[sess] = { wins: 0, losses: 0, pips: 0, n: 0 };
    const b = buckets[sess];
    if (t.profit_loss_pips > 0) b.wins++; else if (t.profit_loss_pips < 0) b.losses++;
    b.pips += t.profit_loss_pips || 0;
    b.n++;
  }
  const memories = [];
  for (const [sess, b] of Object.entries(buckets)) {
    if (b.n < MIN_SAMPLE) continue;
    memories.push({
      type: 'behavior', factor: 'session_performance',
      win_rate: winRate(b.wins, b.losses), sample_size: b.n,
      metadata: { session: sess, wins: b.wins, losses: b.losses,
        total_pips: Math.round(b.pips * 100) / 100,
        avg_pips: Math.round((b.pips / b.n) * 100) / 100,
        description: `${sess} session trading performance` }
    });
  }
  return memories;
}

function analyzeByHoldDuration(trades) {
  const buckets = {};
  for (const t of trades) {
    const bk = holdBucket(t.duration_minutes);
    if (!bk) continue;
    if (!buckets[bk]) buckets[bk] = { wins: 0, losses: 0, pips: 0, n: 0 };
    const b = buckets[bk];
    if (t.profit_loss_pips > 0) b.wins++; else if (t.profit_loss_pips < 0) b.losses++;
    b.pips += t.profit_loss_pips || 0;
    b.n++;
  }
  const memories = [];
  for (const [bk, b] of Object.entries(buckets)) {
    if (b.n < MIN_SAMPLE) continue;
    memories.push({
      type: 'behavior', factor: 'hold_duration_performance',
      win_rate: winRate(b.wins, b.losses), sample_size: b.n,
      metadata: { hold_bucket: bk, wins: b.wins, losses: b.losses,
        total_pips: Math.round(b.pips * 100) / 100,
        avg_pips: Math.round((b.pips / b.n) * 100) / 100,
        description: `Performance for ${bk} hold duration` }
    });
  }
  return memories;
}

function analyzeByDirection(trades) {
  const buckets = {};
  for (const t of trades) {
    const dir = t.direction || 'UNKNOWN';
    if (!buckets[dir]) buckets[dir] = { wins: 0, losses: 0, pips: 0, n: 0 };
    const b = buckets[dir];
    if (t.profit_loss_pips > 0) b.wins++; else if (t.profit_loss_pips < 0) b.losses++;
    b.pips += t.profit_loss_pips || 0;
    b.n++;
  }
  const memories = [];
  for (const [dir, b] of Object.entries(buckets)) {
    if (b.n < MIN_SAMPLE) continue;
    memories.push({
      type: 'behavior', factor: 'direction_performance',
      win_rate: winRate(b.wins, b.losses), sample_size: b.n,
      metadata: { direction: dir, wins: b.wins, losses: b.losses,
        total_pips: Math.round(b.pips * 100) / 100,
        avg_pips: Math.round((b.pips / b.n) * 100) / 100,
        description: `${dir} direction performance` }
    });
  }
  return memories;
}

function analyzeByStrategy(trades) {
  const buckets = {};
  for (const t of trades) {
    const strat = t.strategy_name || 'UNKNOWN';
    if (!buckets[strat]) buckets[strat] = { wins: 0, losses: 0, pips: 0, n: 0 };
    const b = buckets[strat];
    if (t.profit_loss_pips > 0) b.wins++; else if (t.profit_loss_pips < 0) b.losses++;
    b.pips += t.profit_loss_pips || 0;
    b.n++;
  }
  const memories = [];
  for (const [strat, b] of Object.entries(buckets)) {
    if (b.n < MIN_SAMPLE) continue;
    memories.push({
      type: 'behavior', factor: 'strategy_performance',
      strategy: strat, win_rate: winRate(b.wins, b.losses), sample_size: b.n,
      metadata: { wins: b.wins, losses: b.losses,
        total_pips: Math.round(b.pips * 100) / 100,
        avg_pips: Math.round((b.pips / b.n) * 100) / 100,
        description: `${strat} strategy trading performance` }
    });
  }
  return memories;
}

function analyzeByGapAtEntry(trades) {
  const buckets = {};
  for (const t of trades) {
    const gb = gapBucket(t.gap_at_entry);
    if (!gb) continue;
    const key = gb;
    if (!buckets[key]) buckets[key] = { gap: gb, wins: 0, losses: 0, pips: 0, n: 0 };
    const b = buckets[key];
    if (t.profit_loss_pips > 0) b.wins++; else if (t.profit_loss_pips < 0) b.losses++;
    b.pips += t.profit_loss_pips || 0;
    b.n++;
  }
  const memories = [];
  for (const b of Object.values(buckets)) {
    if (b.n < MIN_SAMPLE) continue;
    memories.push({
      type: 'behavior', factor: 'gap_entry_performance',
      win_rate: winRate(b.wins, b.losses), sample_size: b.n,
      metadata: { gap_level: b.gap, wins: b.wins, losses: b.losses,
        total_pips: Math.round(b.pips * 100) / 100,
        avg_pips: Math.round((b.pips / b.n) * 100) / 100,
        description: `Trading performance when entry gap was ${b.gap}` }
    });
  }
  return memories;
}

// --- MAIN HANDLER ---

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('ai_memory').select('*')
      .eq('type', 'behavior')
      .order('computed_at', { ascending: false }).limit(200);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ memories: data || [], count: (data || []).length });
  }

  if (req.method === 'POST') {
    try {
      const { data: trades, error: fetchErr } = await supabase
        .from('manual_trades')
        .select('symbol, direction, profit_loss_pips, entry_time, exit_time, duration_minutes, strategy_name, gap_at_entry, momentum_at_entry')
        .not('exit_time', 'is', null)
        .order('entry_time', { ascending: false });

      if (fetchErr) return res.status(500).json({ error: fetchErr.message });
      if (!trades || trades.length === 0) return res.status(200).json({ message: 'No closed trades to analyze', memories_written: 0 });

      const allMemories = [
        ...analyzeOverall(trades),
        ...analyzeByPair(trades),
        ...analyzeByMonth(trades),
        ...analyzeBySession(trades),
        ...analyzeByHoldDuration(trades),
        ...analyzeByDirection(trades),
        ...analyzeByStrategy(trades),
        ...analyzeByGapAtEntry(trades),
      ];

      // Log previous run summary
      const { data: prevMem } = await supabase.from('ai_memory').select('sample_size')
        .in('factor', FACTORS);
      if (prevMem && prevMem.length > 0) {
        const avgS = Math.round(prevMem.reduce((s,m) => s + (m.sample_size || 0), 0) / prevMem.length);
        await supabase.from('engine_logs').insert({ timestamp: new Date().toISOString(), component: 'journal_agent_summary', duration: 0, error: JSON.stringify({ memories: prevMem.length, avg_sample: avgS }) }).catch(() => {});
      }

      // Clear previous journal agent memories
      await supabase.from('ai_memory').delete().in('factor', FACTORS);

      // Batch insert
      const { data: inserted, error: writeErr } = await supabase.from('ai_memory').insert(allMemories).select('id');
      const written = writeErr ? 0 : (inserted || []).length;

      return res.status(200).json({
        total_trades_analyzed: trades.length,
        memories_written: written,
        memories_attempted: allMemories.length,
        errors: writeErr ? [{ error: writeErr.message }] : undefined,
        analysis_types: [
          'overall_performance — win rate, avg pips, avg hold',
          'pair_trading_performance — per-pair stats (sample >= 20)',
          'monthly_pnl — P&L by month with best/worst',
          'session_performance — ASIAN/LONDON/OVERLAP/NY',
          'hold_duration_performance — by hold time bucket',
          'direction_performance — BUY vs SELL',
          'strategy_performance — by strategy name (BB/INTRA)',
          'gap_entry_performance — by gap score at trade entry'
        ],
        ran_at: new Date().toISOString()
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
