import assert from 'node:assert/strict';
import test from 'node:test';
import { createIndicatorLicenseLookupBackoff } from '../lib/indicatorLicenseLookupBackoff.mjs';

test('only one database lookup runs per account at a time', async () => {
  let finish;
  let calls = 0;
  const lookup = createIndicatorLicenseLookupBackoff(() => {
    calls += 1;
    if (calls > 1) return Promise.resolve({ id: 1 });
    return new Promise((resolve) => { finish = resolve; });
  });

  const first = lookup('account', 'product');
  await assert.rejects(lookup('account', 'product'), /temporarily unavailable/);
  assert.equal(calls, 1);
  finish({ id: 1 });
  assert.deepEqual(await first, { id: 1 });
  assert.deepEqual(await lookup('account', 'product'), { id: 1 });
  assert.equal(calls, 2);
});

test('failed lookup waits before querying the database again', async () => {
  let time = 1_000;
  let calls = 0;
  const lookup = createIndicatorLicenseLookupBackoff(async () => {
    calls += 1;
    if (calls === 1) throw new Error('database timeout');
    return { id: 1 };
  }, { retryMs: 60_000, now: () => time });

  await assert.rejects(lookup('account', 'product'), /database timeout/);
  time += 59_999;
  await assert.rejects(lookup('account', 'product'), /temporarily unavailable/);
  assert.equal(calls, 1);
  time += 1;
  assert.deepEqual(await lookup('account', 'product'), { id: 1 });
  assert.equal(calls, 2);
});
