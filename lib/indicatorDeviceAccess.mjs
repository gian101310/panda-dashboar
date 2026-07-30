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

function normalizeDeviceMode(policy) {
  if (policy === true) return 'ENFORCED';
  if (!policy) return 'OFF';
  if (typeof policy === 'string') {
    const mode = policy.trim().toUpperCase();
    return ['OFF', 'SHADOW', 'ENFORCED'].includes(mode) ? mode : 'OFF';
  }
  const mode = String(policy.mode || '').trim().toUpperCase();
  if (['OFF', 'SHADOW', 'ENFORCED'].includes(mode)) return mode;
  return policy.enabled === true ? 'ENFORCED' : 'OFF';
}

export function createIndicatorDeviceAccess({
  getEnforcement,
  getDevice = async () => null,
  registerDevice = async () => 'DEVICE_AUTH_ERROR',
  touchDevice = async () => {},
  recordShadowEvent = async () => {},
  randomBytesImpl = randomBytes,
}) {
  async function evaluate({ license, productCode, platform, deviceId, deviceToken }) {
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
    await touchDevice(device);
    return { ok: true, status: 'DEVICE_APPROVED' };
  }

  async function authorize(request) {
    const mode = normalizeDeviceMode(await getEnforcement(request.productCode));
    if (mode === 'OFF') return { ok: true, status: 'LEGACY_APPROVED' };

    const decision = await evaluate(request);
    if (mode === 'ENFORCED') return decision;

    try {
      await recordShadowEvent({
        licenseId: request.license?.id,
        productCode: request.productCode,
        platform: request.platform,
        wouldStatus: decision.status,
        installationPresent: Boolean(normalizeDeviceId(request.deviceId)),
        tokenPresent: Boolean(String(request.deviceToken || '').trim()),
      });
    } catch {
      // Shadow telemetry must never interrupt account-approved indicator data.
    }
    return {
      ok: true,
      status: 'SHADOW_APPROVED',
      shadowStatus: decision.status,
      ...(decision.issuedToken ? { issuedToken: decision.issuedToken } : {}),
    };
  }

  return { authorize };
}
