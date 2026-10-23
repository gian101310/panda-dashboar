import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../pages/dashboard.js', import.meta.url), 'utf8');
const start = source.indexOf('function strongestAdvCurrencyScore(');
const end = source.indexOf('// ===== CURRENCY STRENGTH MATCHUP LABEL', start);
assert.ok(start >= 0 && end > start, 'ADV scoring functions exist');
const { advScore } = runInNewContext(`${source.slice(start, end)}; ({ advScore })`);

const eurcad = {
  gap: -8,
  base_d1: -5, base_h4: -5, base_h1: -5,
  quote_d1: 2, quote_h4: 3, quote_h1: 3,
  adv_base_d1: -5, adv_base_h4: -5, adv_base_h1: -3,
  adv_quote_d1: 2, adv_quote_h4: 4, adv_quote_h1: 2,
};

// Next-week scoring always replaces H4 and H1, including before Friday.
assert.equal(advScore(eurcad, new Date('2026-10-28T08:00:00Z')).detail, 'TMRW:-8 WK:-9');
assert.equal(advScore(eurcad, new Date('2026-10-23T08:00:00Z')).detail, 'TMRW:-8 WK:-9');
assert.equal(advScore(eurcad, new Date('2026-10-30T08:00:00Z')).detail, 'TMRW:-8 WK:-9 MTH:-9');
assert.equal(advScore(eurcad, new Date('2026-10-31T08:00:00Z')).detail, 'TMRW:-8 WK:-9 MTH:-9');

// Dubai's date determines the month-end window.
assert.equal(advScore(eurcad, new Date('2026-10-22T21:00:00Z')).detail, 'TMRW:-8 WK:-9');
assert.equal(advScore(eurcad, new Date('2026-10-29T21:00:00Z')).detail, 'TMRW:-8 WK:-9 MTH:-9');

// An ADV zero replaces the current H1 value, including when it was strongest.
const zeroH1 = { ...eurcad, base_d1: -2, base_h4: -1, base_h1: -6, adv_base_h1: 0 };
assert.equal(advScore(zeroH1, new Date('2026-10-28T08:00:00Z')).gaps.h1, -5);

// Equal opposite currency strengths cancel as in the locked scorer.
const tied = { ...eurcad, base_d1: -5, base_h4: 5, adv_base_h1: 0 };
assert.equal(advScore(tied, new Date('2026-10-28T08:00:00Z')).gaps.h1, -3);

console.log('ADV forecast examples and Dubai date windows passed');
