import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildLoginAlertMessage, getLoginAlertConfig, sendLoginAlert } from '../lib/loginAlert.mjs';

test('getLoginAlertConfig does not fall back to signup bot config', () => {
  const config = getLoginAlertConfig({
    PF_BOT_TOKEN: 'signup-bot-token',
    PF_ADMIN_CHAT: 'signup-chat-id',
  });

  assert.deepEqual(config, { token: '', chatId: '' });
});

test('getLoginAlertConfig uses dedicated login alert config', () => {
  const config = getLoginAlertConfig({
    LOGIN_ALERT_BOT_TOKEN: 'alert-bot-token',
    LOGIN_ALERT_CHAT_ID: 'alert-chat-id',
    PF_BOT_TOKEN: 'signup-bot-token',
    PF_ADMIN_CHAT: 'signup-chat-id',
  });

  assert.deepEqual(config, { token: 'alert-bot-token', chatId: 'alert-chat-id' });
});

test('buildLoginAlertMessage includes dashboard login context', () => {
  const message = buildLoginAlertMessage({
    username: 'test_user',
    role: 'admin',
    ip: '1.2.3.4',
    time: new Date('2026-05-27T10:15:30.000Z'),
  });

  assert.match(message, /PANDA ENGINE/);
  assert.match(message, /Login Alert/);
  assert.match(message, /test_user/);
  assert.match(message, /admin/);
  assert.match(message, /1\.2\.3\.4/);
  assert.match(message, /2026-05-27 14:15:30 \(Dubai\)/);
});

test('sendLoginAlert posts to Telegram and reports success', async () => {
  const calls = [];
  const result = await sendLoginAlert({
    username: 'test_user',
    role: 'user',
    ip: '5.6.7.8',
    token: 'bot-token',
    chatId: 'chat-id',
    time: new Date('2026-05-27T10:15:30.000Z'),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, text: async () => '{"ok":true}' };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.telegram.org/botbot-token/sendMessage');
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.chat_id, 'chat-id');
  assert.equal(payload.parse_mode, 'HTML');
  assert.match(payload.text, /test_user/);
});

test('sendLoginAlert returns Telegram error details when rejected', async () => {
  const result = await sendLoginAlert({
    username: 'test_user',
    role: 'user',
    ip: '',
    token: 'bot-token',
    chatId: 'chat-id',
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      text: async () => '{"ok":false,"description":"Bad Request"}',
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.body, /Bad Request/);
});
