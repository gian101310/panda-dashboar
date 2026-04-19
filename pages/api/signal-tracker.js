import { supabase } from '../../lib/supabase';

const TWELVEDATA_KEY = process.env.TWELVEDATA_API_KEY || '';

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

// Session from UTC hour
function sessionFromHour(h) {
  // UTC-based: Tokyo 0-7, London 8-12, Overlap 13-16, NY 17-21
  if (h >= 0 && h <= 7) return 'TOKYO';
  if (h >= 8 && h <= 12) return 'LONDON';
  if (h >= 13 && h <= 16) return 'OVERLAP';
  if (h >= 17 && h <= 21) return 'NEW_YORK';
  return 'OFF_HOURS';
}

function isValidSignal(pair) {
  const gap = Math.abs(pair.gap || 0);
  const bias = pair.bias;
  const tbg = pair.tbg_zone;
  if (gap < 5 || !bias || bias === 'WAIT') return false;
  // TBG must confirm for validity
  if (bias === 'BUY' && tbg !== 'ABOVE') return false;
  if (bias === 'SELL' && tbg !== 'BELOW') return false;
  return true;
}

function classifyStrategy(pair) {
  const gap = Math.abs(pair.gap || 0);
  const h = new Date().getUTCHours();
  // INTRA: gap >= 9, TBG confirmed, 22:00-23:59 UTC (2-4 AM UAE)
  if (gap >= 9 && h >= 22 && h <= 23) return 'INTRA';
  return 'BB';
}

async function openNewTrackers(dashboardPairs, openTrackers) {
  const openSymbols = new Set(openTrackers.map(t => `${t.symbol}_${t.strategy}`));
  const newTrackers = [];
  const now = new Date();
  const hour = now.getUTCHours();

  for (const pair of dashboardPairs) {
    if (!isValidSignal(pair)) continue;
    const strategy = classifyStrategy(pair);
    const key = `${pair.symbol}_${strategy}`;
    if (openSymbols.has(key)) continue; // already tracking

    newTrackers.push({
      symbol: pair.symbol,
      direction: pair.bias,
      strategy,
      gap_at_open: Math.abs(pair.gap),
      confidence_at_open: null,
      momentum_at_open: pair.momentum || null,
      tbg_zone_at_open: pair.tbg_zone || null,
      session_at_open: sessionFromHour(hour),
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
    else if (tracker.direction === 'BUY' && pair.tbg_zone === 'BELOW') closeReason = 'TBG_FLIPPED';
    else if (tracker.direction === 'SELL' && pair.tbg_zone === 'ABOVE') closeReason = 'TBG_FLIPPED';
    else if (ageDays > 30) closeReason = 'MAX_AGE_30D';

    // Milestone snapshots
    const snapshot = { gap: currentGap, bias: pair.bias, tbg_zone: pair.tbg_zone, momentum: pair.momentum, ts: now.toISOString() };
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

  // POST — run tracker update cycle
  if (req.method === 'POST') {
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
        .from('dashboard').select('symbol, gap, bias, confidence, momentum, tbg_zone');
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

      return res.status(200).json({
        cycle_at: new Date().toISOString(),
        open_before: (openTrackers || []).length,
        newly_opened: newlyOpened.length,
        updated,
        closed: closed.length,
        closed_details: closed,
        open_after: (openTrackers || []).length + newlyOpened.length - closed.length,
        new_trackers: newlyOpened,
        price_updates: priceUpdates
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
