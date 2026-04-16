import { supabase } from '../../../lib/supabase';
import { validateSession, hashPassword } from '../../../lib/auth';

const PF_TIER_FEATURES = {
  starter: ['signals','calendar','calculator','cot'],
  pro:     ['signals','table','gap','calendar','calculator','cot','setups','spike'],
  elite:   ['signals','table','gap','calendar','calculator','cot','setups','spike','logs','alerts','journal','charts','panels']
};

async function pfRequireAdmin(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  const { data: user } = await supabase.from('panda_users').select('role').eq('id', session.user_id).single();
  if (!user || user.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return null; }
  return { session, user };
}

async function pfNotifyAdmin(msg) {
  try {
    await fetch('https://api.telegram.org/bot8605294552:AAG2o7bF30qkZx0Zv_FgmwA0RgS7g56OH7Y/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: '5379148910', text: msg, parse_mode: 'HTML' })
    });
  } catch {}
}
export default async function handler(req, res) {
  const auth = await pfRequireAdmin(req, res);
  if (!auth) return;

  if (req.method === 'GET') {
    // List pending signups + pending users + recent security events
    const { data: signups } = await supabase
      .from('pf_signup_requests').select('*').eq('status', 'PENDING')
      .order('created_at', { ascending: false }).limit(100);

    const { data: pendingUsers } = await supabase
      .from('panda_users').select('id, username, role, pf_tier, pf_approved, created_at, is_active')
      .eq('pf_approved', false).order('created_at', { ascending: false }).limit(100);

    const { data: events } = await supabase
      .from('pf_security_events').select('*')
      .order('created_at', { ascending: false }).limit(50);

    return res.status(200).json({
      signups: signups || [],
      pending_users: pendingUsers || [],
      events: events || [],
    });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const { action, id, username, password, tier, role } = req.body || {};
  if (!action) return res.status(400).json({ error: 'action required' });

  try {
    if (action === 'approve_signup') {
      if (!id || !password || !username) return res.status(400).json({ error: 'id, username, password required' });
      const { data: req_row } = await supabase.from('pf_signup_requests').select('*').eq('id', id).single();
      if (!req_row) return res.status(404).json({ error: 'signup not found' });

      const safeTier = ['starter','pro','elite'].includes(tier) ? tier : (req_row.tier || 'starter');
      const featureAccess = PF_TIER_FEATURES[safeTier] || PF_TIER_FEATURES.starter;

      const { data: exists } = await supabase.from('panda_users').select('id').eq('username', username.trim()).maybeSingle();
      if (exists) return res.status(409).json({ error: 'username already exists' });

      const { error: insErr } = await supabase.from('panda_users').insert({
        username: username.trim(),
        password_hash: hashPassword(password),
        role: role || 'user',
        pf_approved: true,
        pf_tier: safeTier,
        feature_access: featureAccess,
        max_devices: 1,
        is_active: true,
      });
      if (insErr) return res.status(500).json({ error: insErr.message });

      await supabase.from('pf_signup_requests').update({ status: 'APPROVED', notes: `approved as ${username}` }).eq('id', id);
      await pfNotifyAdmin(`🐼 <b>USER APPROVED</b>\n━━━━━━━━━━━━━━━━━━━━\n<b>User:</b> ${username}\n<b>Tier:</b> ${safeTier.toUpperCase()}\n<b>Role:</b> ${role || 'user'}\n<b>Email:</b> ${req_row.email}`);
      return res.status(200).json({ ok: true });
    }

    if (action === 'deny_signup') {
      if (!id) return res.status(400).json({ error: 'id required' });
      await supabase.from('pf_signup_requests').update({ status: 'DENIED' }).eq('id', id);
      return res.status(200).json({ ok: true });
    }

    if (action === 'toggle_user_approved') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data: u } = await supabase.from('panda_users').select('pf_approved, username').eq('id', id).single();
      const next = !u.pf_approved;
      await supabase.from('panda_users').update({ pf_approved: next }).eq('id', id);
      await pfNotifyAdmin(`🐼 <b>APPROVAL ${next ? 'GRANTED' : 'REVOKED'}</b>\n<b>User:</b> ${u.username}`);
      return res.status(200).json({ ok: true, pf_approved: next });
    }

    if (action === 'set_tier') {
      if (!id || !tier) return res.status(400).json({ error: 'id, tier required' });
      const safeTier = ['starter','pro','elite'].includes(tier) ? tier : 'starter';
      const featureAccess = PF_TIER_FEATURES[safeTier];
      await supabase.from('panda_users').update({ pf_tier: safeTier, feature_access: featureAccess }).eq('id', id);
      return res.status(200).json({ ok: true, pf_tier: safeTier });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    console.error('pf_approve_err', err);
    return res.status(500).json({ error: err.message || 'server error' });
  }
}
