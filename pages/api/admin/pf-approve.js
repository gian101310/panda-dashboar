import { supabase } from '../../../lib/supabase';
import { validateSession, hashPassword } from '../../../lib/auth';
import crypto from 'crypto';

const PF_BOT_TOKEN = process.env.PF_BOT_TOKEN || '';
const PF_APPROVE_BOT_TOKEN = process.env.PF_APPROVE_BOT_TOKEN || PF_BOT_TOKEN;
const PF_ADMIN_CHAT = process.env.PF_ADMIN_CHAT || '';

const PF_PAYMENT_LINKS = {
  pro:            'https://pay.ziina.com/pandaengine/-N_F9jwMf?source=app',  // AED 49/mo
  elite:          'https://pay.ziina.com/pandaengine/_pOykTgTs?source=app',  // AED 99/mo
  pro_lifetime:   'https://pay.ziina.com/pandaengine/gZMGfgrNt?source=app',  // AED 499
  elite_lifetime: 'https://pay.ziina.com/pandaengine/7R5dOWfTe?source=app',  // AED 999
};

function pfGenPassword() { return 'Panda#' + crypto.randomBytes(4).toString('hex'); }

// Live pricing from admin panel — falls back to PF_PAYMENT_LINKS if DB read fails
async function getTierPricing(tierKey) {
  try {
    const { data } = await supabase.from('pricing_tiers')
      .select('currency, price_monthly, pay_link_monthly')
      .eq('tier_key', tierKey).maybeSingle();
    return data || null;
  } catch { return null; }
}
function fmtPrice(tp, tierKey) {
  if (tp && tp.price_monthly != null) {
    const sym = tp.currency === 'USD' ? '$' : (tp.currency || '') + ' ';
    return `${sym}${tp.price_monthly}/mo`;
  }
  return tierKey === 'elite' ? '$27/mo' : '$13/mo';
}

// Send via old bot (@panda_engine_alerts_bot) for approved/existing users
async function pfSendApproveBot(chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${PF_APPROVE_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
  } catch {}
}

// Send via new signup bot for admin notifications
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
  starter: ['signals','calculator'],
  pro:     ['signals','calculator','panels','table','setups','panda_ai','calendar','cot'],
  elite:   ['signals','calculator','panels','table','setups','panda_ai','calendar','cot','overview','signal_log','valid_pairs','alerts','spike_log','journal','chart','gap_chart','analytics','heatmap','mt4_indicators','bias_indicators']
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

      // Store password for deep link retrieval
      await supabase.from('pf_signup_requests').update({
        status: 'APPROVED',
        notes: `approved as ${username}`,
        pending_password: password,
      }).eq('id', id);

      // Auto-send credentials via Telegram if user has a chat_id
      if (req_row.telegram_chat_id) {
        const dm = [
          '✅ <b>PANDA ENGINE — ACCESS APPROVED</b>',
          '━━━━━━━━━━━━━━━━━━━━━━',
          `<b>Username:</b> ${username.trim()}`,
          `<b>Password:</b> ${password}`,
          `<b>Tier:</b> ${safeTier.toUpperCase()}`,
          '━━━━━━━━━━━━━━━━━━━━━━',
          `🔗 <a href="https://pandaengine.app/login">Login Now</a>`,
          '',
          '⚠️ Save this message — your password won\'t be shown again.',
        ].join('\n');
        await pfSendApproveBot(req_row.telegram_chat_id, dm);
        await supabase.from('pf_signup_requests').update({ pending_password: null }).eq('id', id);
      }

      // Notify admin
      await pfSendApproveBot(PF_ADMIN_CHAT, `🐼 <b>USER APPROVED</b>\n<b>User:</b> ${username}\n<b>Tier:</b> ${safeTier.toUpperCase()}\n<b>Email:</b> ${req_row.email}`);
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
      await pfSendApproveBot(PF_ADMIN_CHAT, `🐼 <b>APPROVAL ${next ? 'GRANTED' : 'REVOKED'}</b>\n<b>User:</b> ${u.username}`);
      return res.status(200).json({ ok: true, pf_approved: next });
    }

    if (action === 'set_tier') {
      if (!id || !tier) return res.status(400).json({ error: 'id, tier required' });
      const safeTier = ['starter','pro','elite'].includes(tier) ? tier : 'starter';
      await supabase.from('panda_users').update({ pf_tier: safeTier, feature_access: PF_TIER_FEATURES[safeTier] }).eq('id', id);
      return res.status(200).json({ ok: true, pf_tier: safeTier });
    }

    if (action === 'send_payment_link') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data: req_row } = await supabase.from('pf_signup_requests')
        .select('telegram_chat_id, tier, username, email').eq('id', id).single();
      if (!req_row) return res.status(404).json({ error: 'signup not found' });
      if (!req_row.telegram_chat_id) return res.status(400).json({ error: 'User has not connected Telegram yet' });
      const t = req_row.tier || 'pro';
      const tp = await getTierPricing(t);
      const payLink = tp?.pay_link_monthly || PF_PAYMENT_LINKS[t] || PF_PAYMENT_LINKS.pro;
      const price = fmtPrice(tp, t);
      const dm = [
        '🐼 <b>PANDA ENGINE — PAYMENT REMINDER</b>',
        '━━━━━━━━━━━━━━━━━━━━━━',
        `<b>Plan:</b> ${t.toUpperCase()} (${price})`,
        `<b>Username:</b> ${req_row.username}`,
        '',
        '💳 Complete your payment below:',
        `<a href="${payLink}">${payLink}</a>`,
        '',
        'Once paid, your account will be activated and credentials sent here automatically.',
        '━━━━━━━━━━━━━━━━━━━━━━',
      ].join('\n');
      await pfSendApproveBot(req_row.telegram_chat_id, dm);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    console.error('pf_approve_err', err);
    return res.status(500).json({ error: err.message || 'server error' });
  }
}
