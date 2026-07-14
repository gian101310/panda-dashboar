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

test('admin token card generates and copies without submitting rotation', () => {
  const source = fs.readFileSync('pages/admin/license.js', 'utf8');

  assert.match(source, /import \{ generateIndicatorToken \}/);
  assert.match(source, /setNewToken\(generateIndicatorToken\(\)\)/);
  assert.match(source, /navigator\.clipboard\.writeText\(newToken\)/);
  assert.match(source, />GENERATE TOKEN</);
  assert.match(source, /\{copyStatus\}/);
  assert.match(source, /disabled=\{!newToken\}/);
  assert.match(source, /type="button"/);
});
