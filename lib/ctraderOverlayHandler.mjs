import {
  CTRADER_OVERLAY_PRODUCT_CODE,
  decideOverlayCredential,
  hashOverlayToken,
  normalizeTradingAccountNumber,
  safeTokenEqual,
  sanitizeOverlayRows,
} from './ctraderOverlay.mjs';

const MAX_AGE_SECONDS = 600;
const SNAPSHOT_CACHE_MS = 10_000;

function header(req, name) {
  const value = req?.headers?.[name];
  return Array.isArray(value) ? value[0] : String(value ?? '').trim();
}
export function createCtraderOverlayHandler({
  now = () => new Date(),
  getTokenSetting,
  getLicense,
  getDashboardRows,
  touchLicense = async () => {},
  rateLimiter = () => true,
}) {
  let snapshotCache = { timestamp: 0, pairs: null };

  async function snapshot(currentTime) {
    if (snapshotCache.pairs && currentTime.getTime() - snapshotCache.timestamp < SNAPSHOT_CACHE_MS) {
      return snapshotCache.pairs;
    }
    const pairs = sanitizeOverlayRows(await getDashboardRows());
    snapshotCache = { timestamp: currentTime.getTime(), pairs };
    return pairs;
  }

  return async function ctraderOverlayHandler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const ip = header(req, 'x-forwarded-for').split(',')[0] || req?.socket?.remoteAddress || 'unknown';
    if (!rateLimiter(ip)) return res.status(429).json({ error: 'Too many requests' });

    const token = header(req, 'x-panda-operator-token');
    const rawAccount = header(req, 'x-panda-account-number');
    if (token && rawAccount) return res.status(400).json({ error: 'Use one credential type' });
    if (!token && !rawAccount) return res.status(401).json({ error: 'Authentication required' });

    const currentTime = now();
    if (token) {
      if (token.length < 32 || token.length > 256) return res.status(403).json({ status: 'AUTH_ERROR' });
      const setting = await getTokenSetting();
      if (!setting?.token_hash || !safeTokenEqual(hashOverlayToken(token), setting.token_hash)) {
        return res.status(403).json({ status: 'AUTH_ERROR' });
      }
    } else {
      const account = normalizeTradingAccountNumber(rawAccount);
      if (!account) return res.status(400).json({ status: 'INVALID_ACCOUNT' });
      const license = await getLicense(account, CTRADER_OVERLAY_PRODUCT_CODE);
      const decision = decideOverlayCredential(license, currentTime);
      if (!decision.ok) return res.status(403).json({ status: decision.status });
      await touchLicense(license.id, currentTime.toISOString());
    }

    return res.status(200).json({
      schema_version: 1,
      server_time: currentTime.toISOString(),
      max_age_seconds: MAX_AGE_SECONDS,
      pairs: await snapshot(currentTime),
    });
  };
}
