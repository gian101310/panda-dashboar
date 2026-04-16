import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const mono = "'Share Tech Mono',monospace";
const orb  = "'Orbitron',sans-serif";
const raj  = "'Rajdhani',sans-serif";

const PRIORITY_COLOR = {
  CRITICAL: '#ff4d6d',
  HIGH:     '#ffaa44',
  MEDIUM:   '#ffd166',
  LOW:      '#00b4ff',
  INFO:     '#445566',
};

function pfFormatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const dubai = new Date(d.getTime() + 4 * 3600 * 1000);
  return dubai.toISOString().replace('T',' ').slice(5,16);
}
export default function PfApprovalsPage() {
  const router = useRouter();
  const [pfLoading, setPfLoading] = useState(true);
  const [pfSignups, setPfSignups] = useState([]);
  const [pfPendingUsers, setPfPendingUsers] = useState([]);
  const [pfEvents, setPfEvents] = useState([]);
  const [pfTab, setPfTab] = useState('signups');
  const [pfApproveOpen, setPfApproveOpen] = useState(null);
  const [pfApUser, setPfApUser] = useState('');
  const [pfApPass, setPfApPass] = useState('');
  const [pfApTier, setPfApTier] = useState('starter');
  const [pfApRole, setPfApRole] = useState('user');
  const [pfApBusy, setPfApBusy] = useState(false);
  const [pfApErr, setPfApErr] = useState('');

  const pfLoad = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/pf-approve');
      if (r.status === 401) { router.replace('/login'); return; }
      if (r.status === 403) { router.replace('/dashboard'); return; }
      const d = await r.json();
      setPfSignups(d.signups || []);
      setPfPendingUsers(d.pending_users || []);
      setPfEvents(d.events || []);
    } catch {}
    setPfLoading(false);
  }, []);

  useEffect(() => { pfLoad(); }, []);
  const pfOpenApprove = (s) => {
    setPfApproveOpen(s);
    setPfApUser(s.username || (s.email || '').split('@')[0]);
    setPfApPass('');
    setPfApTier(s.tier || 'starter');
    setPfApRole('user');
    setPfApErr('');
  };
  const pfDoApprove = async () => {
    if (!pfApUser || pfApPass.length < 6) { setPfApErr('Username + 6+ char password required'); return; }
    setPfApBusy(true); setPfApErr('');
    try {
      const r = await fetch('/api/admin/pf-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_signup', id: pfApproveOpen.id, username: pfApUser, password: pfApPass, tier: pfApTier, role: pfApRole })
      });
      const j = await r.json();
      if (r.ok) { setPfApproveOpen(null); pfLoad(); }
      else setPfApErr(j.error || 'Approval failed');
    } catch { setPfApErr('Network error'); }
    setPfApBusy(false);
  };
  const pfDeny = async (id) => {
    if (!confirm('Deny this signup request?')) return;
    await fetch('/api/admin/pf-approve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deny_signup', id })
    });
    pfLoad();
  };
  const pfToggleApproved = async (id) => {
    await fetch('/api/admin/pf-approve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_user_approved', id })
    });
    pfLoad();
  };
  if (pfLoading) return <div style={{ background: '#050810', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#445566', fontFamily: mono, fontSize: 11, letterSpacing: 3 }}>LOADING APPROVALS...</div>;

  return (
    <>
      <Head>
        <title>PANDA ENGINE — Approvals</title>
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ background: '#050810', minHeight: '100vh', color: '#e8eaf0', padding: '20px' }}>
        <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,180,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,255,0.03) 1px,transparent 1px)', backgroundSize: '50px 50px', pointerEvents: 'none', zIndex: 0 }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto' }}>
          {/* HEADER */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 26 }}>🐼</span>
              <div>
                <div style={{ fontFamily: orb, fontSize: 16, fontWeight: 900, letterSpacing: 3, color: '#00ff9f' }}>PANDA · APPROVALS</div>
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#445566' }}>ADMIN CONTROL · MANUAL GATING</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => router.push('/admin')} style={{ background: 'rgba(255,209,102,0.12)', border: '1px solid #ffd16644', borderRadius: 6, color: '#ffd166', fontFamily: mono, fontSize: 10, letterSpacing: 2, padding: '8px 14px', cursor: 'pointer' }}>🛡️ ADMIN</button>
              <button onClick={() => router.push('/dashboard')} style={{ background: 'rgba(0,255,159,0.08)', border: '1px solid #00ff9f44', borderRadius: 6, color: '#00ff9f', fontFamily: mono, fontSize: 10, letterSpacing: 2, padding: '8px 14px', cursor: 'pointer' }}>📊 DASHBOARD</button>
              <button onClick={pfLoad} style={{ background: 'transparent', border: '1px solid #1a2540', borderRadius: 6, color: '#8899aa', fontFamily: mono, fontSize: 10, letterSpacing: 2, padding: '8px 14px', cursor: 'pointer' }}>↻ REFRESH</button>
            </div>
          </div>

          {/* TABS */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid #1a2540' }}>
            {[
              { k: 'signups', label: `SIGNUP REQUESTS (${pfSignups.length})` },
              { k: 'users',   label: `PENDING USERS (${pfPendingUsers.length})` },
              { k: 'events',  label: `SECURITY EVENTS (${pfEvents.length})` },
            ].map(t => (
              <button key={t.k} onClick={() => setPfTab(t.k)}
                style={{ background: 'transparent', border: 'none', borderBottom: pfTab === t.k ? '2px solid #00ff9f' : '2px solid transparent', color: pfTab === t.k ? '#00ff9f' : '#6b7d8e', fontFamily: orb, fontSize: 11, fontWeight: 700, letterSpacing: 2, padding: '12px 16px', cursor: 'pointer', transition: 'all 0.2s' }}>
                {t.label}
              </button>
            ))}
          </div>
          {/* SIGNUPS TAB */}
          {pfTab === 'signups' && (
            <div>
              {pfSignups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#445566', fontFamily: mono, fontSize: 12, letterSpacing: 2 }}>NO PENDING SIGNUP REQUESTS</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pfSignups.map(s => (
                    <div key={s.id} style={{ background: 'linear-gradient(135deg,#0a0e1a,#0e1525)', border: '1px solid #1a2540', borderRadius: 10, padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: orb, fontSize: 15, fontWeight: 700, color: '#e8eaf0' }}>{s.email}</span>
                          <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#050810', background: s.tier === 'elite' ? '#00b4ff' : s.tier === 'pro' ? '#00ff9f' : '#445566', padding: '3px 10px', borderRadius: 4 }}>{(s.tier || 'starter').toUpperCase()}</span>
                        </div>
                        <div style={{ fontFamily: mono, fontSize: 10, color: '#6b7d8e', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          {s.username && <span>USER: <span style={{ color: '#00ff9f' }}>{s.username}</span></span>}
                          <span>IP: {s.ip || '—'}</span>
                          <span>{pfFormatTime(s.created_at)}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => pfOpenApprove(s)} style={{ background: '#00ff9f', border: 'none', borderRadius: 6, color: '#050810', fontFamily: orb, fontSize: 10, fontWeight: 700, letterSpacing: 2, padding: '9px 18px', cursor: 'pointer' }}>APPROVE</button>
                        <button onClick={() => pfDeny(s.id)} style={{ background: 'transparent', border: '1px solid #2a1525', borderRadius: 6, color: '#ff4d6d', fontFamily: orb, fontSize: 10, fontWeight: 700, letterSpacing: 2, padding: '9px 16px', cursor: 'pointer' }}>DENY</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PENDING USERS TAB */}
          {pfTab === 'users' && (
            <div>
              {pfPendingUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#445566', fontFamily: mono, fontSize: 12, letterSpacing: 2 }}>NO USERS PENDING APPROVAL</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pfPendingUsers.map(u => (
                    <div key={u.id} style={{ background: '#0a0e1a', border: '1px solid #1a2540', borderRadius: 8, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontFamily: mono, fontSize: 11, flexWrap: 'wrap' }}>
                        <span style={{ color: '#00ff9f', fontWeight: 700 }}>{u.username}</span>
                        <span style={{ color: '#445566' }}>·</span>
                        <span style={{ color: '#ffd166' }}>{(u.pf_tier || 'starter').toUpperCase()}</span>
                        <span style={{ color: '#445566' }}>·</span>
                        <span style={{ color: '#6b7d8e' }}>{u.role}</span>
                      </div>
                      <button onClick={() => pfToggleApproved(u.id)} style={{ background: '#00ff9f', border: 'none', borderRadius: 6, color: '#050810', fontFamily: orb, fontSize: 10, fontWeight: 700, letterSpacing: 2, padding: '8px 16px', cursor: 'pointer' }}>APPROVE</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* SECURITY EVENTS TAB */}
          {pfTab === 'events' && (
            <div>
              {pfEvents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#445566', fontFamily: mono, fontSize: 12, letterSpacing: 2 }}>NO SECURITY EVENTS YET</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {pfEvents.map(e => {
                    const pc = PRIORITY_COLOR[e.priority] || '#445566';
                    return (
                      <div key={e.id} style={{ background: '#0a0e1a', borderLeft: `3px solid ${pc}`, borderTop: '1px solid #1a2540', borderRight: '1px solid #1a2540', borderBottom: '1px solid #1a2540', borderRadius: 6, padding: '10px 14px', display: 'grid', gridTemplateColumns: '80px 140px 1fr auto', gap: 12, alignItems: 'center', fontFamily: mono, fontSize: 11 }}>
                        <span style={{ color: pc, fontWeight: 700, letterSpacing: 1 }}>{e.priority}</span>
                        <span style={{ color: '#e8eaf0' }}>{e.event_type}</span>
                        <span style={{ color: '#8899aa', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ color: '#00ff9f' }}>{e.username || '—'}</span>
                          <span style={{ color: '#445566' }}>{e.ip || '—'}</span>
                          {e.flags && e.flags.length > 0 && <span>{e.flags.join(' ')}</span>}
                        </span>
                        <span style={{ color: '#445566', fontSize: 10 }}>{pfFormatTime(e.created_at)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* APPROVE MODAL */}
        {pfApproveOpen && (
          <div onClick={() => setPfApproveOpen(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'linear-gradient(135deg,#0a0e1a,#0e1525)', border: '1px solid #1a2540', borderRadius: 14, padding: '28px 26px', maxWidth: 420, width: '100%' }}>
              <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 4, color: '#00b4ff', marginBottom: 8 }}>APPROVE SIGNUP</div>
              <h3 style={{ fontFamily: orb, fontSize: 18, fontWeight: 900, margin: '0 0 4px' }}>CREATE USER ACCOUNT</h3>
              <div style={{ fontFamily: mono, fontSize: 11, color: '#6b7d8e', marginBottom: 18 }}>{pfApproveOpen.email}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                <label style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#445566' }}>USERNAME
                  <input value={pfApUser} onChange={e => setPfApUser(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, background: '#05080f', border: '1px solid #1a2540', borderRadius: 6, padding: '10px 12px', color: '#e8eaf0', fontFamily: raj, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                </label>
                <label style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#445566' }}>PASSWORD (min 6 chars)
                  <input type="text" value={pfApPass} onChange={e => setPfApPass(e.target.value)} placeholder="set initial password" style={{ display: 'block', width: '100%', marginTop: 4, background: '#05080f', border: '1px solid #1a2540', borderRadius: 6, padding: '10px 12px', color: '#e8eaf0', fontFamily: raj, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#445566' }}>TIER
                    <select value={pfApTier} onChange={e => setPfApTier(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, background: '#05080f', border: '1px solid #1a2540', borderRadius: 6, padding: '10px 12px', color: '#e8eaf0', fontFamily: mono, fontSize: 12, outline: 'none' }}>
                      <option value="starter">STARTER</option><option value="pro">PRO</option><option value="elite">ELITE</option>
                    </select>
                  </label>
                  <label style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#445566' }}>ROLE
                    <select value={pfApRole} onChange={e => setPfApRole(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, background: '#05080f', border: '1px solid #1a2540', borderRadius: 6, padding: '10px 12px', color: '#e8eaf0', fontFamily: mono, fontSize: 12, outline: 'none' }}>
                      <option value="user">USER</option><option value="vip">VIP</option><option value="admin">ADMIN</option>
                    </select>
                  </label>
                </div>
              </div>
              {pfApErr && <div style={{ fontFamily: mono, fontSize: 11, color: '#ff4d6d', marginBottom: 10 }}>⚠ {pfApErr}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPfApproveOpen(null)} style={{ flex: 1, background: 'transparent', border: '1px solid #1a2540', borderRadius: 6, color: '#8899aa', fontFamily: mono, fontSize: 10, letterSpacing: 2, padding: '12px', cursor: 'pointer' }}>CANCEL</button>
                <button onClick={pfDoApprove} disabled={pfApBusy} style={{ flex: 2, background: '#00ff9f', border: 'none', borderRadius: 6, color: '#050810', fontFamily: orb, fontSize: 11, fontWeight: 700, letterSpacing: 2, padding: '12px', cursor: 'pointer', opacity: pfApBusy ? 0.6 : 1 }}>{pfApBusy ? 'CREATING...' : 'CREATE & APPROVE'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
