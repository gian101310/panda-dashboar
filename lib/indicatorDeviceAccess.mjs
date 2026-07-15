import crypto, { randomBytes } from 'node:crypto';

const DEVICE_ID_PATTERN = /^[A-Za-z0-9._-]{16,128}$/;

export function normalizeDeviceId(value) {
  const normalized = String(value || '').trim();
  return DEVICE_ID_PATTERN.test(normalized) ? normalized : '';
}

export function hashDeviceValue(value) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

export function safeDeviceHashEqual(actualHash, expectedHash) {
  try {
    const actual = Buffer.from(String(actualHash || ''), 'hex');
    const expected = Buffer.from(String(expectedHash || ''), 'hex');
    return actual.length === 32 && expected.length === 32 && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createIndicatorDeviceAccess({
  getEnforcement,
  getDevice = async () => null,
  registerDevice = async () => 'DEVICE_AUTH_ERROR',
  touchDevice = async () => {},
  randomBytesImpl = randomBytes,
}) {
  async function authorize({ license, productCode, platform, deviceId, deviceToken }) {
    const enforcementEnabled = await getEnforcement(productCode);
    if (!enforcementEnabled) return { ok: true, status: 'LEGACY_APPROVED' };

    const normalizedDeviceId = normalizeDeviceId(deviceId);
    if (!normalizedDeviceId) return { ok: false, status: 'DEVICE_ID_REQUIRED' };

    const deviceIdHash = hashDeviceValue(normalizedDeviceId);
    if (!deviceToken) {
      const bytes = randomBytesImpl(32);
      if (!Buffer.isBuffer(bytes) || bytes.length !== 32) {
        return { ok: false, status: 'DEVICE_AUTH_ERROR' };
      }
      const issuedToken = bytes.toString('hex');
      const registration = await registerDevice({
        licenseId: license?.id,
        productCode,
        platform,
        deviceIdHash,
        deviceTokenHash: hashDeviceValue(issuedToken),
        deviceFingerprint: deviceIdHash.slice(0, 12),
      });
      const status = String(registration?.status || registration || 'DEVICE_AUTH_ERROR');
      if (!['DEVICE_ACTIVATED', 'DEVICE_REISSUED'].includes(status)) {
        return { ok: false, status };
      }
      return { ok: true, status, issuedToken };
    }

    const normalizedToken = String(deviceToken).trim();
    if (normalizedToken.length < 32 || normalizedToken.length > 256) {
      return { ok: false, status: 'DEVICE_AUTH_ERROR' };
    }
    const device = await getDevice({
      licenseId: license?.id,
      deviceIdHash,
      productCode,
      platform,
    });
    if (!device) return { ok: false, status: 'DEVICE_AUTH_ERROR' };
    if (device.status !== 'ACTIVE') return { ok: false, status: 'DEVICE_REVOKED' };
    if (!safeDeviceHashEqual(hashDeviceValue(normalizedToken), device.device_token_hash)) {
      return { ok: false, status: 'DEVICE_AUTH_ERROR' };
    }
    await touchDevice(device.id);
    return { ok: true, status: 'DEVICE_APPROVED' };
  }

  return { authorize };
}
