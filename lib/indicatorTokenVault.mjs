import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function decodeKey(encodedKey) {
  const key = Buffer.from(String(encodedKey || ''), 'base64');
  if (key.length !== 32) throw new Error('Indicator token encryption is not configured');
  return key;
}

export function encryptIndicatorToken(token, encodedKey, randomBytesImpl = randomBytes) {
  const key = decodeKey(encodedKey);
  const iv = randomBytesImpl(12);
  if (!Buffer.isBuffer(iv) || iv.length !== 12) throw new Error('Secure token IV generation failed');

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()]);
  return {
    token_ciphertext: ciphertext.toString('base64'),
    token_iv: iv.toString('base64'),
    token_auth_tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptIndicatorToken(setting, encodedKey) {
  const key = decodeKey(encodedKey);
  const iv = Buffer.from(String(setting?.token_iv || ''), 'base64');
  const authTag = Buffer.from(String(setting?.token_auth_tag || ''), 'base64');
  const ciphertext = Buffer.from(String(setting?.token_ciphertext || ''), 'base64');
  if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) {
    throw new Error('Active token recovery data is invalid');
  }

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
