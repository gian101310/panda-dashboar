import { supabase } from '../../lib/supabase';

const PF_BOT_TOKEN = '8605294552:AAG2o7bF30qkZx0Zv_FgmwA0RgS7g56OH7Y';

async function pfBotSend(chatId, text) {
  await fetch(`https://api.telegram.org/bot${PF_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const message = req.body?.message || req.body?.edited_message;
    if (!message) return res.status(200).json({ ok: true });

    const chatId = String(message.chat?.id || '');
    const text   = (message.text || '').trim();
    const tgUser = (message.from?.username || '').toLowerCase();

    if (text.startsWith('/start') && chatId && tgUser) {
      // Save chat_id
      await supabase.from('pf_telegram_chats').upsert(
        { telegram_username: tgUser, chat_id: chatId },
        { onConflict: 'telegram_username' }
      );

      // Check if they have pending credentials to deliver
      const { data: pending } = await supabase.from('pf_signup_requests')
        .select('pending_password, username, notes')
        .ilike('telegram_username', tgUser)
        .not('pending_password', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pending?.pending_password) {
        // Extract username from notes or use stored username
        const approvedUser = (pending.notes || '').replace('auto-approved as ', '') || pending.username || 'check admin';
        const dm = [
          '✅ <b>PANDA ENGINE — ACCESS APPROVED</b>',
          '━━━━━━━━━━━━━━━━━━━━━━',
          `<b>Username:</b> ${approvedUser}`,
          `<b>Password:</b> ${pending.pending_password}`,
          `<b>Tier:</b> STARTER`,
          '━━━━━━━━━━━━━━━━━━━━━━',
          '🔗 <a href="https://panda-dashboard.vercel.app/login">Login Now</a>',
          '🐼 Welcome to the system.',
        ].join('\n');
        await pfBotSend(chatId, dm);

        // Clear pending_password so it doesn't send again
        await supabase.from('pf_signup_requests')
          .update({ pending_password: null })
          .ilike('telegram_username', tgUser);
      } else {
        // No pending account — just welcome them
        const welcome = [
          '🐼 <b>PANDA ENGINE</b>',
          '━━━━━━━━━━━━━━━━━━━━━━',
          "You're registered to receive credentials automatically.",
          '',
          '👉 <a href="https://panda-dashboard.vercel.app/pricing">Request Access Here</a>',
          '',
          '🐼 See you inside.',
        ].join('\n');
        await pfBotSend(chatId, welcome);
      }
    }
  } catch (e) {
    console.error('[TG WEBHOOK]', e);
  }
  return res.status(200).json({ ok: true });
}
