import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve('panda-indicators/2026-07-14/mt4-mt5-dashboard-overlay');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('MT4 Personal and Licensed editions have fixed credential boundaries', () => {
  const personal = read('mt4', 'PandaDashboardOverlayMT4-Personal.mq4');
  const licensed = read('mt4', 'PandaDashboardOverlayMT4-Licensed.mq4');

  assert.match(personal, /input string OperatorToken/);
  assert.match(personal, /x-panda-operator-token/);
  assert.doesNotMatch(personal, /AccountNumber\s*\(/);
  assert.match(licensed, /AccountNumber\s*\(\s*\)/);
  assert.match(licensed, /x-panda-account-number/);
  assert.doesNotMatch(licensed, /OperatorToken/);
  for (const source of [personal, licensed]) {
    assert.match(source, /#property indicator_chart_window/);
    assert.match(source, /EventSetTimer\s*\(\s*1\s*\)/);
    assert.match(source, /EventKillTimer\s*\(\s*\)/);
    assert.doesNotMatch(source, /OrderSend|OrderClose|OrderModify/);
  }
});

test('MT4 shared core is throttled, cached, movable, and informational', () => {
  const core = read('mt4', 'PandaDashboardOverlayMT4.Core.mqh');

  assert.match(core, /https:\/\/pandaengine\.app\/api\/mt4-overlay/);
  assert.match(core, /PANDA_REFRESH_SECONDS\s*=\s*60/);
  assert.match(core, /PANDA_LOCK_TIMEOUT_SECONDS\s*=\s*15/);
  assert.match(core, /FILE_COMMON/);
  assert.match(core, /GlobalVariableSetOnCondition/);
  assert.match(core, /CHARTEVENT_OBJECT_DRAG/);
  assert.match(core, /CHARTEVENT_OBJECT_CLICK/);
  assert.match(core, /CORNER_LEFT_UPPER/);
  assert.match(core, /MQL_PROGRAM_TYPE/);
  assert.match(core, /PANDA_PANEL_CORNER/);
  for (const label of ['SCORE', 'BIAS', 'BOX H4', 'BOX H1', 'PANDA LINES', 'XTF']) {
    assert.ok(core.includes(label), `missing MT4 panel label ${label}`);
  }
  assert.doesNotMatch(core, /OrderSend|OrderClose|OrderModify/);
});

test('MT4 feed expert advisors exist and only feed', () => {
  const personal = read('mt4', 'PandaDashboardFeedMT4-Personal.mq4');
  const licensed = read('mt4', 'PandaDashboardFeedMT4-Licensed.mq4');
  assert.match(personal, /input string OperatorToken/);
  assert.doesNotMatch(licensed, /OperatorToken/);
  assert.match(licensed, /AccountNumber\s*\(\s*\)/);
  for (const source of [personal, licensed]) {
    assert.doesNotMatch(source, /#property indicator_chart_window/);
    assert.match(source, /EventSetTimer\s*\(\s*1\s*\)/);
    assert.doesNotMatch(source, /OrderSend|OrderClose|OrderModify/);
  }
});

test('MT5 Personal and Licensed editions have fixed credential boundaries', () => {
  const personal = read('mt5', 'PandaDashboardOverlayMT5-Personal.mq5');
  const licensed = read('mt5', 'PandaDashboardOverlayMT5-Licensed.mq5');

  assert.match(personal, /input string OperatorToken/);
  assert.match(personal, /x-panda-operator-token/);
  assert.doesNotMatch(personal, /AccountInfoInteger\s*\(\s*ACCOUNT_LOGIN\s*\)/);
  assert.match(licensed, /AccountInfoInteger\s*\(\s*ACCOUNT_LOGIN\s*\)/);
  assert.match(licensed, /x-panda-account-number/);
  assert.doesNotMatch(licensed, /OperatorToken/);
  for (const source of [personal, licensed]) {
    assert.match(source, /#property indicator_chart_window/);
    assert.match(source, /EventSetTimer\s*\(\s*1\s*\)/);
    assert.match(source, /EventKillTimer\s*\(\s*\)/);
    assert.doesNotMatch(source, /OrderSend|PositionOpen|CTrade/);
  }
});

test('MT5 shared core is throttled, cached, movable, and informational', () => {
  const core = read('mt5', 'PandaDashboardOverlayMT5.Core.mqh');

  assert.match(core, /https:\/\/pandaengine\.app\/api\/mt5-overlay/);
  assert.match(core, /PANDA_REFRESH_SECONDS\s*=\s*60/);
  assert.match(core, /PANDA_LOCK_TIMEOUT_SECONDS\s*=\s*15/);
  assert.match(core, /FILE_COMMON/);
  assert.match(core, /GlobalVariableSetOnCondition/);
  assert.match(core, /CHARTEVENT_OBJECT_DRAG/);
  assert.match(core, /CHARTEVENT_OBJECT_CLICK/);
  assert.match(core, /CORNER_LEFT_UPPER/);
  assert.match(core, /MQL_PROGRAM_TYPE/);
  assert.match(core, /PANDA_PANEL_CORNER/);
  for (const label of ['SCORE', 'BIAS', 'BOX H4', 'BOX H1', 'PANDA LINES', 'XTF']) {
    assert.ok(core.includes(label), `missing MT5 panel label ${label}`);
  }
  assert.doesNotMatch(core, /OrderSend|PositionOpen|CTrade/);
});

test('MT5 feed expert advisors exist and only feed', () => {
  const personal = read('mt5', 'PandaDashboardFeedMT5-Personal.mq5');
  const licensed = read('mt5', 'PandaDashboardFeedMT5-Licensed.mq5');
  assert.match(personal, /input string OperatorToken/);
  assert.doesNotMatch(licensed, /OperatorToken/);
  assert.match(licensed, /AccountInfoInteger\s*\(\s*ACCOUNT_LOGIN\s*\)/);
  for (const source of [personal, licensed]) {
    assert.doesNotMatch(source, /#property indicator_chart_window/);
    assert.match(source, /EventSetTimer\s*\(\s*1\s*\)/);
    assert.doesNotMatch(source, /OrderSend|PositionOpen|CTrade/);
  }
});

test('both platform cores propagate authorization denial and create shared cache storage', () => {
  for (const [platform, file] of [
    ['MT4', ['mt4', 'PandaDashboardOverlayMT4.Core.mqh']],
    ['MT5', ['mt5', 'PandaDashboardOverlayMT5.Core.mqh']],
  ]) {
    const core = read(...file);
    assert.match(core, /FolderCreate\s*\(\s*"PandaOverlay"\s*,\s*FILE_COMMON\s*\)/, `${platform} must create common cache folder`);
    assert.match(core, /status_code\s*==\s*401\s*\|\|\s*status_code\s*==\s*403[\s\S]{0,500}WriteCache\s*\(\s*body\s*\)/, `${platform} must share denial response`);
    assert.match(core, /if\s*\(\s*!ParseSnapshot\s*\(\s*cached\s*\)\s*\)[\s\S]{0,500}ClearData\s*\(\s*\)/, `${platform} must clear values from shared denial`);
  }
});

test('MetaTrader cores expose the BASE XTF and QUOTE XTF currency extremes rows', () => {
  for (const [platform, file] of [
    ['MT4', ['mt4', 'PandaDashboardOverlayMT4.Core.mqh']],
    ['MT5', ['mt5', 'PandaDashboardOverlayMT5.Core.mqh']],
  ]) {
    const core = read(...file);
    assert.match(core, /FormatCurrencyExtremes\(const string currency, const string tokens\)/, `${platform} missing extremes formatter`);
    assert.match(core, /FormatCurrencyExtremes\(base_currency, base_tf\)/, `${platform} must format base extremes from feed data`);
    assert.match(core, /FormatCurrencyExtremes\(quote_currency, quote_tf\)/, `${platform} must format quote extremes from feed data`);
    assert.ok(core.includes('"BASE XTF"'), `${platform} missing BASE XTF panel row`);
    assert.ok(core.includes('"QUOTE XTF"'), `${platform} missing QUOTE XTF panel row`);
    assert.ok(core.includes(': NONE'), `${platform} missing NONE fallback`);
    assert.ok(core.includes(' · '), `${platform} missing dot separator between extremes`);
  }
});

test('MetaTrader overlay sources contain no embedded server credential', () => {
  const sources = fs.existsSync(root)
    ? fs.readdirSync(root, { recursive: true })
      .filter((name) => /\.(mq4|mq5|mqh)$/i.test(name))
      .map((name) => fs.readFileSync(path.join(root, name), 'utf8'))
      .join('\n')
    : '';

  assert.doesNotMatch(sources, /ENGINE_SECRET|SUPABASE_SERVICE|service_role/i);
  assert.doesNotMatch(sources, /x-panda-operator-token\s*:\s*[a-f0-9]{32,}/i);
});
