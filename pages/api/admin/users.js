import { supabase } from '../../../lib/supabase';
import { requireAdmin, hashPassword, logAccess } from '../../../lib/auth';

const ALL_FEATURES = ['dashboard','cot','calendar','calculator','journal','signals','engine','accuracy'];
const ROLE_DEFAULTS = {
  user:  ['dashboard','cot','calendar','calculator'],
  vip:   ['dashboard','cot','calendar','calculator','journal','signals'],
  admin: ['dashboard','cot','calendar','calculator','journal','signals','engine','accuracy'],
};

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Admin only' });

  if (req.method === 'GET') {
    const { data: users, error: uErr } = await supabase
      .from('panda_users')
      .select('id, username, role, is_active, max_devices, created_at, created_by, notes, plain_password, expires_at, feature_access')
      .order('created_at', { ascending: false });

    if (uErr) return res.status(500).json({ error: uErr.message });

    const { data: sessions } = await supabase.from('panda_sessions').select('user_id, device_fingerprint, last_seen, is_revoked').eq('is_revoked', false);

    const usersWithStats = (users || []).map(u => {
      const userSessions = (sessions || []).filter(s => s.user_id === u.id);
      const uniqueDevices = [...new Set(userSessions.map(s => s.device_fingerprint))];
      const sorted = [...userSessions].sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));
      return { ...u, active_sessions: userSessions.length, active_devices: uniqueDevices.length, last_seen: sorted[0]?.last_seen || null };
    });

    return res.status(200).json(usersWithStats);
  }

  if (req.method === 'POST') {
    const { username, password, role = 'user', max_devices = 1, notes = '', expires_at = null, feature_access } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

    const features = feature_access || ROLE_DEFAULTS[role] || ROLE_DEFAULTS.user;
    const { error } = await supabase.from('panda_users').insert({
      username: username.trim(), password_hash: hashPassword(password), plain_password: password,
      role, max_devices: parseInt(max_devices), notes, expires_at: expires_at || null,
      created_by: admin.username, feature_access: features,
    });

    if (error) return res.status(400).json({ error: error.message.includes('unique') ? 'Username already exists' : error.message });
    await logAccess(admin.username, 'CREATE_USER', req, true, `Created: ${username}`);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'PATCH') {
    const { id, is_active, max_devices, role, notes, password, expires_at, feature_access } = req.body;
    if (!id) return res.status(400).json({ error: 'ID required' });

    const updates = {};
    if (is_active !== undefined) updates.is_active = is_active;
    if (max_devices !== undefined) updates.max_devices = parseInt(max_devices);
    if (notes !== undefined) updates.notes = notes;
    if (expires_at !== undefined) updates.expires_at = expires_at || null;
    if (feature_access !== undefined) updates.feature_access = feature_access;
    if (password) { updates.password_hash = hashPassword(password); updates.plain_password = password; }

    // If role changes, auto-update feature_access unless custom was provided
    if (role !== undefined) {
      updates.role = role;
      if (feature_access === undefined) updates.feature_access = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.user;
    }

    const { error } = await supabase.from('panda_users').update(updates).eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    if (is_active === false) await supabase.from('panda_sessions').update({ is_revoked: true }).eq('user_id', id);
    await logAccess(admin.username, 'UPDATE_USER', req, true, `Updated: ${id}`);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID required' });
    const { error } = await supabase.from('panda_users').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    await logAccess(admin.username, 'DELETE_USER', req, true, `Deleted: ${id}`);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
