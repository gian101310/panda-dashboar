import {
  decideOverlayCredential,
  hashOverlayToken,
  normalizeTradingAccountNumber,
  safeTokenEqual,
  sanitizeOverlayRows,
} from './ctraderOverlay.mjs';

const MAX_AGE_SECONDS = 600;
const SNAPSHOT_CACHE_MS = 10_000;
const PLATFORMS = new Set(['MT4', 'MT5']);

function header(req, name) {
  const value = req?.headers?.[name];
  return Array.isArray(value) ? value[0] : String(value ?? '').trim();
}

export function createMetatraderOverlayHandler({
  platform,
  productCode,
  now = () => new Date(),
  getTokenSetting,
  getLicense,
  getDashboardRows,
  touchLicense = async () => {},
  authorizeDevice = async () => ({ ok: true, status: 'LEGACY_APPROVED' }),
  rateLimiter = () => true,
}) {
  const normalizedPlatform = String(platform || '').trim().toUpperCase();
  if (!PLATFORMS.has(normalizedPlatform)) throw new Error('Unsupported MetaTrader platform');
  if (!String(productCode || '').trim()) throw new Error('MetaTrader product code required');

  let snapshotCache = { timestamp: 0, pairs: null };

  async function snapshot(currentTime) {
    if (snapshotCache.pairs && currentTime.getTime() - snapshotCache.timestamp < SNAPSHOT_CACHE_MS) {
      return snapshotCache.pairs;
    }
    const pairs = sanitizeOverlayRows(await getDashboardRows());
    snapshotCache = { timestamp: currentTime.getTime(), pairs };
    return pairs;
  }

  return async function metatraderOverlayHandler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const ip = header(req, 'x-forwarded-for').split(',')[0] || req?.socket?.remoteAddress || 'unknown';
    if (!rateLimiter(ip)) return res.status(429).json({ error: 'Too many requests' });

    const token = header(req, 'x-panda-operator-token');
    const rawAccount = header(req, 'x-panda-account-number');
    const deviceId = header(req, 'x-panda-device-id');
    const deviceToken = header(req, 'x-panda-device-token');
    if (token && (rawAccount || deviceId || deviceToken)) return res.status(400).json({ error: 'Use one credential type' });
    if (!token && !rawAccount) return res.status(401).json({ error: 'Authentication required' });

    const currentTime = now();
    let deviceActivation;
    if (token) {
      if (token.length < 32 || token.length > 256) return res.status(403).json({ status: 'AUTH_ERROR' });
      const setting = await getTokenSetting();
      if (!setting?.token_hash || !safeTokenEqual(hashOverlayToken(token), setting.token_hash)) {
        return res.status(403).json({ status: 'AUTH_ERROR' });
      }
    } else {
      const account = normalizeTradingAccountNumber(rawAccount);
      if (!account) return res.status(400).json({ status: 'INVALID_ACCOUNT' });
      const license = await getLicense(account, productCode, normalizedPlatform);
      const decision = decideOverlayCredential(license, currentTime);
      if (!decision.ok) return res.status(403).json({ status: decision.status });
      const deviceDecision = await authorizeDevice({
        license,
        productCode,
        platform: normalizedPlatform,
        deviceId,
        deviceToken,
      });
      if (!deviceDecision.ok) return res.status(403).json({ status: deviceDecision.status });
      if (deviceDecision.issuedToken) deviceActivation = { token: deviceDecision.issuedToken };
      await touchLicense(license.id, currentTime.toISOString());
    }

    return res.status(200).json({
      schema_version: 1,
      server_time: currentTime.toISOString(),
      max_age_seconds: MAX_AGE_SECONDS,
      ...(deviceActivation ? { device_activation: deviceActivation } : {}),
      pairs: await snapshot(currentTime),
    });
  };
}
