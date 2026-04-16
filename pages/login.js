import { useState } from 'react';
import Head from 'next/head';
import ThemeToggle from '../components/ThemeToggle';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const d = await res.json();
      if (res.ok) {
        // Telegram login alert (non-blocking)
            fetch('http://2.51.11.146:8000/api/login-alert', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: username })
            }).catch(() => {});
            // pf-security: log event + device/IP detection (non-blocking)
            fetch('/api/pf-log-event', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ event_type: 'LOGIN_SUCCESS', username, role: d.role, status: 'OK' })
            }).catch(() => {});
            // pf-approval gate
            try {
              const me = await fetch('/api/pf-me').then(r => r.json());
              if (me && me.pf_approved === false) { window.location.href = '/pending'; return; }
            } catch {}
            window.location.href = d.role === 'admin' ? '/admin' : '/dashboard';
      } else {
        // pf-security: log failed attempt (non-blocking)
        fetch('/api/pf-log-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_type: 'LOGIN_FAILED', username, status: 'FAIL', detail: d.error || 'login_failed' })
        }).catch(() => {});
        setError(d.error || 'Login failed');
      }
    } catch { setError('Network error. Please try again.'); }
    setLoading(false);
  }

  return (
    <>
      <Head><title>PANDA ENGINE — LOGIN</title><meta name="viewport" content="width=device-width,initial-scale=1" /></Head>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050810', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,180,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,255,0.04) 1px,transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%,-50%)', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle,rgba(0,255,159,0.06) 0%,transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, zIndex: 1, width: '100%', maxWidth: 400, padding: '0 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 52, lineHeight: 1, filter: 'drop-shadow(0 0 18px rgba(0,255,159,0.5))' }}>🐼</div>
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 26, fontWeight: 900, letterSpacing: 6, color: '#00ff9f', textShadow: '0 0 20px rgba(0,255,159,0.6)' }}>PANDA ENGINE</div>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: 4, color: '#445566' }}>FOREX INTELLIGENCE SYSTEM</div>
          </div>

          <form onSubmit={handleLogin} style={{ width: '100%', background: 'linear-gradient(135deg,#0a0e1a,#0e1525)', border: '1px solid #1a2540', borderRadius: 12, padding: 28, display: 'flex', flexDirection: 'column', gap: 18, boxShadow: '0 0 40px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff4d6d', display: 'inline-block' }} />
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ffd166', display: 'inline-block' }} />
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#00ff9f', display: 'inline-block' }} />
              <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: 3, color: '#445566', marginLeft: 8 }}>AUTHENTICATE</span>
            </div>

            <div>
              <label style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: 3, color: '#445566', display: 'block', marginBottom: 6 }}>USERNAME</label>
              <input
                style={{ background: '#05080f', border: '1px solid #1a2540', borderRadius: 6, padding: '11px 13px', color: '#e8eaf0', fontFamily: "'Rajdhani',sans-serif", fontSize: 15, fontWeight: 500, width: '100%', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                value={username} onChange={e => setUsername(e.target.value)}
                placeholder="enter username" autoComplete="username" required
              />
            </div>

            <div>
              <label style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: 3, color: '#445566', display: 'block', marginBottom: 6 }}>PASSWORD</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  style={{ background: '#05080f', border: '1px solid #1a2540', borderRadius: 6, padding: '11px 44px 11px 13px', color: '#e8eaf0', fontFamily: "'Rajdhani',sans-serif", fontSize: 15, fontWeight: 500, width: '100%', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" autoComplete="current-password" required
                />
                {/* Show/hide toggle */}
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#445566', fontSize: 16, lineHeight: 1 }}
                  tabIndex={-1}
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background: 'rgba(255,77,109,0.1)', border: '1px solid rgba(255,77,109,0.3)', borderRadius: 6, padding: '9px 13px', color: '#ff4d6d', fontSize: 12, fontFamily: "'Share Tech Mono',monospace" }}>
                ⚠ {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              style={{ background: 'transparent', border: '1px solid #00ff9f', borderRadius: 6, color: '#00ff9f', fontFamily: "'Orbitron',sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 2, padding: '13px', cursor: 'pointer', transition: 'all 0.2s', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'AUTHENTICATING...' : 'ACCESS SYSTEM →'}
            </button>
          </form>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: 2, color: '#445566' }}>
            NEW USER?
            <a href="/pricing" style={{ color: '#00b4ff', textDecoration: 'none', borderBottom: '1px solid #00b4ff33', paddingBottom: 1 }}>SIGN UP →</a>
          </div>

          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: 2, color: '#1a2540' }}>
            PANDA ENGINE v2.0 · INVITE ONLY
          </div>
        </div>
      </div>
      <style>{`
        input:focus { outline: none; border-color: #00ff9f !important; box-shadow: 0 0 10px rgba(0,255,159,0.2) !important; }
        button[type="submit"]:hover:not(:disabled) { background: #00ff9f !important; color: #050810 !important; }
      `}</style>
    </>
  );
}