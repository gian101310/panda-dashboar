import { supabase } from '../../lib/supabase';

// Pattern Agent v2 — cross-references Signal Agent vs Journal Agent findings
// Finds: alpha pairs, leak pairs, missed edge, behavioral blind spots,
//        momentum-bias alignment, box trend validation, signal quality tiers

// Factor names owned by this agent
const FACTORS = [
  'alpha_pair', 'leak_pair', 'overtraded_weak', 'session_edge',
  'hold_duration_edge', 'edge_gap', 'pl_discipline',
  'momentum_bias_alignment', 'box_trend_validation', 'signal_quality_tier'
];

async function fetchAllMemories() {
  const { data } = await supabase.from('ai_memory').select('*').order('computed_at', { ascending: false }).limit(200);
  return data || [];
}

async function fetchAllSignals() {
  const SELECT = 'symbol, direction, outcome, entry_gap, pl_zone, strategy, momentum, pips, session, box_h1_trend, box_h4_trend';
  const PAGE = 1000;
  let all = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('signal_results').select(SELECT)
      .not('outcome', 'is', null)
      .order('created_at', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) return { data: all, error };
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    page++;
  }
  return { data: all, error: null };
}

async function fetchRawCrossData() {
  const { data: signals, error: sigErr } = await fetchAllSignals();

  const { data: trades, error: tradeErr } = await supabase
    .from('manual_trades')
    .select('symbol, direction, profit_loss_pips, duration_minutes, entry_time')
    .not('exit_time', 'is', null)
    .order('entry_time', { ascending: false });

  return {
    signals: signals || [],
    trades: trades || [],
    sigErr: sigErr?.message || null,
    tradeErr: tradeErr?.message || null
  };
}

function buildPairStats(signals, trades) {
  const sigMap = {};
  for (const s of signals) {
    if (!sigMap[s.symbol]) sigMap[s.symbol] = { wins: 0, losses: 0, flats: 0, pips: 0 };
    if (s.outcome === 'WIN') sigMap[s.symbol].wins++;
    else if (s.outcome === 'LOSS') sigMap[s.symbol].losses++;
    else if (s.outcome === 'FLAT') sigMap[s.symbol].flats++;
    sigMap[s.symbol].pips += s.pips || 0;
  }

  const tradeMap = {};
  for (const t of trades) {
    if (!tradeMap[t.symbol]) tradeMap[t.symbol] = { wins: 0, losses: 0, pips: 0, n: 0 };
    const b = tradeMap[t.symbol];
    if (t.profit_loss_pips > 0) b.wins++; else if (t.profit_loss_pips < 0) b.losses++;
    b.pips += t.profit_loss_pips || 0;
    b.n++;
  }
  return { sigMap, tradeMap };
}

function findAlphaAndLeakPairs(sigMap, tradeMap) {
  const memories = [];
  const allPairs = new Set([...Object.keys(sigMap), ...Object.keys(tradeMap)]);

  for (const pair of allPairs) {
    const sig = sigMap[pair];
    const trade = tradeMap[pair];

    // Signal-only analysis (no trades needed)
    if (sig) {
      const sigTotal = sig.wins + sig.losses + sig.flats;
      const sigResolved = sig.wins + sig.losses;
      const sigWR = sigResolved > 0 ? Math.round((sig.wins / sigResolved) * 100) : null;

      // If we have trade data, do cross-reference
      if (trade && trade.n >= 10) {
        const tradeWR = (trade.wins + trade.losses) > 0 ? Math.round((trade.wins / (trade.wins + trade.losses)) * 100) : null;

        if (trade.pips > 50 && sigWR !== null && sigWR >= 70) {
          memories.push({
            type: 'market_theme', factor: 'alpha_pair', pair, strategy: 'BB',
            win_rate: tradeWR, sample_size: trade.n,
            metadata: { trade_pips: Math.round(trade.pips * 100) / 100,
              trade_wins: trade.wins, trade_losses: trade.losses,
              signal_win_rate: sigWR, signal_count: sigTotal,
              description: `${pair} — alpha pair: profitable trading + strong signal edge` }
          });
        }

        if (trade.pips < -50 && sigWR !== null && sigWR >= 60) {
          memories.push({
            type: 'market_theme', factor: 'leak_pair', pair, strategy: 'BB',
            win_rate: tradeWR, sample_size: trade.n,
            metadata: { trade_pips: Math.round(trade.pips * 100) / 100,
              trade_wins: trade.wins, trade_losses: trade.losses,
              signal_win_rate: sigWR, signal_count: sigTotal,
              description: `${pair} — leak pair: losing money despite signal edge of ${sigWR}%` }
          });
        }

        if (trade.n >= 15 && trade.pips < 0 && sigWR !== null && sigWR < 55) {
          memories.push({
            type: 'market_theme', factor: 'overtraded_weak', pair, strategy: 'BB',
            win_rate: tradeWR, sample_size: trade.n,
            metadata: { trade_pips: Math.round(trade.pips * 100) / 100,
              signal_win_rate: sigWR, signal_count: sigTotal,
              description: `${pair} — overtraded weak setup: ${trade.n} trades, negative P&L, weak signal edge` }
          });
        }
      }
    }
  }
  return memories;
}

function findSignalQualityTiers(signals) {
  // Group pairs by signal performance tier
  const pairStats = {};
  for (const s of signals) {
    if (!pairStats[s.symbol]) pairStats[s.symbol] = { wins: 0, losses: 0, flats: 0, pips: 0 };
    if (s.outcome === 'WIN') pairStats[s.symbol].wins++;
    else if (s.outcome === 'LOSS') pairStats[s.symbol].losses++;
    else if (s.outcome === 'FLAT') pairStats[s.symbol].flats++;
    pairStats[s.symbol].pips += s.pips || 0;
  }

  const tiers = { A: [], B: [], C: [] };
  for (const [pair, st] of Object.entries(pairStats)) {
    const resolved = st.wins + st.losses;
    if (resolved < 20) continue;
    const wr = Math.round((st.wins / resolved) * 100);
    if (wr >= 70 && st.pips > 0) tiers.A.push({ pair, wr, pips: Math.round(st.pips), n: resolved });
    else if (wr >= 55 && st.pips >= 0) tiers.B.push({ pair, wr, pips: Math.round(st.pips), n: resolved });
    else tiers.C.push({ pair, wr, pips: Math.round(st.pips), n: resolved });
  }

  const memories = [];
  if (tiers.A.length > 0 || tiers.B.length > 0 || tiers.C.length > 0) {
    memories.push({
      type: 'market_theme', factor: 'signal_quality_tier',
      win_rate: null, sample_size: signals.length,
      metadata: {
        tier_A: tiers.A.sort((a, b) => b.pips - a.pips),
        tier_B: tiers.B.sort((a, b) => b.pips - a.pips),
        tier_C: tiers.C.sort((a, b) => b.pips - a.pips),
        description: `Signal quality tiers: A(${tiers.A.length} pairs, WR>=70%), B(${tiers.B.length} pairs, WR>=55%), C(${tiers.C.length} pairs, underperformers)`
      }
    });
  }
  return memories;
}

function findMomentumBiasAlignment(signals) {
  // Cross-reference: when momentum aligns with direction, how do signals perform?
  const BULLISH = ['STRONG_BULL', 'TRENDING_BULL', 'FRESH_BULL'];
  const BEARISH = ['STRONG_BEAR', 'TRENDING_BEAR', 'FRESH_BEAR'];

  let alignedWins = 0, alignedLosses = 0, alignedFlats = 0, alignedPips = 0;
  let misalignedWins = 0, misalignedLosses = 0, misalignedFlats = 0, misalignedPips = 0;

  for (const s of signals) {
    if (!s.momentum) continue;
    const bullMom = BULLISH.includes(s.momentum);
    const bearMom = BEARISH.includes(s.momentum);
    const aligned = (s.direction === 'BUY' && bullMom) || (s.direction === 'SELL' && bearMom);
    const misaligned = (s.direction === 'BUY' && bearMom) || (s.direction === 'SELL' && bullMom);

    if (aligned) {
      if (s.outcome === 'WIN') alignedWins++;
      else if (s.outcome === 'LOSS') alignedLosses++;
      else alignedFlats++;
      alignedPips += s.pips || 0;
    } else if (misaligned) {
      if (s.outcome === 'WIN') misalignedWins++;
      else if (s.outcome === 'LOSS') misalignedLosses++;
      else misalignedFlats++;
      misalignedPips += s.pips || 0;
    }
  }

  const alignedTotal = alignedWins + alignedLosses + alignedFlats;
  const misalignedTotal = misalignedWins + misalignedLosses + misalignedFlats;
  const memories = [];

  if (alignedTotal >= 20 && misalignedTotal >= 20) {
    const alignedWR = Math.round((alignedWins / (alignedWins + alignedLosses)) * 100);
    const misalignedWR = Math.round((misalignedWins / (misalignedWins + misalignedLosses)) * 100);
    memories.push({
      type: 'market_theme', factor: 'momentum_bias_alignment',
      win_rate: alignedWR, sample_size: alignedTotal + misalignedTotal,
      metadata: {
        aligned_win_rate: alignedWR, aligned_sample: alignedTotal,
        aligned_pips: Math.round(alignedPips),
        misaligned_win_rate: misalignedWR, misaligned_sample: misalignedTotal,
        misaligned_pips: Math.round(misalignedPips),
        edge_diff: alignedWR - misalignedWR,
        description: `Momentum-bias alignment: aligned signals win ${alignedWR}% vs misaligned ${misalignedWR}% — ${alignedWR - misalignedWR} point edge`
      }
    });
  }
  return memories;
}

function findBoxTrendValidation(signals) {
  // When BOTH H1+H4 box trends align with direction vs when neither aligns
  let bothWins = 0, bothLosses = 0, bothFlats = 0, bothPips = 0;
  let noneWins = 0, noneLosses = 0, noneFlats = 0, nonePips = 0;

  for (const s of signals) {
    if (!s.box_h1_trend || !s.box_h4_trend) continue;
    const h1Aligned = (s.direction === 'BUY' && s.box_h1_trend === 'UPTREND') || (s.direction === 'SELL' && s.box_h1_trend === 'DOWNTREND');
    const h4Aligned = (s.direction === 'BUY' && s.box_h4_trend === 'UPTREND') || (s.direction === 'SELL' && s.box_h4_trend === 'DOWNTREND');

    if (h1Aligned && h4Aligned) {
      if (s.outcome === 'WIN') bothWins++; else if (s.outcome === 'LOSS') bothLosses++; else bothFlats++;
      bothPips += s.pips || 0;
    } else if (!h1Aligned && !h4Aligned) {
      if (s.outcome === 'WIN') noneWins++; else if (s.outcome === 'LOSS') noneLosses++; else noneFlats++;
      nonePips += s.pips || 0;
    }
  }

  const bothTotal = bothWins + bothLosses + bothFlats;
  const noneTotal = noneWins + noneLosses + noneFlats;
  const memories = [];

  if (bothTotal >= 15 && noneTotal >= 15) {
    const bothWR = Math.round((bothWins / (bothWins + bothLosses)) * 100);
    const noneWR = Math.round((noneWins / (noneWins + noneLosses)) * 100);
    memories.push({
      type: 'market_theme', factor: 'box_trend_validation',
      win_rate: bothWR, sample_size: bothTotal + noneTotal,
      metadata: {
        both_aligned_wr: bothWR, both_aligned_sample: bothTotal,
        both_aligned_pips: Math.round(bothPips),
        none_aligned_wr: noneWR, none_aligned_sample: noneTotal,
        none_aligned_pips: Math.round(nonePips),
        description: `Box trend validation: both H1+H4 aligned wins ${bothWR}% vs neither aligned ${noneWR}% — ${bothWR - noneWR} point edge`
      }
    });
  }
  return memories;
}

function findBehavioralInsights(memories) {
  const insights = [];

  // Find session data (from journal agent — type: behavior)
  const sessions = memories.filter(m => m.factor === 'session_performance' && m.type === 'behavior');
  if (sessions.length >= 2) {
    const bestSession = sessions.reduce((a, b) => {
      const aPips = a?.metadata?.total_pips || 0;
      const bPips = b?.metadata?.total_pips || 0;
      return bPips > aPips ? b : a;
    });
    const worstSession = sessions.reduce((a, b) => {
      const aPips = a?.metadata?.total_pips || 0;
      const bPips = b?.metadata?.total_pips || 0;
      return bPips < aPips ? b : a;
    });

    insights.push({
      type: 'market_theme', factor: 'session_edge',
      win_rate: bestSession.win_rate, sample_size: bestSession.sample_size,
      metadata: {
        best_session: bestSession.metadata?.session,
        best_pips: bestSession.metadata?.total_pips,
        best_trades: bestSession.sample_size,
        worst_session: worstSession.metadata?.session,
        worst_pips: worstSession.metadata?.total_pips,
        worst_trades: worstSession.sample_size,
        description: `Session edge: ${bestSession.metadata?.session} is your profit zone (+${bestSession.metadata?.total_pips} pips), ${worstSession.metadata?.session} bleeds (${worstSession.metadata?.total_pips} pips)`
      }
    });
  }

  // Find hold duration sweet spot
  const holds = memories.filter(m => m.factor === 'hold_duration_performance');
  if (holds.length >= 2) {
    const bestHold = holds.reduce((a, b) => (b?.metadata?.total_pips || 0) > (a?.metadata?.total_pips || 0) ? b : a);
    const worstHold = holds.reduce((a, b) => (b?.metadata?.total_pips || 0) < (a?.metadata?.total_pips || 0) ? b : a);

    insights.push({
      type: 'market_theme', factor: 'hold_duration_edge',
      win_rate: bestHold.win_rate, sample_size: bestHold.sample_size,
      metadata: {
        best_hold: bestHold.metadata?.hold_bucket,
        best_pips: bestHold.metadata?.total_pips,
        worst_hold: worstHold.metadata?.hold_bucket,
        worst_pips: worstHold.metadata?.total_pips,
        description: `Hold duration edge: ${bestHold.metadata?.hold_bucket} is optimal (+${bestHold.metadata?.total_pips} pips), ${worstHold.metadata?.hold_bucket} loses (${worstHold.metadata?.total_pips} pips)`
      }
    });
  }

  // Edge gap: signal win rate vs actual trading win rate
  const sigOverall = memories.find(m => m.factor === 'strategy_overall' && m.strategy === 'BB');
  const tradeOverall = memories.find(m => m.factor === 'overall_performance');

  if (sigOverall && tradeOverall) {
    const sigWR = parseFloat(sigOverall.win_rate) || 0;
    const tradeWR = parseFloat(tradeOverall.win_rate) || 0;
    const gap = Math.round((sigWR - tradeWR) * 100) / 100;

    if (Math.abs(gap) > 10) {
      insights.push({
        type: 'market_theme', factor: 'edge_gap',
        win_rate: tradeWR, sample_size: tradeOverall.sample_size,
        metadata: {
          signal_win_rate: sigWR, trade_win_rate: tradeWR,
          gap_pct: gap, signal_sample: sigOverall.sample_size,
          trade_sample: tradeOverall.sample_size,
          description: `Edge gap: BB signals resolve at ${sigWR}% but your trades win ${tradeWR}% — ${gap > 0 ? 'execution/timing gap of ' + gap + ' points' : 'you outperform signals by ' + Math.abs(gap) + ' points'}`
        }
      });
    }
  }

  // Panda Lines discipline insight
  const plConf = memories.find(m => m.factor === 'pl_confirmation' && m.strategy === 'BB' && m.metadata?.pl_status === 'confirmed');
  const plUnconf = memories.find(m => m.factor === 'pl_confirmation' && m.strategy === 'BB' && m.metadata?.pl_status === 'unconfirmed');

  if (plConf && plUnconf) {
    const confWR = parseFloat(plConf.win_rate) || 0;
    const unconfWR = parseFloat(plUnconf.win_rate) || 0;

    insights.push({
      type: 'market_theme', factor: 'pl_discipline',
      win_rate: confWR, sample_size: (plConf.sample_size || 0) + (plUnconf.sample_size || 0),
      metadata: {
        confirmed_win_rate: confWR, unconfirmed_win_rate: unconfWR,
        confirmed_sample: plConf.sample_size, unconfirmed_sample: plUnconf.sample_size,
        description: `Panda Lines discipline: confirmed signals win ${confWR}% vs unconfirmed ${unconfWR}% — Panda Lines confirmation adds ${Math.round(confWR - unconfWR)} points of edge`
      }
    });
  }

  return insights;
}

// --- MAIN HANDLER ---

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('ai_memory').select('*')
      .eq('type', 'market_theme')
      .order('computed_at', { ascending: false }).limit(50);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ memories: data || [], count: (data || []).length });
  }

  if (req.method === 'POST') {
    try {
      // 1. Fetch existing memories + raw cross-reference data
      const [memories, { signals, trades, sigErr, tradeErr }] = await Promise.all([
        fetchAllMemories(),
        fetchRawCrossData()
      ]);

      // Non-fatal: trades fetch can fail (empty table is OK)
      if (sigErr) {
        return res.status(500).json({ error: 'signal_results fetch failed', detail: sigErr });
      }

      // 2. Build pair-level cross-reference maps
      const { sigMap, tradeMap } = buildPairStats(signals, trades);

      // 3. Run all pattern analyses
      const allMemories = [
        ...findAlphaAndLeakPairs(sigMap, tradeMap),
        ...findSignalQualityTiers(signals),
        ...findMomentumBiasAlignment(signals),
        ...findBoxTrendValidation(signals),
        ...findBehavioralInsights(memories),
      ];

      // Log previous run summary
      const { data: prevMem } = await supabase.from('ai_memory').select('sample_size')
        .in('factor', FACTORS);
      if (prevMem && prevMem.length > 0) {
        const avgS = Math.round(prevMem.reduce((s,m) => s + (m.sample_size || 0), 0) / prevMem.length);
        try { await supabase.from('engine_logs').insert({ timestamp: new Date().toISOString(), component: 'pattern_agent_summary', duration: 0, error: JSON.stringify({ memories: prevMem.length, avg_sample: avgS }) }); } catch(_) {}
      }

      // 4. Clear previous pattern agent memories
      await supabase.from('ai_memory').delete().in('factor', FACTORS);

      // 5. Batch insert
      let written = 0;
      if (allMemories.length > 0) {
        const { data: inserted, error: writeErr } = await supabase.from('ai_memory').insert(allMemories).select('id');
        written = writeErr ? 0 : (inserted || []).length;
        if (writeErr) return res.status(500).json({ error: writeErr.message });
      }

      return res.status(200).json({
        signals_analyzed: signals.length,
        trades_analyzed: trades.length,
        existing_memories_read: memories.length,
        patterns_found: written,
        patterns_attempted: allMemories.length,
        pattern_types: allMemories.map(m => `${m.factor}: ${m.metadata?.description}`),
        trade_fetch_error: tradeErr || null,
        ran_at: new Date().toISOString()
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
