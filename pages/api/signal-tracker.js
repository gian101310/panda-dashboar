import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

const TWELVEDATA_KEY = process.env.TWELVEDATA_API_KEY || '';
const ENGINE_SECRET = process.env.ENGINE_SECRET || '';

// Fetch spot prices from Twelve Data (free tier: 800/day, 8/min)
async function fetchPrices(symbols) {
  if (!symbols.length || !TWELVEDATA_KEY) return {};
  const tdSymbols = symbols.map(s => s.slice(0,3) + '/' + s.slice(3)).join(',');
  try {
    const r = await fetch(
      `https://api.twelvedata.com/price?symbol=${tdSymbols}&apikey=${TWELVEDATA_KEY}`
    );
    const data = await r.json();
    const prices = {};
    if (symbols.length === 1) {
      prices[symbols[0]] = parseFloat(data.price) || null;
    } else {
      for (const sym of symbols) {
        const td = sym.slice(0,3) + '/' + sym.slice(3);
        prices[sym] = parseFloat(data[td]?.price) || null;
      }
    }
    return prices;
  } catch (e) {
    console.error('[PRICE FETCH]', e.message);
    return {};
  }
}

// Session from UTC hour — matches ai_memory / Journal Agent labels
function sessionFromHour(h) {
  if (h >= 22 || h < 6)  return 'ASIAN';     // 22:00-05:59 UTC
  if (h >= 6 && h < 14)  return 'LONDON';    // 06:00-13:59 UTC
  return 'NEW_YORK';                           // 14:00-21:59 UTC
}

function isValidSignal(pair) {
  const gap = Math.abs(pair.gap || 0);
  const bias = pair.bias;
  // BB does not require Panda Lines — gap >= 5 and directional bias is the only requirement
  if (gap < 5 || !bias || bias === 'WAIT') return false;
  return true;
}

function classifyStrategy(pair) {
  const gap = Math.abs(pair.gap || 0);
  const h = new Date().getUTCHours();
  // INTRA: gap >= 9, Panda Lines confirmed, 22:00-23:59 UTC (2-4 AM UAE)
  if (gap >= 9 && h >= 22 && h <= 23) return 'INTRA';
  return 'BB';
}

async function openNewTrackers(dashboardPairs, openTrackers) {
  const openSymbols = new Set(openTrackers.map(t => `${t.symbol}_${t.strategy}`));
  const newTrackers = [];
  const now = new Date();
  const hour = now.getUTCHours();

  // Fetch PDR cache for all symbols being considered
  const candidateSymbols = dashboardPairs
    .filter(p => isValidSignal(p))
    .map(p => p.symbol);
  let pdrMap = {};
  if (candidateSymbols.length > 0) {
    try {
      const { data: pdrRows } = await supabase
        .from('pdr_cache')
        .select('symbol, pdr_strength, pdr_strong')
        .in('symbol', candidateSymbols);
      if (pdrRows) {
        for (const r of pdrRows) pdrMap[r.symbol] = r;
      }
    } catch (e) { /* non-blocking — PDR is optional */ }
  }

  for (const pair of dashboardPairs) {
    if (!isValidSignal(pair)) continue;
    const strategy = classifyStrategy(pair);
    const key = `${pair.symbol}_${strategy}`;
    if (openSymbols.has(key)) continue;

    const pdr = pdrMap[pair.symbol] || null;
    newTrackers.push({
      symbol: pair.symbol,
      direction: pair.bias,
      strategy,
      gap_at_open: Math.abs(pair.gap),
      confidence_at_open: null,
      momentum_at_open: pair.momentum || null,
      pl_zone_at_open: pair.pl_zone || null,
      session_at_open: sessionFromHour(hour),
      pdr_strength_at_open: pdr ? pdr.pdr_strength : null,
      pdr_strong_at_open: pdr ? pdr.pdr_strong : null,
      peak_gap: Math.abs(pair.gap),
      hourly_gaps: [{ hour: 0, gap: Math.abs(pair.gap), ts: now.toISOString() }],
      status: 'OPEN'
    });
  }

  if (newTrackers.length === 0) return [];
  const { data, error } = await supabase.from('signal_tracker').insert(newTrackers).select('id, symbol, strategy');
  return error ? [] : (data || []);
}

async function updateAndCloseTrackers(dashboardPairs, openTrackers) {
  const pairMap = {};
  for (const p of dashboardPairs) pairMap[p.symbol] = p;
  const now = new Date();
  const closed = [];
  const updated = [];

  for (const tracker of openTrackers) {
    const pair = pairMap[tracker.symbol];
    if (!pair) continue;

    const currentGap = Math.abs(pair.gap || 0);
    const ageMs = now - new Date(tracker.opened_at);
    const ageHours = ageMs / (1000 * 60 * 60);
    const ageDays = ageHours / 24;

    // Update peak gap
    const newPeakGap = Math.max(tracker.peak_gap || 0, currentGap);

    // Append to hourly_gaps (one entry per update cycle)
    const gaps = Array.isArray(tracker.hourly_gaps) ? [...tracker.hourly_gaps] : [];
    gaps.push({ hour: Math.round(ageHours * 10) / 10, gap: currentGap, ts: now.toISOString() });

    // Check close conditions
    let closeReason = null;
    if (currentGap < 5) closeReason = 'GAP_BELOW_5';
    else if (tracker.direction === 'BUY' && pair.bias === 'SELL') closeReason = 'BIAS_FLIPPED';
    else if (tracker.direction === 'SELL' && pair.bias === 'BUY') closeReason = 'BIAS_FLIPPED';
    else if (tracker.direction === 'BUY' && pair.pl_zone === 'BELOW') closeReason = 'PL_FLIPPED';
    else if (tracker.direction === 'SELL' && pair.pl_zone === 'ABOVE') closeReason = 'PL_FLIPPED';
    else if (ageDays > 30) closeReason = 'MAX_AGE_30D';

    // Milestone snapshots
    const snapshot = { gap: currentGap, bias: pair.bias, pl_zone: pair.pl_zone, momentum: pair.momentum, ts: now.toISOString() };
    const h24 = tracker.h24_snapshot || (ageHours >= 24 && ageHours < 24.2 ? snapshot : null);
    const h48 = tracker.h48_snapshot || (ageHours >= 48 && ageHours < 48.2 ? snapshot : null);
    const h72 = tracker.h72_snapshot || (ageHours >= 72 && ageHours < 72.2 ? snapshot : null);

    // Weekly snapshots (every 168 hours)
    const weeklies = Array.isArray(tracker.weekly_snapshots) ? [...tracker.weekly_snapshots] : [];
    const weekNum = Math.floor(ageHours / 168);
    if (weekNum > 0 && weeklies.length < weekNum) {
      weeklies.push({ week: weekNum, ...snapshot });
    }

    const updateData = {
      peak_gap: newPeakGap,
      hourly_gaps: gaps,
      h24_snapshot: h24 || tracker.h24_snapshot,
      h48_snapshot: h48 || tracker.h48_snapshot,
      h72_snapshot: h72 || tracker.h72_snapshot,
      weekly_snapshots: weeklies
    };

    if (closeReason) {
      updateData.status = 'CLOSED';
      updateData.closed_at = now.toISOString();
      updateData.close_reason = closeReason;
      closed.push({ id: tracker.id, symbol: tracker.symbol, reason: closeReason });
    } else {
      updated.push(tracker.id);
    }

    await supabase.from('signal_tracker').update(updateData).eq('id', tracker.id);
  }
  return { closed, updated: updated.length };
}

// --- MAIN HANDLER ---

export default async function handler(req, res) {
  // GET — list tracker records
  if (req.method === 'GET') {
    const token = req.cookies?.panda_session;
    const session = await validateSession(token);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const { status = 'OPEN', symbol, limit = 50 } = req.query;
    let query = supabase.from('signal_tracker').select('*')
      .order('opened_at', { ascending: false })
      .limit(Math.min(parseInt(limit) || 50, 200));
    if (status !== 'ALL') query = query.eq('status', status);
    if (symbol) query = query.eq('symbol', symbol);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ trackers: data || [], count: (data || []).length });
  }

  // POST — run tracker update cycle (browser session OR engine secret)
  if (req.method === 'POST') {
    const token = req.cookies?.panda_session;
    const session = await validateSession(token);
    const incomingSecret = req.headers['x-engine-secret'] || '';
    const validEngine = ENGINE_SECRET && incomingSecret === ENGINE_SECRET;
    if (!session && !validEngine) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const { action } = req.body || {};

      // Toggle extended_watch
      if (action === 'watch') {
        const { id, watch } = req.body;
        if (!id) return res.status(400).json({ error: 'id required' });
        const { error } = await supabase.from('signal_tracker')
          .update({ extended_watch: !!watch }).eq('id', id);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ id, extended_watch: !!watch });
      }

      // Default action: full update cycle
      // 1. Get current dashboard data
      const { data: dashboardPairs, error: dashErr } = await supabase
        .from('dashboard').select('symbol, gap, bias, confidence, momentum, pl_zone');
      if (dashErr) return res.status(500).json({ error: dashErr.message });

      // 2. Get all open trackers
      const { data: openTrackers, error: openErr } = await supabase
        .from('signal_tracker').select('*').eq('status', 'OPEN');
      if (openErr) return res.status(500).json({ error: openErr.message });

      // 3. Open new trackers for valid signals not already tracked
      const newlyOpened = await openNewTrackers(dashboardPairs, openTrackers || []);

      // 4. Update existing trackers + close dead signals
      const { closed, updated } = await updateAndCloseTrackers(dashboardPairs, openTrackers || []);

      // 5. Price capture (every 15 min — free tier safe)
      let priceUpdates = 0;
      const min = new Date().getUTCMinutes();
      const isPriceCycle = min % 15 <= 4;

      if (isPriceCycle && TWELVEDATA_KEY) {
        const { data: currentOpen } = await supabase
          .from('signal_tracker').select('id, symbol, direction, entry_price, peak_price, worst_price, hourly_prices')
          .eq('status', 'OPEN');

        if (currentOpen && currentOpen.length > 0) {
          const symbols = [...new Set(currentOpen.map(t => t.symbol))];
          const prices = await fetchPrices(symbols);

          for (const t of currentOpen) {
            const price = prices[t.symbol];
            if (!price) continue;
            const updates = {};
            const isBuy = t.direction === 'BUY';
            const pipDiv = t.symbol.includes('JPY') ? 0.01 : 0.0001;

            // Set entry_price on first price capture
            if (!t.entry_price) updates.entry_price = price;
            const ep = t.entry_price || price;

            // Track peak/worst
            const prevPeak = t.peak_price || price;
            const prevWorst = t.worst_price || price;
            updates.peak_price = Math.max(prevPeak, price);
            updates.worst_price = Math.min(prevWorst, price);

            // Append to hourly_prices
            const hp = Array.isArray(t.hourly_prices) ? [...t.hourly_prices] : [];
            hp.push({ price, ts: new Date().toISOString() });
            updates.hourly_prices = hp;

            // Pip calculations
            const netRaw = isBuy ? (price - ep) / pipDiv : (ep - price) / pipDiv;
            updates.net_pips = Math.round(netRaw * 10) / 10;
            const bestPrice = isBuy ? updates.peak_price : updates.worst_price;
            const worstPrice = isBuy ? updates.worst_price : updates.peak_price;
            updates.pips_gained = Math.round(Math.max(0, (isBuy ? bestPrice - ep : ep - bestPrice) / pipDiv) * 10) / 10;
            updates.pips_lost = Math.round(Math.min(0, (isBuy ? worstPrice - ep : ep - worstPrice) / pipDiv) * 10) / 10;

            await supabase.from('signal_tracker').update(updates).eq('id', t.id);
            priceUpdates++;
          }
        }
      }

      // 6. Stale agent warning
      let agentStale = false;
      try {
        const { count: totalSignals } = await supabase.from('signal_results').select('*', { count: 'exact', head: true });
        const { data: lastAgent } = await supabase.from('ai_memory').select('sample_size')
          .eq('factor', 'strategy_overall').eq('strategy', 'BB').limit(1);
        if (lastAgent?.[0] && totalSignals) {
          const delta = totalSignals - (lastAgent[0].sample_size || 0);
          if (delta > 50) {
            agentStale = true;
            const TG_TOKEN = process.env.TELEGRAM_TOKEN || '';
            const TG_CHAT = process.env.TELEGRAM_CHAT_ID || '';
            if (TG_TOKEN && TG_CHAT) {
              await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ chat_id: TG_CHAT, text: `⚠️ Signal Agent stale — ${delta} new signals since last run. Re-run agents.` })
              }).catch(()=>{});
            }
          }
        }
      } catch(e) { console.error('[STALE CHECK]', e.message); }

      return res.status(200).json({
        cycle_at: new Date().toISOString(),
        open_before: (openTrackers || []).length,
        newly_opened: newlyOpened.length,
        updated,
        closed: closed.length,
        closed_details: closed,
        open_after: (openTrackers || []).length + newlyOpened.length - closed.length,
        new_trackers: newlyOpened,
        price_updates: priceUpdates,
        agent_stale: agentStale
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
