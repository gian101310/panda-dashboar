import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEngineStallMonitor,
  evaluateEngineMonitor,
} from '../lib/engineStallMonitor.mjs';

const NOW = new Date('2026-07-16T12:00:00.000Z');

test('heartbeat younger than 15 minutes is healthy', () => {
  const decision = evaluateEngineMonitor({
    heartbeatAt: '2026-07-16T11:46:00.000Z',
    previousStatus: 'HEALTHY',
    now: NOW,
  });
  assert.equal(decision.status, 'HEALTHY');
  assert.equal(decision.action, 'NONE');
  assert.equal(decision.ageMinutes, 14);
});

test('first heartbeat at least 15 minutes old creates one stale alert transition', () => {
  const decision = evaluateEngineMonitor({
    heartbeatAt: '2026-07-16T11:45:00.000Z',
    previousStatus: 'HEALTHY',
    now: NOW,
  });
  assert.equal(decision.status, 'STALE');
  assert.equal(decision.action, 'STALE_ALERT');
});

test('continued staleness is suppressed and recovery is reported once', () => {
  assert.equal(evaluateEngineMonitor({
    heartbeatAt: '2026-07-16T10:00:00.000Z', previousStatus: 'STALE', now: NOW,
  }).action, 'NONE');
  assert.equal(evaluateEngineMonitor({
    heartbeatAt: '2026-07-16T11:59:00.000Z', previousStatus: 'STALE', now: NOW,
  }).action, 'RECOVERY_ALERT');
});

test('missing heartbeat is treated as stale', () => {
  const decision = evaluateEngineMonitor({ heartbeatAt: null, previousStatus: 'HEALTHY', now: NOW });
  assert.equal(decision.status, 'STALE');
  assert.equal(decision.ageMinutes, null);
  assert.equal(decision.action, 'STALE_ALERT');
});

test('monitor sends transition alert then persists transition timestamps', async () => {
  const saved = [];
  const alerts = [];
  const monitor = createEngineStallMonitor({
    getLatestHeartbeat: async () => ({ created_at: '2026-07-16T11:30:00.000Z' }),
    getState: async () => ({ monitor_key: 'engine', status: 'HEALTHY', last_alert_at: null, last_recovery_at: null }),
    sendAlert: async (decision) => { alerts.push(decision.action); return true; },
    saveState: async (state) => saved.push(state),
    now: () => NOW,
  });

  const result = await monitor();

  assert.deepEqual(alerts, ['STALE_ALERT']);
  assert.equal(saved[0].status, 'STALE');
  assert.equal(saved[0].last_alert_at, NOW.toISOString());
  assert.equal(result.alerted, true);
});

test('monitor does not persist a transition when Telegram delivery fails', async () => {
  let saved = false;
  const monitor = createEngineStallMonitor({
    getLatestHeartbeat: async () => ({ created_at: '2026-07-16T11:30:00.000Z' }),
    getState: async () => ({ monitor_key: 'engine', status: 'HEALTHY' }),
    sendAlert: async () => false,
    saveState: async () => { saved = true; },
    now: () => NOW,
  });

  await assert.rejects(monitor, /Telegram alert was not delivered/);
  assert.equal(saved, false);
});
