import { supabase } from '../../lib/supabase';
import { requireAdmin } from '../../lib/auth';

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

    const lastRun = logs?.[0]?.timestamp || null;

    // Check freshness
    const now = new Date();
    const lastRunDate = lastRun ? new Date(lastRun) : null;
    const minutesAgo = lastRunDate ? Math.floor((now - lastRunDate) / 60000) : 999;
    const isAlive = minutesAgo <= 20;

    // Get dashboard stats
    const { data: dashboard } = await supabase
      .from('dashboard')
      .select('symbol, gap, updated_at, momentum');

    const total   = (dashboard || []).length;
    const valid   = (dashboard || []).filter(r => Math.abs(r.gap || 0) >= 5).length;
    const stale   = (dashboard || []).filter(r => {
      if (!r.updated_at) return true;
      const age = (now - new Date(r.updated_at)) / 60000;
      return age > 20;
    }).length;

    // Recent errors from logs
    const errors = (logs || []).filter(l => l.error).map(l => l.error);

    return res.status(200).json({
      isAlive,
      lastRun,
      minutesAgo,
      total,
      valid,
      stale,
      errors,
      status: isAlive ? 'ONLINE' : 'STALE',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
