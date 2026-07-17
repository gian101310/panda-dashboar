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
  assert.match(source, /table\.new\(f_panel_position\(panelPositionInput\),\s*2,\s*13/);
  assert.doesNotMatch(source, /\n\s+or value ==/);
  assert.doesNotMatch(source, /strategy\(|supabase|engine\.secret|operator\.token/i);
});
