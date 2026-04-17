import { supabase } from '../../lib/supabase';
import { hashPassword } from '../../lib/auth';

const PF_BOT_TOKEN  = '8605294552:AAG2o7bF30qkZx0Zv_FgmwA0RgS7g56OH7Y';
const PF_ADMIN_CHAT = '5379148910';
const PF_STARTER_FEATURES = ['signals','calendar','calculator','cot'];

function pfGetIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
}
function pfGenPassword() {
  return 'Panda#' + Math.floor(1000 + Math.random() * 9000);
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
  const { email, username, tier, telegram_username } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'valid email required' });

  const ip = pfGetIp(req);
  const safeTier = ['starter','pro','elite'].includes(tier) ? tier : 'starter';
  const tgUser = (telegram_username || '').replace('@','').trim().toLowerCase();

  try {
    await supabase.from('pf_signup_requests').insert({
      email: email.trim().toLowerCase(),
      username: (username || '').trim() || null,
      tier: safeTier,
      telegram_username: tgUser || null,
      ip,
      status: safeTier === 'starter' ? 'AUTO' : 'PENDING',
    });

    // ── STARTER: auto-approve ──
    if (safeTier === 'starter') {
      const safeUser = ((username || '').trim() || email.split('@')[0]).slice(0,30);
      const password = pfGenPassword();

      const { data: exists } = await supabase.from('panda_users').select('id').eq('username', safeUser).maybeSingle();
      const finalUser = exists ? safeUser + '_' + Math.floor(100 + Math.random() * 900) : safeUser;

      await supabase.from('panda_users').insert({
        username: finalUser,
        password_hash: hashPassword(password),
        role: 'user',
        pf_approved: true,
        pf_tier: 'starter',
        feature_access: PF_STARTER_FEATURES,
        max_devices: 1,
        is_active: true,
      });

      // Store password for Telegram webhook to deliver when user /starts bot
      if (tgUser) {
        await supabase.from('pf_signup_requests')
          .update({ pending_password: password, notes: `auto-approved as ${finalUser}` })
          .eq('telegram_username', tgUser).eq('status', 'AUTO');
      }
      await pfSendTelegram(PF_ADMIN_CHAT, `🐼 <b>NEW STARTER USER</b>\n<b>User:</b> ${finalUser}\n<b>Email:</b> ${email}\n<i>Auto-approved — no action needed.</i>`);
      return res.status(200).json({ ok: true, status: 'APPROVED', auto: true });
    }

    // ── PRO / ELITE: manual approval ──
    const msg = [
      '🐼 <b>PANDA ENGINE — SIGNUP REQUEST</b>',
      '━━━━━━━━━━━━━━━━━━━━━━',
      `<b>Email:</b> ${email}`,
      `<b>Username:</b> ${username || '—'}`,
      `<b>Tier:</b> ${safeTier.toUpperCase()}`,
      `<b>IP:</b> ${ip}`,
      '━━━━━━━━━━━━━━━━━━━━━━',
      '✅ Action: approve in admin panel'
    ].join('\n');
    await pfSendTelegram(PF_ADMIN_CHAT, msg);
    return res.status(200).json({ ok: true, status: 'PENDING' });

  } catch (err) {
    console.error('pf_signup_err', err);
    return res.status(500).json({ error: 'signup failed' });
  }
}
