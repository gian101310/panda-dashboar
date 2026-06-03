import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getSignalTelegramConfig,
  isMarketClosedDubai,
  sendTelegram,
} from '../lib/signalTelegram.mjs';

test('getSignalTelegramConfig prefers dedicated signal bot settings', () => {
  const config = getSignalTelegramConfig({
    TELEGRAM_TOKEN: 'main-token',
    TELEGRAM_CHAT_ID: 'main-chat',
    SIGNAL_BOT_TOKEN: 'signal-token',
    SIGNAL_CHAT_ID: 'signal-chat',
  });

  assert.equal(config.token, 'signal-token');
  assert.equal(config.chatId, 'signal-chat');
});

test('isMarketClosedDubai allows the Friday midnight Dubai final cycle', () => {
  assert.equal(isMarketClosedDubai(new Date('2026-05-29T20:00:30.000Z')), false);
  assert.equal(isMarketClosedDubai(new Date('2026-05-29T20:01:00.000Z')), true);
  assert.equal(isMarketClosedDubai(new Date('2026-05-31T21:59:00.000Z')), true);
  assert.equal(isMarketClosedDubai(new Date('2026-05-31T22:00:00.000Z')), false);
});

test('sendTelegram posts to the configured signal bot and chat', async () => {
  const calls = [];

  const ok = await sendTelegram({
    token: 'signal-token',
    chatId: 'signal-chat',
    text: '<b>MOMENTUM SPIKE</b>',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true };
    },
  });

  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.telegram.org/botsignal-token/sendMessage');
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.chat_id, 'signal-chat');
  assert.equal(payload.parse_mode, 'HTML');
  assert.match(payload.text, /MOMENTUM SPIKE/);
});
