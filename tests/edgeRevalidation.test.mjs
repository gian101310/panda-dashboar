import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEdgeRevalidationReport,
  createEdgeRevalidationHandler,
  createEdgeRevalidationRunner,
  isCronAuthorized,
} from '../lib/edgeRevalidation.mjs';

function signal({ strategy = 'BB', outcome, gap = 7, direction = 'BUY', plZone = 'ABOVE' }) {
  return { strategy, outcome, entry_gap: gap, direction, pl_zone: plZone };
}

function responseRecorder() {
  let statusCode = 200;
  let body;
  const res = {
    status(code) { statusCode = code; return res; },
    json(value) { body = value; return res; },
  };
  return { res, read: () => ({ statusCode, body }) };
}

test('builds decisive strategy and gap-7 Panda Lines statistics', () => {
  const rows = [
    ...Array.from({ length: 4 }, () => signal({ outcome: 'WIN' })),
    ...Array.from({ length: 6 }, () => signal({ outcome: 'LOSS' })),
    ...Array.from({ length: 3 }, () => signal({ outcome: 'FLAT' })),
    ...Array.from({ length: 3 }, () => signal({ outcome: 'WIN', plZone: 'BELOW' })),
    ...Array.from({ length: 2 }, () => signal({ outcome: 'LOSS', plZone: 'BELOW' })),
    signal({ strategy: 'INTRA', outcome: 'WIN', gap: 9 }),
    signal({ strategy: 'INTRA', outcome: 'LOSS', gap: 9 }),
  ];

  const report = buildEdgeRevalidationReport(rows, new Date('2026-07-16T00:00:00.000Z'));

  assert.deepEqual(report.strategies.BB, {
    wins: 7, losses: 8, flats: 3, decisive: 15, total: 18, decisive_win_rate: 46.67,
  });
  assert.equal(report.strategies.INTRA.decisive_win_rate, 50);
  assert.equal(report.claims.bb_gap7_pl_confirmed.current.decisive_win_rate, 40);
  assert.equal(report.claims.bb_gap7_pl_unconfirmed.current.decisive_win_rate, 60);
  assert.equal(report.claims.bb_gap7_pl_confirmed.status, 'STALE');
  assert.equal(report.overall_status, 'STALE_CLAIMS');
  assert.equal(report.computed_at, '2026-07-16T00:00:00.000Z');
});

test('Panda Lines confirmation respects BUY/ABOVE and SELL/BELOW', () => {
  const report = buildEdgeRevalidationReport([
    signal({ outcome: 'WIN', direction: 'SELL', gap: -7, plZone: 'BELOW' }),
    signal({ outcome: 'LOSS', direction: 'SELL', gap: -7, plZone: 'ABOVE' }),
  ]);

  assert.equal(report.claims.bb_gap7_pl_confirmed.current.wins, 1);
  assert.equal(report.claims.bb_gap7_pl_unconfirmed.current.losses, 1);
});

test('runner stores one current report, retires old claims, and alerts only on first stale report', async () => {
  const calls = [];
  const runner = createEdgeRevalidationRunner({
    fetchRows: async () => [signal({ outcome: 'WIN' }), signal({ outcome: 'LOSS' })],
    getPreviousReport: async () => null,
    replaceReport: async (report) => calls.push(['replace', report.overall_status]),
    retireHistoricalClaims: async (report) => calls.push(['retire', report.claims.bb_gap7_pl_confirmed.current.decisive_win_rate]),
    notify: async (report) => { calls.push(['notify', report.overall_status]); return true; },
    now: () => new Date('2026-07-16T00:00:00.000Z'),
  });

  const result = await runner();

  assert.equal(result.notified, true);
  assert.deepEqual(calls.map(([name]) => name), ['retire', 'notify', 'replace']);
  assert.equal(result.report.alert_delivered, true);
});

test('runner does not repeat alert when stale status was already recorded', async () => {
  let notified = false;
  const runner = createEdgeRevalidationRunner({
    fetchRows: async () => [signal({ outcome: 'WIN' }), signal({ outcome: 'LOSS' })],
    getPreviousReport: async () => ({ overall_status: 'STALE_CLAIMS', alert_delivered: true }),
    replaceReport: async () => {},
    retireHistoricalClaims: async () => {},
    notify: async () => { notified = true; return true; },
  });

  const result = await runner();

  assert.equal(result.notified, false);
  assert.equal(notified, false);
});

test('runner retries a stale alert that was not delivered', async () => {
  let notifications = 0;
  const runner = createEdgeRevalidationRunner({
    fetchRows: async () => [signal({ outcome: 'WIN' }), signal({ outcome: 'LOSS' })],
    getPreviousReport: async () => ({ overall_status: 'STALE_CLAIMS', alert_delivered: false }),
    replaceReport: async () => {},
    retireHistoricalClaims: async () => {},
    notify: async () => { notifications += 1; return true; },
  });

  const result = await runner();

  assert.equal(notifications, 1);
  assert.equal(result.report.alert_delivered, true);
});

test('cron authorization fails closed when secret is missing or wrong', () => {
  assert.equal(isCronAuthorized('Bearer secret', ''), false);
  assert.equal(isCronAuthorized('Bearer wrong', 'secret'), false);
  assert.equal(isCronAuthorized('Bearer secret', 'secret'), true);
});

test('admin handler requires admin and supports GET and POST', async () => {
  const unauthorized = createEdgeRevalidationHandler({
    requireAdmin: async () => null,
    getLatest: async () => ({ id: 1 }),
    runRevalidation: async () => ({ ok: true }),
  });
  const denied = responseRecorder();
  await unauthorized({ method: 'GET' }, denied.res);
  assert.equal(denied.read().statusCode, 403);

  const handler = createEdgeRevalidationHandler({
    requireAdmin: async () => ({ username: 'Boss-G' }),
    getLatest: async () => ({ overall_status: 'STALE_CLAIMS' }),
    runRevalidation: async () => ({ report: { overall_status: 'STALE_CLAIMS' } }),
  });
  const get = responseRecorder();
  await handler({ method: 'GET' }, get.res);
  assert.equal(get.read().body.report.overall_status, 'STALE_CLAIMS');

  const post = responseRecorder();
  await handler({ method: 'POST' }, post.res);
  assert.equal(post.read().body.report.overall_status, 'STALE_CLAIMS');
});
