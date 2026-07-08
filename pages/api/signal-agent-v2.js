// Signal Agent v2 — PHASE 8: lifecycle analysis on signal_tracker data
// Answers the 6 Phase 8 questions from AI_BUILD_PLAN_UPDATED.md using tracker
// rows (gap-based, NO cTrader dependency — price_confirmed=0 across the table).
// Writes findings to ai_memory (factors prefixed v2_) for Master Agent injection.
import { supabase } from '../../lib/supabase';
import { requireAdmin } from '../../lib/auth';

const MIN_SAMPLE = 20;

// Factor names owned by this agent — cleared + rewritten on every run
const V2_FACTORS = [
  'v2_gap_sustain', 'v2_close_reason', 'v2_pdr_longevity',
  'v2_session_longevity', 'v2_box_longevity', 'v2_survivors', 'v2_churn',
  'v2_velocity_note'
];

function hoursBetween(a, b) {
  if (!a || !b) return null;
  const h = (new Date(b) - new Date(a)) / 3600000;
  return h >= 0 ? h : null;
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function r1(v) { return v == null ? null : Math.round(v * 10) / 10; }
function r2(v) { return v == null ? null : Math.round(v * 100) / 100; }

function gapBucket(gap) {
  const g = Math.floor(Math.abs(gap ?? 0));
  return g >= 12 ? '12+' : String(g);
}

function boxAligned(direction, trend) {
  if (!trend || trend === 'RANGING' || trend === 'UNKNOWN') return false;
  return (direction === 'BUY' && trend === 'UPTREND') ||
         (direction === 'SELL' && trend === 'DOWNTREND');
}

// Shared bucket stats: lifetime distribution + gap gain + survival rates
function bucketStats(rows) {
  const hrs = rows.map(r => r._hrs).filter(h => h != null);
  const gains = rows.map(r => (r.peak_gap ?? 0) - Math.abs(r.gap_at_open ?? 0)).filter(g => !isNaN(g));
  return {
    n: rows.length,
    avg_hours: r1(hrs.reduce((s, h) => s + h, 0) / (hrs.length || 1)),
    median_hours: r2(median(hrs)),
    pct_survive_1h: r1(100 * hrs.filter(h => h >= 1).length / (hrs.length || 1)),
    pct_survive_6h: r1(100 * hrs.filter(h => h >= 6).length / (hrs.length || 1)),
    avg_gap_gain: r2(gains.reduce((s, g) => s + g, 0) / (gains.length || 1)),
  };
}

function groupBy(rows, keyFn) {
  const out = {};
  for (const r of rows) {
    const k = keyFn(r);
    if (k == null) continue;
    (out[k] = out[k] || []).push(r);
  }
  return out;
}

// --- ANALYSIS FUNCTIONS (Phase 8 questions) ---

// Q1: How long do signals at each gap level sustain?
function analyzeGapSustain(rows) {
  const memories = [];
  const groups = groupBy(rows, r => `${r.strategy}|${gapBucket(r.gap_at_open)}`);
  for (const [key, g] of Object.entries(groups)) {
    const [strategy, gap] = key.split('|');
    const st = bucketStats(g);
    if (st.n < MIN_SAMPLE) continue;
    memories.push({
      type: 'tracker_lifecycle', factor: 'v2_gap_sustain', strategy,
      win_rate: st.pct_survive_6h, sample_size: st.n,
      metadata: { gap_level: gap, ...st,
        description: `${strategy} tracker lifespan at gap ${gap} — win_rate field = % surviving 6h` }
    });
  }
  return memories;
}

// Q2: What kills signals most often? (close_reason distribution)
function analyzeCloseReason(rows) {
  const memories = [];
  const byStrat = groupBy(rows, r => r.strategy);
  for (const [strategy, sRows] of Object.entries(byStrat)) {
    const groups = groupBy(sRows, r => r.close_reason || 'UNKNOWN');
    for (const [reason, g] of Object.entries(groups)) {
      const st = bucketStats(g);
      if (st.n < MIN_SAMPLE) continue;
      memories.push({
        type: 'tracker_lifecycle', factor: 'v2_close_reason', strategy,
        win_rate: r1(100 * st.n / sRows.length), sample_size: st.n,
        metadata: { close_reason: reason, share_pct: r1(100 * st.n / sRows.length), ...st,
          description: `${strategy} closed by ${reason} — win_rate field = share of all closes` }
      });
    }
  }
  return memories;
}

// Q3: Does PDR strong correlate with signal longevity?
function analyzePdrLongevity(rows) {
  const memories = [];
  const groups = groupBy(rows, r => `${r.strategy}|${r.pdr_strong_at_open ? 'PDR_STRONG' : 'PDR_WEAK'}`);
  for (const [key, g] of Object.entries(groups)) {
    const [strategy, pdr] = key.split('|');
    const st = bucketStats(g);
    if (st.n < MIN_SAMPLE) continue;
    memories.push({
      type: 'tracker_lifecycle', factor: 'v2_pdr_longevity', strategy,
      win_rate: st.pct_survive_6h, sample_size: st.n,
      metadata: { pdr_status: pdr, ...st,
        description: `${strategy} lifespan with ${pdr} at open` }
    });
  }
  return memories;
}

// Q4: Does session correlate with signal quality?
function analyzeSessionLongevity(rows) {
  const memories = [];
  const groups = groupBy(rows, r => r.session_at_open ? `${r.strategy}|${r.session_at_open}` : null);
  for (const [key, g] of Object.entries(groups)) {
    const [strategy, session] = key.split('|');
    const st = bucketStats(g);
    if (st.n < MIN_SAMPLE) continue;
    memories.push({
      type: 'tracker_lifecycle', factor: 'v2_session_longevity', strategy,
      win_rate: st.pct_survive_6h, sample_size: st.n,
      metadata: { session, ...st,
        description: `${strategy} tracker lifespan opened in ${session}` }
    });
  }
  return memories;
}

// Q5: Does box alignment at open correlate with outcome?
function analyzeBoxLongevity(rows) {
  const memories = [];
  const groups = groupBy(rows, r => {
    const h1 = boxAligned(r.direction, r.box_h1_at_open);
    const h4 = boxAligned(r.direction, r.box_h4_at_open);
    const tag = h1 && h4 ? 'both_aligned' : h1 ? 'h1_only' : h4 ? 'h4_only' : 'none';
    return `${r.strategy}|${tag}`;
  });
  for (const [key, g] of Object.entries(groups)) {
    const [strategy, alignment] = key.split('|');
    const st = bucketStats(g);
    if (st.n < MIN_SAMPLE) continue;
    memories.push({
      type: 'tracker_lifecycle', factor: 'v2_box_longevity', strategy,
      win_rate: st.pct_survive_6h, sample_size: st.n,
      metadata: { alignment, ...st,
        description: `${strategy} tracker lifespan with box ${alignment} at open` }
    });
  }
  return memories;
}

// Survivors: profile the durable-signal subset (>=6h) — the tradeable population
function analyzeSurvivors(rows) {
  const memories = [];
  const byStrat = groupBy(rows, r => r.strategy);
  for (const [strategy, sRows] of Object.entries(byStrat)) {
    const survivors = sRows.filter(r => r._hrs != null && r._hrs >= 6);
    if (survivors.length < MIN_SAMPLE) continue;
    const pairCounts = {};
    for (const r of survivors) pairCounts[r.symbol] = (pairCounts[r.symbol] || 0) + 1;
    const topPairs = Object.entries(pairCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([sym, n]) => `${sym}(${n})`);
    const reasonCounts = {};
    for (const r of survivors) reasonCounts[r.close_reason || 'UNKNOWN'] = (reasonCounts[r.close_reason || 'UNKNOWN'] || 0) + 1;
    const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0];
    const st = bucketStats(survivors);
    memories.push({
      type: 'tracker_lifecycle', factor: 'v2_survivors', strategy,
      win_rate: r1(100 * survivors.length / sRows.length), sample_size: survivors.length,
      metadata: { ...st, share_of_all_pct: r1(100 * survivors.length / sRows.length),
        top_pairs: topPairs, dominant_close_reason: topReason ? topReason[0] : null,
        description: `${strategy} 6h+ survivors — the durable-signal subset; win_rate field = % of all trackers` }
    });
  }
  return memories;
}

// Churn: re-opening flicker per symbol per day — tracker noise metric
function analyzeChurn(rows) {
  const memories = [];
  const byStrat = groupBy(rows, r => r.strategy);
  for (const [strategy, sRows] of Object.entries(byStrat)) {
    if (sRows.length < MIN_SAMPLE) continue;
    const dayCounts = {};
    for (const r of sRows) {
      const day = (r.opened_at || '').slice(0, 10);
      const k = `${r.symbol}|${day}`;
      dayCounts[k] = (dayCounts[k] || 0) + 1;
    }
    const counts = Object.values(dayCounts);
    const avgPerSymbolDay = counts.reduce((s, c) => s + c, 0) / (counts.length || 1);
    const maxPerSymbolDay = Math.max(...counts, 0);
    const st = bucketStats(sRows);
    memories.push({
      type: 'tracker_lifecycle', factor: 'v2_churn', strategy,
      win_rate: null, sample_size: sRows.length,
      metadata: { avg_openings_per_symbol_day: r1(avgPerSymbolDay),
        max_openings_per_symbol_day: maxPerSymbolDay,
        median_lifetime_hours: st.median_hours,
        description: `${strategy} tracker churn — re-openings of the same symbol per day; high values = PL-zone flicker, most rows are noise not fresh signals` }
    });
  }
  return memories;
}

// Q6: gap velocity at open — honest data-limitation note
function velocityNote(rows) {
  return [{
    type: 'tracker_lifecycle', factor: 'v2_velocity_note', strategy: null,
    win_rate: null, sample_size: rows.length,
    metadata: {
      measurable: false,
      description: 'Gap velocity at open is NOT measurable from current data: pre-open gap_delta lived in signal_snapshots (purged) and hourly_gaps capture is too coarse (1h) versus median BB lifetime (~5 min). Needs snapshot-level delta stored on signal_tracker at open before this question can be answered.'
    }
  }];
}

// --- MAIN HANDLER ---

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Admin only' });

  // GET — return existing v2 memories
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('ai_memory')
      .select('*')
      .eq('type', 'tracker_lifecycle')
      .order('computed_at', { ascending: false })
      .limit(200);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ memories: data || [], count: (data || []).length });
  }

  // POST — run full Phase 8 analysis
  if (req.method === 'POST') {
    try {
      // 1. Fetch ALL closed trackers (paginated; hourly/price jsonb excluded — heavy + unused)
      const SELECT = 'symbol, direction, strategy, gap_at_open, peak_gap, opened_at, closed_at, close_reason, session_at_open, pdr_strong_at_open, box_h1_at_open, box_h4_at_open';
      const PAGE = 1000;
      let rows = [];
      let page = 0;
      let fetchErr = null;
      while (true) {
        const { data, error } = await supabase
          .from('signal_tracker')
          .select(SELECT)
          .eq('status', 'CLOSED')
          .not('closed_at', 'is', null)
          .order('opened_at', { ascending: false })
          .range(page * PAGE, (page + 1) * PAGE - 1);
        if (error) { fetchErr = error; break; }
        if (!data || data.length === 0) break;
        rows = rows.concat(data);
        if (data.length < PAGE) break;
        page++;
      }
      if (fetchErr) return res.status(500).json({ error: fetchErr.message });
      if (rows.length === 0) return res.status(200).json({ message: 'No closed trackers to analyze', memories_written: 0 });

      // Precompute lifetime hours once
      for (const r of rows) r._hrs = hoursBetween(r.opened_at, r.closed_at);

      // 2. Run all Phase 8 analyses
      const allMemories = [
        ...analyzeGapSustain(rows),       // Q1 lifespan by gap level
        ...analyzeCloseReason(rows),      // Q2 what kills signals
        ...analyzePdrLongevity(rows),     // Q3 PDR vs longevity
        ...analyzeSessionLongevity(rows), // Q4 session vs quality
        ...analyzeBoxLongevity(rows),     // Q5 box alignment vs outcome
        ...analyzeSurvivors(rows),        // durable-signal profile
        ...analyzeChurn(rows),            // flicker/noise metric
        ...velocityNote(rows),            // Q6 data-limitation note
      ];

      // 3. Log previous run summary before clearing
      const { data: prevMem } = await supabase.from('ai_memory').select('sample_size').in('factor', V2_FACTORS);
      if (prevMem && prevMem.length > 0) {
        try {
          await supabase.from('engine_logs').insert({
            timestamp: new Date().toISOString(), component: 'signal_agent_v2_summary',
            duration: 0, error: JSON.stringify({ memories: prevMem.length })
          });
        } catch (_) {}
      }

      // 4. Clear previous v2 memories (idempotent re-runs)
      await supabase.from('ai_memory').delete().in('factor', V2_FACTORS);

      // 5. Batch insert
      const { data: inserted, error: writeErr } = await supabase.from('ai_memory').insert(allMemories).select('id');
      const written = writeErr ? 0 : (inserted || []).length;

      // 6. Summary
      return res.status(200).json({
        total_trackers_analyzed: rows.length,
        bb_count: rows.filter(r => r.strategy === 'BB').length,
        intra_count: rows.filter(r => r.strategy === 'INTRA').length,
        memories_written: written,
        memories_attempted: allMemories.length,
        errors: writeErr ? [{ error: writeErr.message }] : undefined,
        analysis_types: [
          'v2_gap_sustain — tracker lifespan per gap level (Q1)',
          'v2_close_reason — what kills signals, share + avg lifetime (Q2)',
          'v2_pdr_longevity — PDR strong vs weak lifespan (Q3)',
          'v2_session_longevity — lifespan by opening session (Q4)',
          'v2_box_longevity — lifespan by H1/H4 box alignment (Q5)',
          'v2_survivors — profile of 6h+ durable signals',
          'v2_churn — same-symbol same-day re-opening flicker metric',
          'v2_velocity_note — Q6 not measurable, documented why'
        ],
        ran_at: new Date().toISOString()
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
