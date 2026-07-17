import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const path = 'panda-indicators/2026-07-17/tradingview-panda-personal-xtf-bos/PandaEnginePersonalTVXtfBos.pine';

test('XTF BOS Pine source gates confirmed triggers through its selected Box', () => {
  const source = fs.readFileSync(path, 'utf8');

  assert.match(source, /indicator\("Panda Engine Personal TV XTF BOS"/);
  assert.match(source, /shorttitle\s*=\s*"PANDA XTF"/);
  assert.match(source, /input\.string\("H1",\s*"XTF structure",\s*options\s*=\s*\["H1",\s*"H4"\]/);
  assert.match(source, /string xtfBoxTrend\s*=\s*xtfStructure\s*==\s*"H4"\s*\?\s*boxH4Trend\s*:\s*boxH1Trend/);
  assert.match(source, /bool buyReady\s*=\s*pandaBias\s*==\s*"BUY"\s*and\s*pandaLineStatus\s*==\s*"ABOVE"\s*and\s*xtfBoxTrend\s*==\s*"UPTREND"/);
  assert.match(source, /bool sellReady\s*=\s*pandaBias\s*==\s*"SELL"\s*and\s*pandaLineStatus\s*==\s*"BELOW"\s*and\s*xtfBoxTrend\s*==\s*"DOWNTREND"/);
  assert.match(source, /bool buyTrigger\s*=\s*buyReady\s*and\s*bosBullish/);
  assert.match(source, /bool sellTrigger\s*=\s*sellReady\s*and\s*bosBearish/);
  for (const label of ['ALIGNED', 'RANGING', 'COUNTER', 'UNKNOWN', 'BUY READY', 'SELL READY', 'BUY TRIGGER', 'SELL TRIGGER'])
    assert.match(source, new RegExp(label));
  for (const event of ['XTF_BOS_BUY_TRIGGER', 'XTF_BOS_SELL_TRIGGER'])
    assert.match(source, new RegExp(event));
  assert.match(source, /alertcondition\(buyTrigger/);
  assert.match(source, /alertcondition\(sellTrigger/);
  assert.match(source, /table\.new\(f_panel_position\(panelPositionInput\),\s*2,\s*15/);
  assert.doesNotMatch(source, /\n\s+or value ==/);
  assert.doesNotMatch(source, /strategy\(|supabase|engine\.secret|operator\.token/i);
});

test('XTF BOS Pine source exposes every engine-style extreme base and quote timeframe', () => {
  const source = fs.readFileSync(path, 'utf8');

  assert.match(source, /f_currency_extremes\(string currency, int d1, int h4, int h1\)/);
  assert.match(source, /math\.abs\(d1\)\s*>=\s*PANDA_SIGNIFICANT/);
  assert.match(source, /math\.abs\(h4\)\s*>=\s*PANDA_SIGNIFICANT/);
  assert.match(source, /math\.abs\(h1\)\s*>=\s*PANDA_SIGNIFICANT/);
  assert.match(source, /f_currency_extremes\(baseCurrency, f_score\(scoresD1, baseIndex\), f_score\(scoresH4, baseIndex\), f_score\(scoresH1, baseIndex\)\)/);
  assert.match(source, /f_currency_extremes\(quoteCurrency, f_score\(scoresD1, quoteIndex\), f_score\(scoresH4, quoteIndex\), f_score\(scoresH1, quoteIndex\)\)/);
  assert.match(source, /"BASE XTF"/);
  assert.match(source, /"QUOTE XTF"/);
});
