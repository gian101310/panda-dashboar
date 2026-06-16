import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { INDICATOR_PRODUCTS } from '../../lib/indicatorProducts.mjs';

const mono = "'Share Tech Mono', monospace";
const orb = "'Orbitron', sans-serif";
const raj = "'Rajdhani', sans-serif";
const productMap = Object.fromEntries(INDICATOR_PRODUCTS.map((product) => [product.code, product]));

function Badge({ label, color }) {
  return <span style={{ fontFamily: mono, fontSize: 8, letterSpacing: 1, color, background: color + '18', border: `1px solid ${color}44`, borderRadius: 4, padding: '3px 7px' }}>{label}</span>;
}

function formatDate(value) {
  if (!value) return '-';
  try { return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); }
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

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/indicator-licenses');
    if (res.status === 403) { window.location.href = '/login'; return; }
    const data = await res.json();
    setLicenses(Array.isArray(data.licenses) ? data.licenses : []);
  }, []);

  useEffect(() => {
    fetch('/api/me').then((r) => r.json()).then((user) => {
      if (!user?.username || user.role !== 'admin') { window.location.href = '/login'; return; }
      setAdminUser(user);
      setLoading(false);
      load();
    }).catch(() => { window.location.href = '/login'; });
  }, [load]);

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
            <button onClick={() => window.location.href = '/admin'} style={smallBtn('#ffd166')}>ADMIN</button>
            <button onClick={() => window.location.href = '/dashboard'} style={smallBtn('#00ff9f')}>DASHBOARD</button>
            <button onClick={load} style={smallBtn('#00b4ff')}>REFRESH</button>
          </div>
        </header>

        <main style={{ padding: 24 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {['ALL', 'PENDING', 'APPROVED', 'DISABLED', 'EXPIRED'].map((status) => (
              <button key={status} onClick={() => setFilter(status)} style={{ ...smallBtn(filter === status ? '#00ff9f' : '#445566'), padding: '8px 14px' }}>
                {status} {counts[status]}
              </button>
            ))}
          </div>
          {error && <div style={{ fontFamily: mono, fontSize: 10, color: '#ff4d6d', border: '1px solid #ff4d6d44', background: 'rgba(255,77,109,0.08)', borderRadius: 6, padding: 10, marginBottom: 14 }}>{error}</div>}

          <div style={{ overflowX: 'auto', border: '1px solid #1a2540', borderRadius: 10, background: '#080c18' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1120 }}>
              <thead>
                <tr style={{ background: '#0e1525' }}>
                  {['NAME', 'CONTACT', 'ACCOUNT ID', 'INDICATOR', 'PRICE', 'PAID', 'EXPIRY', 'STATUS', 'LAST VERIFIED', 'NOTES', 'ACTIONS'].map((h) => <th key={h} style={hdr}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} style={{ ...cell, textAlign: 'center', padding: 40, fontFamily: mono, color: '#2a3550' }}>NO LICENSE REQUESTS</td></tr>
                ) : filtered.map((license) => {
                  const product = productMap[license.product_code] || { name: license.product_code, priceLabel: '-' };
                  const busy = savingId === license.id;
                  return (
                    <tr key={license.id} style={{ opacity: busy ? 0.55 : 1 }}>
                      <td style={{ ...cell, fontFamily: orb, fontSize: 11, color: '#e8eaf0' }}>{license.customer_name}</td>
                      <td style={{ ...cell, fontFamily: mono, fontSize: 9 }}>{license.contact}</td>
                      <td style={{ ...cell, fontFamily: mono, color: '#00b4ff' }}>{license.mt4_account_id}</td>
                      <td style={cell}>{product.name}</td>
                      <td style={{ ...cell, fontFamily: mono, color: '#ffd166' }}>{product.priceLabel}</td>
                      <td style={cell}>
                        <button onClick={() => patch(license.id, { paid_confirmed: !license.paid_confirmed })} style={smallBtn(license.paid_confirmed ? '#00ff9f' : '#ff4d6d')}>
                          {license.paid_confirmed ? 'PAID' : 'UNPAID'}
                        </button>
                      </td>
                      <td style={cell}>
                        <input type="date" value={license.expires_at ? new Date(license.expires_at).toISOString().split('T')[0] : ''} onChange={(e) => patch(license.id, { expires_at: e.target.value || null })} style={input} />
                      </td>
                      <td style={cell}><Badge label={license.status} color={statusColor(license.status)} /></td>
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
        </main>
      </div>
    </>
  );
}
