import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve('panda-indicators/2026-07-14/ctrader-dashboard-overlay');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('both cTrader editions are sandboxed informational indicators', () => {
  for (const name of ['PandaDashboardOverlay.Personal.cs', 'PandaDashboardOverlay.Licensed.cs']) {
    const source = read(name);
    assert.match(source, /Indicator\([^)]*IsOverlay\s*=\s*true[^)]*AccessRights\s*=\s*AccessRights\.None/si);
    assert.doesNotMatch(source, /ExecuteMarketOrder|PlaceLimitOrder|PlaceStopOrder|ClosePosition|ModifyPosition/);
    assert.match(source, /public override void Calculate\(int index\)\s*\{\s*\}/s);
  }
});

test('personal and licensed credentials cannot be switched by a user parameter', () => {
  const personal = read('PandaDashboardOverlay.Personal.cs');
  const licensed = read('PandaDashboardOverlay.Licensed.cs');
  assert.match(personal, /Parameter\("Operator Token"/);
  assert.match(personal, /x-panda-operator-token/);
  assert.doesNotMatch(personal, /x-panda-account-number/);
  assert.match(licensed, /Account\.Number/);
  assert.match(licensed, /x-panda-account-number/);
  assert.doesNotMatch(licensed, /Parameter\("Account/);
  assert.doesNotMatch(licensed, /Operator Token/);
});

test('shared core coalesces 60-second refreshes outside Calculate', () => {
  const core = read('PandaDashboardOverlay.Core.cs');
  assert.match(core, /static class SharedOverlayFeed/);
  assert.match(core, /TimeSpan\.FromSeconds\(60\)/);
  assert.match(core, /RequestInFlight/);
  assert.match(core, /http\.SendAsync/);
  assert.match(core, /Timer\.Start\(1\)/);
});

test('panel is draggable, bottom-left by default, minimizable, and persisted', () => {
  const core = read('PandaDashboardOverlay.Core.cs');
  assert.match(core, /Chart\.Draggables\.Add\(\)/);
  assert.match(core, /Chart\.Height\s*-\s*PanelHeight/);
  assert.match(core, /LocationChanged/);
  assert.match(core, /LocalStorage\.SetString/);
  assert.match(core, /LocalStorageScope\.Instance/);
  assert.match(core, /Minimize/);
  for (const label of ['SCORE', 'BIAS', 'BOX H4', 'BOX H1', 'PANDA LINES', 'XTF']) {
    assert.ok(core.includes(label), `missing panel label ${label}`);
  }
});

test('local storage keys satisfy cTrader key restrictions', () => {
  const core = read('PandaDashboardOverlay.Core.cs');
  const keys = [...core.matchAll(/LocalStorage\.(?:GetString|SetString)\("([^"]+)"/g)]
    .map((match) => match[1]);

  assert.ok(keys.length > 0, 'expected persisted panel settings');
  for (const key of keys) {
    assert.match(key, /^[A-Za-z0-9](?:[A-Za-z0-9 ]*[A-Za-z0-9])?$/, `invalid cTrader LocalStorage key: ${key}`);
  }
});

test('core exposes the BASE XTF and QUOTE XTF currency extremes rows', () => {
  const core = read('PandaDashboardOverlay.Core.cs');
  assert.match(core, /FormatCurrencyExtremes\(string currency, string tokens\)/);
  assert.match(core, /FormatCurrencyExtremes\(pair\.BaseCurrency, pair\.BaseScoreTf\)/);
  assert.match(core, /FormatCurrencyExtremes\(pair\.QuoteCurrency, pair\.QuoteScoreTf\)/);
  assert.ok(core.includes('"BASE XTF"'), 'missing BASE XTF panel row');
  assert.ok(core.includes('"QUOTE XTF"'), 'missing QUOTE XTF panel row');
  assert.ok(core.includes(': NONE'), 'missing NONE fallback');
  assert.ok(core.includes(' · '), 'missing dot separator between extremes');
});

test('source contains no embedded credential', () => {
  const combined = ['PandaDashboardOverlay.Core.cs', 'PandaDashboardOverlay.Personal.cs', 'PandaDashboardOverlay.Licensed.cs']
    .map(read).join('\n');
  assert.doesNotMatch(combined, /ENGINE_SECRET|SUPABASE_SERVICE|service_role/i);
  assert.doesNotMatch(combined, /x-panda-operator-token"\s*,\s*"[^"{][^"]{31,}"/i);
});
