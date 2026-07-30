import test from 'node:test';
import assert from 'node:assert/strict';
import {
  strongestScore,
  classifyPair,
  classifyBoxTrend,
  classifyPandaLineStatus,
  advancePandaSide,
  detectBos,
  classifyXtfBosSignal,
} from './helpers/tradingviewPandaReference.mjs';

test('selects the strongest signed currency score and resolves equal opposition to zero', () => {
  assert.equal(strongestScore([2, 5, -3]), 5);
  assert.equal(strongestScore([2, 4, -6]), -6);
  assert.equal(strongestScore([1, 4, -4]), 0);
});

test('classifies Panda gap, bias, global conflict, and neutral matchup', () => {
  assert.deepEqual(classifyPair({ baseScores: [5, 2, 1], quoteScores: [-3, -2, -1] }),
    { gap: 8, bias: 'BUY', hardInvalid: false });
  assert.deepEqual(classifyPair({ baseScores: [-5, -2, -1], quoteScores: [2, 1, 0] }),
    { gap: -7, bias: 'SELL', hardInvalid: false });
  assert.deepEqual(classifyPair({ baseScores: [4, 0, -4], quoteScores: [-5, -2, 0] }),
    { gap: 0, bias: 'HARD_INVALID', hardInvalid: true });
  assert.deepEqual(classifyPair({ baseScores: [3, 2, 1], quoteScores: [-3, -2, -1] }),
    { gap: 0, bias: 'HARD_INVALID', hardInvalid: true });
});

test('classifies Box midpoint structure without guessing missing values', () => {
  assert.equal(classifyBoxTrend({ formerHigh: 10, formerLow: 5, latterHigh: 13, latterLow: 9 }), 'UPTREND');
  assert.equal(classifyBoxTrend({ formerHigh: 10, formerLow: 5, latterHigh: 6, latterLow: 2 }), 'DOWNTREND');
  assert.equal(classifyBoxTrend({ formerHigh: 10, formerLow: 5, latterHigh: 9, latterLow: 7 }), 'RANGING');
  assert.equal(classifyBoxTrend({ formerHigh: null, formerLow: 5, latterHigh: 9, latterLow: 7 }), 'UNKNOWN');
});

test('tracks Panda Lines side through BETWEEN and emits one opposite-side flip', () => {
  assert.equal(classifyPandaLineStatus({ close: 12, supertrend: 10, followLine: 11 }), 'ABOVE');
  assert.equal(classifyPandaLineStatus({ close: 8, supertrend: 10, followLine: 9 }), 'BELOW');
  assert.equal(classifyPandaLineStatus({ close: 10, supertrend: 9, followLine: 11 }), 'BETWEEN');
  const between = advancePandaSide({ lastSide: -1, status: 'BETWEEN', confirmed: true });
  assert.deepEqual(between, { lastSide: -1, event: null });
  const flip = advancePandaSide({ lastSide: between.lastSide, status: 'ABOVE', confirmed: true });
  assert.deepEqual(flip, { lastSide: 1, event: 'PL_BULLISH_FLIP' });
  assert.deepEqual(advancePandaSide({ lastSide: flip.lastSide, status: 'ABOVE', confirmed: true }),
    { lastSide: 1, event: null });
});

test('emits one confirmed BOS per swing and ignores intrabar crossings', () => {
  assert.deepEqual(detectBos({ close: 101, swingHigh: 100, swingLow: 90, highBroken: false, lowBroken: false, confirmed: false }),
    { event: null, highBroken: false, lowBroken: false });
  assert.deepEqual(detectBos({ close: 101, swingHigh: 100, swingLow: 90, highBroken: false, lowBroken: false, confirmed: true }),
    { event: 'BOS_BULLISH', highBroken: true, lowBroken: false });
  assert.deepEqual(detectBos({ close: 102, swingHigh: 100, swingLow: 90, highBroken: true, lowBroken: false, confirmed: true }),
    { event: null, highBroken: true, lowBroken: false });
});

test('requires only the selected XTF Box and gates BOS triggers', () => {
  assert.deepEqual(classifyXtfBosSignal({
    xtf: 'H4', bias: 'BUY', pandaLines: 'ABOVE',
    boxH1: 'DOWNTREND', boxH4: 'UPTREND', bosEvent: null,
  }), {
    activeBox: 'UPTREND', otherBox: 'DOWNTREND', otherContext: 'COUNTER',
    ready: true, status: 'BUY READY — WAIT BULLISH BOS', event: null,
  });
  assert.deepEqual(classifyXtfBosSignal({
    xtf: 'H4', bias: 'BUY', pandaLines: 'ABOVE',
    boxH1: 'DOWNTREND', boxH4: 'UPTREND', bosEvent: 'BOS_BULLISH',
  }), {
    activeBox: 'UPTREND', otherBox: 'DOWNTREND', otherContext: 'COUNTER',
    ready: true, status: 'BUY TRIGGER', event: 'XTF_BOS_BUY_TRIGGER',
  });
  assert.deepEqual(classifyXtfBosSignal({
    xtf: 'H1', bias: 'SELL', pandaLines: 'BELOW',
    boxH1: 'DOWNTREND', boxH4: 'UPTREND', bosEvent: 'BOS_BEARISH',
  }), {
    activeBox: 'DOWNTREND', otherBox: 'UPTREND', otherContext: 'COUNTER',
    ready: true, status: 'SELL TRIGGER', event: 'XTF_BOS_SELL_TRIGGER',
  });
  assert.equal(classifyXtfBosSignal({
    xtf: 'H1', bias: 'BUY', pandaLines: 'ABOVE',
    boxH1: 'RANGING', boxH4: 'UPTREND', bosEvent: 'BOS_BULLISH',
  }).status, 'NO SETUP');
});
