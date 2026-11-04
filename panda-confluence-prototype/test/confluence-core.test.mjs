import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPullbackZone,
  buildSwingRiskPlan,
  classifyGapExecution,
  confluenceStatus,
  interpretConfluence,
  fairValueGaps,
  h1PullbackDecision,
  nearestDirectionalLevel,
  openFairValueGaps,
  pandaLineConfirmation,
  shouldDrawRiskPlan,
  pullbackState,
  executionDecision,
  classifyStructure,
  superTrend,
  trendStrength,
  trueRange,
  wilderAdx,
} from '../src/confluence-core.mjs';

const candle = (close, high = close + 0.5, low = close - 0.5) => ({ open: close, high, low, close });

test('true range includes an overnight gap', () => {
  assert.equal(trueRange(13, 12, 10), 3);
});

test('SuperTrend becomes bullish and produces a bounded strength score', () => {
  const candles = Array.from({ length: 80 }, (_, i) => candle(100 + i * 0.4));
  const states = superTrend(candles);
  const last = states.at(-1);
  const strength = trendStrength(candles, candles.length - 1, last);
  assert.equal(last.direction, 1);
  assert.ok(strength.total >= 65 && strength.total <= 100);
});

test('Wilder ADX confirms a persistent directional move', () => {
  const candles = Array.from({ length: 80 }, (_, i) => candle(100 + i * 0.4));
  const adx = wilderAdx(candles);
  assert.ok(adx.at(-1) >= 25 && adx.at(-1) <= 100);
});

test('structure emits a bullish break after a confirmed swing high', () => {
  const closes = [10, 11, 13, 11, 10, 11, 14, 15];
  const candles = closes.map((value) => candle(value, value + 0.2, value - 0.2));
  const result = classifyStructure(candles, 2);
  assert.ok(result.events.some((event) => event.type === 'BOS_UP'));
  assert.equal(result.direction, 1);
});

test('FVG detection uses a strict three-candle imbalance', () => {
  const candles = [
    candle(10, 11, 9),
    candle(12, 13, 11),
    candle(15, 16, 14),
  ];
  assert.deepEqual(fairValueGaps(candles), [{ index: 2, direction: 1, low: 11, high: 14 }]);
});

test('open FVG list excludes fully mitigated gaps and keeps multiple active boxes', () => {
  const candles = [
    candle(10, 11, 9),
    candle(12, 13, 11),
    candle(15, 16, 14),
    candle(16, 17, 15),
    candle(19, 20, 18),
    candle(20, 21, 19),
  ];
  const gaps = openFairValueGaps(candles);
  assert.ok(gaps.length >= 2);
  assert.ok(gaps.every((gap) => gap.direction === 1));
});

test('high confluence requires direction, strength and ADX agreement', () => {
  assert.equal(confluenceStatus({ pandaBias: 'BUY', aligned: 1, strength: 70, adx: 27, structure: 1 }), 'HIGH CONFLUENCE');
  assert.equal(confluenceStatus({ pandaBias: 'BUY', aligned: -1, strength: 70, adx: 27, structure: 1 }), 'WAIT');
});

test('Panda WAIT can never be promoted by technical confluence', () => {
  assert.equal(confluenceStatus({ pandaBias: 'WAIT', aligned: 1, strength: 100, adx: 50, structure: 1 }), 'WAIT');
});

test('automatic interpretation uses only H1 H4 and D1 for alignment', () => {
  const status = interpretConfluence({
    pandaBias: 'BUY',
    trends: [
      { label: 'M15', direction: -1, strength: 10, adx: 5 },
      { label: 'H1', direction: 1, strength: 70, adx: 26 },
      { label: 'H4', direction: 1, strength: 68, adx: 24 },
      { label: 'D1', direction: 1, strength: 72, adx: 30 },
    ],
    structure: 1,
  });
  assert.equal(status, 'HIGH CONFLUENCE');
});

test('automatic interpretation explains Panda WAIT and stale feed states', () => {
  assert.equal(interpretConfluence({ pandaBias: 'WAIT' }), 'BLOCKED — PANDA WAIT');
  assert.equal(interpretConfluence({ feedStatus: 'STALE', pandaBias: 'BUY' }), 'DATA — STALE');
});

test('two aligned Panda timeframes can become READY but not HIGH', () => {
  const status = interpretConfluence({
    pandaBias: 'SELL',
    trends: [
      { label: 'H1', direction: -1, strength: 62, adx: 21 },
      { label: 'H4', direction: -1, strength: 58, adx: 24 },
      { label: 'D1', direction: 1, strength: 70, adx: 30 },
    ],
    structure: -1,
  });
  assert.equal(status, 'READY');
});

test('pullback state uses M15 for timing without changing Panda direction', () => {
  const base = {
    pandaBias: 'BUY',
    alignedCount: 3,
    h1Structure: 1,
  };
  assert.equal(pullbackState({ ...base, m15Direction: -1, m15Event: 'BOS_DOWN' }), 'PULLBACK ACTIVE');
  assert.equal(pullbackState({ ...base, m15Direction: 1, m15Event: 'CHOCH_UP' }), 'PULLBACK ENDING');
  assert.equal(pullbackState({ ...base, m15Direction: 1, m15Event: 'BOS_UP' }), 'ENTRY TRIGGER');
});

test('opposing H1 structure invalidates pullback timing', () => {
  assert.equal(pullbackState({
    pandaBias: 'SELL', alignedCount: 3, h1Structure: 1, m15Direction: -1, m15Event: 'BOS_DOWN',
  }), 'SETUP INVALIDATED');
});

test('old M15 structure events cannot remain entry triggers', () => {
  assert.equal(pullbackState({
    pandaBias: 'BUY', alignedCount: 3, h1Structure: 1, m15Direction: 1, m15Event: 'BOS_UP', eventAgeBars: 4,
  }), 'CONTEXT READY');
});

test('execution decision requires both valid context and a fresh entry trigger', () => {
  assert.equal(executionDecision({ pandaBias: 'SELL', mainStatus: 'HIGH CONFLUENCE', pullback: 'ENTRY TRIGGER' }), 'SELL READY');
  assert.equal(executionDecision({ pandaBias: 'SELL', mainStatus: 'HIGH CONFLUENCE', pullback: 'CONTEXT READY' }), 'WAIT - NO FRESH ENTRY TRIGGER');
  assert.equal(executionDecision({ pandaBias: 'BUY', mainStatus: 'WATCH - ADX WEAK', pullback: 'ENTRY TRIGGER' }), 'WAIT - ADX WEAK');
});

test('execution decision can never override Panda WAIT or invalidation', () => {
  assert.equal(executionDecision({ pandaBias: 'WAIT', mainStatus: 'HIGH CONFLUENCE', pullback: 'ENTRY TRIGGER' }), 'BLOCKED - PANDA WAIT');
  assert.equal(executionDecision({ pandaBias: 'BUY', mainStatus: 'READY', pullback: 'SETUP INVALIDATED' }), 'BLOCKED - SETUP INVALIDATED');
});

test('gap execution uses the locked Panda boundaries', () => {
  assert.equal(classifyGapExecution(4.9), 'NONE');
  assert.equal(classifyGapExecution(5), 'PULLBACK');
  assert.equal(classifyGapExecution(-8), 'PULLBACK');
  assert.equal(classifyGapExecution(9), 'MARKET');
  assert.equal(classifyGapExecution(-12), 'MARKET');
});

test('Panda Line confirmation requires price beyond both lines in the bias direction', () => {
  assert.equal(pandaLineConfirmation({ pandaBias: 'BUY', price: 1.105, superTrend: 1.101, followLine: 1.103 }), 'CONFIRMED');
  assert.equal(pandaLineConfirmation({ pandaBias: 'BUY', price: 1.102, superTrend: 1.101, followLine: 1.103 }), 'BETWEEN');
  assert.equal(pandaLineConfirmation({ pandaBias: 'SELL', price: 1.095, superTrend: 1.101, followLine: 1.099 }), 'CONFIRMED');
  assert.equal(pandaLineConfirmation({ pandaBias: 'SELL', price: 1.100, superTrend: 1.101, followLine: 1.099 }), 'BETWEEN');
  assert.equal(pandaLineConfirmation({ pandaBias: 'BUY', price: 1.105, superTrend: null, followLine: 1.103 }), 'UNAVAILABLE');
});

test('directional Panda Level selection chooses nearest support for BUY and resistance for SELL', () => {
  const levels = [
    { label: 'PDL', price: 1.1000 },
    { label: 'PWL', price: 1.0950 },
    { label: 'PDH', price: 1.1100 },
  ];
  assert.deepEqual(nearestDirectionalLevel({ pandaBias: 'BUY', price: 1.1060, levels, pipSize: 0.0001 }), {
    label: 'PDL', price: 1.1, distancePips: 60,
  });
  assert.deepEqual(nearestDirectionalLevel({ pandaBias: 'SELL', price: 1.1060, levels, pipSize: 0.0001 }), {
    label: 'PDH', price: 1.11, distancePips: 40,
  });
  assert.equal(nearestDirectionalLevel({ pandaBias: 'BUY', price: 1.1060, levels: [], pipSize: 0.0001 }), null);
});

const buyPullbackInput = {
  feedStatus: 'LIVE',
  pandaBias: 'BUY',
  gap: 7,
  price: 1.1010,
  superTrend: 1.0970,
  followLine: 1.0990,
  levels: [{ label: 'PDL', price: 1.1000 }],
  pipSize: 0.0001,
  proximityPips: 15,
  touchPips: 2,
  h1Adx: 24,
  h1Ranging: false,
  h1Structure: 1,
  levelWasTouched: false,
  rejectionConfirmed: false,
  m15Event: 'NONE',
  m15EventAgeBars: 0,
};

test('H1 pullback decision blocks an early entry while price approaches the Panda Level', () => {
  const result = h1PullbackDecision(buyPullbackInput);
  assert.equal(result.execution, 'PULLBACK');
  assert.equal(result.state, 'APPROACHING PANDA LEVEL');
  assert.equal(result.decision, 'WAIT');
  assert.equal(result.level.label, 'PDL');
});

test('H1 pullback decision treats a Panda Level touch as wait rather than ready', () => {
  const result = h1PullbackDecision({
    ...buyPullbackInput, price: 1.1001, levelWasTouched: true,
  });
  assert.equal(result.state, 'AT PANDA LEVEL — WAIT FOR REJECTION');
  assert.equal(result.decision, 'WAIT');
});

test('H1 pullback decision requires rejection and a fresh M15 continuation event', () => {
  const ending = h1PullbackDecision({
    ...buyPullbackInput, price: 1.1005, levelWasTouched: true, rejectionConfirmed: true, m15Event: 'CHOCH_UP',
  });
  assert.equal(ending.state, 'PULLBACK ENDING');
  assert.equal(ending.decision, 'WAIT');

  const ready = h1PullbackDecision({
    ...buyPullbackInput, price: 1.1005, levelWasTouched: true, rejectionConfirmed: true, m15Event: 'BOS_UP',
  });
  assert.equal(ready.state, 'ENTRY TRIGGER');
  assert.equal(ready.decision, 'BUY READY');
  assert.equal(ready.continuation, 'STRONG');
});

test('H1 pullback decision blocks a late continuation trigger after price leaves the entry zone', () => {
  const result = h1PullbackDecision({
    ...buyPullbackInput,
    price: 1.1050,
    levelWasTouched: true,
    rejectionConfirmed: true,
    m15Event: 'BOS_UP',
  });
  assert.equal(result.state, 'ENTRY MOVED — WAIT');
  assert.equal(result.decision, 'WAIT');
});

test('H1 pullback decision expires stale M15 events and blocks ranging conditions', () => {
  const stale = h1PullbackDecision({
    ...buyPullbackInput, levelWasTouched: true, rejectionConfirmed: true, m15Event: 'BOS_UP', m15EventAgeBars: 4,
  });
  assert.equal(stale.decision, 'WAIT');
  assert.notEqual(stale.state, 'ENTRY TRIGGER');

  const range = h1PullbackDecision({
    ...buyPullbackInput, h1Ranging: true, levelWasTouched: true, rejectionConfirmed: true, m15Event: 'BOS_UP',
  });
  assert.equal(range.state, 'RANGE — NO TRADE');
  assert.equal(range.decision, 'WAIT');
});

test('H1 pullback decision blocks line data loss, line loss, and opposing structure', () => {
  assert.equal(h1PullbackDecision({ ...buyPullbackInput, superTrend: null }).state, 'LINE DATA UNAVAILABLE');
  assert.equal(h1PullbackDecision({ ...buyPullbackInput, price: 1.0980 }).state, 'SETUP INVALIDATED');
  assert.equal(h1PullbackDecision({ ...buyPullbackInput, h1Structure: -1 }).state, 'SETUP INVALIDATED');
});

test('market eligibility warns when price is overextended or a Panda Level is nearby', () => {
  const result = h1PullbackDecision({
    ...buyPullbackInput,
    gap: 9,
    h1TrendDirection: 1, h1TrendStrength: 72, h1Adx: 28,
    m15TrendDirection: 1, m15TrendStrength: 58,
    price: 1.1010,
    levels: [{ label: 'PDL', price: 1.1000 }, { label: 'PDH', price: 1.1015 }],
    distanceFromLinesPips: 45,
    overextensionPips: 30,
  });
  assert.equal(result.state, 'MARKET REVIEW');
  assert.equal(result.decision, 'WAIT — REVIEW WARNINGS');
  assert.deepEqual(result.warnings, ['OVEREXTENDED FROM PANDA LINES', 'NEARBY PANDA LEVEL PDH']);
});

test('market context follows momentum and structure even when H1 box ranges and no level exists', () => {
  const input = {
    ...buyPullbackInput, gap: 9, h1Ranging: true, levels: [],
    h1TrendDirection: 1, h1TrendStrength: 70, h1Adx: 27,
    m15TrendDirection: 1, m15TrendStrength: 55,
  };
  const buy = h1PullbackDecision(input);
  assert.equal(buy.state, 'MARKET ELIGIBLE');
  assert.equal(buy.decision, 'BUY MARKET CONTEXT');
  const sell = h1PullbackDecision({
    ...input, pandaBias: 'SELL', gap: -9, price: 1.0990,
    superTrend: 1.1030, followLine: 1.1010,
    h1TrendDirection: -1, h1Structure: -1, m15TrendDirection: -1,
  });
  assert.equal(sell.decision, 'SELL MARKET CONTEXT');
});

test('market context waits for strong H1 trend, ADX, structure, and M15 momentum', () => {
  const input = {
    ...buyPullbackInput, gap: 9, levels: [], h1TrendDirection: 1,
    h1TrendStrength: 70, h1Adx: 27, m15TrendDirection: 1, m15TrendStrength: 55,
  };
  assert.equal(h1PullbackDecision({ ...input, h1TrendStrength: 64 }).decision, 'WAIT — H1 TREND');
  assert.equal(h1PullbackDecision({ ...input, h1Adx: 24 }).decision, 'WAIT — H1 ADX');
  assert.equal(h1PullbackDecision({ ...input, h1Structure: 0 }).decision, 'WAIT — H1 STRUCTURE');
  assert.equal(h1PullbackDecision({ ...input, m15TrendDirection: -1 }).decision, 'WAIT — M15 MOMENTUM');
  assert.equal(h1PullbackDecision({ ...input, m15TrendStrength: 49 }).decision, 'WAIT — M15 MOMENTUM');
  assert.equal(h1PullbackDecision({ ...input, m15Event: 'CHOCH_DOWN', m15StructureDirection: -1 }).decision, 'WAIT — M15 REVERSAL');
  assert.equal(h1PullbackDecision({ ...input, m15Event: 'CHOCH_DOWN', m15StructureDirection: -1, m15EventAgeBars: 4 }).state, 'MARKET ELIGIBLE');
  assert.equal(shouldDrawRiskPlan({ mode: 'ALWAYS', execution: 'MARKET', state: 'MARKET WAIT', lineState: 'CONFIRMED' }), false);
});

test('SELL pullback mirrors BUY direction and uses bearish M15 confirmation', () => {
  const result = h1PullbackDecision({
    ...buyPullbackInput,
    pandaBias: 'SELL',
    gap: -8,
    price: 1.1095,
    superTrend: 1.1130,
    followLine: 1.1110,
    levels: [{ label: 'PDH', price: 1.1100 }],
    h1Structure: -1,
    levelWasTouched: true,
    rejectionConfirmed: true,
    m15Event: 'BOS_DOWN',
  });
  assert.equal(result.level.label, 'PDH');
  assert.equal(result.decision, 'SELL READY');
});

test('swing risk plan places a BUY stop below the H1 swing and targets fixed R', () => {
  assert.deepEqual(buildSwingRiskPlan({
    side: 'BUY', entry: 1.1050, swing: 1.1000, pipSize: 0.0001,
    bufferPips: 5, rewardRisk: 2, maxStopPips: 60,
  }), {
    side: 'BUY', entry: 1.105, stop: 1.0995, target: 1.116,
    stopPips: 55, targetPips: 110, rewardRisk: 2,
    status: 'ACCEPTABLE', draw: true,
  });
});

test('swing risk plan marks an H1 stop wider than the configured maximum', () => {
  const plan = buildSwingRiskPlan({
    side: 'BUY', entry: 1.1050, swing: 1.1000, pipSize: 0.0001,
    bufferPips: 5, rewardRisk: 2, maxStopPips: 40,
  });
  assert.equal(plan.stopPips, 55);
  assert.equal(plan.status, 'TOO WIDE');
  assert.equal(plan.draw, true);
});

test('swing risk plan mirrors stop and target geometry for SELL', () => {
  const plan = buildSwingRiskPlan({
    side: 'SELL', entry: 1.2000, swing: 1.2040, pipSize: 0.0001,
    bufferPips: 3, rewardRisk: 2, maxStopPips: 50,
  });
  assert.deepEqual(plan, {
    side: 'SELL', entry: 1.2, stop: 1.2043, target: 1.1914,
    stopPips: 43, targetPips: 86, rewardRisk: 2,
    status: 'ACCEPTABLE', draw: true,
  });
});

test('swing risk plan rejects a swing on the wrong side of entry', () => {
  assert.equal(buildSwingRiskPlan({
    side: 'BUY', entry: 1.1050, swing: 1.1060, pipSize: 0.0001,
  }), null);
});

test('risk plan preview modes control when a drawing becomes visible', () => {
  const context = { decision: 'WAIT', state: 'CONTEXT READY — WAIT FOR M15', lineState: 'CONFIRMED', execution: 'PULLBACK' };
  assert.equal(shouldDrawRiskPlan({ ...context, mode: 'READY ONLY' }), false);
  assert.equal(shouldDrawRiskPlan({ ...context, mode: 'CONTEXT READY' }), true);
  assert.equal(shouldDrawRiskPlan({ ...context, mode: 'ALWAYS' }), true);
  assert.equal(shouldDrawRiskPlan({ ...context, mode: 'CONTEXT READY', state: 'PULLBACK ACTIVE — WAIT' }), true);
});

test('risk plan preview never draws for invalid, missing-line, or no-setup states', () => {
  assert.equal(shouldDrawRiskPlan({ mode: 'ALWAYS', decision: 'WAIT', state: 'NO SETUP', lineState: 'CONFIRMED', execution: 'NONE' }), false);
  assert.equal(shouldDrawRiskPlan({ mode: 'ALWAYS', decision: 'WAIT', state: 'LINE DATA UNAVAILABLE', lineState: 'UNAVAILABLE', execution: 'PULLBACK' }), false);
  assert.equal(shouldDrawRiskPlan({ mode: 'ALWAYS', decision: 'WAIT', state: 'SETUP INVALIDATED', lineState: 'CONFIRMED', execution: 'PULLBACK' }), false);
  assert.equal(shouldDrawRiskPlan({ mode: 'ALWAYS', decision: 'WAIT', state: 'RANGE — NO TRADE', lineState: 'CONFIRMED', execution: 'PULLBACK' }), false);
  assert.equal(shouldDrawRiskPlan({ mode: 'READY ONLY', decision: 'BUY READY', state: 'ENTRY TRIGGER', lineState: 'CONFIRMED', execution: 'PULLBACK' }), true);
});

test('pullback zone uses the larger of minimum pips and H1 ATR width', () => {
  assert.deepEqual(buildPullbackZone({
    pandaBias: 'BUY', level: { label: 'PDL', price: 1.1000 }, price: 1.1040,
    h1Atr: 0.0020, pipSize: 0.0001, minimumPips: 3, atrPercent: 10,
  }), {
    label: 'PDL', anchor: 1.1, low: 1.0997, high: 1.1003,
    halfWidthPips: 3, state: 'APPROACHING', side: 'BUY',
  });
  assert.equal(buildPullbackZone({
    pandaBias: 'BUY', level: { label: 'PWL', price: 1.1000 }, price: 1.1040,
    h1Atr: 0.0080, pipSize: 0.0001, minimumPips: 3, atrPercent: 10,
  }).halfWidthPips, 8);
});

test('pullback zone identifies inside and failed BUY states', () => {
  const input = {
    pandaBias: 'BUY', level: { label: 'PDL', price: 1.1000 }, h1Atr: 0.0020,
    pipSize: 0.0001, minimumPips: 3, atrPercent: 10,
  };
  assert.equal(buildPullbackZone({ ...input, price: 1.1001 }).state, 'INSIDE ZONE — WAIT');
  assert.equal(buildPullbackZone({ ...input, price: 1.0990 }).state, 'ZONE FAILED');
});

test('pullback zone mirrors approach and failure for SELL', () => {
  const input = {
    pandaBias: 'SELL', level: { label: 'PDH', price: 1.2000 }, h1Atr: 0.0020,
    pipSize: 0.0001, minimumPips: 3, atrPercent: 10,
  };
  assert.equal(buildPullbackZone({ ...input, price: 1.1960 }).state, 'APPROACHING');
  assert.equal(buildPullbackZone({ ...input, price: 1.2001 }).state, 'INSIDE ZONE — WAIT');
  assert.equal(buildPullbackZone({ ...input, price: 1.2010 }).state, 'ZONE FAILED');
});

test('pullback zone returns unavailable when required market data is missing', () => {
  assert.equal(buildPullbackZone({ pandaBias: 'BUY', level: null, price: 1.1, h1Atr: 0.002, pipSize: 0.0001 }), null);
  assert.equal(buildPullbackZone({ pandaBias: 'WAIT', level: { label: 'PDL', price: 1.1 }, price: 1.1, h1Atr: 0.002, pipSize: 0.0001 }), null);
});
