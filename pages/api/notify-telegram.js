import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

const TELEGRAM_TOKEN  = '8556482762:AAGd6I7M6fFZ84f-8r2O8fyVktRCF3rUosA';
const GROUP_CHAT_ID   = '-1003857801976';

async function sendTelegram(chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  return res.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { symbol, gap, bias, momentum, strength, type = 'spike' } = req.body;
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });

  const biasIcon   = bias === 'BUY' ? '📈' : '📉';
  const momIcon    = momentum === 'STRONG' ? '🔥' : momentum === 'BUILDING' ? '🚀' : '⚡';
  const strLabel   = strength >= 2 ? '🔥 STRONG' : strength >= 1 ? '⚡ MOD' : '· WEAK';
  const time       = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  let text = '';
  if (type === 'spike') {
    text = `${momIcon} <b>MOMENTUM SPIKE</b>\n\n` +
           `${biasIcon} <b>${symbol}</b> — ${bias}\n` +
           `Gap: <b>${gap > 0 ? '+' : ''}${gap}</b>\n` +
           `Momentum: <b>${momentum}</b>\n` +
           `Strength: <b>${strLabel}</b>\n\n` +
           `⏰ ${time}\n` +
           `🐼 PANDA ENGINE`;
  } else if (type === 'threshold') {
    text = `🚨 <b>NEW SIGNAL — ${symbol}</b>\n\n` +
           `${biasIcon} Gap just crossed <b>${bias === 'BUY' ? '+5' : '-5'}</b> threshold!\n` +
           `Current Gap: <b>${gap > 0 ? '+' : ''}${gap}</b>\n\n` +
           `⏰ ${time}\n` +
           `🐼 PANDA ENGINE`;
  }

  const sent = [];

  // 1. Always send to group chat
  const groupOk = await sendTelegram(GROUP_CHAT_ID, text);
  if (groupOk) sent.push('group');

  // 2. Send to subscribed users for this pair
  try {
    const { data: subs } = await supabase
      .from('telegram_subscriptions')
      .select('telegram_chat_id, username')
      .eq('symbol', symbol)
      .eq('is_active', true);

    for (const sub of (subs || [])) {
      if (sub.telegram_chat_id && sub.telegram_chat_id !== GROUP_CHAT_ID) {
        await sendTelegram(sub.telegram_chat_id, text);
        sent.push(sub.username);
      }
    }
  } catch {}

  return res.status(200).json({ ok: true, sent });
}
