import { supabase } from '../../lib/supabase';

const MIN_SAMPLE = 20;

// Factor names — MUST match what's in ai_memory table
const FACTORS = [
  'strategy_overall', 'gap_level', 'pl_confirmation', 'gap_plus_pl',
  'per_pair', 'flat_rate', 'momentum_state', 'session_performance', 'box_trend'
];

function winRates(wins, losses, flats) {
  const resolved = wins + losses;
  const total = resolved + flats;
  return {
    win_rate_resolved: resolved > 0 ? Math.round((wins / resolved) * 10000) / 100 : null,
    win_rate_total: total > 0 ? Math.round((wins / total) * 10000) / 100 : null,
    wins, losses, flats, resolved, total,
    flat_pct: total > 0 ? Math.round((flats / total) * 10000) / 100 : null
  };
}

function gapBucket(entry_gap) {
  const g = Math.floor(Math.abs(entry_gap));
  return g >= 12 ? '12+' : String(g);
}

function plConfirmed(direction, pl_zone) {
  return (direction === 'BUY' && pl_zone === 'ABOVE') ||
         (direction === 'SELL' && pl_zone === 'BELOW');
}

function boxAligned(direction, trend) {
  if (!trend || trend === 'RANGING' || trend === 'UNKNOWN') return false;
  return (direction === 'BUY' && trend === 'UPTREND') ||
         (direction === 'SELL' && trend === 'DOWNTREND');
}

// --- ANALYSIS FUNCTIONS ---

function analyzeByStrategy(rows) {
  const buckets = {};
  for (const r of rows) {
    const key = r.strategy;
    if (!buckets[key]) buckets[key] = { wins: 0, losses: 0, flats: 0 };
    if (r.outcome === 'WIN') buckets[key].wins++;
    else if (r.outcome === 'LOSS') buckets[key].losses++;
    else if (r.outcome === 'FLAT') buckets[key].flats++;
  }
  const memories = [];
  for (const [strategy, b] of Object.entries(buckets)) {
    const wr = winRates(b.wins, b.losses, b.flats);
    if (wr.total < MIN_SAMPLE) continue;
    memories.push({
      type: 'signal_pattern', factor: 'strategy_overall',
      strategy, win_rate: wr.win_rate_resolved, sample_size: wr.total,
      metadata: { ...wr, description: `Overall ${strategy} strategy performance` }
    });
  }
  return memories;
}

function analyzeGapLevels(rows) {
  const buckets = {};
  for (const r of rows) {
    const key = `${r.strategy}_${gapBucket(r.entry_gap)}`;
    if (!buckets[key]) buckets[key] = { strategy: r.strategy, gap: gapBucket(r.entry_gap), wins: 0, losses: 0, flats: 0 };
    if (r.outcome === 'WIN') buckets[key].wins++;
    else if (r.outcome === 'LOSS') buckets[key].losses++;
    else if (r.outcome === 'FLAT') buckets[key].flats++;
  }
  const memories = [];
  for (const b of Object.values(buckets)) {
    const wr = winRates(b.wins, b.losses, b.flats);
    if (wr.total < MIN_SAMPLE) continue;
    memories.push({
      type: 'signal_pattern', factor: 'gap_level',
      strategy: b.strategy, win_rate: wr.win_rate_resolved, sample_size: wr.total,
      metadata: { gap_level: b.gap, ...wr, description: `${b.strategy} at gap ${b.gap}` }
    });
  }
  return memories;
}

function analyzePLConfirmation(rows) {
  const buckets = {};
  for (const r of rows) {
    const confirmed = plConfirmed(r.direction, r.pl_zone);
    const key = `${r.strategy}_${confirmed ? 'confirmed' : 'unconfirmed'}`;
    if (!buckets[key]) buckets[key] = { strategy: r.strategy, pl: confirmed ? 'confirmed' : 'unconfirmed', wins: 0, losses: 0, flats: 0 };
    if (r.outcome === 'WIN') buckets[key].wins++;
    else if (r.outcome === 'LOSS') buckets[key].losses++;
    else if (r.outcome === 'FLAT') buckets[key].flats++;
  }
  const memories = [];
  for (const b of Object.values(buckets)) {
    const wr = winRates(b.wins, b.losses, b.flats);
    if (wr.total < MIN_SAMPLE) continue;
    memories.push({
      type: 'edge_analysis', factor: 'pl_confirmation',
      strategy: b.strategy, win_rate: wr.win_rate_resolved, sample_size: wr.total,
      metadata: { pl_status: b.pl, ...wr, description: `${b.strategy} with Panda Lines ${b.pl}` }
    });
  }
  return memories;
}

function analyzeGapPlusPL(rows) {
  const buckets = {};
  for (const r of rows) {
    const gap = gapBucket(r.entry_gap);
    const confirmed = plConfirmed(r.direction, r.pl_zone);
    const key = `${r.strategy}_${gap}_${confirmed ? 'confirmed' : 'unconfirmed'}`;
    if (!buckets[key]) buckets[key] = { strategy: r.strategy, gap, pl: confirmed ? 'confirmed' : 'unconfirmed', wins: 0, losses: 0, flats: 0 };
    if (r.outcome === 'WIN') buckets[key].wins++;
    else if (r.outcome === 'LOSS') buckets[key].losses++;
    else if (r.outcome === 'FLAT') buckets[key].flats++;
  }
  const memories = [];
  for (const b of Object.values(buckets)) {
    const wr = winRates(b.wins, b.losses, b.flats);
    if (wr.total < MIN_SAMPLE) continue;
    memories.push({
      type: 'confluence_validation', factor: 'gap_plus_pl',
      strategy: b.strategy, win_rate: wr.win_rate_resolved, sample_size: wr.total,
      metadata: { gap_level: b.gap, pl_status: b.pl, ...wr,
        description: `${b.strategy} gap ${b.gap} + Panda Lines ${b.pl}` }
    });
  }
  return memories;
}

function analyzePairs(rows) {
  const buckets = {};
  for (const r of rows) {
    const key = `${r.strategy}_${r.symbol}`;
    if (!buckets[key]) buckets[key] = { strategy: r.strategy, pair: r.symbol, wins: 0, losses: 0, flats: 0, pips: 0 };
    if (r.outcome === 'WIN') buckets[key].wins++;
    else if (r.outcome === 'LOSS') buckets[key].losses++;
    else if (r.outcome === 'FLAT') buckets[key].flats++;
    buckets[key].pips += r.pips || 0;
  }
  const memories = [];
  for (const b of Object.values(buckets)) {
    const wr = winRates(b.wins, b.losses, b.flats);
    if (wr.total < MIN_SAMPLE) continue;
    memories.push({
      type: 'signal_pattern', factor: 'per_pair',
      pair: b.pair, strategy: b.strategy, win_rate: wr.win_rate_resolved, sample_size: wr.total,
      metadata: { ...wr, total_pips: Math.round(b.pips * 100) / 100,
        avg_pips: Math.round((b.pips / wr.total) * 100) / 100,
        description: `${b.pair} ${b.strategy} performance` }
    });
  }
  return memories;
}

function analyzeFlatRate(rows) {
  const buckets = {};
  for (const r of rows) {
    const gap = gapBucket(r.entry_gap);
    const key = `${r.strategy}_${gap}`;
    if (!buckets[key]) buckets[key] = { strategy: r.strategy, gap, wins: 0, losses: 0, flats: 0 };
    if (r.outcome === 'WIN') buckets[key].wins++;
    else if (r.outcome === 'LOSS') buckets[key].losses++;
    else if (r.outcome === 'FLAT') buckets[key].flats++;
  }
  const memories = [];
  for (const b of Object.values(buckets)) {
    const wr = winRates(b.wins, b.losses, b.flats);
    if (wr.total < MIN_SAMPLE) continue;
    memories.push({
      type: 'signal_pattern', factor: 'flat_rate',
      strategy: b.strategy, win_rate: wr.flat_pct, sample_size: wr.total,
      metadata: { gap_level: b.gap, ...wr,
        description: `${b.strategy} FLAT rate at gap ${b.gap} — signal quality indicator` }
    });
  }
  return memories;
}

function analyzeMomentumState(rows) {
  const buckets = {};
  for (const r of rows) {
    if (!r.momentum) continue;
    const key = `${r.strategy}_${r.momentum}`;
    if (!buckets[key]) buckets[key] = { strategy: r.strategy, momentum: r.momentum, wins: 0, losses: 0, flats: 0, pips: 0 };
    if (r.outcome === 'WIN') buckets[key].wins++;
    else if (r.outcome === 'LOSS') buckets[key].losses++;
    else if (r.outcome === 'FLAT') buckets[key].flats++;
    buckets[key].pips += r.pips || 0;
  }
  const memories = [];
  for (const b of Object.values(buckets)) {
    const wr = winRates(b.wins, b.losses, b.flats);
    if (wr.total < MIN_SAMPLE) continue;
    memories.push({
      type: 'edge_analysis', factor: 'momentum_state',
      strategy: b.strategy, win_rate: wr.win_rate_resolved, sample_size: wr.total,
      metadata: { momentum: b.momentum, ...wr,
        avg_pips: Math.round((b.pips / wr.total) * 100) / 100,
        description: `${b.strategy} win rate by entry momentum state` }
    });
  }
  return memories;
}

function analyzeSession(rows) {
  const buckets = {};
  for (const r of rows) {
    if (!r.session) continue;
    const key = `${r.strategy}_${r.session}`;
    if (!buckets[key]) buckets[key] = { strategy: r.strategy, session: r.session, wins: 0, losses: 0, flats: 0, pips: 0 };
    if (r.outcome === 'WIN') buckets[key].wins++;
    else if (r.outcome === 'LOSS') buckets[key].losses++;
    else if (r.outcome === 'FLAT') buckets[key].flats++;
    buckets[key].pips += r.pips || 0;
  }
  const memories = [];
  for (const b of Object.values(buckets)) {
    const wr = winRates(b.wins, b.losses, b.flats);
    if (wr.total < MIN_SAMPLE) continue;
    memories.push({
      type: 'edge_analysis', factor: 'session_performance',
      strategy: b.strategy, win_rate: wr.win_rate_resolved, sample_size: wr.total,
      metadata: { session: b.session, ...wr,
        total_pips: Math.round(b.pips * 100) / 100,
        avg_pips: Math.round((b.pips / wr.total) * 100) / 100,
        description: `${b.strategy} signals opened in ${b.session} session` }
    });
  }
  return memories;
}

function analyzeBoxTrend(rows) {
  const buckets = {};
  for (const r of rows) {
    if (!r.box_h1_trend) continue;
    const h1Aligned = boxAligned(r.direction, r.box_h1_trend);
    const h4Aligned = r.box_h4_trend ? boxAligned(r.direction, r.box_h4_trend) : false;
    const tag = h1Aligned && h4Aligned ? 'both_aligned' : h1Aligned ? 'h1_only' : h4Aligned ? 'h4_only' : 'none';
    const key = `${r.strategy}_${tag}`;
    if (!buckets[key]) buckets[key] = { strategy: r.strategy, alignment: tag, wins: 0, losses: 0, flats: 0, pips: 0 };
    if (r.outcome === 'WIN') buckets[key].wins++;
    else if (r.outcome === 'LOSS') buckets[key].losses++;
    else if (r.outcome === 'FLAT') buckets[key].flats++;
    buckets[key].pips += r.pips || 0;
  }
  const memories = [];
  for (const b of Object.values(buckets)) {
    const wr = winRates(b.wins, b.losses, b.flats);
    if (wr.total < MIN_SAMPLE) continue;
    memories.push({
      type: 'edge_analysis', factor: 'box_trend',
      strategy: b.strategy, win_rate: wr.win_rate_resolved, sample_size: wr.total,
      metadata: { alignment: b.alignment, ...wr,
        total_pips: Math.round(b.pips * 100) / 100,
        avg_pips: Math.round((b.pips / wr.total) * 100) / 100,
        description: `${b.strategy} with box trend ${b.alignment}` }
    });
  }
  return memories;
}

// --- MAIN HANDLER ---

export default async function handler(req, res) {
  // GET — return existing signal_pattern memories
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('ai_memory')
      .select('*')
      .in('type', ['signal_pattern', 'edge_analysis', 'confluence_validation'])
      .order('computed_at', { ascending: false })
      .limit(200);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ memories: data || [], count: (data || []).length });
  }

  // POST — run full Signal Agent v2 analysis
  if (req.method === 'POST') {
    try {
      // 1. Fetch ALL resolved signal_results (paginated — Supabase caps at 1000/request)
      const SELECT = 'symbol, direction, strategy, entry_gap, peak_gap, outcome, pl_zone, momentum, confidence, duration_min, pips, session, box_h1_trend, box_h4_trend';
      const PAGE = 1000;
      let rows = [];
      let page = 0;
      let fetchErr = null;
      while (true) {
        const { data, error } = await supabase
          .from('signal_results')
          .select(SELECT)
          .not('outcome', 'is', null)
          .order('created_at', { ascending: false })
          .range(page * PAGE, (page + 1) * PAGE - 1);
        if (error) { fetchErr = error; break; }
        if (!data || data.length === 0) break;
        rows = rows.concat(data);
        if (data.length < PAGE) break;
        page++;
      }

      if (fetchErr) return res.status(500).json({ error: fetchErr.message });
      if (rows.length === 0) return res.status(200).json({ message: 'No resolved signals to analyze', memories_written: 0 });

      // 2. Run all analysis functions
      const allMemories = [
        ...analyzeByStrategy(rows),        // Overall strategy stats
        ...analyzeGapLevels(rows),          // Gap level buckets
        ...analyzePLConfirmation(rows),    // Panda Lines confirmed vs not
        ...analyzeGapPlusPL(rows),         // Gap + Panda Lines combined
        ...analyzePairs(rows),              // Per-pair performance
        ...analyzeFlatRate(rows),           // FLAT rate as quality indicator
        ...analyzeMomentumState(rows),     // Win rate by momentum state
        ...analyzeSession(rows),           // Win rate by session
        ...analyzeBoxTrend(rows),          // Win rate by box trend alignment
      ];

      // 3. Log previous run summary before clearing
      const { data: prevMem } = await supabase.from('ai_memory').select('sample_size')
        .in('factor', FACTORS);
      if (prevMem && prevMem.length > 0) {
        const avgS = Math.round(prevMem.reduce((s,m) => s + (m.sample_size || 0), 0) / prevMem.length);
        try { await supabase.from('engine_logs').insert({ timestamp: new Date().toISOString(), component: 'signal_agent_summary', duration: 0, error: JSON.stringify({ memories: prevMem.length, avg_sample: avgS }) }); } catch(_) {}
      }

      // 4. Clear previous signal agent memories (idempotent re-runs)
      await supabase.from('ai_memory').delete().in('factor', FACTORS);

      // 5. Batch insert all memories
      const { data: inserted, error: writeErr } = await supabase.from('ai_memory').insert(allMemories).select('id');
      const written = writeErr ? 0 : (inserted || []).length;
      const errors = writeErr ? [{ error: writeErr.message }] : [];

      // 6. Build summary
      const summary = {
        total_signals_analyzed: rows.length,
        bb_count: rows.filter(r => r.strategy === 'BB').length,
        intra_count: rows.filter(r => r.strategy === 'INTRA').length,
        with_session: rows.filter(r => r.session).length,
        with_box_trend: rows.filter(r => r.box_h1_trend).length,
        memories_written: written,
        memories_attempted: allMemories.length,
        errors: errors.length > 0 ? errors : undefined,
        analysis_types: [
          'strategy_overall — BB and INTRA overall win rates',
          'gap_level — win rate at each gap level (5,6,7,8,9,10+)',
          'pl_confirmation — Panda Lines confirmed vs unconfirmed edge',
          'gap_plus_pl — combined gap level + Panda Lines confirmation',
          'per_pair — per-pair stats (sample >= 20 only)',
          'flat_rate — FLAT % as signal quality indicator',
          'momentum_state — win rate by entry momentum (STABLE, NEUTRAL, etc.)',
          'session_performance — win rate by trading session',
          'box_trend — win rate by H1/H4 box trend alignment'
        ],
        ran_at: new Date().toISOString()
      };

      return res.status(200).json(summary);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
