import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.push('/dashboard');
      } else {
        const d = await res.json();
        setError(d.error || 'Login failed');
      }
    } catch {
      setError('Network error');
    }
    setLoading(false);
  }

  return (
    <>
      <Head>
        <title>PANDA ENGINE — LOGIN</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={styles.page}>
        {/* Background grid */}
        <div style={styles.grid} />
        {/* Glow orb */}
        <div style={styles.orb} />

        <div style={styles.container}>
          {/* Logo */}
          <div style={styles.logoWrap}>
            <div style={styles.logoIcon}>🐼</div>
            <div style={styles.logoText}>PANDA ENGINE</div>
            <div style={styles.logoSub}>FOREX INTELLIGENCE SYSTEM</div>
          </div>

          {/* Login box */}
          <form onSubmit={handleLogin} style={styles.box}>
            <div style={styles.boxHeader}>
              <span style={styles.dot} />
              <span style={styles.dot2} />
              <span style={styles.dot3} />
              <span style={styles.boxTitle}>AUTHENTICATE</span>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>USERNAME</label>
              <input
                style={styles.input}
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="enter username"
                autoComplete="username"
                required
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>PASSWORD</label>
              <input
                type="password"
                style={styles.input}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            {error && <div style={styles.error}>⚠ {error}</div>}

            <button type="submit" style={{ ...styles.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
              {loading ? 'AUTHENTICATING...' : 'ACCESS SYSTEM →'}
            </button>

            <div style={styles.hint}>
              Default: admin / 1234
            </div>
          </form>

          <div style={styles.footer}>
            PANDA FOREX ENGINE v2.0 · LIVE MARKET INTELLIGENCE
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        input:focus { outline: none; border-color: #00ff9f !important; box-shadow: 0 0 12px rgba(0,255,159,0.25) !important; }
        button:hover { background: #00ff9f !important; color: #050810 !important; }
        button:active { transform: scale(0.98); }
      `}</style>
    </>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#050810',
    position: 'relative',
    overflow: 'hidden',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(0,180,255,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,180,255,0.04) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
  },
  orb: {
    position: 'absolute',
    top: '30%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 500,
    height: 500,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0,255,159,0.06) 0%, transparent 70%)',
    animation: 'pulse 4s ease-in-out infinite',
    pointerEvents: 'none',
  },
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 32,
    zIndex: 1,
    width: '100%',
    maxWidth: 420,
    padding: '0 20px',
  },
  logoWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  logoIcon: {
    fontSize: 48,
    lineHeight: 1,
    filter: 'drop-shadow(0 0 16px rgba(0,255,159,0.5))',
  },
  logoText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 6,
    color: '#00ff9f',
    textShadow: '0 0 20px rgba(0,255,159,0.6)',
  },
  logoSub: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    letterSpacing: 4,
    color: '#445566',
  },
  box: {
    width: '100%',
    background: 'linear-gradient(135deg, #0a0e1a 0%, #0e1525 100%)',
    border: '1px solid #1a2540',
    borderRadius: 12,
    padding: 32,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    boxShadow: '0 0 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.03)',
  },
  boxHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  dot: { width: 10, height: 10, borderRadius: '50%', background: '#ff4d6d', display: 'inline-block' },
  dot2: { width: 10, height: 10, borderRadius: '50%', background: '#ffd166', display: 'inline-block' },
  dot3: { width: 10, height: 10, borderRadius: '50%', background: '#00ff9f', display: 'inline-block' },
  boxTitle: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    letterSpacing: 3,
    color: '#445566',
    marginLeft: 8,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    letterSpacing: 3,
    color: '#445566',
  },
  input: {
    background: '#05080f',
    border: '1px solid #1a2540',
    borderRadius: 6,
    padding: '12px 14px',
    color: '#e8eaf0',
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: 16,
    fontWeight: 500,
    letterSpacing: 1,
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  error: {
    background: 'rgba(255,77,109,0.1)',
    border: '1px solid rgba(255,77,109,0.3)',
    borderRadius: 6,
    padding: '10px 14px',
    color: '#ff4d6d',
    fontSize: 13,
    fontFamily: "'Share Tech Mono', monospace",
    letterSpacing: 1,
  },
  btn: {
    background: 'transparent',
    border: '1px solid #00ff9f',
    borderRadius: 6,
    color: '#00ff9f',
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 2,
    padding: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'center',
  },
  hint: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: '#2a3550',
    textAlign: 'center',
    letterSpacing: 1,
  },
  footer: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    letterSpacing: 2,
    color: '#2a3550',
    textAlign: 'center',
  },
};
