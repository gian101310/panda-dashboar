import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeRunHealth } from '../lib/engineHealth.mjs';

test('fresh heartbeat overrides stale engine log timestamp', () => {
  const now = new Date('2026-06-09T22:30:00Z');
  const result = computeRunHealth({
    now,
    logLastRun: '2026-06-09T14:29:18.814Z',
    heartbeatRow: {
      created_at: '2026-06-09T22:25:07.558462+00:00',
      pairs_processed: 21,
      signals_pushed: 5,
      errors: null,
    },
  });

  assert.equal(result.lastRun, '2026-06-09T22:25:07.558462+00:00');
  assert.equal(result.minutesAgo, 4);
  assert.equal(result.isAlive, true);
  assert.equal(result.heartbeat.status, 'HEALTHY');
});

test('engine log timestamp is fallback when heartbeat is missing', () => {
  const now = new Date('2026-06-09T22:30:00Z');
  const result = computeRunHealth({
    now,
    logLastRun: '2026-06-09T22:15:00Z',
    heartbeatRow: null,
  });

  assert.equal(result.lastRun, '2026-06-09T22:15:00Z');
  assert.equal(result.minutesAgo, 15);
  assert.equal(result.isAlive, true);
  assert.equal(result.heartbeat, null);
});
