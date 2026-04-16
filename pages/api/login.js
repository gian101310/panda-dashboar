import { serialize } from 'cookie';
import { supabase } from '../../lib/supabase';
import { hashPassword, generateToken, logAccess } from '../../lib/auth';
import crypto from 'crypto';

function getFingerprint(req) {
  const ua = req.headers['user-agent'] || '';
  const lang = req.headers['accept-language'] || '';
  const enc = req.headers['accept-encoding'] || '';
  return crypto.createHash('sha256').update(ua + lang + enc).digest('hex').slice(0, 32);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  try {
    const { data: user } = await supabase
      .from('panda_users')
      .select('*')
      .eq('username', username.trim())
      .single();

    if (!user) {
      await logAccess(username, 'LOGIN_FAILED', req, false, 'User not found');
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (!user.is_active) {
      await logAccess(username, 'LOGIN_BLOCKED', req, false, 'Account disabled');
      return res.status(403).json({ error: 'Account has been disabled' });
    }

    // ===== CHECK EXPIRY =====
    if (user.expires_at) {
      const expiry = new Date(user.expires_at);
      if (new Date() > expiry) {
        // Auto-disable the account
        await supabase.from('panda_users').update({ is_active: false }).eq('id', user.id);
        await supabase.from('panda_sessions').update({ is_revoked: true }).eq('user_id', user.id);
        await logAccess(username, 'LOGIN_EXPIRED', req, false, `Expired: ${user.expires_at}`);
        return res.status(403).json({ error: 'Your access has expired. Contact admin to renew.' });
      }
    }

    const hash = hashPassword(password);
    if (hash !== user.password_hash) {
      await logAccess(username, 'LOGIN_FAILED', req, false, 'Wrong password');
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const fingerprint = getFingerprint(req);
    const ip = req.headers['x-forwarded-for'] || '';

    const { data: activeSessions } = await supabase
      .from('panda_sessions')
      .select('id, device_fingerprint')
      .eq('user_id', user.id)
      .eq('is_revoked', false);

    const sessions = activeSessions || [];
    const existingDeviceSession = sessions.find(s => s.device_fingerprint === fingerprint);

    if (!existingDeviceSession) {
      const uniqueDevices = [...new Set(sessions.map(s => s.device_fingerprint))];
      if (uniqueDevices.length >= user.max_devices) {
        await logAccess(username, 'LOGIN_DEVICE_LIMIT', req, false, `Max: ${user.max_devices}`);
        return res.status(403).json({ error: `Device limit reached. Max ${user.max_devices} device${user.max_devices > 1 ? 's' : ''} allowed. Contact admin.` });
      }
    }

    const token = generateToken();
    await supabase.from('panda_sessions').insert({
      user_id: user.id, username: user.username, token,
      device_fingerprint: fingerprint, ip_address: ip,
      user_agent: req.headers['user-agent'] || '',
    });

    await logAccess(username, 'LOGIN_SUCCESS', req, true, `Device: ${fingerprint.slice(0, 8)}`);

    // ===== TELEGRAM LOGIN ALERT =====
    try {
      const now = new Date(Date.now() + 4 * 60 * 60 * 1000);
      const ts = now.toISOString().replace('T', ' ').slice(0, 19);
      const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const dayName = days[now.getUTCDay()];
      const msg = [
        '\u{1F43C} <b>PANDA ENGINE \u2014 Login Alert</b>',
        '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
        '\u{1F464} <b>User:</b> ' + username,
        '\u{1F550} <b>Time:</b> ' + ts + ' (Dubai)',
        '\u{1F4C5} <b>Day:</b> ' + dayName,
        '\u{1F310} <b>IP:</b> ' + ip,
        '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
        '\u{1F310} <a href="https://pandaengine.app/dashboard">Open Dashboard</a>'
      ].join('\n');
      await fetch('https://api.telegram.org/bot8605294552:AAG2o7bF30qkZx0Zv_FgmwA0RgS7g56OH7Y/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: '5379148910', text: msg, parse_mode: 'HTML', disable_web_page_preview: true })
      });
    } catch (e) { console.error('Login alert error:', e); }

    res.setHeader('Set-Cookie', serialize('panda_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 12,
      path: '/',
    }));

    return res.status(200).json({ ok: true, role: user.role });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
