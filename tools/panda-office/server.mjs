import http from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const officeDir = fileURLToPath(new URL('.', import.meta.url));
const repoDir = resolve(officeDir, '../..');
const distDir = join(officeDir, 'dist');
const port = Number(process.env.PANDA_OFFICE_PORT || 4318);
try { process.loadEnvFile(join(repoDir, '.env')); } catch { /* optional */ }
const mt4Dir = process.env.MT4_PATH || join(process.env.APPDATA || '', 'MetaQuotes', 'Terminal', 'Common', 'Files');

const supabaseUrl = process.env.SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_KEY || '';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const cache = { at: 0, value: null, pending: null };

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const raw = String(value).replace(' ', 'T');
  // app.py writes naive UTC timestamps to engine_logs.
  const stamped = /(?:Z|[+-]\d\d:\d\d)$/i.test(raw) ? raw : `${raw}Z`;
  const date = new Date(stamped);
  return Number.isNaN(+date) ? null : date;
}
const ageMinutes = (value) => { const date = parseDate(value); return date ? Math.max(0, (Date.now() - date.getTime()) / 60000) : Infinity; };
const iso = (value) => parseDate(value)?.toISOString() || null;
const agent = (id, label, status, activity, at, source, detail = '') => ({ id, label, status, activity, at: iso(at), source, detail });

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function rows(table, select, order, limit = 8) {
  if (!supabaseUrl || !serviceKey) throw new Error('Local database connection unavailable');
  const url = new URL(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}`);
  url.searchParams.set('select', select);
  url.searchParams.set('order', `${order}.desc`);
  url.searchParams.set('limit', String(limit));
  return jsonFetch(url, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
}

async function latestFile(name) {
  try { return (await stat(join(repoDir, name))).mtime; } catch { return null; }
}

async function linesExport() {
  try {
    const files = (await readdir(mt4Dir)).filter((name) => /^tbg_[A-Z]{6}\.txt$/i.test(name));
    const times = await Promise.all(files.map((name) => stat(join(mt4Dir, name)).then((s) => s.mtime).catch(() => null)));
    const fresh = times.filter((time) => time && ageMinutes(time) < 15).length;
    const latest = times.filter(Boolean).sort((a, b) => b - a)[0] || null;
    const prevChecks = await Promise.all(files.map(async (name, index) => {
      if (!times[index] || ageMinutes(times[index]) >= 15) return false;
      try {
        const content = await readFile(join(mt4Dir, name), 'utf8');
        return /^PDH\s*:/m.test(content) && /^PDL\s*:/m.test(content);
      } catch { return false; }
    }));
    return { count: files.length, fresh, previousFresh: prevChecks.filter(Boolean).length, latest };
  } catch { return { count: 0, fresh: 0, previousFresh: 0, latest: null }; }
}

async function gather() {
  const [engine, logs, outbox, licenses, imageTime, lines] = await Promise.allSettled([
    jsonFetch('http://127.0.0.1:8000/status'),
    rows('engine_logs', 'timestamp,component,error', 'timestamp', 18),
    rows('signal_alert_outbox', 'created_at,sent_at,status,alert_type', 'created_at', 12),
    rows('indicator_licenses', 'updated_at,status', 'updated_at', 5),
    latestFile('snapshot.png'),
    linesExport(),
  ]);
  const ok = (item, fallback) => item.status === 'fulfilled' ? item.value : fallback;
  const health = ok(engine, null);
  const recentLogs = ok(logs, []);
  const alertRows = ok(outbox, []);
  const licenseRows = ok(licenses, []);
  const image = ok(imageTime, null);
  const lineData = ok(lines, { count: 0, fresh: 0, previousFresh: 0, latest: null });

  const scoreLog = recentLogs.find((r) => r.component === 'run_gap_once_v3');
  const scoreAt = health?.last_run || scoreLog?.timestamp || null;
  const scoreAge = ageMinutes(scoreAt);
  const scoreStatus = !health ? 'unavailable' : health.status !== 'ACTIVE' || scoreAge > 15 ? 'warning' : scoreAge < 0.45 ? 'working' : 'ready';
  const snapshotLog = recentLogs.find((r) => /^telegram_snapshot_(ok|fail|exception)$/.test(r.component));
  const snapshotAt = image && (!snapshotLog || image > parseDate(snapshotLog.timestamp)) ? image : snapshotLog?.timestamp || image;
  const snapshotStatus = !snapshotAt ? 'unavailable' : snapshotLog?.component !== 'telegram_snapshot_ok' && snapshotLog && ageMinutes(snapshotLog.timestamp) < 90 ? 'warning' : ageMinutes(image) < 0.45 ? 'working' : 'ready';
  const alertLatest = alertRows[0];
  const alertStatus = outbox.status !== 'fulfilled' ? 'unavailable' : !alertLatest ? 'idle' : alertLatest.status === 'sending' ? 'working' : ['failed', 'uncertain'].includes(alertLatest.status) ? 'warning' : 'ready';
  const telegramStatus = logs.status !== 'fulfilled' && outbox.status !== 'fulfilled' ? 'unavailable' :
    alertRows.some((r) => r.status === 'sending') ? 'working' :
    snapshotLog?.component === 'telegram_snapshot_fail' || snapshotLog?.component === 'telegram_snapshot_exception' ? 'warning' : 'ready';
  const licenseLatest = licenseRows[0];
  const licenseStatus = licenses.status !== 'fulfilled' ? 'unavailable' : licenseLatest?.status === 'PENDING' ? 'warning' : 'ready';
  const lineStatus = !lineData.latest ? 'unavailable' : lineData.fresh ? 'ready' : 'warning';

  const agents = [
    agent('scoring', 'Scoring', scoreStatus, !health ? 'Engine status unavailable' : `${health.total_pairs ?? 0} pairs processed · ${health.valid_pairs ?? 0} valid`, scoreAt, 'Engine /status', scoreAge > 15 ? 'Last scoring cycle is stale' : 'Core scoring code is observed, never controlled here'),
    agent('snapshot', 'Snapshot', snapshotStatus, !snapshotAt ? 'No snapshot observed' : ageMinutes(image) < 0.45 ? 'Preparing snapshot image' : 'Latest image and send record observed', snapshotAt, 'Snapshot image + engine log', 'Image creation does not prove Telegram delivery'),
    agent('alerts', 'Alerts', alertStatus, !alertLatest ? 'No recent alert in outbox' : `${alertLatest.alert_type || 'Signal'} · ${alertLatest.status}`, alertLatest?.created_at, 'Signal alert outbox', 'Delivery state comes from the durable outbox'),
    agent('telegram', 'Telegram', telegramStatus, snapshotLog?.component === 'telegram_snapshot_ok' ? 'Snapshot delivery recorded' : alertLatest?.status === 'sent' ? 'Signal delivery recorded' : 'Waiting for delivery record', snapshotLog?.timestamp || alertLatest?.sent_at, 'Engine log + alert outbox', 'Sent is shown only for a recorded delivery result'),
    agent('checker', 'Send Check', 'unavailable', 'No pre-send review event', null, 'Not instrumented', 'This viewer does not gate or approve Telegram messages'),
    agent('licensing', 'Licensing', licenseStatus, licenseLatest ? `Latest license status: ${licenseLatest.status}` : licenses.status === 'fulfilled' ? 'No license records' : 'License feed unavailable', licenseLatest?.updated_at, 'License status only', 'No customer or account details shown'),
    agent('lines', 'Panda Lines', lineStatus, lineData.count ? `${lineData.fresh}/${lineData.count} exports fresh` : 'No local Lines exports', lineData.latest, 'Local tbg files', 'Export freshness does not prove chart rendering'),
    agent('previous', 'Previous Day', !lineData.latest ? 'unavailable' : lineData.previousFresh ? 'ready' : 'warning',
      lineData.count ? `${lineData.previousFresh}/${lineData.count} exports have fresh PDH/PDL` : 'No previous-day exports',
      lineData.latest, 'Local tbg files', 'Checks PDH and PDL fields in the latest local exports; chart rendering is not verified'),
  ];

  const events = [
    ...recentLogs.filter((r) => /^(run_gap_once_v3|telegram_snapshot_|telegram_adv_scorecard_)/.test(r.component)).map((r) => ({
      key: `log:${r.timestamp}:${r.component}`, at: iso(r.timestamp), kind: r.error ? 'warning' : 'success',
      title: r.component === 'run_gap_once_v3' ? 'Scoring cycle recorded' : r.component.replaceAll('_', ' '),
      source: 'Engine log',
    })),
    ...alertRows.map((r) => ({
      key: `alert:${r.created_at}:${r.alert_type}:${r.status}`, at: iso(r.sent_at || r.created_at),
      kind: ['failed', 'uncertain'].includes(r.status) ? 'warning' : r.status === 'sent' ? 'success' : 'info',
      title: `${r.alert_type || 'Signal alert'} · ${r.status}`, source: 'Signal outbox',
    })),
  ].filter((event) => event.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 16);
  return { updatedAt: new Date().toISOString(), agents, events, sourceHealth: { engine: engine.status === 'fulfilled', logs: logs.status === 'fulfilled', outbox: outbox.status === 'fulfilled', licenses: licenses.status === 'fulfilled' } };
}

async function snapshot() {
  if (cache.value && Date.now() - cache.at < 15000) return cache.value;
  if (!cache.pending) cache.pending = gather().then((value) => { cache.value = value; cache.at = Date.now(); return value; }).finally(() => { cache.pending = null; });
  return cache.pending;
}

function respond(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; script-src 'self'" });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || '';
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) return respond(res, 403, '{"error":"Local only"}');
  if (req.method !== 'GET') return respond(res, 405, '{"error":"Read-only viewer"}');
  const pathname = new URL(req.url || '/', `http://${host}`).pathname;
  if (pathname === '/api/health') return respond(res, 200, JSON.stringify({ ok: true }));
  if (pathname === '/api/office') {
    try { return respond(res, 200, JSON.stringify(await snapshot())); }
    catch { return respond(res, 503, '{"error":"Office sources unavailable"}'); }
  }
  const file = resolve(distDir, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (file !== distDir && !file.startsWith(distDir + sep)) return respond(res, 404, 'Not found', 'text/plain');
  try { return respond(res, 200, await readFile(file), mime[extname(file)] || 'application/octet-stream'); }
  catch { return respond(res, 404, 'Not found', 'text/plain'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Panda Office ready at http://127.0.0.1:${port}`));
