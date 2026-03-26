import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';

const mono = "'Share Tech Mono', monospace";
const ALL_FEATURES = ['dashboard','cot','calendar','calculator','journal','signals','engine','accuracy'];
const FEATURE_LABELS = {
  dashboard:  '📊 Dashboard',
  cot:        '📈 COT Report',
  calendar:   '📰 Calendar',
  calculator: '🧮 Calculator',
  journal:    '📓 Journal',
  signals:    '⚡ Signals',
  engine:     '🏥 Engine',
  accuracy:   '🎯 Accuracy',
};
const ROLE_DEFAULTS = {
  user:  ['dashboard','cot','calendar','calculator'],
  vip:   ['dashboard','cot','calendar','calculator','journal','signals'],
  admin: ['dashboard','cot','calendar','calculator','journal','signals','engine','accuracy'],
};
const orb = "'Orbitron', sans-serif";
const raj = "'Rajdhani', sans-serif";

function formatDt(dt) {
  if (!dt) return '—';
  try {
    const d = new Date(dt);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

function formatExpiry(dt) {
  if (!dt) return null;
  try {
    const d = new Date(dt);
    const now = new Date();
    const diff = d - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    if (diff < 0) return { label, color: '#ff4d6d', tag: 'EXPIRED' };
    if (days <= 3) return { label, color: '#ffd166', tag: `${days}d left` };
    return { label, color: '#00b4ff', tag: `${days}d left` };
  } catch { return null; }
}

function toDateInputValue(dt) {
  if (!dt) return '';
  try { return new Date(dt).toISOString().split('T')[0]; }
  catch { return ''; }
}

function Badge({ label, color }) {
  return <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: 1, color, background: color + '18', border: `1px solid ${color}33`, borderRadius: 3, padding: '2px 6px' }}>{label}</span>;
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: '#0a0e1a', border: '1px solid #1a2540', borderRadius: 8, padding: '12px 18px', flex: 1, minWidth: 100 }}>
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#445566', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: orb, fontSize: 22, fontWeight: 700, color, textShadow: `0 0 10px ${color}55` }}>{value}</div>
    </div>
  );
}

function PasswordCell({ password, userId }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!password) return <span style={{ fontFamily: mono, fontSize: 10, color: '#2a3550' }}>—</span>;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontFamily: mono, fontSize: 11, color: '#ffd166', letterSpacing: 1, minWidth: 70 }}>
        {show ? password : '••••••••'}
      </span>
      <button onClick={() => setShow(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#445566', fontSize: 13, padding: 2, lineHeight: 1 }}>{show ? '🙈' : '👁️'}</button>
      {show && <button onClick={copy} style={{ background: copied ? 'rgba(0,255,159,0.15)' : 'rgba(255,209,102,0.1)', border: `1px solid ${copied ? '#00ff9f44' : '#ffd16633'}`, borderRadius: 3, color: copied ? '#00ff9f' : '#ffd166', fontFamily: mono, fontSize: 7, padding: '2px 5px', cursor: 'pointer' }}>{copied ? '✓' : 'COPY'}</button>}
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ username: '', password: '', role: 'user', max_devices: 1, notes: '', expires_at: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault(); setLoading(true); setError('');
    const body = { ...form, expires_at: form.expires_at || null };
    const res = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) { setError(d.error); setLoading(false); return; }
    onCreated();
  }

  const inp = { background: '#06080f', border: '1px solid #1a2540', borderRadius: 5, padding: '8px 10px', color: '#e8eaf0', fontFamily: raj, fontSize: 14, width: '100%', boxSizing: 'border-box' };
  const lbl = { fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#445566', display: 'block', marginBottom: 5 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0a0e1a', border: '1px solid #1e3060', borderRadius: 12, padding: 28, width: 400, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontFamily: orb, fontSize: 14, fontWeight: 700, color: '#00ff9f', letterSpacing: 3 }}>+ CREATE USER</div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={lbl}>USERNAME</label><input style={inp} value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="e.g. trader01" required /></div>
          <div>
            <label style={lbl}>PASSWORD</label>
            <div style={{ position: 'relative' }}>
              <input type={showPass ? 'text' : 'password'} style={{ ...inp, paddingRight: 40 }} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="min 4 chars" required />
              <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#445566', fontSize: 14 }}>{showPass ? '🙈' : '👁️'}</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>ROLE</label>
              <select style={inp} value={form.role} onChange={e => {
                const newRole = e.target.value;
                setForm(f => ({ ...f, role: newRole, feature_access: ROLE_DEFAULTS[newRole] || ROLE_DEFAULTS.user }));
              }}>
                <option value="user">User</option>
                <option value="vip">VIP</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>MAX DEVICES</label>
              <input type="number" min="1" max="10" style={inp} value={form.max_devices} onChange={e => setForm(f => ({ ...f, max_devices: parseInt(e.target.value) }))} />
            </div>
          </div>
          <div>
            <label style={lbl}>EXPIRY DATE (optional)</label>
            <input type="date" style={{ ...inp, colorScheme: 'dark' }} value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} min={new Date().toISOString().split('T')[0]} />
            <div style={{ fontFamily: mono, fontSize: 8, color: '#2a3550', marginTop: 4 }}>Leave blank for no expiry. Account auto-disables on this date.</div>
          </div>
          <div><label style={lbl}>NOTES (optional)</label><input style={inp} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. VIP member, 1 month access" /></div>
          {error && <div style={{ fontFamily: mono, fontSize: 10, color: '#ff4d6d', background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.3)', borderRadius: 5, padding: '8px 10px' }}>⚠ {error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, background: 'transparent', border: '1px solid #1a2540', borderRadius: 5, color: '#445566', fontFamily: mono, fontSize: 10, padding: '8px', cursor: 'pointer' }}>CANCEL</button>
            <button type="submit" disabled={loading} style={{ flex: 1, background: 'rgba(0,255,159,0.1)', border: '1px solid #00ff9f', borderRadius: 5, color: '#00ff9f', fontFamily: mono, fontSize: 10, letterSpacing: 2, padding: '8px', cursor: 'pointer' }}>{loading ? 'CREATING...' : 'CREATE'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({ is_active: user.is_active, max_devices: user.max_devices, role: user.role, notes: user.notes || '', password: '', expires_at: toDateInputValue(user.expires_at), feature_access: user.feature_access || ROLE_DEFAULTS[user.role] || ROLE_DEFAULTS.user });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function save(e) {
    e.preventDefault(); setLoading(true); setError('');
    const body = { id: user.id, ...form, expires_at: form.expires_at || null };
    if (!body.password) delete body.password;
    const res = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) { setError(d.error); setLoading(false); return; }
    onSaved();
  }

  function copyPass() { navigator.clipboard.writeText(user.plain_password); setCopied(true); setTimeout(() => setCopied(false), 1500); }

  const inp = { background: '#06080f', border: '1px solid #1a2540', borderRadius: 5, padding: '8px 10px', color: '#e8eaf0', fontFamily: raj, fontSize: 14, width: '100%', boxSizing: 'border-box' };
  const lbl = { fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#445566', display: 'block', marginBottom: 5 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0a0e1a', border: '1px solid #1e3060', borderRadius: 12, padding: 28, width: 420, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontFamily: orb, fontSize: 14, fontWeight: 700, color: '#00b4ff', letterSpacing: 3 }}>EDIT: {user.username.toUpperCase()}</div>

        {/* Current password */}
        <div style={{ background: '#060810', border: '1px solid #1a2540', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#445566', marginBottom: 6 }}>CURRENT PASSWORD</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: raj, fontSize: 16, fontWeight: 600, color: user.plain_password ? '#ffd166' : '#2a3550' }}>
              {user.plain_password || '(set a new password below)'}
            </span>
            {user.plain_password && (
              <button onClick={copyPass} style={{ background: copied ? 'rgba(0,255,159,0.15)' : 'rgba(255,209,102,0.1)', border: `1px solid ${copied ? '#00ff9f44' : '#ffd16633'}`, borderRadius: 4, color: copied ? '#00ff9f' : '#ffd166', fontFamily: mono, fontSize: 8, padding: '3px 8px', cursor: 'pointer' }}>{copied ? '✓ COPIED' : 'COPY'}</button>
            )}
          </div>
        </div>

        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>STATUS</label>
              <select style={inp} value={form.is_active ? 'active' : 'disabled'} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'active' }))}>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>ROLE</label>
              <select style={inp} value={form.role} onChange={e => {
                const newRole = e.target.value;
                setForm(f => ({ ...f, role: newRole, feature_access: ROLE_DEFAULTS[newRole] || ROLE_DEFAULTS.user }));
              }}>
                <option value="user">User</option>
                <option value="vip">VIP</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div>
            <label style={lbl}>MAX DEVICES (using: {user.active_devices}/{user.max_devices})</label>
            <input type="number" min="1" max="20" style={inp} value={form.max_devices} onChange={e => setForm(f => ({ ...f, max_devices: parseInt(e.target.value) }))} />
          </div>
          <div>
            <label style={lbl}>EXPIRY DATE</label>
            <input type="date" style={{ ...inp, colorScheme: 'dark' }} value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
            <div style={{ fontFamily: mono, fontSize: 8, color: '#2a3550', marginTop: 4 }}>Clear to remove expiry. Account auto-disables on this date.</div>
          </div>
          <div><label style={lbl}>NOTES</label><input style={inp} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>

          {/* Feature Access */}
          <div>
            <label style={{...lbl, marginBottom:6}}>FEATURE ACCESS</label>
            <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
              {ALL_FEATURES.map(f => {
                const active = (form.feature_access || []).includes(f);
                return (
                  <button key={f} type="button" onClick={() => setForm(prev => ({
                    ...prev,
                    feature_access: active
                      ? (prev.feature_access || []).filter(x => x !== f)
                      : [...(prev.feature_access || []), f]
                  }))} style={{background:active?'rgba(0,255,159,0.1)':'transparent',border:`1px solid ${active?'#00ff9f':'#1a2540'}`,borderRadius:4,color:active?'#00ff9f':'#2a3550',fontFamily:mono,fontSize:8,padding:'3px 8px',cursor:'pointer'}}>
                    {FEATURE_LABELS[f]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label style={lbl}>NEW PASSWORD (leave blank to keep current)</label>
            <div style={{ position: 'relative' }}>
              <input type={showPass ? 'text' : 'password'} style={{ ...inp, paddingRight: 40 }} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="optional" />
              <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#445566', fontSize: 14 }}>{showPass ? '🙈' : '👁️'}</button>
            </div>
          </div>
          {error && <div style={{ fontFamily: mono, fontSize: 10, color: '#ff4d6d', background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.3)', borderRadius: 5, padding: '8px 10px' }}>⚠ {error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, background: 'transparent', border: '1px solid #1a2540', borderRadius: 5, color: '#445566', fontFamily: mono, fontSize: 10, padding: '8px', cursor: 'pointer' }}>CANCEL</button>
            <button type="submit" disabled={loading} style={{ flex: 1, background: 'rgba(0,180,255,0.1)', border: '1px solid #00b4ff', borderRadius: 5, color: '#00b4ff', fontFamily: mono, fontSize: 10, letterSpacing: 2, padding: '8px', cursor: 'pointer' }}>{loading ? 'SAVING...' : 'SAVE'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const [tab, setTab] = useState('USERS');
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [logFilter, setLogFilter] = useState('');
  const [adminUser, setAdminUser] = useState(null);

  const loadUsers = useCallback(async () => {
    const res = await fetch('/api/admin/users');
    if (res.status === 403) { window.location.href = '/'; return; }
    const d = await res.json();
    setUsers(Array.isArray(d) ? d : []);
  }, []);

  const loadSessions = useCallback(async () => {
    const res = await fetch('/api/admin/sessions');
    if (res.ok) setSessions(await res.json());
  }, []);

  const loadLogs = useCallback(async (username = '') => {
    const url = '/api/admin/logs?limit=150' + (username ? `&username=${username}` : '');
    const res = await fetch(url);
    if (res.ok) setLogs(await res.json());
  }, []);

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(d => {
      if (!d.username || d.role !== 'admin') { window.location.href = '/'; return; }
      setAdminUser(d); setLoading(false); loadUsers();
    }).catch(() => { window.location.href = '/'; });
  }, [loadUsers]);

  useEffect(() => {
    if (tab === 'SESSIONS') loadSessions();
    if (tab === 'LOGS') loadLogs(logFilter);
  }, [tab, logFilter, loadSessions, loadLogs]);

  async function revokeSession(id) {
    await fetch('/api/admin/sessions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: id }) });
    loadSessions();
  }
  async function revokeAllSessions(userId) {
    await fetch('/api/admin/sessions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, revoke_all: true }) });
    loadSessions(); loadUsers();
  }
  async function deleteUser(id, username) {
    if (!confirm(`Delete user "${username}"? Cannot be undone.`)) return;
    await fetch('/api/admin/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadUsers();
  }
  async function toggleUser(user) {
    await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: user.id, is_active: !user.is_active }) });
    loadUsers();
  }

  const totalActive = users.filter(u => u.is_active).length;
  const totalDevices = users.reduce((s, u) => s + (u.active_devices || 0), 0);
  const totalSessions = users.reduce((s, u) => s + (u.active_sessions || 0), 0);
  const expiringSoon = users.filter(u => { if (!u.expires_at) return false; const d = Math.ceil((new Date(u.expires_at) - new Date()) / 86400000); return d >= 0 && d <= 7; }).length;

  const hdr = { padding: '9px 12px', fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#445566', textAlign: 'left', borderBottom: '1px solid #1a2540', fontWeight: 400 };
  const tc = { padding: '10px 12px', fontFamily: raj, fontSize: 13, color: '#8892aa', verticalAlign: 'middle' };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#050810', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: mono, fontSize: 12, letterSpacing: 3, color: '#445566' }}>LOADING...</span>
    </div>
  );

  return (
    <>
      <Head><title>PANDA ADMIN PANEL</title><meta name="viewport" content="width=device-width,initial-scale=1" /></Head>
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadUsers(); }} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSaved={() => { setEditUser(null); loadUsers(); }} />}

      <div style={{ minHeight: '100vh', background: '#050810', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,180,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,255,0.02) 1px,transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none', zIndex: 0 }} />

        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: '#080c18', borderBottom: '1px solid #1a2540', position: 'sticky', top: 0, zIndex: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>🐼</span>
            <div>
              <div style={{ fontFamily: orb, fontSize: 13, fontWeight: 900, letterSpacing: 4, color: '#ffd166' }}>ADMIN PANEL</div>
              <div style={{ fontFamily: mono, fontSize: 8, letterSpacing: 3, color: '#2a3550' }}>PANDA ENGINE · USER CONTROL</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: mono, fontSize: 9, color: '#2a3550' }}>👤 {adminUser?.username}</span>
            <button onClick={() => window.location.href = '/dashboard'} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,255,159,0.08)', border: '1px solid #00ff9f44', borderRadius: 6, color: '#00ff9f', fontFamily: mono, fontSize: 9, letterSpacing: 2, padding: '6px 14px', cursor: 'pointer' }}>📊 DASHBOARD</button>
            <button style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,209,102,0.15)', border: '1px solid #ffd166', borderRadius: 6, color: '#ffd166', fontFamily: mono, fontSize: 9, letterSpacing: 2, padding: '6px 14px', cursor: 'default' }}>🛡️ ADMIN</button>
            <button onClick={async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/'; }} style={{ background: 'transparent', border: '1px solid #2a1525', borderRadius: 6, color: '#ff4d6d', fontFamily: mono, fontSize: 9, padding: '6px 12px', cursor: 'pointer' }}>LOGOUT</button>
          </div>
        </header>

        <div style={{ display: 'flex', gap: 8, padding: '12px 24px', zIndex: 1 }}>
          <StatCard label="TOTAL USERS" value={users.length} color="#00b4ff" />
          <StatCard label="ACTIVE" value={totalActive} color="#00ff9f" />
          <StatCard label="DEVICES" value={totalDevices} color="#ffd166" />
          <StatCard label="SESSIONS" value={totalSessions} color="#ff9944" />
          <StatCard label="DISABLED" value={users.length - totalActive} color="#ff4d6d" />
          <StatCard label="⏰ EXPIRING" value={expiringSoon} color={expiringSoon > 0 ? '#ffd166' : '#2a3550'} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 24px 12px', zIndex: 1 }}>
          <div style={{ display: 'flex', background: '#080c18', border: '1px solid #1a2540', borderRadius: 7, overflow: 'hidden' }}>
            {['USERS', 'SESSIONS', 'LOGS'].map((t, i) => (
              <button key={t} onClick={() => setTab(t)} style={{ background: tab === t ? 'rgba(255,209,102,0.12)' : 'transparent', border: 'none', borderRight: i < 2 ? '1px solid #1a2540' : 'none', color: tab === t ? '#ffd166' : '#445566', fontFamily: mono, fontSize: 9, letterSpacing: 2, padding: '7px 16px', cursor: 'pointer' }}>{t}</button>
            ))}
          </div>
          {tab === 'USERS' && <button onClick={() => setShowCreate(true)} style={{ background: 'rgba(0,255,159,0.1)', border: '1px solid #00ff9f', borderRadius: 5, color: '#00ff9f', fontFamily: mono, fontSize: 9, letterSpacing: 2, padding: '7px 16px', cursor: 'pointer' }}>+ CREATE USER</button>}
          {tab === 'LOGS' && <input style={{ background: '#080c18', border: '1px solid #1a2540', borderRadius: 5, padding: '6px 10px', color: '#e8eaf0', fontFamily: raj, fontSize: 13, width: 200 }} placeholder="Filter by username..." value={logFilter} onChange={e => { setLogFilter(e.target.value); loadLogs(e.target.value); }} />}
          {tab === 'SESSIONS' && <button onClick={loadSessions} style={{ background: 'transparent', border: '1px solid #1a2540', borderRadius: 5, color: '#00b4ff', fontFamily: mono, fontSize: 9, padding: '7px 12px', cursor: 'pointer' }}>⟳ REFRESH</button>}
        </div>

        <div style={{ flex: 1, padding: '0 24px 24px', zIndex: 1, overflowX: 'auto' }}>
          {tab === 'USERS' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#080c18', border: '1px solid #1a2540', borderRadius: 10, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: '#0e1525' }}>
                  {['USERNAME', 'ROLE', 'STATUS', 'PASSWORD', 'DEVICES', 'EXPIRY', 'LAST SEEN', 'NOTES', 'ACTIONS'].map(h => <th key={h} style={hdr}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {users.length === 0
                  ? <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, fontFamily: mono, fontSize: 10, color: '#2a3550' }}>NO USERS YET · Click + CREATE USER</td></tr>
                  : users.map(u => {
                    const exp = formatExpiry(u.expires_at);
                    return (
                      <tr key={u.id} style={{ borderBottom: '1px solid #111827', opacity: u.is_active ? 1 : 0.5 }}>
                        <td style={{ ...tc, fontFamily: orb, fontSize: 11, fontWeight: 700, color: u.is_active ? '#e8eaf0' : '#445566' }}>{u.username}</td>
                        <td style={tc}><Badge label={u.role.toUpperCase()} color={u.role === 'admin' ? '#ffd166' : u.role === 'vip' ? '#cc77ff' : '#00b4ff'} /></td>
                        <td style={tc}><Badge label={u.is_active ? 'ACTIVE' : 'DISABLED'} color={u.is_active ? '#00ff9f' : '#ff4d6d'} /></td>
                        <td style={{ ...tc, minWidth: 150 }}><PasswordCell password={u.plain_password} userId={u.id} /></td>
                        <td style={{ ...tc, fontFamily: mono, fontSize: 11 }}>
                          <span style={{ color: u.active_devices >= u.max_devices ? '#ffd166' : '#00ff9f' }}>{u.active_devices}</span>
                          <span style={{ color: '#2a3550' }}> / {u.max_devices}</span>
                        </td>
                        <td style={{ ...tc, minWidth: 120 }}>
                          {exp ? (
                            <div>
                              <div style={{ fontFamily: mono, fontSize: 9, color: exp.color }}>{exp.label}</div>
                              <div style={{ fontFamily: mono, fontSize: 8, color: exp.color, opacity: 0.7 }}>{exp.tag}</div>
                            </div>
                          ) : <span style={{ fontFamily: mono, fontSize: 9, color: '#2a3550' }}>No expiry</span>}
                        </td>
                        <td style={{ ...tc, fontFamily: mono, fontSize: 9, color: '#445566' }}>{formatDt(u.last_seen)}</td>
                        <td style={{ ...tc, fontSize: 11, color: '#445566', maxWidth: 100 }}>{u.notes || '—'}</td>
                        <td style={tc}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => setEditUser(u)} style={{ background: 'rgba(0,180,255,0.08)', border: '1px solid #1e306066', borderRadius: 4, color: '#00b4ff', fontFamily: mono, fontSize: 8, padding: '4px 7px', cursor: 'pointer' }}>EDIT</button>
                            <button onClick={() => toggleUser(u)} style={{ background: u.is_active ? 'rgba(255,77,109,0.08)' : 'rgba(0,255,159,0.08)', border: `1px solid ${u.is_active ? '#ff4d6d44' : '#00ff9f44'}`, borderRadius: 4, color: u.is_active ? '#ff4d6d' : '#00ff9f', fontFamily: mono, fontSize: 8, padding: '4px 7px', cursor: 'pointer' }}>{u.is_active ? 'DISABLE' : 'ENABLE'}</button>
                            <button onClick={() => revokeAllSessions(u.id)} style={{ background: 'rgba(255,153,68,0.08)', border: '1px solid #ff994444', borderRadius: 4, color: '#ff9944', fontFamily: mono, fontSize: 8, padding: '4px 7px', cursor: 'pointer' }}>KICK</button>
                            {u.role !== 'admin' && <button onClick={() => deleteUser(u.id, u.username)} style={{ background: 'rgba(255,77,109,0.08)', border: '1px solid #ff4d6d44', borderRadius: 4, color: '#ff4d6d', fontFamily: mono, fontSize: 8, padding: '4px 7px', cursor: 'pointer' }}>DEL</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}

          {tab === 'SESSIONS' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#080c18', border: '1px solid #1a2540', borderRadius: 10, overflow: 'hidden' }}>
              <thead><tr style={{ background: '#0e1525' }}>{['USERNAME', 'DEVICE ID', 'IP ADDRESS', 'LAST SEEN', 'CREATED', 'USER AGENT', 'ACTION'].map(h => <th key={h} style={hdr}>{h}</th>)}</tr></thead>
              <tbody>
                {sessions.length === 0
                  ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, fontFamily: mono, fontSize: 10, color: '#2a3550' }}>NO ACTIVE SESSIONS</td></tr>
                  : sessions.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #111827' }}>
                      <td style={{ ...tc, fontFamily: orb, fontSize: 11, fontWeight: 700, color: '#e8eaf0' }}>{s.username}</td>
                      <td style={{ ...tc, fontFamily: mono, fontSize: 9, color: '#445566' }}>{s.device_fingerprint?.slice(0, 12)}...</td>
                      <td style={{ ...tc, fontFamily: mono, fontSize: 10, color: '#00b4ff' }}>{s.ip_address || '—'}</td>
                      <td style={{ ...tc, fontFamily: mono, fontSize: 9, color: '#445566' }}>{formatDt(s.last_seen)}</td>
                      <td style={{ ...tc, fontFamily: mono, fontSize: 9, color: '#2a3550' }}>{formatDt(s.created_at)}</td>
                      <td style={{ ...tc, fontFamily: mono, fontSize: 8, color: '#2a3550', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.user_agent?.slice(0, 40) || '—'}</td>
                      <td style={tc}><button onClick={() => revokeSession(s.id)} style={{ background: 'rgba(255,77,109,0.08)', border: '1px solid #ff4d6d44', borderRadius: 4, color: '#ff4d6d', fontFamily: mono, fontSize: 8, padding: '4px 8px', cursor: 'pointer' }}>REVOKE</button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}

          {tab === 'LOGS' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#080c18', border: '1px solid #1a2540', borderRadius: 10, overflow: 'hidden' }}>
              <thead><tr style={{ background: '#0e1525' }}>{['TIME', 'USERNAME', 'ACTION', 'STATUS', 'IP', 'DETAIL'].map(h => <th key={h} style={hdr}>{h}</th>)}</tr></thead>
              <tbody>
                {logs.length === 0
                  ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, fontFamily: mono, fontSize: 10, color: '#2a3550' }}>NO LOGS YET</td></tr>
                  : logs.map(l => (
                    <tr key={l.id} style={{ borderBottom: '1px solid #111827' }}>
                      <td style={{ ...tc, fontFamily: mono, fontSize: 9, color: '#2a3550', whiteSpace: 'nowrap' }}>{formatDt(l.created_at)}</td>
                      <td style={{ ...tc, fontFamily: orb, fontSize: 10, fontWeight: 700, color: '#8892aa' }}>{l.username}</td>
                      <td style={tc}><Badge label={l.action} color={l.action.includes('FAIL') || l.action.includes('BLOCK') || l.action.includes('LIMIT') || l.action.includes('EXPIR') ? '#ff4d6d' : l.action === 'LOGIN_SUCCESS' ? '#00ff9f' : '#00b4ff'} /></td>
                      <td style={tc}><Badge label={l.success ? 'OK' : 'FAIL'} color={l.success ? '#00ff9f' : '#ff4d6d'} /></td>
                      <td style={{ ...tc, fontFamily: mono, fontSize: 9, color: '#445566' }}>{l.ip_address?.split(',')[0] || '—'}</td>
                      <td style={{ ...tc, fontFamily: mono, fontSize: 9, color: '#445566' }}>{l.detail || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#2a3550', textAlign: 'center', padding: '8px 24px', borderTop: '1px solid #1a2540' }}>
          PANDA ENGINE ADMIN · {users.length} USERS · {totalSessions} ACTIVE SESSIONS
        </div>
      </div>
      <style>{`button:hover{opacity:0.8;} input:focus,select:focus{outline:none;border-color:#00b4ff!important;} select option{background:#06080f;} input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(0.5);}`}</style>
    </>
  );
}