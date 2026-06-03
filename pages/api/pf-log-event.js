import { supabase } from '../../lib/supabase';
import crypto from 'crypto';

const ADMIN_BOT = '8605294552:AAG2o7bF30qkZx0Zv_FgmwA0RgS7g56OH7Y';
const ADMIN_CHAT = '5379148910';

const FLAGS = {
  LOGIN_SUCCESS:        ['🆕 First Login'],
  LOGIN_FAILED:         [],
  LOGIN_BLOCKED:        ['⛔ Blocked'],
  LOGIN_DEVICE_LIMIT:   ['🚫 Device Limit'],
  BRUTE_FORCE_ATTACK:   ['🚨 Brute Force'],
  NEW_USER_LOGIN:       ['🆕 First Login'],
  SUSPICIOUS_LOGIN:     ['⚠️ Suspicious'],
  NEW_DEVICE_DETECTED:  ['🧠 New Device'],
  NEW_IP_DETECTED:      ['🌍 New IP'],
  UPDATE_USER:          ['⚙️ Updated'],
  DELETE_USER:          ['🗑️ Deleted'],
};

const PRIORITY = {
  BRUTE_FORCE_ATTACK: 'CRITICAL',
  LOGIN_BLOCKED: 'HIGH',
  LOGIN_DEVICE_LIMIT: 'HIGH',
  SUSPICIOUS_LOGIN: 'HIGH',
  NEW_DEVICE_DETECTED: 'MEDIUM',
  NEW_IP_DETECTED: 'MEDIUM',
  LOGIN_FAILED: 'LOW',
  LOGIN_SUCCESS: 'INFO',
  UPDATE_USER: 'INFO',
  DELETE_USER: 'INFO',
};

function pfGetIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
}
function pfFingerprint(req, deviceHint) {
  const ua = req.headers['user-agent'] || '';
  const lang = req.headers['accept-language'] || '';
  const enc = req.headers['accept-encoding'] || '';
  return crypto.createHash('sha256').update(ua + lang + enc + (deviceHint || '')).digest('hex').slice(0, 16);
}
function pfDubaiTs() {
  const d = new Date(Date.now() + 4 * 3600 * 1000);
  return d.toISOString().replace('T',' ').slice(0,19);
}
function pfDay() {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return days[new Date(Date.now() + 4 * 3600 * 1000).getUTCDay()];
}

async function pfSendAdminAlert(evt, meta, flags, priority) {
  const header = '🐼 <b>PANDA ENGINE — ALERT</b>';
  const sep = '━━━━━━━━━━━━━━━━━━━━━━';
  const msg = [
    header, sep,
    `<b>Type:</b> ${evt}`,
    `<b>Priority:</b> ${priority}`,
    sep,
    `<b>User:</b> ${meta.username || '—'}`,
    `<b>Role:</b> ${meta.role || '—'}`,
    `<b>Time:</b> ${pfDubaiTs()} (Dubai)`,
    `<b>Day:</b> ${pfDay()}`,
    `<b>IP:</b> ${meta.ip || '—'}`,
    `<b>Device:</b> ${(meta.device_id || '—').slice(0,12)}`,
    `<b>Status:</b> ${meta.status || '—'}`,
    sep,
    flags.length ? flags.join('  ') : '',
  ].filter(Boolean).join('\n');
  try {
    await fetch(`https://api.telegram.org/bot${ADMIN_BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ADMIN_CHAT, text: msg, parse_mode: 'HTML', disable_web_page_preview: true })
    });
  } catch(e) { console.error('pf_alert_err', e); }
}

async function pfBruteCheck(username, ip) {
  const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: userFails } = await supabase
    .from('pf_security_events')
    .select('id')
    .eq('event_type', 'LOGIN_FAILED')
    .eq('username', username)
    .gte('created_at', since);
  const { data: ipFails } = await supabase
    .from('pf_security_events')
    .select('id')
    .eq('event_type', 'LOGIN_FAILED')
    .eq('ip', ip)
    .gte('created_at', since);
  return {
    userCount: (userFails || []).length,
    ipCount: (ipFails || []).length,
    bruteForce: (userFails || []).length >= 5,
    ipBlocked: (ipFails || []).length >= 10,
  };
}

async function pfDeviceCheck(username, deviceId, ip) {
  let newDevice = false, newIp = false;
  if (username && deviceId) {
    const { data: dev } = await supabase.from('pf_known_devices').select('id').eq('username', username).eq('device_id', deviceId).maybeSingle();
    if (!dev) {
      newDevice = true;
      await supabase.from('pf_known_devices').insert({ username, device_id: deviceId });
    } else {
      await supabase.from('pf_known_devices').update({ last_seen: new Date().toISOString() }).eq('id', dev.id);
    }
  }
  if (username && ip) {
    const { data: ipRec } = await supabase.from('pf_known_ips').select('id').eq('username', username).eq('ip', ip).maybeSingle();
    if (!ipRec) {
      newIp = true;
      await supabase.from('pf_known_ips').insert({ username, ip });
    } else {
      await supabase.from('pf_known_ips').update({ last_seen: new Date().toISOString() }).eq('id', ipRec.id);
    }
  }
  return { newDevice, newIp };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { event_type, username, role, status, detail, device_hint } = req.body || {};
  if (!event_type) return res.status(400).json({ error: 'event_type required' });

  const ip = pfGetIp(req);
  const device_id = pfFingerprint(req, device_hint);
  const ua = req.headers['user-agent'] || '';
  const flags = [...(FLAGS[event_type] || [])];
  let priority = PRIORITY[event_type] || 'INFO';
  let derivedEvents = [];

  try {
    if (event_type === 'LOGIN_SUCCESS' && username) {
      const dc = await pfDeviceCheck(username, device_id, ip);
      if (dc.newDevice) { flags.push('🧠 New Device'); derivedEvents.push('NEW_DEVICE_DETECTED'); }
      if (dc.newIp)     { flags.push('🌍 New IP');     derivedEvents.push('NEW_IP_DETECTED'); }
      if (dc.newDevice || dc.newIp) { flags.push('⚠️ Suspicious'); priority = 'MEDIUM'; }
    }

    if (event_type === 'LOGIN_FAILED' && (username || ip)) {
      const bf = await pfBruteCheck(username || '', ip);
      if (bf.bruteForce) { flags.push('🚨 Brute Force'); priority = 'CRITICAL'; derivedEvents.push('BRUTE_FORCE_ATTACK'); }
      if (bf.ipBlocked)  { flags.push('⛔ Blocked');     priority = 'HIGH';     derivedEvents.push('LOGIN_BLOCKED'); }
    }

    await supabase.from('pf_security_events').insert({
      event_type, username: username || null, role: role || null,
      ip, device_id, user_agent: ua, priority, flags, status: status || null, detail: detail || null
    });

    await pfSendAdminAlert(event_type, { username, role, ip, device_id, status }, flags, priority);

    for (const d of derivedEvents) {
      await supabase.from('pf_security_events').insert({
        event_type: d, username: username || null, role: role || null,
        ip, device_id, user_agent: ua, priority: PRIORITY[d] || 'HIGH', flags: FLAGS[d] || [], detail: `derived from ${event_type}`
      });
      await pfSendAdminAlert(d, { username, role, ip, device_id, status }, FLAGS[d] || [], PRIORITY[d] || 'HIGH');
    }

    return res.status(200).json({ ok: true, flags, priority, derived: derivedEvents });
  } catch (err) {
    console.error('pf_log_event_err', err);
    return res.status(500).json({ error: 'event log failed' });
  }
}
