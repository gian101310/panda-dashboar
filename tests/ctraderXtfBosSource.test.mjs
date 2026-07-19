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
  for (const label of ['BIAS', 'GAP', 'BASE XTF', 'QUOTE XTF', 'XTF BOX H1', 'XTF BOX H4', 'OTHER BOX', 'SIGNAL', 'BOX H1', 'BOX H4', 'PANDA LINES', 'FLIP', 'BOS'])
    assert.ok(source.includes(`"${label}"`), `missing panel row ${label}`);
  assert.match(source, /StrongestExtremeLabel\(string currency, int d1, int h4, int h1\)/);
  assert.match(source, /BUY READY — WAIT BULLISH BOS/);
  assert.match(source, /SELL READY — WAIT BEARISH BOS/);
  assert.match(source, /CurrencyExtremes\(string currency, int d1, int h4, int h1\)/);
  assert.match(source, /\[Parameter\("SuperTrend period", DefaultValue = 10/);
  assert.match(source, /\[Parameter\("SuperTrend multiplier", DefaultValue = 3\.0/);
  assert.match(source, /\[Parameter\("Follow BB period", DefaultValue = 21/);
  assert.match(source, /\[Parameter\("Follow ATR period", DefaultValue = 5/);
});

test('cTrader XTF BOS exposes the legacy Panda Lines controls and previous levels', () => {
  for (const parameter of [
    'Show SuperTrend', 'SuperTrend use ATR', 'Show Follow Line', 'Follow use ATR',
    'Show previous day high / low', 'Show previous week high / low',
    'Show previous month high / low', 'Show previous year high / low',
    'Previous-level zone width (%)'
  ]) assert.ok(source.includes(`"${parameter}"`), `missing ${parameter} control`);

  for (const prefix of ['PD', 'PW', 'PM'])
    assert.match(source, new RegExp(`DrawPreviousRange\\(\\"${prefix}\\"`));
  for (const label of ['PYH', 'PYL'])
    assert.ok(source.includes(`"${label}"`), `missing ${label} previous-period level`);
  assert.match(source, /Chart\.DrawTrendLine\(prefix \+ "\.Line"/);
  assert.match(source, /line\.LineStyle = LineStyle\.Dots/);
});

test('cTrader XTF BOS renders Panda Lines with the proven legacy cTrader calculation', () => {
  for (const output of [
    'Panda SuperTrend Up',
    'Panda SuperTrend Down',
    'Panda Follow Line Up',
    'Panda Follow Line Down'
  ]) {
    assert.match(source, new RegExp(`\\[Output\\("${output}",[^\\]]*PlotType\\s*=\\s*PlotType\\.DiscontinuousLine`, 's'));
  }

  assert.match(source, /private IndicatorDataSeries _followTrend;/);
  assert.match(source, /var previousTrend = i > 0 && !double\.IsNaN\(_stTrend\[i - 1\]\) \? _stTrend\[i - 1\] : 1\.0;/);
  assert.match(source, /previousTrend == -1\.0 && previousClose > previousUpper/);
  assert.match(source, /previousTrend == 1\.0 && previousClose < previousLower/);
  assert.match(source, /SuperTrendUp\[i - 1\] = _st\[i - 1\];/);
  assert.match(source, /FollowLineUp\[i - 1\] = _follow\[i - 1\];/);
  assert.doesNotMatch(source, /_atr\[i\] = \(_atr\[i - 1\] \* \(SuperTrendPeriod - 1\) \+ _tr\[i\]\) \/ SuperTrendPeriod;/);
});

test('cTrader XTF BOS local storage keys satisfy cTrader restrictions', () => {
  const keys = [...source.matchAll(/LocalStorage\.(?:GetString|SetString)\("([^"]+)"/g)].map((match) => match[1]);
  assert.ok(keys.length > 0, 'expected persisted panel settings');
  for (const key of keys) assert.match(key, /^[A-Za-z0-9](?:[A-Za-z0-9 ]*[A-Za-z0-9])?$/, `invalid LocalStorage key: ${key}`);
});
