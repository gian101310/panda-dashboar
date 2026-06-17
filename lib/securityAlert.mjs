export function getSecurityAlertConfig(env = process.env) {
  return {
    token: env.PF_APPROVE_BOT_TOKEN || '',
    chatId: env.PF_ADMIN_CHAT || '',
  };
}
