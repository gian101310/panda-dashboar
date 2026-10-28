import { validateSession } from '../../lib/auth';

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const user = session.panda_users;

  return res.status(200).json({
    id: user.id,
    username: user.username,
    role: user.role,
    feature_access: user.feature_access || ['dashboard','cot','calendar','calculator'],
    maintenance_bypass: user.maintenance_bypass || false,
  });
}
