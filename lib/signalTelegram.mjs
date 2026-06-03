const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;

export function getSignalTelegramConfig(env = process.env) {
  return {
    token: env.SIGNAL_BOT_TOKEN || env.TELEGRAM_TOKEN || '',
    chatId: env.SIGNAL_CHAT_ID || env.TELEGRAM_CHAT_ID || '',
  };
}

export function isMarketClosedDubai(now = new Date()) {
  const dubai = new Date(now.getTime() + DUBAI_OFFSET_MS);
  const day = dubai.getUTCDay(); // 0=Sun, 1=Mon, 6=Sat after Dubai shift
  const hour = dubai.getUTCHours();
  const minute = dubai.getUTCMinutes();

  if (day === 6) return hour > 0 || minute > 0;
  if (day === 0) return true;
  if (day === 1 && hour < 2) return true;
  return false;
}

export async function sendTelegram({ token, chatId, text, fetchImpl = fetch }) {
  if (!token || !chatId || !text) return false;

  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  return res.ok;
}

export function buildSignalAlertText({ symbol, gap, bias, momentum, strength, type = 'spike' }, now = new Date()) {
  const biasIcon = bias === 'BUY' ? '📈' : '📉';
  const momIcon = momentum === 'STRONG' ? '🔥' : momentum === 'BUILDING' ? '🚀' : '⚡';
  const strLabel = strength >= 2 ? '🔥 STRONG' : strength >= 1 ? '⚡ MOD' : '· WEAK';
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  if (type === 'spike') {
    return `${momIcon} <b>MOMENTUM SPIKE</b>\n\n` +
      `${biasIcon} <b>${symbol}</b> — ${bias}\n` +
      `Gap: <b>${gap > 0 ? '+' : ''}${gap}</b>\n` +
      `Momentum: <b>${momentum}</b>\n` +
      `Strength: <b>${strLabel}</b>\n\n` +
      `⏰ ${time}\n` +
      `🐼 PANDA ENGINE`;
  }

  if (type === 'threshold') {
    return `🚨 <b>NEW SIGNAL — ${symbol}</b>\n\n` +
      `${biasIcon} Gap just crossed <b>${bias === 'BUY' ? '+5' : '-5'}</b> threshold!\n` +
      `Current Gap: <b>${gap > 0 ? '+' : ''}${gap}</b>\n\n` +
      `⏰ ${time}\n` +
      `🐼 PANDA ENGINE`;
  }

  return '';
}
