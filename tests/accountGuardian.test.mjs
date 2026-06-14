import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyGuardianStatus,
  computeChallengeRisk,
  canAutomateExecution,
  summarizeOpenRisk,
} from '../lib/accountGuardian.mjs';

test('computeChallengeRisk calculates challenge buffers from FundedNext screenshot values', () => {
  const risk = computeChallengeRisk({
    startingBalance: 50000,
    balance: 48060.21,
    equity: 47568.17,
    dailyLossLimit: 2500,
    dailyLossUsed: 592.46,
    maxLossLimit: 5000,
    maxLossUsed: 2427.87,
    profitTarget: 4000,
  });

  assert.equal(risk.balance, 48060.21);
  assert.equal(risk.equity, 47568.17);
  assert.equal(risk.dailyRemaining, 1907.54);
  assert.equal(risk.maxLossRemaining, 2572.13);
  assert.equal(risk.toProfitTarget, 4000);
  assert.equal(risk.equityDrawdownPct, 4.86);
});

test('summarizeOpenRisk identifies missing stop losses and floating loss', () => {
  const summary = summarizeOpenRisk([
    { id: 2866758, symbolName: 'AUDJPY', tradeSide: 'Buy', netProfit: -399.43, stopLoss: null },
    { id: 2882180, symbolName: 'AUDUSD', tradeSide: 'Sell', netProfit: -4.2, stopLoss: 0.70981 },
    { id: 2884771, symbolName: 'AUDJPY', tradeSide: 'Buy', netProfit: 46.56, stopLoss: null },
  ]);

  assert.equal(summary.openPositions, 3);
  assert.equal(summary.positionsWithoutSl, 2);
  assert.equal(summary.floatingNet, -357.07);
  assert.deepEqual(summary.missingSlPositionIds, [2866758, 2884771]);
});

test('classifyGuardianStatus is RED when any open position has no stop loss', () => {
  const status = classifyGuardianStatus({
    risk: { dailyRemaining: 1907.54, maxLossRemaining: 2572.13 },
    positions: [
      { id: 1, symbolName: 'AUDJPY', netProfit: -399.43, stopLoss: null },
      { id: 2, symbolName: 'AUDUSD', netProfit: -4.2, stopLoss: 0.70981 },
    ],
    pendingOrders: [],
  });

  assert.equal(status.state, 'RED');
  assert.equal(status.mode, 'LOCKED');
  assert.ok(status.blockers.includes('OPEN_POSITION_WITHOUT_SL'));
});

test('classifyGuardianStatus is YELLOW in recovery mode when buffers are thin', () => {
  const status = classifyGuardianStatus({
    risk: { dailyRemaining: 1400, maxLossRemaining: 2100 },
    positions: [
      { id: 2, symbolName: 'AUDUSD', netProfit: -4.2, stopLoss: 0.70981 },
    ],
    pendingOrders: [],
  });

  assert.equal(status.state, 'YELLOW');
  assert.equal(status.mode, 'RECOVERY');
  assert.ok(status.warnings.includes('DAILY_BUFFER_UNDER_1500'));
});

test('canAutomateExecution blocks live automation unless guardian is GREEN', () => {
  const decision = canAutomateExecution({
    guardian: { state: 'RED', blockers: ['OPEN_POSITION_WITHOUT_SL'], warnings: [] },
    setup: { strategy: 'INTRA', direction: 'SELL', gap: -10 },
    totalOpenRisk: 200,
  });

  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes('GUARDIAN_NOT_GREEN'));
});

test('canAutomateExecution allows guarded INTRA only under hard caps', () => {
  const decision = canAutomateExecution({
    guardian: { state: 'GREEN', blockers: [], warnings: [] },
    setup: { strategy: 'INTRA', direction: 'SELL', gap: -10 },
    totalOpenRisk: 400,
    now: new Date('2026-06-11T22:15:00Z'),
  });

  assert.equal(decision.allowed, true);
  assert.deepEqual(decision.reasons, []);
});
