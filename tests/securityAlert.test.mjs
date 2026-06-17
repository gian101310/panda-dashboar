import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getSecurityAlertConfig } from '../lib/securityAlert.mjs';

test('getSecurityAlertConfig uses dedicated login alert bot config', () => {
  const config = getSecurityAlertConfig({
    LOGIN_ALERT_BOT_TOKEN: 'alert-bot-token',
    LOGIN_ALERT_CHAT_ID: 'alert-chat-id',
    PF_BOT_TOKEN: 'signup-bot-token',
    PF_ADMIN_CHAT: 'signup-chat-id',
  });

  assert.deepEqual(config, { token: 'alert-bot-token', chatId: 'alert-chat-id' });
});

test('getSecurityAlertConfig does not fall back to signup bot config', () => {
  const config = getSecurityAlertConfig({
    PF_BOT_TOKEN: 'signup-bot-token',
    PF_ADMIN_CHAT: 'signup-chat-id',
  });

  assert.deepEqual(config, { token: '', chatId: '' });
});
