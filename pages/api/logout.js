import { serialize } from 'cookie';
import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  if (token) {
    // Revoke the session token in the DB so it cannot be reused even if captured
    supabase.from('panda_sessions').update({ is_revoked: true }).eq('token', token).then(() => {}).catch(() => {});
  }
  res.setHeader('Set-Cookie', serialize('panda_session', '', {
    httpOnly: true, maxAge: 0, path: '/',
  }));
  res.status(200).json({ ok: true });
}
