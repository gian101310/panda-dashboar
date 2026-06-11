import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildObChartObjects,
  detectOrderBlock,
  scoreAPlusSetup,
} from '../lib/aplusSetups.mjs';

test('scoreAPlusSetup promotes only strong confluence into A+ watchlist', () => {
  const row = {
    symbol: 'EURUSD',
    gap: 10,
    hard_invalid: false,
    bias: 'BUY',
    confidence: 'HIGH',
    strength: 2.4,
    momentum: 'STRONG',
    pl_zone: 'ABOVE',
    pl_g1_valid: true,
    box_h1_trend: 'UPTREND',
    box_h4_trend: 'UPTREND',
    spread: 0.7,
  };

  const setup = scoreAPlusSetup(row, {
    edge: { win_rate_resolved: 68.4, sample_size: 42, factor: 'gap_plus_pl' },
  });

  assert.equal(setup.tier, 'A+');
  assert.equal(setup.direction, 'BUY');
  assert.equal(setup.symbol, 'EURUSD');
  assert.equal(setup.readiness, 'WAIT_FOR_OB_RETEST');
  assert.ok(setup.score >= 85);
  assert.ok(setup.reasons.includes('gap >= 9'));
  assert.equal(setup.edge.winRate, 68.4);
  assert.equal(setup.edge.validated, true);
});

test('scoreAPlusSetup rejects invalid or weak setups', () => {
  const setup = scoreAPlusSetup({
    symbol: 'EURGBP',
    gap: 11,
    hard_invalid: true,
    bias: 'BUY',
    confidence: 'HIGH',
  });

  assert.equal(setup, null);
});

test('detectOrderBlock finds the last bearish candle before bullish displacement', () => {
  const bars = [
    { timestamp: '2026-06-11T09:00:00Z', open: 1.1000, high: 1.1010, low: 1.0990, close: 1.1005 },
    { timestamp: '2026-06-11T10:00:00Z', open: 1.1005, high: 1.1010, low: 1.0985, close: 1.0990 },
    { timestamp: '2026-06-11T11:00:00Z', open: 1.0990, high: 1.1060, low: 1.0988, close: 1.1054 },
    { timestamp: '2026-06-11T12:00:00Z', open: 1.1054, high: 1.1080, low: 1.1048, close: 1.1070 },
  ];

  const ob = detectOrderBlock(bars, 'BUY');

  assert.equal(ob.direction, 'BUY');
  assert.equal(ob.startTime, '2026-06-11T10:00:00Z');
  assert.equal(ob.low, 1.0985);
  assert.equal(ob.high, 1.1005);
  assert.equal(ob.entry, 1.0995);
  assert.equal(ob.stop, 1.098);
});

test('detectOrderBlock finds the last bullish candle before bearish displacement', () => {
  const bars = [
    { timestamp: '2026-06-11T09:00:00Z', open: 1.2070, high: 1.2080, low: 1.2060, close: 1.2075 },
    { timestamp: '2026-06-11T10:00:00Z', open: 1.2075, high: 1.2090, low: 1.2070, close: 1.2088 },
    { timestamp: '2026-06-11T11:00:00Z', open: 1.2088, high: 1.2092, low: 1.2010, close: 1.2020 },
  ];

  const ob = detectOrderBlock(bars, 'SELL');

  assert.equal(ob.direction, 'SELL');
  assert.equal(ob.startTime, '2026-06-11T10:00:00Z');
  assert.equal(ob.low, 1.2075);
  assert.equal(ob.high, 1.2090);
  assert.equal(ob.entry, 1.20825);
  assert.equal(ob.stop, 1.2095);
});

test('buildObChartObjects creates read-only rectangle, entry line, and label', () => {
  const objects = buildObChartObjects(
    { symbol: 'EURUSD', direction: 'BUY', score: 91, tier: 'A+' },
    {
      direction: 'BUY',
      startTime: '2026-06-11T10:00:00Z',
      endTime: '2026-06-11T11:00:00Z',
      low: 1.0985,
      high: 1.1005,
      entry: 1.0995,
    },
    '2026-06-11T14:00:00Z',
  );

  assert.deepEqual(objects.map(o => o.object_type), ['rectangle', 'horizontal_line', 'text']);
  assert.equal(objects[0].price1, 1.0985);
  assert.equal(objects[0].price2, 1.1005);
  assert.equal(objects[1].price1, 1.0995);
  assert.match(objects[2].text, /A\+ EURUSD BUY/);
});
