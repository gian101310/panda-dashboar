import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getSecurityAlertConfig } from '../lib/securityAlert.mjs';

test('getSecurityAlertConfig uses approved-user bot config', () => {
  const config = getSecurityAlertConfig({
    PF_APPROVE_BOT_TOKEN: 'approve-bot-token',
    PF_BOT_TOKEN: 'signup-bot-token',
    PF_ADMIN_CHAT: 'admin-chat-id',
  });

  assert.deepEqual(config, { token: 'approve-bot-token', chatId: 'admin-chat-id' });
});

test('getSecurityAlertConfig does not fall back to signup bot token', () => {
  const config = getSecurityAlertConfig({
    PF_BOT_TOKEN: 'signup-bot-token',
    PF_ADMIN_CHAT: 'signup-chat-id',
  });

  assert.deepEqual(config, { token: '', chatId: 'signup-chat-id' });
});
