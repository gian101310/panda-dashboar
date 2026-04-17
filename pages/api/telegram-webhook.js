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
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  try {
    const message = req.body?.message;
    if (!message) return res.status(200).json({ ok: true });

    const chatId = String(message.chat?.id || '');
    const text   = (message.text || '').trim();

    if (!text.startsWith('/start') || !chatId) {
      return res.status(200).json({ ok: true });
    }

    // Extract token from "/start abc123"
    const token = text.replace('/start', '').trim();

    if (token) {
      // Deep link — look up credentials by token
      const { data: row } = await supabase.from('pf_signup_requests')
        .select('pending_password, username, notes, status')
        .eq('token', token)
        .maybeSingle();

      if (row?.pending_password) {
        const user = (row.notes || '').replace('auto-approved as ', '') || row.username || 'check admin';
        const tier = row.status === 'AUTO' ? 'STARTER' : 'APPROVED';
        const dm = [
          '✅ <b>PANDA ENGINE — ACCESS APPROVED</b>',
          '━━━━━━━━━━━━━━━━━━━━━━',
          `<b>Username:</b> ${row.username}`,
          `<b>Password:</b> ${row.pending_password}`,
          `<b>Tier:</b> ${tier}`,
          '━━━━━━━━━━━━━━━━━━━━━━',
          '🔗 <a href="https://panda-dashboard.vercel.app/login">Login Now</a>',
          '🐼 Welcome to the system.',
        ].join('\n');
        await pfBotSend(chatId, dm);
        // Clear so it can't be retrieved again
        await supabase.from('pf_signup_requests')
          .update({ pending_password: null })
          .eq('token', token);
      } else if (row) {
        // Pro/Elite — not approved yet. Save chat_id so we can DM when approved.
        await supabase.from('pf_telegram_chats').upsert(
          { telegram_username: 'token_' + token, chat_id: chatId },
          { onConflict: 'telegram_username' }
        );
        await pfBotSend(chatId, '🐼 Your account is pending approval. You will receive your credentials here automatically once approved.');
      } else {
        await pfBotSend(chatId, '🐼 Invalid link. Visit panda-dashboard.vercel.app/pricing to sign up.');
      }
    } else {
      // Plain /start with no token
      const welcome = [
        '🐼 <b>PANDA ENGINE</b>',
        '━━━━━━━━━━━━━━━━━━━━━━',
        '👉 <a href="https://panda-dashboard.vercel.app/pricing">Request Access Here</a>',
        '🐼 See you inside.',
      ].join('\n');
      await pfBotSend(chatId, welcome);
    }
  } catch (e) {
    console.error('[TG WEBHOOK]', e);
  }
  return res.status(200).json({ ok: true });
}
