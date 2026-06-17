export function getSecurityAlertConfig(env = process.env) {
  return {
    token: env.LOGIN_ALERT_BOT_TOKEN || '',
    chatId: env.LOGIN_ALERT_CHAT_ID || '',
  };
}
