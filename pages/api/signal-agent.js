import { supabase } from '../../lib/supabase';

const MIN_SAMPLE = 20;

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
    if (!buckets[key]) buckets[key] = { strategy: r.strategy, pair: r.symbol, wins: 0, losses: 0, flats: 0 };
    if (r.outcome === 'WIN') buckets[key].wins++;
    else if (r.outcome === 'LOSS') buckets[key].losses++;
    else if (r.outcome === 'FLAT') buckets[key].flats++;
  }
  const memories = [];
  for (const b of Object.values(buckets)) {
    const wr = winRates(b.wins, b.losses, b.flats);
    if (wr.total < MIN_SAMPLE) continue;
    memories.push({
      type: 'signal_pattern', factor: 'pair_performance',
      pair: b.pair, strategy: b.strategy, win_rate: wr.win_rate_resolved, sample_size: wr.total,
      metadata: { ...wr, description: `${b.pair} ${b.strategy} performance` }
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
    if (wr.total < MIN_SAMPLE && wr.flat_pct > 50) continue;
    if (wr.total < MIN_SAMPLE) continue;
    memories.push({
      type: 'edge_analysis', factor: 'flat_rate_by_gap',
      strategy: b.strategy, win_rate: wr.flat_pct, sample_size: wr.total,
      metadata: { gap_level: b.gap, ...wr,
        description: `${b.strategy} FLAT rate at gap ${b.gap} — signal quality indicator` }
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

  // POST — run full Signal Agent v1 analysis
  if (req.method === 'POST') {
    try {
      // 1. Fetch all resolved signal_results
      const { data: rows, error: fetchErr } = await supabase
        .from('signal_results')
        .select('symbol, direction, strategy, entry_gap, peak_gap, outcome, pl_zone, momentum, confidence, duration_min')
        .not('outcome', 'is', null)
        .order('created_at', { ascending: false });

      if (fetchErr) return res.status(500).json({ error: fetchErr.message });
      if (!rows || rows.length === 0) return res.status(200).json({ message: 'No resolved signals to analyze', memories_written: 0 });

      // 2. Run all analysis functions (validation sequence from BUILD_PLAN)
      const allMemories = [
        ...analyzeByStrategy(rows),       // Overall strategy stats
        ...analyzeGapLevels(rows),         // Step 1: gap alone
        ...analyzePLConfirmation(rows),   // Step 2: Panda Lines confirmation effect
        ...analyzeGapPlusPL(rows),        // Step 2b: gap + Panda Lines combined
        ...analyzePairs(rows),             // Per-pair performance
        ...analyzeFlatRate(rows),          // FLAT rate as signal quality
      ];

      // 3. Log previous run summary before clearing
      const { data: prevMem } = await supabase.from('ai_memory').select('sample_size')
        .in('factor', ['strategy_overall','gap_level','pl_confirmation','gap_plus_pl','pair_performance','flat_rate_by_gap']);
      if (prevMem && prevMem.length > 0) {
        const avgS = Math.round(prevMem.reduce((s,m) => s + m.sample_size, 0) / prevMem.length);
        await supabase.from('engine_logs').insert({ timestamp: new Date().toISOString(), component: 'signal_agent_summary', duration: 0, error: JSON.stringify({ memories: prevMem.length, avg_sample: avgS }) });
      }

      // 4. Clear previous signal agent memories (idempotent re-runs)
      await supabase
        .from('ai_memory')
        .delete()
        .in('factor', ['strategy_overall', 'gap_level', 'pl_confirmation', 'gap_plus_pl', 'pair_performance', 'flat_rate_by_gap']);

      // 4. Batch insert all memories in one call
      const { data: inserted, error: writeErr } = await supabase.from('ai_memory').insert(allMemories).select('id');
      const written = writeErr ? 0 : (inserted || []).length;
      const errors = writeErr ? [{ error: writeErr.message }] : [];

      // 5. Build summary
      const summary = {
        total_signals_analyzed: rows.length,
        bb_count: rows.filter(r => r.strategy === 'BB').length,
        intra_count: rows.filter(r => r.strategy === 'INTRA').length,
        memories_written: written,
        memories_attempted: allMemories.length,
        errors: errors.length > 0 ? errors : undefined,
        analysis_types: [
          'strategy_overall — BB and INTRA overall win rates',
          'gap_level — win rate at each gap level (5,6,7,8,9,10+)',
          'pl_confirmation — Panda Lines confirmed vs unconfirmed edge',
          'gap_plus_pl — combined gap level + Panda Lines confirmation',
          'pair_performance — per-pair stats (sample >= 20 only)',
          'flat_rate_by_gap — FLAT % as signal quality indicator'
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
