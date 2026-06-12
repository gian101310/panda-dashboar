import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildEngineChartObjects,
  buildPullbackPlan,
  classifyEngineSetup,
} from '../lib/engineSetups.mjs';

test('classifyEngineSetup marks INTRA only inside engine window with PL confirmation', () => {
  const setup = classifyEngineSetup({
    symbol: 'AUDUSD',
    gap: -10,
    hard_invalid: false,
    bias: 'SELL',
    pl_zone: 'BELOW',
    pl_g1_valid: true,
  }, new Date('2026-06-11T22:30:00Z'));

  assert.equal(setup.strategy, 'INTRA');
  assert.equal(setup.direction, 'SELL');
  assert.equal(setup.reason, 'gap >= 9 + Panda Lines confirmed + 2-4AM UAE window');
});

test('classifyEngineSetup falls back to BB outside the INTRA window', () => {
  const setup = classifyEngineSetup({
    symbol: 'AUDUSD',
    gap: -10,
    hard_invalid: false,
    bias: 'SELL',
    pl_zone: 'BELOW',
    pl_g1_valid: true,
  }, new Date('2026-06-11T18:30:00Z'));

  assert.equal(setup.strategy, 'BB');
  assert.equal(setup.direction, 'SELL');
  assert.equal(setup.reason, 'gap >= 5 engine bias');
});

test('classifyEngineSetup rejects hard invalid and below-threshold rows', () => {
  assert.equal(classifyEngineSetup({ symbol: 'EURGBP', gap: 11, hard_invalid: true }), null);
  assert.equal(classifyEngineSetup({ symbol: 'EURGBP', gap: 4, hard_invalid: false }), null);
});

test('buildPullbackPlan mirrors engine dashboard PB levels for BUY', () => {
  const plan = buildPullbackPlan({
    symbol: 'EURUSD',
    gap: 7,
    bias: 'BUY',
    pdh: 1.118,
    pdl: 1.101,
    pwh: 1.13,
    pwl: 1.095,
    pmh: 1.16,
    pml: 1.08,
  }, 1.11);

  assert.equal(plan.direction, 'BUY');
  assert.equal(plan.entry.label, 'PDL');
  assert.equal(plan.entry.price, 1.101);
  assert.equal(plan.takeProfit.label, 'PDH');
  assert.equal(plan.takeProfit.price, 1.118);
  assert.equal(plan.stopLoss.price, 1.0953);
  assert.equal(plan.riskReward, 3);
});

test('buildPullbackPlan mirrors engine dashboard PB levels for SELL', () => {
  const plan = buildPullbackPlan({
    symbol: 'GBPUSD',
    gap: -8,
    bias: 'SELL',
    pdh: 1.281,
    pdl: 1.255,
    pwh: 1.295,
    pwl: 1.24,
  }, 1.27);

  assert.equal(plan.direction, 'SELL');
  assert.equal(plan.entry.label, 'PDH');
  assert.equal(plan.entry.price, 1.281);
  assert.equal(plan.takeProfit.label, 'PDL');
  assert.equal(plan.takeProfit.price, 1.255);
  assert.equal(plan.stopLoss.price, 1.2875);
  assert.equal(plan.riskReward, 4);
});

test('buildPullbackPlan keeps the nearest PB entry even when a farther entry has bigger target', () => {
  const plan = buildPullbackPlan({
    symbol: 'EURUSD',
    gap: 7,
    bias: 'BUY',
    pdh: 1.107,
    pdl: 1.104,
    pwh: 1.13,
    pwl: 1.09,
  }, 1.105);

  assert.equal(plan.entry.label, 'PDL');
  assert.equal(plan.entry.price, 1.104);
  assert.equal(plan.takeProfit.label, 'PWH');
  assert.equal(plan.takeProfit.pips, 260);
});

test('buildPullbackPlan requires at least 50 pips of clear target from PB entry', () => {
  const plan = buildPullbackPlan({
    symbol: 'EURUSD',
    gap: 7,
    bias: 'BUY',
    pdh: 1.107,
    pdl: 1.104,
    pwh: 1.1089,
  }, 1.105);

  assert.equal(plan, null);
});

test('buildPullbackPlan expands INTRA take profit to farthest valid engine line', () => {
  const plan = buildPullbackPlan({
    symbol: 'EURUSD',
    gap: 10,
    bias: 'BUY',
    pl_zone: 'ABOVE',
    pl_g1_valid: true,
    pdh: 1.112,
    pdl: 1.104,
    pwh: 1.13,
    pmh: 1.155,
  }, 1.105, new Date('2026-06-11T22:30:00Z'));

  assert.equal(plan.strategy, 'INTRA');
  assert.equal(plan.entry.label, 'PDL');
  assert.equal(plan.takeProfit.label, 'PMH');
  assert.equal(plan.takeProfit.pips, 510);
});

test('buildEngineChartObjects plots PB entry with SL and TP only', () => {
  const setup = { symbol: 'EURUSD', strategy: 'BB', direction: 'BUY', gap: 7 };
  const plan = {
    direction: 'BUY',
    entry: { label: 'PDL', price: 1.101 },
    stopLoss: { price: 1.09533, pips: 57 },
    takeProfit: { label: 'PDH', price: 1.118, pips: 170 },
    riskReward: 3,
  };

  const objects = buildEngineChartObjects(setup, plan, '2026-06-11T18:30:00Z');

  assert.deepEqual(objects.map(o => o.object_type), ['risk_reward', 'horizontal_line', 'text']);
  assert.equal(objects[0].side, 'buy');
  assert.equal(objects[0].price1, 1.101);
  assert.equal(objects[0].price2, 1.09533);
  assert.equal(objects[0].price3, 1.118);
  assert.match(objects[2].text, /BB EURUSD BUY PB PDL/);
});
