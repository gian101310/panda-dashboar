import { supabase } from '../../lib/supabase';

const PF_BOT_TOKEN = '8605294552:AAG2o7bF30qkZx0Zv_FgmwA0RgS7g56OH7Y';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const message = req.body?.message || req.body?.edited_message;
    if (!message) return res.status(200).json({ ok: true });

    const chatId = String(message.chat?.id || '');
    const text   = (message.text || '').trim();
    const tgUser = (message.from?.username || '').toLowerCase();

    if (text.startsWith('/start') && chatId) {
      if (tgUser) {
        await supabase.from('pf_telegram_chats').upsert(
          { telegram_username: tgUser, chat_id: chatId },
          { onConflict: 'telegram_username' }
        );
      }
      const welcome = [
        '🐼 <b>PANDA ENGINE</b>',
        '━━━━━━━━━━━━━━━━━━━━━━',
        "You're registered to receive credentials automatically.",
        '',
        '👉 <a href="https://panda-dashboard.vercel.app/pricing">Request Access Here</a>',
        '',
        '🐼 See you inside.',
      ].join('\n');
      await fetch(`https://api.telegram.org/bot${PF_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: welcome, parse_mode: 'HTML', disable_web_page_preview: true })
      });
    }
  } catch (e) {
    console.error('[TG WEBHOOK]', e);
  }
  return res.status(200).json({ ok: true });
}
