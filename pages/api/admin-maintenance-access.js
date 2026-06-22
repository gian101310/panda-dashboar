import { serialize } from 'cookie';
import {
  createAdminMaintenanceAccessToken,
  getAdminMaintenanceAccessKey,
  hasValidAdminMaintenanceAccess,
  isAdminMaintenanceKeyValid,
} from '../../lib/adminMaintenanceAccess.mjs';

const COOKIE_NAME = 'panda_admin_maintenance_access';
const MAX_AGE_SECONDS = 10 * 60;

function hasAccess(req, key) {
  return hasValidAdminMaintenanceAccess(req.cookies?.[COOKIE_NAME], key);
}

export default function handler(req, res) {
  const key = getAdminMaintenanceAccessKey();

  if (req.method === 'GET') {
    return res.status(200).json({ allowed: hasAccess(req, key) });
  }

  if (req.method === 'POST') {
    if (!isAdminMaintenanceKeyValid(req.body?.key, key)) {
      return res.status(401).json({ error: 'Invalid maintenance access key' });
    }

    const token = createAdminMaintenanceAccessToken(key);
    res.setHeader('Set-Cookie', serialize(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: MAX_AGE_SECONDS,
      path: '/',
    }));
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}
