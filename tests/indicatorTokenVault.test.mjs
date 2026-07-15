import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decryptIndicatorToken, encryptIndicatorToken } from '../lib/indicatorTokenVault.mjs';

const key = Buffer.alloc(32, 7).toString('base64');
const token = 'operator-token-value-that-is-long-enough-123';

test('encrypts and decrypts the active token with AES-256-GCM', () => {
  const encrypted = encryptIndicatorToken(token, key, (size) => Buffer.alloc(size, 9));
  assert.deepEqual(Object.keys(encrypted).sort(), ['token_auth_tag', 'token_ciphertext', 'token_iv']);
  assert.notEqual(encrypted.token_ciphertext, token);
  assert.equal(decryptIndicatorToken(encrypted, key), token);
});

test('rejects tampered ciphertext authentication', () => {
  const encrypted = encryptIndicatorToken(token, key, (size) => Buffer.alloc(size, 9));
  assert.throws(() => decryptIndicatorToken({
    ...encrypted,
    token_auth_tag: Buffer.alloc(16).toString('base64'),
  }, key));
});

test('fails closed when the encryption key is not exactly 32 bytes', () => {
  assert.throws(
    () => encryptIndicatorToken(token, Buffer.alloc(16).toString('base64')),
    /Indicator token encryption is not configured/,
  );
  assert.throws(
    () => decryptIndicatorToken({ token_ciphertext: 'AA==', token_iv: 'AA==', token_auth_tag: 'AA==' }, ''),
    /Indicator token encryption is not configured/,
  );
});
