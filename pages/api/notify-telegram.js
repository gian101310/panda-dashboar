import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';
import {
  buildSignalAlertText,
  getSignalTelegramConfig,
  isMarketClosedDubai,
  sendTelegram,
} from '../../lib/signalTelegram.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { symbol, gap, bias, momentum, strength, type = 'spike' } = req.body;
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });

  if (isMarketClosedDubai()) {
    return res.status(200).json({ ok: true, skipped: 'market_closed', sent: [] });
  }

  // Global kill switch
  const { data: globalToggle } = await supabase
    .from('engine_config')
    .select('value')
    .eq('key', 'telegram_notifications_enabled')
    .single();

  if (globalToggle?.value === 'false') {
    return res.status(200).json({ ok: true, skipped: 'notifications_disabled', sent: [] });
  }

  const text = buildSignalAlertText({ symbol, gap, bias, momentum, strength, type });
  if (!text) return res.status(400).json({ error: 'Unsupported alert type' });

  const signalConfig = getSignalTelegramConfig();
  if (!signalConfig.token || !signalConfig.chatId) {
    return res.status(500).json({ error: 'Signal Telegram config missing' });
  }

  const sent = [];

  const signalOk = await sendTelegram({ ...signalConfig, text });
  if (signalOk) sent.push('signals_bot');

  try {
    const { data: subs } = await supabase
      .from('telegram_subscriptions')
      .select('telegram_chat_id, username')
      .eq('symbol', symbol)
      .eq('is_active', true);

    for (const sub of (subs || [])) {
      if (sub.telegram_chat_id && sub.telegram_chat_id !== signalConfig.chatId) {
        await sendTelegram({ token: signalConfig.token, chatId: sub.telegram_chat_id, text });
        sent.push(sub.username);
      }
    }
  } catch {}

  return res.status(200).json({ ok: true, sent });
}
