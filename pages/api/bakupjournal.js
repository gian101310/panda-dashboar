import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { data: user } = await supabase.from('panda_users').select('role, feature_access').eq('id', session.user_id).single();
  const hasAccess = user?.feature_access?.includes('journal') || user?.role === 'admin' || user?.role === 'vip';
  if (!hasAccess) return res.status(403).json({ error: 'VIP/Admin only' });

  const userId = session.user_id;

  // GET — fetch trades (journal + manual)
  if (req.method === 'GET') {
    const { symbol, direction, status, limit = 200 } = req.query;

    // Get journal trades
    let ctQuery = supabase.from('trade_journal').select('*').eq('account_id', userId).order('entry_time', { ascending: false }).limit(parseInt(limit));
    if (symbol) ctQuery = ctQuery.eq('symbol', symbol);
    if (direction) ctQuery = ctQuery.eq('direction', direction);
    if (status) ctQuery = ctQuery.eq('status', status);

    // Get manual trades
    let manQuery = supabase.from('manual_trades').select('*').eq('user_id', userId).order('entry_time', { ascending: false }).limit(parseInt(limit));
    if (symbol) manQuery = manQuery.eq('symbol', symbol);
    if (direction) manQuery = manQuery.eq('direction', direction);
    if (status) manQuery = manQuery.eq('status', status);

    const [ctRes, manRes] = await Promise.all([ctQuery, manQuery]);
    const ctTrades = (ctRes.data || []).map(t => ({ ...t, source: 'journal' }));
    const manTrades = (manRes.data || []).map(t => ({ ...t, source: 'manual', id: t.id }));

    const all = [...ctTrades, ...manTrades].sort((a, b) => new Date(b.entry_time) - new Date(a.entry_time));
    return res.status(200).json(all);
  }

  // POST — add manual trade
  if (req.method === 'POST') {
    const { symbol, direction, volume, entry_price, exit_price, sl, tp, profit_loss, profit_loss_pips, entry_time, exit_time, status, notes, strategy_name } = req.body;
    if (!symbol || !direction) return res.status(400).json({ error: 'Symbol and direction required' });

    // Look up gap + momentum at entry time
    let gap_at_entry = null, momentum_at_entry = null;
    if (entry_time) {
      const ts = new Date(entry_time).toISOString().slice(0, 16).replace('T', ' ');
      const { data: gh } = await supabase.from('gap_history').select('gap').eq('symbol', symbol).lte('timestamp', ts).order('timestamp', { ascending: false }).limit(1);
      if (gh?.[0]) gap_at_entry = gh[0].gap;
      const { data: db } = await supabase.from('dashboard').select('momentum').eq('symbol', symbol).limit(1);
      if (db?.[0]) momentum_at_entry = db[0].momentum;
    }

    const { error } = await supabase.from('manual_trades').insert({
      user_id: userId, username: session.username,
      symbol, direction, volume: parseFloat(volume) || 0.01,
      entry_price: parseFloat(entry_price) || null,
      exit_price: parseFloat(exit_price) || null,
      sl: parseFloat(sl) || null, tp: parseFloat(tp) || null,
      profit_loss: parseFloat(profit_loss) || 0,
      profit_loss_pips: parseFloat(profit_loss_pips) || 0,
      entry_time: entry_time || new Date().toISOString(),
      exit_time: exit_time || null, status: status || 'CLOSED',
      gap_at_entry, momentum_at_entry,
      notes: notes || '', strategy_name: strategy_name || '',
    });

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  // DELETE — remove single trade or all trades
  if (req.method === 'DELETE') {
    const { id, clearAll } = req.body;

    if (clearAll) {
      // Delete ALL manual trades for this user
      const { error } = await supabase.from('manual_trades').delete().eq('user_id', userId);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true, message: 'All trades deleted' });
    }

    if (!id) return res.status(400).json({ error: 'ID required' });
    const { error } = await supabase.from('manual_trades').delete().eq('id', id).eq('user_id', userId);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}