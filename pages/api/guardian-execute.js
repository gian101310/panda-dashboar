import { validateSession } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

/**
 * Guardian Execute API
 * POST /api/guardian-execute
 *   body: { action: 'execute' | 'toggle_mode' | 'get_state', symbol?, direction? }
 *
 * Actions:
 *   get_state   — returns current mode + valid setups + guardian state
 *   toggle_mode — switch AUTO <-> MANUAL
 *   execute     — trigger execution for a specific symbol (runs autonomous-loop for it)
 */
export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (session.panda_users?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  if (req.method === 'GET') {
    return getState(req, res);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};

  if (action === 'get_state') return getState(req, res);
  if (action === 'toggle_mode') return toggleMode(req, res);
  if (action === 'execute') return executeSetup(req, res);

  return res.status(400).json({ error: 'Invalid action. Use: get_state, toggle_mode, execute' });
}

async function getState(req, res) {
  try {
    // Get current mode
    const { data: configData } = await supabase
      .from('engine_config')
      .select('value')
      .eq('key', 'execution_mode')
      .single();
    const mode = configData?.value || 'MANUAL';

    // Get latest guardian snapshot
    const { data: snapshot } = await supabase
      .from('account_guardian_snapshots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get pending notifications (valid setups waiting for approval)
    const { data: notifications } = await supabase
      .from('engine_notifications')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(10);

    // Get dashboard setups with active bias
    const { data: activeSetups } = await supabase
      .from('dashboard')
      .select('symbol, bias, gap, pl_st, pl_fl, pl_price, hard_invalid')
      .not('bias', 'is', null)
      .in('bias', ['BUY', 'SELL'])
      .eq('hard_invalid', false);

    return res.status(200).json({
      mode,
      snapshot: snapshot || null,
      notifications: notifications || [],
      activeSetups: activeSetups || [],
      lastUpdated: snapshot?.created_at || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function toggleMode(req, res) {
  try {
    // Get current mode
    const { data: current } = await supabase
      .from('engine_config')
      .select('value')
      .eq('key', 'execution_mode')
      .single();

    const currentMode = current?.value || 'MANUAL';
    const newMode = currentMode === 'AUTO' ? 'MANUAL' : 'AUTO';

    // Upsert the new mode
    const { error } = await supabase
      .from('engine_config')
      .upsert({ key: 'execution_mode', value: newMode }, { onConflict: 'key' });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ mode: newMode, previous: currentMode });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function executeSetup(req, res) {
  const { symbol, direction } = req.body || {};
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  // Mark notification as EXECUTING
  await supabase
    .from('engine_notifications')
    .update({ status: 'EXECUTING' })
    .eq('symbol', symbol.toUpperCase())
    .eq('status', 'PENDING');

  // The actual execution happens via the autonomous loop or execute-engine-pb
  // For now, we queue it and return — the loop will pick it up on next pass
  // Or the user can run: npm run execute:engine-pb -- --symbol=SYMBOL --approve
  return res.status(200).json({
    queued: true,
    symbol: symbol.toUpperCase(),
    direction: direction || null,
    message: `Execution queued for ${symbol}. The autonomous loop will execute on next pass, or run manually: npm run execute:engine-pb -- --symbol=${symbol} --approve`,
  });
}
