import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

// Parse DD/MM/YYYY HH:MM:SS.mmm format from trade history CSV
function parseDate(val) {
  if (!val || val === '') return null;
  const s = val.toString().trim();

  // DD/MM/YYYY HH:MM:SS or DD/MM/YYYY HH:MM:SS.mmm
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const [, d, mo, y, h, min, sec] = m;
    // Use UTC to avoid timezone issues
    return new Date(`${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}T${h}:${min}:${sec}Z`).toISOString();
  }

  // Excel serial date (number)
  if (typeof val === 'number' && val > 40000) {
    return new Date((val - 25569) * 86400000).toISOString();
  }

  // ISO or other standard formats
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString();

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { data: user } = await supabase
    .from('panda_users').select('role, feature_access, id')
    .eq('id', session.user_id).single();

  const hasAccess = user?.feature_access?.includes('journal') || user?.role === 'admin' || user?.role === 'vip';
  if (!hasAccess) return res.status(403).json({ error: 'VIP/Admin only' });

  const { rows, filename } = req.body;
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No trade data received' });
  }

  const trades = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      // Symbol
      const symbol = (row['Symbol'] || '').toString().replace(/[/\- ]/g, '').toUpperCase();
      if (!symbol || symbol.length < 5) continue;

      // Direction
      const dirRaw = (row['Opening direction'] || row['Direction'] || '').toString().toLowerCase();
      const direction = dirRaw.startsWith('buy') || dirRaw === 'b' ? 'BUY' : 'SELL';

      // Numbers
      const volume           = parseFloat(row['Closing Quantity']  || row['Volume'] || 0.01) || 0.01;
      const entry_price      = parseFloat(row['Entry price']       || 0) || null;
      const exit_price       = parseFloat(row['Closing price']     || 0) || null;
      const profit_loss      = parseFloat(row['Net $']             || row['Gross $'] || 0);
      const commission       = parseFloat(row['Commission']        || 0);
      const swap             = parseFloat(row['Swap']              || 0);
      const profit_loss_pips = parseFloat(row['Pips']              || 0);

      // Times
      const entry_time = parseDate(row['Opening time'] || row['Opening Time']);
      const exit_time  = parseDate(row['Closing time'] || row['Closing Time']);

      if (!entry_time) {
        errors.push(`Row ${i+1}: Could not parse Opening time: ${row['Opening time']}`);
        continue;
      }

      // Duration
      const duration_minutes = exit_time
        ? Math.round((new Date(exit_time) - new Date(entry_time)) / 60000)
        : null;

      // Gap lookup
      let gap_at_entry = null;
      try {
        const ts = entry_time.slice(0, 16).replace('T', ' ');
        const { data: gh } = await supabase
          .from('gap_history').select('gap')
          .eq('symbol', symbol).lte('timestamp', ts)
          .order('timestamp', { ascending: false }).limit(1);
        if (gh?.[0]) gap_at_entry = gh[0].gap;
      } catch {}

      // Notes
      const comment  = (row['Comment'] || '').toString().trim();
      const label    = (row['Label']   || '').toString().trim();
      const order_id = (row['Order ID']|| row['ID'] || '').toString().trim();
      const notes    = [comment, label].filter(Boolean).join(' ') + (order_id ? ` [${order_id}]` : '');

      trades.push({
        user_id:          session.user_id,
        username:         session.username,
        symbol,
        direction,
        volume,
        entry_price,
        exit_price,
        profit_loss,
        profit_loss_pips,
        commission,
        swap,
        entry_time,
        exit_time,
        duration_minutes,
        status:           'CLOSED',
        gap_at_entry,
        notes:            notes.trim(),
      });

    } catch (e) {
      errors.push(`Row ${i+1}: ${e.message}`);
    }
  }

  // Insert in batches of 50
  let imported = 0;
  const insertErrors = [];

  for (let i = 0; i < trades.length; i += 50) {
    const batch = trades.slice(i, i + 50);
    const { error } = await supabase.from('manual_trades').insert(batch);
    if (error) {
      insertErrors.push(error.message);
      console.error('[JOURNAL UPLOAD] Insert error:', error.message);
    } else {
      imported += batch.length;
    }
  }

  // Log upload
  if (imported > 0) {
    await supabase.from('csv_uploads').insert({
      user_id:       session.user_id,
      username:      session.username,
      filename:      filename || 'upload',
      rows_imported: imported,
    });
  }

  return res.status(200).json({
    ok:       imported > 0,
    imported,
    total:    rows.length,
    skipped:  rows.length - trades.length,
    errors:   [...errors, ...insertErrors].slice(0, 5), // return first 5 errors for debugging
  });
}