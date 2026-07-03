import { validateSession } from '../../lib/auth';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { exec, spawn } from 'child_process';

/**
 * Watchdog API — manages the guardian-watchdog.bat process.
 *
 * GET  /api/watchdog          → status (running, last heartbeat, restart count)
 * POST /api/watchdog { action: "start" }  → spawn watchdog bat detached
 * POST /api/watchdog { action: "stop" }   → signal watchdog to stop
 * POST /api/watchdog { action: "logs" }   → tail last N lines of log
 */

const ROOT = resolve(process.cwd());
const PID_FILE = resolve(ROOT, '.watchdog.pid');
const HEARTBEAT_FILE = resolve(ROOT, '.watchdog.heartbeat');
const STOP_FILE = resolve(ROOT, '.watchdog.stop');
const LOG_FILE = resolve(ROOT, 'guardian-watchdog.log');
const BAT_FILE = resolve(ROOT, 'guardian-watchdog.bat');

function getStatus() {
  const hasPid = existsSync(PID_FILE);
  const hasHeartbeat = existsSync(HEARTBEAT_FILE);

  let heartbeat = null;
  let heartbeatAge = null;
  let isCooldown = false;

  if (hasHeartbeat) {
    const raw = readFileSync(HEARTBEAT_FILE, 'utf8').trim();
    isCooldown = raw.includes('COOLDOWN');
    heartbeat = raw.replace(' COOLDOWN', '');
    // Try to parse the Windows date/time format
    // Format: "Sat 06/27/2026 14:30:00.00"
    try {
      const d = new Date(heartbeat);
      if (!isNaN(d)) {
        heartbeatAge = Math.round((Date.now() - d.getTime()) / 1000);
      }
    } catch {}
  }

  // Consider alive if PID file exists and heartbeat is < 10 minutes old
  const alive = hasPid && hasHeartbeat && (heartbeatAge === null || heartbeatAge < 600);

  return {
    running: alive,
    hasPidFile: hasPid,
    heartbeat,
    heartbeatAgeSec: heartbeatAge,
    isCooldown,
    hasStopSignal: existsSync(STOP_FILE),
  };
}

function tailLog(lines = 50) {
  if (!existsSync(LOG_FILE)) return '';
  try {
    const content = readFileSync(LOG_FILE, 'utf8');
    const allLines = content.split(/\r?\n/);
    return allLines.slice(-lines).join('\n');
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  // Block on Vercel — watchdog only works locally
  if (process.env.VERCEL) {
    return res.status(400).json({ error: 'Watchdog only works on localhost' });
  }

  // Skip auth on localhost, require admin otherwise
  const host = req.headers.host || '';
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  if (!isLocal) {
    const token = req.cookies?.panda_session;
    const session = await validateSession(token);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    if (session.panda_users?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  }

  // GET — status
  if (req.method === 'GET') {
    const status = getStatus();
    const log = tailLog(30);
    return res.status(200).json({ ...status, log });
  }

  // POST — actions
  if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });

  const { action, lines } = req.body || {};

  if (action === 'status') {
    const status = getStatus();
    const log = tailLog(lines || 30);
    return res.status(200).json({ ...status, log });
  }

  if (action === 'start') {
    const status = getStatus();
    if (status.running) {
      return res.status(200).json({ success: false, message: 'Watchdog already running' });
    }

    // Clean up stale files
    try { if (existsSync(STOP_FILE)) unlinkSync(STOP_FILE); } catch {}
    try { if (existsSync(PID_FILE)) unlinkSync(PID_FILE); } catch {}

    // Spawn the bat file detached
    try {
      const child = spawn('cmd.exe', ['/c', 'start', '/min', 'Guardian Watchdog', BAT_FILE], {
        cwd: ROOT,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();

      // Wait a moment for PID file to appear
      await new Promise(r => setTimeout(r, 2000));
      const newStatus = getStatus();
      return res.status(200).json({ success: true, message: 'Watchdog started', ...newStatus });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  if (action === 'stop') {
    // Write stop signal file — the bat checks for this after each pass
    writeFileSync(STOP_FILE, new Date().toISOString());

    // Also try to kill any running node autonomous-loop processes
    try {
      await new Promise((resolve, reject) => {
        exec('taskkill /fi "WINDOWTITLE eq Panda Guardian Watchdog" /f', { timeout: 5000 }, (err) => {
          // Taskkill may fail if window title doesn't match, that's ok
          resolve();
        });
      });
    } catch {}

    // Also kill node processes running autonomous-loop
    try {
      await new Promise((resolve) => {
        exec('wmic process where "commandline like \'%autonomous-loop%\'" call terminate', { timeout: 5000 }, () => resolve());
      });
    } catch {}

    // Clean up files
    try { unlinkSync(PID_FILE); } catch {}
    try { unlinkSync(HEARTBEAT_FILE); } catch {}

    return res.status(200).json({ success: true, message: 'Stop signal sent', running: false });
  }

  if (action === 'logs') {
    const log = tailLog(lines || 100);
    return res.status(200).json({ log });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}
