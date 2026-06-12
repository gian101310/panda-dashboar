import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPendingOrderRequest,
  computeRiskSizedVolume,
  evaluatePendingOrderExecution,
  normalizeVolumeUnits,
  planOpenPositionActions,
  planPendingOrderActions,
} from '../lib/tradeExecutor.mjs';

const greenGuardian = { state: 'GREEN', mode: 'NORMAL' };
const intraSetup = { symbol: 'EURUSD', direction: 'BUY', strategy: 'INTRA', gap: 10 };
const pbPlan = {
  symbol: 'EURUSD',
  strategy: 'INTRA',
  direction: 'BUY',
  entry: { price: 1.08, label: 'PDL' },
  stopLoss: { price: 1.075, pips: 50 },
  takeProfit: { price: 1.095, pips: 150, label: 'PWH' },
  riskReward: 3,
};
const symbolDetails = { lotSize: 100000, minVolume: 1000, maxVolume: 1000000, volumeStep: 1000 };

test('evaluatePendingOrderExecution blocks without explicit approval', () => {
  const decision = evaluatePendingOrderExecution({
    guardian: greenGuardian,
    setup: intraSetup,
    plan: pbPlan,
    approval: false,
    now: new Date('2026-06-10T22:30:00.000Z'),
  });

  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.reasons, ['APPROVAL_REQUIRED']);
});

test('evaluatePendingOrderExecution blocks when guardian is not green', () => {
  const decision = evaluatePendingOrderExecution({
    guardian: { state: 'YELLOW', mode: 'RECOVERY' },
    setup: intraSetup,
    plan: pbPlan,
    approval: true,
    now: new Date('2026-06-10T22:30:00.000Z'),
  });

  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes('GUARDIAN_NOT_GREEN'));
});

test('evaluatePendingOrderExecution only allows INTRA PB plans', () => {
  const decision = evaluatePendingOrderExecution({
    guardian: greenGuardian,
    setup: { ...intraSetup, strategy: 'BB', gap: 7 },
    plan: { ...pbPlan, strategy: 'BB' },
    approval: true,
    now: new Date('2026-06-10T22:30:00.000Z'),
  });

  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes('INTRA_ONLY'));
});

test('evaluatePendingOrderExecution blocks duplicate Panda PB pending orders on the same symbol', () => {
  const decision = evaluatePendingOrderExecution({
    guardian: greenGuardian,
    setup: intraSetup,
    plan: pbPlan,
    approval: true,
    pendingOrders: [{ symbolName: 'EURUSD', label: 'PANDA-INTRA-PB' }],
    now: new Date('2026-06-10T22:30:00.000Z'),
  });

  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes('DUPLICATE_PANDA_PB_ORDER'));
});

test('normalizeVolumeUnits converts lots to broker units and snaps to volume step', () => {
  assert.equal(normalizeVolumeUnits({ lots: 0.0123, symbolDetails }), 1000);
  assert.equal(normalizeVolumeUnits({ lots: 0.026, symbolDetails }), 3000);
});

test('computeRiskSizedVolume rounds down so stop loss risk stays inside account budget', () => {
  const sized = computeRiskSizedVolume({
    plan: { stopLoss: { pips: 25 } },
    risk: { equity: 48000, dailyRemaining: 1900, maxLossRemaining: 2500 },
    symbolDetails: { ...symbolDetails, pipValuePerLot: 10 },
    riskPct: 0.5,
    maxRiskUsd: 300,
    safetyBufferUsd: 100,
  });

  assert.equal(sized.volume, 96000);
  assert.equal(sized.riskBudgetUsd, 240);
  assert.equal(sized.estimatedLossUsd, 240);
});

test('computeRiskSizedVolume refuses to guess when pip value is unavailable', () => {
  assert.throws(() => computeRiskSizedVolume({
    plan: { stopLoss: { pips: 25 } },
    risk: { equity: 48000, dailyRemaining: 1900, maxLossRemaining: 2500 },
    symbolDetails,
  }), /PIP_VALUE_UNAVAILABLE/);
});

test('buildPendingOrderRequest creates a buy limit request with SL and TP pips', () => {
  const expiresAt = new Date('2026-06-11T10:30:00.000Z');
  const request = buildPendingOrderRequest({
    setup: intraSetup,
    plan: pbPlan,
    volume: 1000,
    expiresAt,
  });

  assert.deepEqual(request, {
    symbolName: 'EURUSD',
    side: 'buy',
    volume: 1000,
    limitPrice: 1.08,
    stopLossPips: 50,
    takeProfitPips: 150,
    expiresAt: '2026-06-11T10:30:00.000Z',
    label: 'PANDA-INTRA-PB',
    comment: 'Panda Engine INTRA PB PDL RR 3:1',
  });
});

test('planOpenPositionActions closes Panda position when engine signal disappears', () => {
  const actions = planOpenPositionActions({
    positions: [{ id: 101, symbolName: 'EURUSD', label: 'PANDA-INTRA-PB', netProfit: 50 }],
    activeSetups: [],
  });

  assert.deepEqual(actions, [{ tool: 'close_position', args: { positionId: 101 }, reason: 'SIGNAL_DISAPPEARED' }]);
});

test('planOpenPositionActions leaves Panda position alone while signal remains same direction', () => {
  const actions = planOpenPositionActions({
    positions: [{ id: 101, symbolName: 'EURUSD', tradeSide: 'BUY', label: 'PANDA-INTRA-PB', netProfit: 50 }],
    activeSetups: [{ symbol: 'EURUSD', direction: 'BUY', strategy: 'INTRA' }],
  });

  assert.deepEqual(actions, []);
});

test('planPendingOrderActions cancels Panda pending order when engine signal disappears', () => {
  const actions = planPendingOrderActions({
    pendingOrders: [{ id: 202, symbolName: 'EURUSD', label: 'PANDA-INTRA-PB' }],
    activeSetups: [],
  });

  assert.deepEqual(actions, [{ tool: 'cancel_order', args: { orderId: 202 }, reason: 'SIGNAL_DISAPPEARED' }]);
});
