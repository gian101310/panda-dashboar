import crypto from 'crypto';

function sign(expiry, key) {
  return crypto.createHmac('sha256', key).update(String(expiry)).digest('hex');
}

function sameValue(left, right) {
  const leftBuffer = Buffer.from(left || '');
  const rightBuffer = Buffer.from(right || '');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function getAdminMaintenanceAccessKey(env = process.env) {
  return String(env.ADMIN_MAINTENANCE_KEY || '');
}

export function isAdminMaintenanceKeyValid(candidate, key) {
  return Boolean(key) && sameValue(String(candidate || ''), key);
}

export function createAdminMaintenanceAccessToken(key, now = Date.now(), ttlMs = 10 * 60 * 1000) {
  if (!key) return null;
  const expiry = now + ttlMs;
  return `${expiry}.${sign(expiry, key)}`;
}

export function hasValidAdminMaintenanceAccess(token, key, now = Date.now()) {
  if (!token || !key) return false;
  const [expiryValue, signature, extra] = String(token).split('.');
  const expiry = Number(expiryValue);
  if (extra || !Number.isSafeInteger(expiry) || expiry <= now) return false;
  return sameValue(signature, sign(expiry, key));
}
