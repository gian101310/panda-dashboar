import { hashOverlayToken } from './ctraderOverlay.mjs';

export function createIndicatorFeedAdminHandler({
  requireAdmin,
  getSetting,
  saveSetting,
  getRotations = async () => [],
  encryptToken = async () => { throw new Error('Indicator token encryption is not configured'); },
  decryptToken = async () => { throw new Error('Active token recovery is unavailable'); },
  now = () => new Date(),
}) {
  return async function indicatorFeedAdminHandler(req, res) {
    const admin = await requireAdmin(req);
    if (!admin) return res.status(403).json({ error: 'Admin only' });

    if (req.method === 'GET') {
      const setting = await getSetting();
      const rotations = await getRotations();
      const recoverable = Boolean(
        setting?.token_ciphertext && setting?.token_iv && setting?.token_auth_tag,
      );
      return res.status(200).json({
        configured: Boolean(setting?.token_hash),
        recoverable,
        rotated_at: setting?.rotated_at || null,
        rotations: (Array.isArray(rotations) ? rotations : []).map((rotation) => ({
          rotated_at: rotation?.rotated_at || null,
          rotated_by: String(rotation?.rotated_by || 'admin'),
          token_fingerprint: String(rotation?.token_fingerprint || '').slice(0, 12),
        })),
      });
    }

    if (req.method === 'POST') {
      if (req.body?.action !== 'reveal') return res.status(400).json({ error: 'Invalid token action' });
      const setting = await getSetting();
      const recoverable = Boolean(
        setting?.token_ciphertext && setting?.token_iv && setting?.token_auth_tag,
      );
      if (!recoverable) {
        return res.status(409).json({
          error: 'Active token was created before recovery was enabled. Rotate it once to enable recovery.',
        });
      }
      const token = await decryptToken(setting);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({ token });
    }

    if (req.method === 'PUT') {
      const token = String(req.body?.token || '').trim();
      if (token.length < 32 || token.length > 256) {
        return res.status(400).json({ error: 'Token must be 32-256 characters' });
      }
      const rotatedAt = now().toISOString();
      const encrypted = await encryptToken(token);
      await saveSetting({
        setting_key: 'ctrader_operator_token',
        token_hash: hashOverlayToken(token),
        ...encrypted,
        rotated_at: rotatedAt,
        rotated_by: String(admin.username || admin.panda_users?.username || 'admin'),
      });
      return res.status(200).json({
        ok: true,
        configured: true,
        recoverable: true,
        rotated_at: rotatedAt,
      });
    }

    return res.status(405).end();
  };
}
