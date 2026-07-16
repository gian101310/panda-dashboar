import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { INDICATOR_PRODUCTS } from '../../lib/indicatorProducts.mjs';
import { generateIndicatorToken } from '../../lib/indicatorTokenGenerator.mjs';

const mono = "'Share Tech Mono', monospace";
const orb = "'Orbitron', sans-serif";
const raj = "'Rajdhani', sans-serif";
const productMap = Object.fromEntries(INDICATOR_PRODUCTS.map((product) => [product.code, product]));

function usesTradingAccount(platform, productCode) {
  return platform === 'CTRADER' || platform === 'MT5' || String(productCode || '').endsWith('_dashboard_overlay');
}

function Badge({ label, color }) {
  return <span style={{ fontFamily: mono, fontSize: 8, letterSpacing: 1, color, background: color + '18', border: `1px solid ${color}44`, borderRadius: 4, padding: '3px 7px' }}>{label}</span>;
}

function formatDate(value) {
  if (!value) return '-';
  try { return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); }
  catch { return '-'; }
}

function formatDateTime(value) {
  if (!value) return '-';
  try { return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return '-'; }
}

function statusColor(status) {
  if (status === 'APPROVED') return '#00ff9f';
  if (status === 'PENDING') return '#ffd166';
  if (status === 'DISABLED') return '#ff4d6d';
  if (status === 'EXPIRED') return '#ff9944';
  return '#8899aa';
}

export default function LicenseAdminPage() {
  const [adminUser, setAdminUser] = useState(null);
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tokenStatus, setTokenStatus] = useState({ configured: false, recoverable: false, rotated_at: null, rotations: [] });
  const [newToken, setNewToken] = useState('');
  const [rotatingToken, setRotatingToken] = useState(false);
  const [downloadStats, setDownloadStats] = useState({ totals: [], recent: [] });
  const [showDownloadActivity, setShowDownloadActivity] = useState(false);
  const [devicePolicies, setDevicePolicies] = useState([]);
  const [selectedLicense, setSelectedLicense] = useState(null);
  const [licenseDevices, setLicenseDevices] = useState([]);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [revealedToken, setRevealedToken] = useState('');
  const [revealStatus, setRevealStatus] = useState('REVEAL & COPY ACTIVE TOKEN');
  const revealTimerRef = useRef(null);
  const [form, setForm] = useState({ customer_name: '', contact: '', telegram_username: '', mt4_account_id: '', trading_account_number: '', platform: 'MT4', product_code: INDICATOR_PRODUCTS[0].code, paid_confirmed: false, price_override: '', notes: '' });

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/indicator-licenses');
    if (res.status === 403) { window.location.href = '/login'; return; }
    const data = await res.json();
    setLicenses(Array.isArray(data.licenses) ? data.licenses : []);
    const tokenRes = await fetch('/api/admin/indicator-feed-token');
    if (tokenRes.ok) setTokenStatus(await tokenRes.json());
    const downloadRes = await fetch('/api/admin/indicator-downloads');
    if (downloadRes.ok) {
      const downloads = await downloadRes.json();
      setDownloadStats({
        totals: Array.isArray(downloads.totals) ? downloads.totals : [],
        recent: Array.isArray(downloads.recent) ? downloads.recent : [],
      });
    }
    const deviceRes = await fetch('/api/admin/indicator-license-devices');
    if (deviceRes.ok) {
      const devices = await deviceRes.json();
      setDevicePolicies(Array.isArray(devices.policies) ? devices.policies : []);
    }
  }, []);

  useEffect(() => {
    fetch('/api/me').then((r) => r.json()).then((user) => {
      if (!user?.username || user.role !== 'admin') { window.location.href = '/login'; return; }
      setAdminUser(user);
      setLoading(false);
      load();
    }).catch(() => { window.location.href = '/login'; });
  }, [load]);

  useEffect(() => () => clearTimeout(revealTimerRef.current), []);

  async function patch(id, body) {
    setSavingId(id);
    setError('');
    const res = await fetch('/api/admin/indicator-licenses', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Update failed');
    await load();
    setSavingId('');
  }

  async function deleteLicense(id, name) {
    if (!confirm(`Delete license request for ${name}?`)) return;
    setSavingId(id);
    await fetch('/api/admin/indicator-licenses', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await load();
    setSavingId('');
  }

  async function createLicense(e) {
    e.preventDefault();
    const account = usesTradingAccount(form.platform, form.product_code) ? form.trading_account_number : form.mt4_account_id;
    if (!form.customer_name || !account) { setError('Name and Account ID required'); return; }
    setCreating(true);
    setError('');
    const res = await fetch('/api/admin/indicator-licenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || 'Create failed'); setCreating(false); return; }
    setForm({ customer_name: '', contact: '', telegram_username: '', mt4_account_id: '', trading_account_number: '', platform: 'MT4', product_code: INDICATOR_PRODUCTS[0].code, paid_confirmed: false, price_override: '', notes: '' });
    setShowCreate(false);
    setCreating(false);
    await load();
  }

  async function generateActivateAndCopyOperatorToken() {
    if (!confirm('Activate a new Personal token? The previous token will stop working immediately.')) return;
    let candidate;
    try {
      candidate = generateIndicatorToken();
    } catch {
      setError('Secure token generation is unavailable in this browser');
      return;
    }
    setNewToken(candidate);
    setRevealedToken('');
    setRotatingToken(true);
    setError('');
    const res = await fetch('/api/admin/indicator-feed-token', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: candidate }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.verified !== true) {
      setError(data.error || 'Token was not activated');
      setRotatingToken(false);
      return;
    }
    setRevealedToken(candidate);
    try {
      await navigator.clipboard.writeText(candidate);
      setRevealStatus('ACTIVE & COPIED · CLEARS IN 60S');
    } catch {
      setError('Token is active. Copy the visible value manually.');
      setRevealStatus('ACTIVE · COPY MANUALLY · CLEARS IN 60S');
    }
    await load();
    clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => {
      setNewToken('');
      setRevealedToken('');
      setRevealStatus('REVEAL & COPY ACTIVE TOKEN');
    }, 60000);
    setRotatingToken(false);
  }

  async function revealAndCopyOperatorToken() {
    setError('');
    const res = await fetch('/api/admin/indicator-feed-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reveal' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || 'Token recovery failed'); return; }

    setRevealedToken(data.token);
    try {
      await navigator.clipboard.writeText(data.token);
      setRevealStatus('COPIED · CLEARS IN 60S');
    } catch {
      setRevealStatus('SELECT TOKEN MANUALLY · CLEARS IN 60S');
    }
    clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => {
      setRevealedToken('');
      setRevealStatus('REVEAL & COPY ACTIVE TOKEN');
    }, 60000);
  }

  async function deviceRequest(method, body) {
    setDeviceBusy(true);
    setError('');
    const res = await fetch('/api/admin/indicator-license-devices', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setDeviceBusy(false);
    if (!res.ok) {
      setError(data.error || 'Device operation failed');
      return null;
    }
    return data;
  }

  async function openDeviceManager(license) {
    setDeviceBusy(true);
    setError('');
    const res = await fetch(`/api/admin/indicator-license-devices?license_id=${encodeURIComponent(license.id)}`);
    const data = await res.json().catch(() => ({}));
    setDeviceBusy(false);
    if (!res.ok) { setError(data.error || 'Could not load devices'); return; }
    setSelectedLicense(license);
    setLicenseDevices(Array.isArray(data.devices) ? data.devices : []);
    if (Array.isArray(data.policies)) setDevicePolicies(data.policies);
  }

  async function updateDeviceLimit(license) {
    const deviceLimit = Number(license.device_limit);
    const data = await deviceRequest('PATCH', { action: 'set_limit', license_id: license.id, device_limit: deviceLimit });
    if (data) await load();
  }

  async function setDeviceEnforcement(productCode, enabled) {
    if (enabled && !confirm('Enable device enforcement only after the replacement indicator binary is live. Continue?')) return;
    const data = await deviceRequest('PATCH', { action: 'set_enforcement', product_code: productCode, enabled });
    if (data) await load();
  }

  async function revokeDevice(deviceId) {
    if (!confirm('Revoke this device? It will need to activate again.')) return;
    const data = await deviceRequest('POST', { action: 'revoke', device_id: deviceId });
    if (data && selectedLicense) await openDeviceManager(selectedLicense);
  }

  async function resetDevices() {
    if (!selectedLicense || !confirm(`Reset every device for ${selectedLicense.customer_name}?`)) return;
    const data = await deviceRequest('POST', { action: 'reset', license_id: selectedLicense.id });
    if (data) await openDeviceManager(selectedLicense);
  }

  const filtered = useMemo(() => filter === 'ALL' ? licenses : licenses.filter((license) => license.status === filter), [licenses, filter]);
  const counts = useMemo(() => ({
    ALL: licenses.length,
    PENDING: licenses.filter((l) => l.status === 'PENDING').length,
    APPROVED: licenses.filter((l) => l.status === 'APPROVED').length,
    DISABLED: licenses.filter((l) => l.status === 'DISABLED').length,
    EXPIRED: licenses.filter((l) => l.status === 'EXPIRED').length,
  }), [licenses]);

  const hdr = { padding: '10px 12px', fontFamily: mono, fontSize: 8, letterSpacing: 2, color: '#445566', textAlign: 'left', borderBottom: '1px solid #1a2540', fontWeight: 400 };
  const cell = { padding: '11px 12px', fontFamily: raj, fontSize: 13, color: '#96a3bb', verticalAlign: 'middle', borderBottom: '1px solid #101827' };
  const input = { background: '#050810', border: '1px solid #1a2540', borderRadius: 5, color: '#e8eaf0', fontFamily: mono, fontSize: 9, padding: '6px 8px', colorScheme: 'dark' };
  const smallBtn = (color) => ({ background: color + '12', border: `1px solid ${color}44`, borderRadius: 4, color, fontFamily: mono, fontSize: 8, padding: '5px 8px', cursor: 'pointer', whiteSpace: 'nowrap' });

  if (loading) return <div style={{ minHeight: '100vh', background: '#050810', color: '#445566', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, letterSpacing: 3 }}>LOADING...</div>;

  return (
    <>
      <Head><title>PANDA LICENSE ADMIN</title><meta name="viewport" content="width=device-width,initial-scale=1" /></Head>
      <div style={{ minHeight: '100vh', background: '#050810', color: '#e8eaf0' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: '#080c18', borderBottom: '1px solid #1a2540', position: 'sticky', top: 0, zIndex: 10 }}>
          <div>
            <div style={{ fontFamily: orb, fontSize: 13, fontWeight: 900, letterSpacing: 4, color: '#ffd166' }}>LICENSE</div>
            <div style={{ fontFamily: mono, fontSize: 8, letterSpacing: 3, color: '#2a3550' }}>INDICATOR ACCESS CONTROL</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: mono, fontSize: 9, color: '#2a3550' }}>{adminUser?.username}</span>
            <button onClick={() => setShowCreate(!showCreate)} style={smallBtn('#ffd166')}>+ CREATE</button>
            <button onClick={() => window.location.href = '/admin'} style={smallBtn('#ffd166')}>ADMIN</button>
            <button onClick={() => window.location.href = '/dashboard'} style={smallBtn('#00ff9f')}>DASHBOARD</button>
            <button onClick={load} style={smallBtn('#00b4ff')}>REFRESH</button>
          </div>
        </header>

        <main style={{ padding: 24 }}>
          <section style={{ background: '#0e1525', border: '1px solid #1a2540', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 210 }}>
                <div style={{ fontFamily: orb, fontSize: 10, letterSpacing: 2, color: '#00b4ff' }}>PERSONAL OVERLAY TOKEN</div>
                <div style={{ fontFamily: mono, fontSize: 8, color: '#445566', marginTop: 4 }}>
                  {tokenStatus.configured ? `CONFIGURED · ROTATED ${formatDate(tokenStatus.rotated_at)}` : 'NOT CONFIGURED'}
                </div>
                <div style={{ fontFamily: mono, fontSize: 8, color: tokenStatus.recoverable ? '#00ff9f' : '#ffd166', marginTop: 4 }}>
                  {tokenStatus.recoverable ? 'ENCRYPTED RECOVERY READY' : tokenStatus.configured ? 'RECOVERY REQUIRES ONE ROTATION' : 'ROTATE ONCE TO CONFIGURE'}
                </div>
              </div>
              <button type="button" onClick={generateActivateAndCopyOperatorToken} disabled={rotatingToken} style={{ ...smallBtn('#00b4ff'), padding: '8px 14px', opacity: rotatingToken ? 0.5 : 1 }}>{rotatingToken ? 'ACTIVATING...' : 'GENERATE, ACTIVATE & COPY'}</button>
              <button type="button" onClick={revealAndCopyOperatorToken} disabled={!tokenStatus.recoverable} style={{ ...smallBtn('#00ff9f'), padding: '8px 14px', opacity: tokenStatus.recoverable ? 1 : 0.4 }}>{revealStatus}</button>
            </div>
            {(revealedToken || newToken) && <input type="password" readOnly value={revealedToken || newToken} aria-label="Revealed active token" style={{ ...input, width: '100%', marginTop: 10 }} />}
            <div style={{ fontFamily: mono, fontSize: 8, color: '#2a3550', marginTop: 8 }}>One token serves cTrader, MT4 and MT5 Personal editions. The active value is encrypted for admin-only recovery; rotating invalidates the previous token immediately.</div>
            <div style={{ borderTop: '1px solid #1a2540', marginTop: 14, paddingTop: 12 }}>
              <div style={{ fontFamily: orb, fontSize: 9, color: '#445566', letterSpacing: 2, marginBottom: 8 }}>TOKEN ROTATION HISTORY</div>
              {Array.isArray(tokenStatus.rotations) && tokenStatus.rotations.length > 0 ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {tokenStatus.rotations.map((rotation, index) => (
                    <div key={`${rotation.rotated_at}-${index}`} style={{ fontFamily: mono, fontSize: 8, color: '#60708d', border: '1px solid #1a2540', borderRadius: 4, padding: '5px 8px' }}>
                      {formatDateTime(rotation.rotated_at)} · {rotation.rotated_by} · {rotation.token_fingerprint}
                    </div>
                  ))}
                </div>
              ) : <div style={{ fontFamily: mono, fontSize: 8, color: '#2a3550' }}>NO RECORDED ROTATIONS</div>}
            </div>
          </section>

          <section style={{ background: '#0e1525', border: '1px solid #1a2540', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontFamily: orb, fontSize: 10, color: '#ffd166', letterSpacing: 2, marginBottom: 12 }}>INDICATOR DOWNLOADS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
              {downloadStats.totals.map((stat) => (
                <div key={stat.product_code} style={{ background: '#080c18', border: '1px solid #1a2540', borderRadius: 7, padding: 12 }}>
                  <div style={{ fontFamily: mono, fontSize: 8, color: '#00b4ff', letterSpacing: 2 }}>{stat.platform}</div>
                  <div style={{ fontFamily: orb, fontSize: 22, color: '#e8eaf0', marginTop: 6 }}>{stat.count}</div>
                  <div style={{ fontFamily: mono, fontSize: 8, color: '#445566', marginTop: 4 }}>DOWNLOADS RECORDED</div>
                  <div style={{ fontFamily: raj, fontSize: 11, color: '#60708d', marginTop: 5 }}>{productMap[stat.product_code]?.name || stat.product_code}</div>
                </div>
              ))}
              {downloadStats.totals.length === 0 && <div style={{ fontFamily: mono, fontSize: 8, color: '#2a3550' }}>DOWNLOAD TELEMETRY NOT AVAILABLE</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '16px 0 8px', flexWrap: 'wrap' }}>
              <div style={{ fontFamily: orb, fontSize: 9, color: '#445566', letterSpacing: 2 }}>RECENT DOWNLOAD ACTIVITY · {downloadStats.recent.length}</div>
              <button type="button" onClick={() => setShowDownloadActivity((current) => !current)} style={smallBtn('#00b4ff')}>
                {showDownloadActivity ? 'HIDE ACTIVITY' : 'SHOW ACTIVITY'}
              </button>
            </div>
            {showDownloadActivity && (
              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 320 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                  <thead><tr>{['INDICATOR', 'PLATFORM', 'TIME'].map((label) => <th key={label} style={hdr}>{label}</th>)}</tr></thead>
                  <tbody>
                    {downloadStats.recent.slice(0, 20).map((event, index) => (
                      <tr key={`${event.product_code}-${event.downloaded_at}-${index}`}>
                        <td style={cell}>{productMap[event.product_code]?.name || event.product_code}</td>
                        <td style={cell}><Badge label={event.platform} color={event.platform === 'CTRADER' ? '#00b4ff' : '#ffd166'} /></td>
                        <td style={{ ...cell, fontFamily: mono, fontSize: 9 }}>{formatDateTime(event.downloaded_at)}</td>
                      </tr>
                    ))}
                    {downloadStats.recent.length === 0 && <tr><td colSpan={3} style={{ ...cell, textAlign: 'center', color: '#2a3550' }}>NO RECORDED DOWNLOADS</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={{ background: '#0e1525', border: '1px solid #1a2540', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontFamily: orb, fontSize: 10, color: '#ff9944', letterSpacing: 2 }}>DEVICE ENFORCEMENT</div>
            <div style={{ fontFamily: mono, fontSize: 8, color: '#445566', margin: '6px 0 12px' }}>Keep OFF until the matching replacement binary is compiled, tested, and published. Existing account-number licensing remains active while OFF.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}>
              {INDICATOR_PRODUCTS.filter((product) => product.code.endsWith('_dashboard_overlay')).map((product) => {
                const policy = devicePolicies.find((item) => item.product_code === product.code);
                return (
                  <label key={product.code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#080c18', border: `1px solid ${policy?.enabled ? '#00ff9f55' : '#1a2540'}`, borderRadius: 7, padding: 12 }}>
                    <span>
                      <span style={{ display: 'block', fontFamily: orb, fontSize: 9, color: '#e8eaf0' }}>{product.platform}</span>
                      <span style={{ display: 'block', fontFamily: mono, fontSize: 8, color: policy?.enabled ? '#00ff9f' : '#60708d', marginTop: 4 }}>{policy?.enabled ? 'ENFORCED' : 'ACCOUNT ONLY'}</span>
                    </span>
                    <input type="checkbox" checked={policy?.enabled === true} disabled={deviceBusy} onChange={(e) => setDeviceEnforcement(product.code, e.target.checked)} aria-label={`${product.platform} device enforcement`} />
                  </label>
                );
              })}
            </div>
          </section>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {['ALL', 'PENDING', 'APPROVED', 'DISABLED', 'EXPIRED'].map((status) => (
              <button key={status} onClick={() => setFilter(status)} style={{ ...smallBtn(filter === status ? '#00ff9f' : '#445566'), padding: '8px 14px' }}>
                {status} {counts[status]}
              </button>
            ))}
          </div>
          {/* Manual Create Form */}
          {showCreate && (
            <form onSubmit={createLicense} style={{ background: '#0e1525', border: '1px solid #1a2540', borderRadius: 10, padding: 20, marginBottom: 16 }}>
              <div style={{ fontFamily: orb, fontSize: 10, letterSpacing: 3, color: '#ffd166', marginBottom: 16 }}>CREATE MANUAL LICENSE</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
                <div>
                  <label style={{ fontFamily: mono, fontSize: 8, color: '#445566', letterSpacing: 1, display: 'block', marginBottom: 4 }}>NAME *</label>
                  <input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} placeholder="Client name" style={{ ...input, width: '100%' }} required />
                </div>
                <div>
                  <label style={{ fontFamily: mono, fontSize: 8, color: '#445566', letterSpacing: 1, display: 'block', marginBottom: 4 }}>CONTACT (EMAIL/PHONE)</label>
                  <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="email or phone" style={{ ...input, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontFamily: mono, fontSize: 8, color: '#445566', letterSpacing: 1, display: 'block', marginBottom: 4 }}>TELEGRAM</label>
                  <input value={form.telegram_username} onChange={(e) => setForm({ ...form, telegram_username: e.target.value })} placeholder="@username" style={{ ...input, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontFamily: mono, fontSize: 8, color: '#445566', letterSpacing: 1, display: 'block', marginBottom: 4 }}>{form.platform === 'CTRADER' ? 'CTRADER ACCOUNT NUMBER *' : form.platform === 'MT5' ? 'MT5 ACCOUNT NUMBER *' : form.product_code === 'mt4_dashboard_overlay' ? 'MT4 ACCOUNT NUMBER *' : 'MT4 ACCOUNT ID *'}</label>
                  <input value={usesTradingAccount(form.platform, form.product_code) ? form.trading_account_number : form.mt4_account_id} onChange={(e) => setForm(usesTradingAccount(form.platform, form.product_code) ? { ...form, trading_account_number: e.target.value } : { ...form, mt4_account_id: e.target.value })} placeholder="e.g. 3242354235" style={{ ...input, width: '100%' }} required />
                </div>
                <div>
                  <label style={{ fontFamily: mono, fontSize: 8, color: '#445566', letterSpacing: 1, display: 'block', marginBottom: 4 }}>INDICATOR</label>
                  <select value={form.product_code} onChange={(e) => { const product = productMap[e.target.value]; setForm({ ...form, product_code: e.target.value, platform: product?.platform || 'MT4' }); }} style={{ ...input, width: '100%' }}>
                    {INDICATOR_PRODUCTS.map((p) => <option key={p.code} value={p.code}>{p.name} — {p.priceLabel}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontFamily: mono, fontSize: 8, color: '#445566', letterSpacing: 1, display: 'block', marginBottom: 4 }}>PAID STATUS</label>
                  <select value={form.paid_confirmed ? 'true' : 'false'} onChange={(e) => setForm({ ...form, paid_confirmed: e.target.value === 'true' })} style={{ ...input, width: '100%' }}>
                    <option value="false">UNPAID</option>
                    <option value="true">PAID</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontFamily: mono, fontSize: 8, color: '#445566', letterSpacing: 1, display: 'block', marginBottom: 4 }}>PRICE (CUSTOM)</label>
                  <input value={form.price_override} onChange={(e) => setForm({ ...form, price_override: e.target.value })} placeholder="e.g. $300 USD" style={{ ...input, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontFamily: mono, fontSize: 8, color: '#445566', letterSpacing: 1, display: 'block', marginBottom: 4 }}>NOTES</label>
                  <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" style={{ ...input, width: '100%' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="submit" disabled={creating} style={{ ...smallBtn('#00ff9f'), padding: '8px 20px', opacity: creating ? 0.5 : 1 }}>{creating ? 'CREATING...' : 'CREATE LICENSE'}</button>
                <button type="button" onClick={() => setShowCreate(false)} style={{ ...smallBtn('#445566'), padding: '8px 14px' }}>CANCEL</button>
              </div>
            </form>
          )}

          {error && <div style={{ fontFamily: mono, fontSize: 10, color: '#ff4d6d', border: '1px solid #ff4d6d44', background: 'rgba(255,77,109,0.08)', borderRadius: 6, padding: 10, marginBottom: 14 }}>{error}</div>}

          <div style={{ overflowX: 'auto', border: '1px solid #1a2540', borderRadius: 10, background: '#080c18' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1120 }}>
              <thead>
                <tr style={{ background: '#0e1525' }}>
                  {['NAME', 'CONTACT', 'TELEGRAM', 'PLATFORM', 'ACCOUNT ID', 'INDICATOR', 'PRICE', 'PAID', 'EXPIRY', 'STATUS', 'DEVICE LIMIT', 'LAST VERIFIED', 'NOTES', 'ACTIONS'].map((h) => <th key={h} style={hdr}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={14} style={{ ...cell, textAlign: 'center', padding: 40, fontFamily: mono, color: '#2a3550' }}>NO LICENSE REQUESTS</td></tr>
                ) : filtered.map((license) => {
                  const product = productMap[license.product_code] || { name: license.product_code, priceLabel: '-' };
                  const busy = savingId === license.id;
                  return (
                    <tr key={license.id} style={{ opacity: busy ? 0.55 : 1 }}>
                      <td style={{ ...cell, fontFamily: orb, fontSize: 11, color: '#e8eaf0' }}>{license.customer_name}</td>
                      <td style={{ ...cell, fontFamily: mono, fontSize: 9 }}>{license.contact}</td>
                      <td style={{ ...cell, fontFamily: mono, fontSize: 9 }}>{license.telegram_username ? <a href={`https://t.me/${license.telegram_username}`} target="_blank" rel="noopener noreferrer" style={{ color: '#00b4ff' }}>@{license.telegram_username}</a> : '—'}</td>
                      <td style={cell}><Badge label={license.platform || 'MT4'} color={(license.platform || 'MT4') === 'CTRADER' ? '#00b4ff' : '#ffd166'} /></td>
                      <td style={{ ...cell, fontFamily: mono, color: '#00b4ff' }}>{license.trading_account_number || license.mt4_account_id}</td>
                      <td style={cell}>
                        <select value={license.product_code} onChange={(e) => { const selected = productMap[e.target.value]; patch(license.id, { product_code: e.target.value, platform: selected?.platform || 'MT4' }); }} style={{ ...input, width: '100%', minWidth: 130 }}>
                          {INDICATOR_PRODUCTS.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                        </select>
                      </td>
                      <td style={{ ...cell, fontFamily: mono, color: '#ffd166', minWidth: 80 }}>{license.price_override || product.priceLabel}</td>
                      <td style={cell}>
                        <select value={license.paid_confirmed ? 'PAID' : 'UNPAID'} onChange={(e) => patch(license.id, { paid_confirmed: e.target.value === 'PAID' })} style={{ ...input, color: license.paid_confirmed ? '#00ff9f' : '#ff4d6d', minWidth: 80 }}>
                          <option value="UNPAID">UNPAID</option>
                          <option value="PAID">PAID</option>
                        </select>
                      </td>
                      <td style={cell}>
                        <input type="date" value={license.expires_at ? new Date(license.expires_at).toISOString().split('T')[0] : ''} onChange={(e) => patch(license.id, { expires_at: e.target.value || null })} style={input} />
                      </td>
                      <td style={cell}><Badge label={license.status} color={statusColor(license.status)} /></td>
                      <td style={{ ...cell, minWidth: 135 }}>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input type="number" min="1" max="100" value={license.device_limit || 1} onChange={(e) => setLicenses((prev) => prev.map((item) => item.id === license.id ? { ...item, device_limit: e.target.value } : item))} onBlur={() => updateDeviceLimit(license)} aria-label={`${license.customer_name} device limit`} style={{ ...input, width: 55 }} />
                          <button type="button" onClick={() => openDeviceManager(license)} style={smallBtn('#00b4ff')}>MANAGE DEVICES</button>
                        </div>
                      </td>
                      <td style={{ ...cell, fontFamily: mono, fontSize: 9, color: '#445566' }}>{formatDate(license.last_verified_at)}</td>
                      <td style={{ ...cell, minWidth: 150 }}>
                        <input value={license.notes || ''} onChange={(e) => setLicenses((prev) => prev.map((item) => item.id === license.id ? { ...item, notes: e.target.value } : item))} onBlur={(e) => patch(license.id, { notes: e.target.value })} style={{ ...input, width: '100%' }} />
                      </td>
                      <td style={cell}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <button onClick={() => patch(license.id, { action: 'approve' })} style={smallBtn('#00ff9f')}>APPROVE</button>
                          <button onClick={() => patch(license.id, { action: license.status === 'DISABLED' ? 'enable' : 'disable' })} style={smallBtn(license.status === 'DISABLED' ? '#00b4ff' : '#ff4d6d')}>
                            {license.status === 'DISABLED' ? 'ENABLE' : 'DISABLE'}
                          </button>
                          <button onClick={() => deleteLicense(license.id, license.customer_name)} style={smallBtn('#ff9944')}>DELETE</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selectedLicense && (
            <div role="dialog" aria-modal="true" aria-label="Active devices" style={{ position: 'fixed', inset: 0, background: 'rgba(2,5,12,0.86)', zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div style={{ width: 'min(760px,100%)', maxHeight: '85vh', overflowY: 'auto', background: '#0e1525', border: '1px solid #1a2540', borderRadius: 10, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: orb, fontSize: 11, color: '#00b4ff', letterSpacing: 2 }}>ACTIVE DEVICES</div>
                    <div style={{ fontFamily: mono, fontSize: 8, color: '#60708d', marginTop: 4 }}>{selectedLicense.customer_name} · LIMIT {selectedLicense.device_limit || 1}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <button type="button" disabled={deviceBusy} onClick={resetDevices} style={smallBtn('#ff9944')}>RESET DEVICES</button>
                    <button type="button" onClick={() => { setSelectedLicense(null); setLicenseDevices([]); }} style={smallBtn('#60708d')}>CLOSE</button>
                  </div>
                </div>
                <div style={{ overflowX: 'auto', marginTop: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                    <thead><tr>{['FINGERPRINT', 'PLATFORM', 'STATUS', 'ACTIVATED', 'LAST SEEN', 'ACTION'].map((label) => <th key={label} style={hdr}>{label}</th>)}</tr></thead>
                    <tbody>
                      {licenseDevices.map((device) => (
                        <tr key={device.id}>
                          <td style={{ ...cell, fontFamily: mono, color: '#00b4ff' }}>{device.device_fingerprint}</td>
                          <td style={cell}>{device.platform}</td>
                          <td style={cell}><Badge label={device.status} color={device.status === 'ACTIVE' ? '#00ff9f' : '#60708d'} /></td>
                          <td style={{ ...cell, fontFamily: mono, fontSize: 8 }}>{formatDateTime(device.activated_at)}</td>
                          <td style={{ ...cell, fontFamily: mono, fontSize: 8 }}>{formatDateTime(device.last_seen_at)}</td>
                          <td style={cell}>{device.status === 'ACTIVE' && <button type="button" disabled={deviceBusy} onClick={() => revokeDevice(device.id)} style={smallBtn('#ff4d6d')}>REVOKE</button>}</td>
                        </tr>
                      ))}
                      {licenseDevices.length === 0 && <tr><td colSpan={6} style={{ ...cell, textAlign: 'center', color: '#445566' }}>NO ACTIVATED DEVICES</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
