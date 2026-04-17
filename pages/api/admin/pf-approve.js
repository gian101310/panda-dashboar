import { supabase } from '../../../lib/supabase';
import { validateSession, hashPassword } from '../../../lib/auth';

const PF_BOT_TOKEN = '8605294552:AAG2o7bF30qkZx0Zv_FgmwA0RgS7g56OH7Y';

function pfGenPassword() { return 'Panda#' + Math.floor(1000 + Math.random() * 9000); }

async function pfSendTelegram(chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${PF_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
  } catch {}
}

async function pfSendUserDM(tgUsername, text) {
  if (!tgUsername) return;
  try {
    const { data: tgRow } = await supabase.from('pf_telegram_chats')
      .select('chat_id').ilike('telegram_username', tgUsername.replace('@', '')).maybeSingle();
    if (tgRow?.chat_id) await pfSendTelegram(tgRow.chat_id, text);
  } catch {}
}

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

export default async function handler(req, res) {
  const auth = await pfRequireAdmin(req, res);
  if (!auth) return;

  if (req.method === 'GET') {
    const { data: signups } = await supabase
      .from('pf_signup_requests').select('*').eq('status', 'PENDING')
      .order('created_at', { ascending: false }).limit(100);
    const { data: pendingUsers } = await supabase
      .from('panda_users').select('id, username, role, pf_tier, pf_approved, created_at, is_active')
      .eq('pf_approved', false).order('created_at', { ascending: false }).limit(100);
    const { data: events } = await supabase
      .from('pf_security_events').select('*')
      .order('created_at', { ascending: false }).limit(50);
    return res.status(200).json({ signups: signups || [], pending_users: pendingUsers || [], events: events || [] });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const { action, id, username, tier, role } = req.body || {};
  if (!action) return res.status(400).json({ error: 'action required' });

  try {
    if (action === 'approve_signup') {
      if (!id || !username) return res.status(400).json({ error: 'id and username required' });
      const { data: req_row } = await supabase.from('pf_signup_requests').select('*').eq('id', id).single();
      if (!req_row) return res.status(404).json({ error: 'signup not found' });

      const safeTier = ['starter','pro','elite'].includes(tier) ? tier : (req_row.tier || 'starter');
      const featureAccess = PF_TIER_FEATURES[safeTier] || PF_TIER_FEATURES.starter;
      const { data: exists } = await supabase.from('panda_users').select('id').eq('username', username.trim()).maybeSingle();
      if (exists) return res.status(409).json({ error: 'username already exists' });

      const password = pfGenPassword();
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

      // DM user their credentials
      const dm = [
        '✅ <b>PANDA ENGINE — ACCESS APPROVED</b>',
        '━━━━━━━━━━━━━━━━━━━━━━',
        `<b>Username:</b> ${username.trim()}`,
        `<b>Password:</b> ${password}`,
        `<b>Tier:</b> ${safeTier.toUpperCase()}`,
        '━━━━━━━━━━━━━━━━━━━━━━',
        '🔗 <a href="https://panda-dashboard.vercel.app/login">Login Now</a>',
        '🐼 Welcome to the system.',
      ].join('\n');
      await pfSendUserDM(req_row.telegram_username, dm);

      // Notify admin
      await pfSendTelegram('5379148910', `🐼 <b>USER APPROVED</b>\n<b>User:</b> ${username}\n<b>Tier:</b> ${safeTier.toUpperCase()}\n<b>Email:</b> ${req_row.email}`);
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
      await pfSendTelegram('5379148910', `🐼 <b>APPROVAL ${next ? 'GRANTED' : 'REVOKED'}</b>\n<b>User:</b> ${u.username}`);
      return res.status(200).json({ ok: true, pf_approved: next });
    }

    if (action === 'set_tier') {
      if (!id || !tier) return res.status(400).json({ error: 'id, tier required' });
      const safeTier = ['starter','pro','elite'].includes(tier) ? tier : 'starter';
      await supabase.from('panda_users').update({ pf_tier: safeTier, feature_access: PF_TIER_FEATURES[safeTier] }).eq('id', id);
      return res.status(200).json({ ok: true, pf_tier: safeTier });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    console.error('pf_approve_err', err);
    return res.status(500).json({ error: err.message || 'server error' });
  }
}
