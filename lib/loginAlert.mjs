const DEFAULT_BOT_TOKEN = '8605294552:AAG2o7bF30qkZx0Zv_FgmwA0RgS7g56OH7Y';
const DEFAULT_CHAT_ID = '5379148910';

export function getLoginAlertConfig(env = process.env) {
  return {
    token: env.LOGIN_ALERT_BOT_TOKEN || env.PF_BOT_TOKEN || DEFAULT_BOT_TOKEN,
    chatId: env.LOGIN_ALERT_CHAT_ID || env.PF_ADMIN_CHAT || DEFAULT_CHAT_ID,
  };
}

export function buildLoginAlertMessage({ username, role, ip, time = new Date() }) {
  const dubaiTime = new Date(time.getTime() + 4 * 60 * 60 * 1000);
  const ts = dubaiTime.toISOString().replace('T', ' ').slice(0, 19);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = days[dubaiTime.getUTCDay()];

  return [
    '\u{1F43C} <b>PANDA ENGINE - Login Alert</b>',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `\u{1F464} <b>User:</b> ${username || 'unknown'}`,
    `\u{1F3F7} <b>Role:</b> ${role || 'unknown'}`,
    `\u{1F550} <b>Time:</b> ${ts} (Dubai)`,
    `\u{1F4C5} <b>Day:</b> ${dayName}`,
    `\u{1F310} <b>IP:</b> ${ip || 'unknown'}`,
    '━━━━━━━━━━━━━━━━━━━━━━',
    '\u{1F310} <a href="https://pandaengine.app/dashboard">Open Dashboard</a>',
  ].join('\n');
}

export async function sendLoginAlert({
  username,
  role,
  ip,
  token,
  chatId,
  time,
  fetchImpl = fetch,
}) {
  const message = buildLoginAlertMessage({ username, role, ip, time });
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const body = await response.text();

  if (!response.ok) {
    return { ok: false, status: response.status, body };
  }

  return { ok: true, status: response.status, body };
}
