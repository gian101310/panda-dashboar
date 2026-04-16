import { supabase } from '../../lib/supabase';

function pfGetIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { email, username, tier } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'valid email required' });

  const ip = pfGetIp(req);
  const safeTier = ['starter','pro','elite'].includes(tier) ? tier : 'starter';

  try {
    await supabase.from('pf_signup_requests').insert({
      email: email.trim().toLowerCase(),
      username: (username || '').trim() || null,
      tier: safeTier,
      ip,
      status: 'PENDING',
    });

    // Admin Telegram notification
    try {
      const msg = [
        '🐼 <b>PANDA ENGINE — SIGNUP REQUEST</b>',
        '━━━━━━━━━━━━━━━━━━━━━━',
        `<b>Email:</b> ${email}`,
        `<b>Username:</b> ${username || '—'}`,
        `<b>Tier:</b> ${safeTier.toUpperCase()}`,
        `<b>IP:</b> ${ip}`,
        '━━━━━━━━━━━━━━━━━━━━━━',
        '✅ Action: create account in admin panel'
      ].join('\n');
      await fetch('https://api.telegram.org/bot8605294552:AAG2o7bF30qkZx0Zv_FgmwA0RgS7g56OH7Y/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: '5379148910', text: msg, parse_mode: 'HTML' })
      });
    } catch(e) {}

    return res.status(200).json({ ok: true, status: 'PENDING' });
  } catch (err) {
    console.error('pf_signup_err', err);
    return res.status(500).json({ error: 'signup failed' });
  }
}
