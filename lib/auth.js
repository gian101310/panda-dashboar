import { supabase } from './supabase';
import crypto from 'crypto';

export function hashPassword(password) {
  const salt = 'panda_salt_2026';
  return crypto.createHash('sha256').update(password + salt).digest('hex');
}

export function generateToken() {
  return crypto.randomBytes(48).toString('hex');
}

export async function logAccess(username, action, req, success = true, detail = '') {
  try {
    await supabase.from('panda_access_logs').insert({
      username,
      action,
      ip_address: req?.headers?.['x-forwarded-for']?.split(',')[0] || '',
      user_agent: req?.headers?.['user-agent'] || '',
      success,
      detail,
    });
  } catch {}
}

export async function validateSession(token) {
  if (!token) return null;
  try {
    // Get session
    const { data: session, error: sErr } = await supabase
      .from('panda_sessions')
      .select('*')
      .eq('token', token)
      .eq('is_revoked', false)
      .single();

    if (sErr || !session) return null;

    // Get user separately
    const { data: user, error: uErr } = await supabase
      .from('panda_users')
      .select('*')
      .eq('id', session.user_id)
      .single();

    if (uErr || !user || !user.is_active) return null;

    // Update last_seen (fire and forget)
    supabase.from('panda_sessions')
      .update({ last_seen: new Date().toISOString() })
      .eq('token', token)
      .then(() => {}).catch(() => {});

    // Return merged session+user object
    return { ...session, panda_users: user, username: session.username };
  } catch {
    return null;
  }
}

export async function requireAdmin(req) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return null;
  if (session.panda_users?.role !== 'admin') return null;
  return session;
}