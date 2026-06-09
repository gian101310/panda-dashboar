import { supabase } from '../../lib/supabase';
import { requireAdmin } from '../../lib/auth';
import { computeRunHealth } from '../../lib/engineHealth.mjs';

export default async function handler(req, res) {
  // Admin only
  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Admin only' });

  try {
    // Last engine run
    const { data: logs } = await supabase
      .from('engine_logs')
      .select('timestamp, component, error')
      .order('timestamp', { ascending: false })
      .limit(5);

    const logLastRun = logs?.[0]?.timestamp || null;
    const now = new Date();

    // Get dashboard stats
    const { data: dashboard } = await supabase
      .from('dashboard')
      .select('symbol, gap, updated_at, momentum');

    const total   = (dashboard || []).length;
    const valid   = (dashboard || []).filter(r => Math.abs(r.gap || 0) >= 5).length;
    const stale   = (dashboard || []).filter(r => {
      if (!r.updated_at) return true;
      const age = Math.max(0, (now - new Date(r.updated_at)) / 60000);
      return age > 20;
    }).length;

    // Recent errors from logs
    const errors = (logs || []).filter(l => l.error).map(l => l.error);

    // Heartbeat from engine_heartbeat table (new — more reliable than engine_logs)
    let heartbeatRow = null;
    try {
      const { data: hb } = await supabase
        .from('engine_heartbeat')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);
      if (hb && hb.length > 0) {
        heartbeatRow = hb[0];
      }
    } catch (_) { /* heartbeat table may not exist yet */ }

    const { lastRun, minutesAgo, isAlive, heartbeat } = computeRunHealth({
      now,
      logLastRun,
      heartbeatRow,
    });

    return res.status(200).json({
      isAlive,
      lastRun,
      minutesAgo,
      total,
      valid,
      stale,
      errors,
      heartbeat,
      status: heartbeat ? heartbeat.status : (isAlive ? 'ONLINE' : 'STALE'),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
