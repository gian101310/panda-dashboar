import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPendingOrderRequest,
  evaluatePendingOrderExecution,
  normalizeVolumeUnits,
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
