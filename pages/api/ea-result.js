// Panda Engine EA Result Endpoint
// Receives trade execution results from MT5 EA via WebRequest
// Auth: Bearer token via EA_API_KEY env var (machine-to-machine, no cookie)

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jxkelchxitwuilpbrwxk.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || ''
);

export default async function handler(req, res) {
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Bearer token auth
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '').trim();
  const expected = process.env.EA_API_KEY || '';

  if (!expected || token !== expected) {
    return res.status(401).json({ error: 'Invalid EA token' });
  }

  try {
    const {
      ticket, symbol, strategy, magic, direction,
      entry_requested, fill_price, sl, tp, close_price,
      open_time, close_time, close_reason,
      spread_at_entry, slippage_points,
      profit_pips, profit_money, lot_size,
      engine_version,
      signal_write_time, ea_read_time
    } = req.body || {};

    // Validate required fields (magic & direction are NOT NULL in Supabase)
    if (!ticket || !symbol || !strategy || !fill_price || !open_time || !magic || !direction) {
      return res.status(400).json({ error: 'Missing required fields: ticket, symbol, strategy, fill_price, open_time, magic, direction' });
    }

    // Check duplicate (ticket is UNIQUE but handle gracefully)
    const { data: existing } = await supabase
      .from('ea_executions')
      .select('id')
      .eq('ticket', String(ticket))
      .maybeSingle();

    if (existing) {
      return res.status(200).json({ id: existing.id, symbol, status: 'already_recorded' });
    }

    // Insert
    const { data, error } = await supabase
      .from('ea_executions')
      .insert({
        ticket: String(ticket),
        symbol,
        strategy,
        magic: Number(magic),
        direction,
        entry_requested: entry_requested ? Number(entry_requested) : null,
        fill_price: Number(fill_price),
        sl: sl ? Number(sl) : null,
        tp: tp ? Number(tp) : null,
        close_price: close_price ? Number(close_price) : null,
        open_time,
        close_time: close_time || null,
        close_reason: close_reason || null,
        spread_at_entry: spread_at_entry ? Number(spread_at_entry) : null,
        slippage_points: slippage_points ? Number(slippage_points) : null,
        profit_pips: profit_pips ? Number(profit_pips) : null,
        profit_money: profit_money ? Number(profit_money) : null,
        lot_size: lot_size ? Number(lot_size) : null,
        engine_version: engine_version || null,
        signal_write_time: signal_write_time || null,
        ea_read_time: ea_read_time || null,
        signal_to_fill_sec: (signal_write_time && open_time)
          ? Math.round((new Date(open_time) - new Date(signal_write_time)) / 1000)
          : null
      })
      .select('id')
      .single();

    if (error) {
      console.error('[EA-RESULT] Insert error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    console.log(`[EA-RESULT] Recorded: ${symbol} ${strategy} ${direction} ticket=${ticket} pips=${profit_pips}`);
    return res.status(200).json({ id: data.id, symbol, status: 'recorded' });

  } catch (err) {
    console.error('[EA-RESULT] Handler error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
