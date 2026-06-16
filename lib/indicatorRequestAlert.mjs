import { getIndicatorProduct } from './indicatorProducts.mjs';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function getIndicatorRequestAlertConfig(env = process.env) {
  return {
    token: env.LOGIN_ALERT_BOT_TOKEN || env.PF_BOT_TOKEN || '',
    chatId: env.LOGIN_ALERT_CHAT_ID || env.PF_ADMIN_CHAT || '',
  };
}

export function buildIndicatorRequestAlertMessage({ request, time = new Date() }) {
  const product = getIndicatorProduct(request?.product_code);
  const dubaiTime = new Date(time.getTime() + 4 * 60 * 60 * 1000);
  const ts = dubaiTime.toISOString().replace('T', ' ').slice(0, 19);

  return [
    '<b>PANDA ENGINE - Indicator Request</b>',
    '------------------------------',
    `<b>Name:</b> ${escapeHtml(request?.customer_name)}`,
    `<b>Contact:</b> ${escapeHtml(request?.contact)}`,
    `<b>Telegram:</b> ${request?.telegram_username ? '@' + escapeHtml(request.telegram_username) : '—'}`,
    `<b>MT4 Account:</b> ${escapeHtml(request?.mt4_account_id)}`,
    `<b>Indicator:</b> ${escapeHtml(product?.name || request?.product_code)}`,
    `<b>Status:</b> ${escapeHtml(request?.status || 'PENDING')}`,
    `<b>Time:</b> ${ts} (Dubai)`,
    '------------------------------',
    '<a href="https://pandaengine.app/admin/license">Open License Admin</a>',
  ].join('\n');
}

export async function sendIndicatorRequestAlert({
  request,
  token,
  chatId,
  fetchImpl = fetch,
}) {
  if (!token || !chatId) return { ok: false, status: 0, body: 'Telegram config missing' };

  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: buildIndicatorRequestAlertMessage({ request }),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const body = await response.text();

  if (!response.ok) return { ok: false, status: response.status, body };
  return { ok: true, status: response.status, body };
}
