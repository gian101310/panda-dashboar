import { serialize } from 'cookie';
import { supabase } from '../../lib/supabase';
import { hashPassword, generateToken, logAccess } from '../../lib/auth';
import { getLoginAlertConfig, sendLoginAlert } from '../../lib/loginAlert.mjs';
import crypto from 'crypto';

function getFingerprint(req) {
  const ua = req.headers['user-agent'] || '';
  const lang = req.headers['accept-language'] || '';
  const enc = req.headers['accept-encoding'] || '';
  return crypto.createHash('sha256').update(ua + lang + enc).digest('hex').slice(0, 32);
}

// ===== LOGIN RATE LIMIT (in-memory, per serverless instance) =====
// 5 failed attempts per IP+username → locked for 10 minutes
const FAIL_LIMIT = 5;
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const loginFails = new Map(); // key → { count, first }

function rlKey(req, username) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'noip';
  return ip + '|' + (username || '').toLowerCase();
}
function rlCheck(key) {
  const e = loginFails.get(key);
  if (!e) return false;
  if (Date.now() - e.first > FAIL_WINDOW_MS) { loginFails.delete(key); return false; }
  return e.count >= FAIL_LIMIT;
}
function rlFail(key) {
  const e = loginFails.get(key);
  if (!e || Date.now() - e.first > FAIL_WINDOW_MS) loginFails.set(key, { count: 1, first: Date.now() });
  else e.count++;
  if (loginFails.size > 5000) loginFails.clear(); // memory guard
}
function rlClear(key) { loginFails.delete(key); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  const rl = rlKey(req, username);
  if (rlCheck(rl)) {
    await logAccess(username, 'LOGIN_RATE_LIMITED', req, false, 'Too many failed attempts');
    return res.status(429).json({ error: 'Too many failed attempts. Try again in 10 minutes.' });
  }

  try {
    const { data: user } = await supabase
      .from('panda_users')
      .select('*')
      .eq('username', username.trim())
      .single();

    if (!user) {
      rlFail(rl);
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
      rlFail(rl);
      await logAccess(username, 'LOGIN_FAILED', req, false, 'Wrong password');
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    rlClear(rl);

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
      const { token: alertToken, chatId: alertChatId } = getLoginAlertConfig();
      const alertResult = await sendLoginAlert({
        username,
        role: user.role,
        ip,
        token: alertToken,
        chatId: alertChatId,
      });
      if (!alertResult.ok) {
        console.error('Login alert rejected:', alertResult.status, alertResult.body);
      }
    } catch (e) {
      console.error('Login alert error:', e);
    }

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
