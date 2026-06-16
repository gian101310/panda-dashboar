import { supabase } from '../../lib/supabase';

const PF_BOT_TOKEN  = process.env.PF_BOT_TOKEN || '';
const PF_ADMIN_CHAT = process.env.PF_ADMIN_CHAT || '';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { email } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

  const safe = email.trim().toLowerCase();

  const { error } = await supabase.from('pf_waitlist').upsert(
    { email: safe },
    { onConflict: 'email', ignoreDuplicates: true }
  );
  if (error) return res.status(500).json({ error: 'Failed to save' });

  // Notify admin
  try {
    await fetch(`https://api.telegram.org/bot${PF_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: PF_ADMIN_CHAT, text: `📋 <b>WAITLIST SIGNUP</b>\n<b>Email:</b> ${safe}`, parse_mode: 'HTML' })
    });
  } catch {}

  return res.status(200).json({ ok: true });
}
