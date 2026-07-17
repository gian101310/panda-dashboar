import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const path = 'panda-indicators/2026-07-17/tradingview-panda-personal/PandaEnginePersonalTV.pine';

test('Pine source contains the fixed personal scoring and Box contract', () => {
  const source = fs.readFileSync(path, 'utf8');
  assert.match(source, /^\/\/@version=6/m);
  assert.match(source, /indicator\("Panda Engine Personal TV"/);
  for (const pair of [
    'AUDCAD', 'AUDJPY', 'AUDNZD', 'AUDUSD', 'CADJPY', 'EURAUD', 'EURCAD',
    'EURGBP', 'EURJPY', 'EURNZD', 'EURUSD', 'GBPAUD', 'GBPCAD', 'GBPJPY',
    'GBPNZD', 'GBPUSD', 'NZDCAD', 'NZDJPY', 'NZDUSD', 'USDCAD', 'USDJPY',
  ]) assert.match(source, new RegExp(`"${pair}"`));
  assert.doesNotMatch(source, /USDCHF|CHFJPY|operator.token|account.number|supabase|engine.secret/i);
  assert.match(source, /"OANDA:"\s*\+\s*pair/);
  assert.match(source, /request\.security\([\s\S]*?"60"/);
  assert.match(source, /calc_bars_count\s*=\s*3500/);
  assert.match(source, /PANDA_GAP_THRESHOLD\s*=\s*5/);
  assert.match(source, /PANDA_SIGNIFICANT\s*=\s*4/);
  assert.match(source, /HARD_INVALID|DATA UNAVAILABLE|UNSUPPORTED SYMBOL/);
  assert.match(source, /boxH1Trend|boxH4Trend/);
});

test('Pine source contains confirmed Panda Lines, BOS, panel, and alert contracts', () => {
  const source = fs.readFileSync(path, 'utf8');
  assert.match(source, /ta\.supertrend\(3\.0,\s*10\)/);
  assert.match(source, /BB_PERIOD\s*=\s*21/);
  assert.match(source, /BB_DEVIATION\s*=\s*1\.0/);
  assert.match(source, /FOLLOW_ATR_PERIOD\s*=\s*5/);
  assert.match(source, /barstate\.isconfirmed/);
  for (const event of ['PL_BULLISH_FLIP', 'PL_BEARISH_FLIP', 'BOS_BULLISH', 'BOS_BEARISH'])
    assert.match(source, new RegExp(event));
  for (const label of ['BIAS', 'GAP', 'BOX H1', 'BOX H4', 'PANDA LINES', 'FLIP', 'BOS'])
    assert.match(source, new RegExp(label));
  assert.match(source, /ta\.pivothigh|ta\.pivotlow/);
  assert.match(source, /alertcondition/);
  assert.doesNotMatch(source, /strategy\(|strategy\.(entry|exit|order)/);
});
