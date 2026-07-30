import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { generateIndicatorToken } from '../lib/indicatorTokenGenerator.mjs';

test('generates a 64-character lowercase hexadecimal token from 32 secure bytes', () => {
  const cryptoSource = {
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index;
      return bytes;
    },
  };

  const token = generateIndicatorToken(cryptoSource);

  assert.equal(token, '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
  assert.match(token, /^[a-f0-9]{64}$/);
});

test('fails closed when a secure random generator is unavailable', () => {
  assert.throws(
    () => generateIndicatorToken({}),
    /Secure random generator unavailable/,
  );
});

test('admin token card generates, activates, verifies, and only then copies', () => {
  const source = fs.readFileSync('pages/admin/license.js', 'utf8');

  assert.match(source, /import \{ generateIndicatorToken \}/);
  assert.match(source, /generateActivateAndCopyOperatorToken/);
  assert.match(source, /candidate = generateIndicatorToken\(\)/);
  assert.match(source, /method: 'PUT'/);
  assert.match(source, /data\.verified !== true/);
  assert.match(source, /navigator\.clipboard\.writeText\(candidate\)/);
  assert.match(source, /GENERATE, ACTIVATE & COPY/);
  assert.doesNotMatch(source, />GENERATE TOKEN</);
});
