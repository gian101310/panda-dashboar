import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildCountdownLabel,
  getDubaiDayRangeUtc,
  normalizeNewsEvents,
} from '../lib/newsCalendar.mjs';

test('getDubaiDayRangeUtc returns the current Dubai calendar day in UTC', () => {
  const now = new Date('2026-06-10T08:15:00.000Z');
  const range = getDubaiDayRangeUtc(now);

  assert.equal(range.start.toISOString(), '2026-06-09T20:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-06-10T20:00:00.000Z');
});

test('normalizeNewsEvents keeps high impact Dubai-day events and maps affected pairs', () => {
  const now = new Date('2026-06-10T08:15:00.000Z');
  const events = normalizeNewsEvents([
    {
      impact: 'High',
      country: 'USD',
      title: 'CPI m/m',
      date: '2026-06-10',
      time: '8:30am',
      forecast: '0.2%',
      previous: '0.3%',
    },
    {
      impact: 'Medium',
      country: 'EUR',
      title: 'Ignored medium impact',
      date: '2026-06-10',
      time: '9:00am',
    },
  ], { now });

  assert.equal(events.length, 1);
  assert.equal(events[0].currency, 'USD');
  assert.equal(events[0].event_at_utc, '2026-06-10T12:30:00.000Z');
  assert.equal(events[0].event_at_dubai, '2026-06-10 16:30');
  assert.equal(events[0].mins_away, 255);
  assert.equal(events[0].countdown_label, '4h 15m');
  assert.deepEqual(events[0].affected_pairs, ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDJPY']);
  assert.equal(events[0].forecast, '0.2%');
  assert.equal(events[0].previous, '0.3%');
});

test('buildCountdownLabel handles now, minutes, and hours', () => {
  assert.equal(buildCountdownLabel(-3), 'NOW');
  assert.equal(buildCountdownLabel(15), '15m');
  assert.equal(buildCountdownLabel(75), '1h 15m');
  assert.equal(buildCountdownLabel(180), '3h');
});
