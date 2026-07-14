import { hashOverlayToken } from './ctraderOverlay.mjs';

export function createIndicatorFeedAdminHandler({
  requireAdmin,
  getSetting,
  saveSetting,
  now = () => new Date(),
}) {
  return async function indicatorFeedAdminHandler(req, res) {
    const admin = await requireAdmin(req);
    if (!admin) return res.status(403).json({ error: 'Admin only' });

    if (req.method === 'GET') {
      const setting = await getSetting();
      return res.status(200).json({
        configured: Boolean(setting?.token_hash),
        rotated_at: setting?.rotated_at || null,
      });
    }

    if (req.method === 'PUT') {
      const token = String(req.body?.token || '').trim();
      if (token.length < 32 || token.length > 256) {
        return res.status(400).json({ error: 'Token must be 32-256 characters' });
      }
      const rotatedAt = now().toISOString();
      await saveSetting({
        setting_key: 'ctrader_operator_token',
        token_hash: hashOverlayToken(token),
        rotated_at: rotatedAt,
        rotated_by: String(admin.username || admin.panda_users?.username || 'admin'),
      });
      return res.status(200).json({ ok: true, configured: true, rotated_at: rotatedAt });
    }

    return res.status(405).end();
  };
}
