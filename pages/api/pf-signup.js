import { supabase } from '../../lib/supabase';
import { hashPassword } from '../../lib/auth';
import crypto from 'crypto';

const PF_BOT_TOKEN  = '8605294552:AAG2o7bF30qkZx0Zv_FgmwA0RgS7g56OH7Y';
const PF_ADMIN_CHAT = '5379148910';
const PF_STARTER_FEATURES = ['signals','calendar','calculator','cot'];

function pfGetIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
}
function pfGenPassword() {
  return 'Panda#' + Math.floor(1000 + Math.random() * 9000);
}
function pfGenToken() {
  return crypto.randomBytes(16).toString('hex');
}
async function pfSendTelegram(chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${PF_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
  } catch {}
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { email, username, tier } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

  const ip = pfGetIp(req);
  const safeTier = ['starter','pro','elite'].includes(tier) ? tier : 'starter';
  const safeUser = (username || '').trim();

  // Username required
  if (!safeUser) return res.status(400).json({ error: 'Username is required' });

  // Check duplicate username
  const { data: exists } = await supabase.from('panda_users')
    .select('id').eq('username', safeUser).maybeSingle();
  if (exists) return res.status(409).json({ error: 'Username already taken. Please choose another.' });

  const token = pfGenToken();

  try {
    // ── STARTER: auto-approve ──
    if (safeTier === 'starter') {
      const password = pfGenPassword();

      await supabase.from('panda_users').insert({
        username: safeUser,
        password_hash: hashPassword(password),
        role: 'user',
        pf_approved: true,
        pf_tier: 'starter',
        feature_access: PF_STARTER_FEATURES,
        max_devices: 1,
        is_active: true,
      });

      await supabase.from('pf_signup_requests').insert({
        email: email.trim().toLowerCase(),
        username: safeUser,
        tier: 'starter',
        token,
        pending_password: password,
        ip,
        status: 'AUTO',
      });

      await pfSendTelegram(PF_ADMIN_CHAT,
        `🐼 <b>NEW STARTER USER</b>\n<b>User:</b> ${safeUser}\n<b>Email:</b> ${email}\n<i>Auto-approved — no action needed.</i>`
      );
      return res.status(200).json({ ok: true, status: 'APPROVED', auto: true, token });
    }

    // ── PRO / ELITE: manual approval ──
    await supabase.from('pf_signup_requests').insert({
      email: email.trim().toLowerCase(),
      username: safeUser,
      tier: safeTier,
      token,
      ip,
      status: 'PENDING',
    });

    await pfSendTelegram(PF_ADMIN_CHAT, [
      '🐼 <b>PANDA ENGINE — SIGNUP REQUEST</b>',
      '━━━━━━━━━━━━━━━━━━━━━━',
      `<b>Email:</b> ${email}`,
      `<b>Username:</b> ${safeUser}`,
      `<b>Tier:</b> ${safeTier.toUpperCase()}`,
      `<b>IP:</b> ${ip}`,
      '━━━━━━━━━━━━━━━━━━━━━━',
      '✅ Action: approve in admin panel'
    ].join('\n'));
    return res.status(200).json({ ok: true, status: 'PENDING', token });

  } catch (err) {
    console.error('pf_signup_err', err);
    return res.status(500).json({ error: 'Signup failed' });
  }
}
