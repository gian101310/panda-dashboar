import { validateSession } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (session.panda_users?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { data, error } = await supabase
      .from('account_guardian_snapshots')
      .select(`
        id, created_at, balance, equity, net_profit,
        daily_loss_limit, daily_loss_used, daily_remaining,
        max_loss_limit, max_loss_used, max_loss_remaining,
        profit_target, mode, open_positions, pending_orders,
        guardian_state, blockers, warnings
      `)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error?.message?.includes('account_guardian_snapshots') || error?.code === 'PGRST205') {
      return res.status(200).json({
        snapshot: null,
        configured: false,
        setupSql: 'supabase/account_guardian_snapshots.sql',
        error: error.message,
      });
    }

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      snapshot: data || null,
      configured: Boolean(data),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
