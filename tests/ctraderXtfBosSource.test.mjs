import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve('panda-indicators/2026-07-18/ctrader-panda-xtf-bos');
const source = fs.readFileSync(path.join(root, 'PandaXtfBos.Personal.cs'), 'utf8');

test('cTrader XTF BOS port is a sandboxed informational indicator', () => {
  assert.match(source, /Indicator\([^)]*IsOverlay\s*=\s*true[^)]*AccessRights\s*=\s*AccessRights\.None/si);
  assert.doesNotMatch(source, /ExecuteMarketOrder|PlaceLimitOrder|PlaceStopOrder|ClosePosition|ModifyPosition/);
  assert.doesNotMatch(source, /HttpRequest|http:|https:|pandaengine\.app|x-panda-operator-token|account-number|Supabase|ENGINE_SECRET/i);
});

test('cTrader XTF BOS port keeps the TradingView scoring contract', () => {
  assert.match(source, /PandaGapThreshold\s*=\s*5/);
  assert.match(source, /PandaSignificant\s*=\s*4/);
  for (const pair of ['AUDCAD', 'EURUSD', 'GBPJPY', 'USDJPY']) assert.ok(source.includes(`"${pair}"`), `missing pair ${pair}`);
  assert.doesNotMatch(source, /CHF/);
  assert.match(source, /Strongest\(int d1, int h4, int h1\)/);
  assert.match(source, /Conflicted\(int d1, int h4, int h1\)/);
  assert.match(source, /HARD_INVALID/);
});

test('cTrader XTF BOS port renders the TradingView panel rows and gates', () => {
  for (const label of ['BIAS', 'GAP', 'BASE XTF', 'QUOTE XTF', 'XTF BOX', 'OTHER BOX', 'SIGNAL', 'BOX H1', 'BOX H4', 'PANDA LINES', 'FLIP', 'BOS'])
    assert.ok(source.includes(`"${label}"`), `missing panel row ${label}`);
  assert.match(source, /BUY READY — WAIT BULLISH BOS/);
  assert.match(source, /SELL READY — WAIT BEARISH BOS/);
  assert.match(source, /CurrencyExtremes\(string currency, int d1, int h4, int h1\)/);
  assert.match(source, /SuperTrendPeriod\s*=\s*10/);
  assert.match(source, /SuperTrendFactor\s*=\s*3\.0/);
  assert.match(source, /BbPeriod\s*=\s*21/);
  assert.match(source, /FollowAtrPeriod\s*=\s*5/);
});

test('cTrader XTF BOS local storage keys satisfy cTrader restrictions', () => {
  const keys = [...source.matchAll(/LocalStorage\.(?:GetString|SetString)\("([^"]+)"/g)].map((match) => match[1]);
  assert.ok(keys.length > 0, 'expected persisted panel settings');
  for (const key of keys) assert.match(key, /^[A-Za-z0-9](?:[A-Za-z0-9 ]*[A-Za-z0-9])?$/, `invalid LocalStorage key: ${key}`);
});
