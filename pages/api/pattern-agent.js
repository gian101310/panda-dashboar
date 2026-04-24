import { supabase } from '../../lib/supabase';

// Pattern Agent — cross-references Signal Agent vs Journal Agent findings
// Finds: alpha pairs, leak pairs, missed edge, behavioral blind spots

async function fetchAllMemories() {
  const { data } = await supabase.from('ai_memory').select('*').order('computed_at', { ascending: false }).limit(200);
  return data || [];
}

async function fetchRawCrossData() {
  // Signal results per pair (including below-20 threshold)
  const { data: signals, error: sigErr } = await supabase
    .from('signal_results')
    .select('symbol, direction, outcome, entry_gap, tbg_zone, strategy')
    .not('outcome', 'is', null);

  // Manual trades per pair — query kept identical to journal-agent (known working)
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
    if (!sigMap[s.symbol]) sigMap[s.symbol] = { wins: 0, losses: 0, flats: 0 };
    if (s.outcome === 'WIN') sigMap[s.symbol].wins++;
    else if (s.outcome === 'LOSS') sigMap[s.symbol].losses++;
    else if (s.outcome === 'FLAT') sigMap[s.symbol].flats++;
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
    if (!sig || !trade || trade.n < 10) continue;

    const sigTotal = sig.wins + sig.losses + sig.flats;
    const sigResolved = sig.wins + sig.losses;
    const sigWR = sigResolved > 0 ? Math.round((sig.wins / sigResolved) * 100) : null;
    const tradeWR = (trade.wins + trade.losses) > 0 ? Math.round((trade.wins / (trade.wins + trade.losses)) * 100) : null;

    // Alpha pair: user profitable AND signals strong
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

    // Leak pair: user loses money despite decent signal edge
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

    // Overtraded weak pair: user trades a lot but signals are weak
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
  return memories;
}

function findBehavioralInsights(memories) {
  const insights = [];

  // Find session data
  const sessions = memories.filter(m => m.factor === 'session_performance');
  const bestSession = sessions.reduce((a, b) => {
    const aPips = a?.metadata?.total_pips || 0;
    const bPips = b?.metadata?.total_pips || 0;
    return bPips > aPips ? b : a;
  }, null);
  const worstSession = sessions.reduce((a, b) => {
    const aPips = a?.metadata?.total_pips || 0;
    const bPips = b?.metadata?.total_pips || 0;
    return bPips < aPips ? b : a;
  }, null);

  if (bestSession && worstSession && sessions.length >= 2) {
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
  const bestHold = holds.reduce((a, b) => {
    const aPips = a?.metadata?.total_pips || 0;
    const bPips = b?.metadata?.total_pips || 0;
    return bPips > aPips ? b : a;
  }, null);
  const worstHold = holds.reduce((a, b) => {
    const aPips = a?.metadata?.total_pips || 0;
    const bPips = b?.metadata?.total_pips || 0;
    return bPips < aPips ? b : a;
  }, null);

  if (bestHold && worstHold && holds.length >= 2) {
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

  // TBG discipline insight from confluence data
  const tbgConf = memories.find(m => m.factor === 'tbg_confirmation' && m.strategy === 'BB' && m.metadata?.tbg_status === 'confirmed');
  const tbgUnconf = memories.find(m => m.factor === 'tbg_confirmation' && m.strategy === 'BB' && m.metadata?.tbg_status === 'unconfirmed');

  if (tbgConf && tbgUnconf) {
    const confWR = parseFloat(tbgConf.win_rate) || 0;
    const unconfWR = parseFloat(tbgUnconf.win_rate) || 0;
    const confFlat = tbgConf.metadata?.flat_pct || 0;
    const unconfFlat = tbgUnconf.metadata?.flat_pct || 0;

    insights.push({
      type: 'market_theme', factor: 'tbg_discipline',
      win_rate: confWR, sample_size: tbgConf.sample_size + tbgUnconf.sample_size,
      metadata: {
        confirmed_win_rate: confWR, unconfirmed_win_rate: unconfWR,
        confirmed_sample: tbgConf.sample_size, unconfirmed_sample: tbgUnconf.sample_size,
        description: `TBG discipline: confirmed signals win ${confWR}% vs unconfirmed ${unconfWR}% — TBG confirmation adds ${Math.round(confWR - unconfWR)} points of edge`
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

      // Surface any fetch errors immediately before deleting existing memories
      if (tradeErr) {
        return res.status(500).json({ error: 'manual_trades fetch failed', detail: tradeErr });
      }
      if (sigErr) {
        return res.status(500).json({ error: 'signal_results fetch failed', detail: sigErr });
      }

      // 2. Build pair-level cross-reference maps
      const { sigMap, tradeMap } = buildPairStats(signals, trades);

      // 3. Run all pattern analyses
      const allMemories = [
        ...findAlphaAndLeakPairs(sigMap, tradeMap),
        ...findBehavioralInsights(memories),
      ];

      // Log previous run summary
      const { data: prevMem } = await supabase.from('ai_memory').select('sample_size')
        .in('factor', ['alpha_pair','leak_pair','overtraded_weak','session_edge','hold_duration_edge','edge_gap','tbg_discipline']);
      if (prevMem && prevMem.length > 0) {
        const avgS = Math.round(prevMem.reduce((s,m) => s + m.sample_size, 0) / prevMem.length);
        await supabase.from('engine_logs').insert({ timestamp: new Date().toISOString(), component: 'pattern_agent_summary', duration: 0, error: JSON.stringify({ memories: prevMem.length, avg_sample: avgS }) });
      }

      // 4. Clear previous pattern agent memories
      await supabase.from('ai_memory').delete()
        .in('factor', ['alpha_pair', 'leak_pair', 'overtraded_weak', 'session_edge', 'hold_duration_edge', 'edge_gap', 'tbg_discipline']);

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
        fetch_errors: { signals: sigErr, trades: tradeErr },
        ran_at: new Date().toISOString()
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
