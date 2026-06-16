import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const pfMono = "'Share Tech Mono',monospace";
const pfOrb  = "'Orbitron',sans-serif";
const pfRaj  = "'Rajdhani',sans-serif";

export default function PfPendingPage() {
  const router = useRouter();
  const [pfUser, setPfUser] = useState(null);
  const [pfChecked, setPfChecked] = useState(false);

  useEffect(() => {
    fetch('/api/pf-me').then(r => r.json()).then(d => {
      setPfChecked(true);
      if (!d.username) { router.replace('/login'); return; }
      if (d.pf_approved) { router.replace(d.role === 'admin' ? '/admin' : '/dashboard'); return; }
      setPfUser(d);
    }).catch(() => router.replace('/login'));
  }, []);

  const pfOpenTelegram = () => window.open('https://t.me/panda_engine_alerts_bot', '_blank');
  const pfLogout = async () => { try { await fetch('/api/logout', { method: 'POST' }); } catch {} router.replace('/login'); };
  if (!pfChecked) {
    return <div style={{ background: '#050810', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#445566', fontFamily: pfMono, fontSize: 11, letterSpacing: 3 }}>VERIFYING ACCESS...</div>;
  }
  if (!pfUser) return null;

  return (
    <>
      <Head>
        <title>PANDA ENGINE — Pending Approval</title>
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <div style={{ background: '#050810', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,180,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,255,0.03) 1px,transparent 1px)', backgroundSize: '50px 50px', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,209,102,0.06) 0%,transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 18, filter: 'drop-shadow(0 0 30px rgba(255,209,102,0.35))' }}>⏳</div>
          <div style={{ fontFamily: pfMono, fontSize: 10, letterSpacing: 5, color: '#ffd166', marginBottom: 12 }}>ACCOUNT STATUS</div>
          <h1 style={{ fontFamily: pfOrb, fontSize: 28, fontWeight: 900, color: '#e8eaf0', margin: '0 0 14px' }}>PENDING APPROVAL</h1>
          <p style={{ fontFamily: pfRaj, fontSize: 16, color: '#6b7d8e', lineHeight: 1.6, marginBottom: 28 }}>
            Your account <span style={{ color: '#00ff9f', fontFamily: pfMono }}>{pfUser.username}</span> is awaiting manual approval.
            Access is vetted to maintain system quality.
          </p>

          <div style={{ background: 'linear-gradient(135deg,#0a0e1a,#0e1525)', border: '1px solid #1a2540', borderRadius: 12, padding: '28px 24px', marginBottom: 20 }}>
            <div style={{ fontFamily: pfMono, fontSize: 10, letterSpacing: 3, color: '#445566', marginBottom: 12 }}>NEXT STEP</div>
            <p style={{ fontFamily: pfRaj, fontSize: 14, color: '#8899aa', lineHeight: 1.6, marginBottom: 20 }}>
              If you provided your Telegram username during signup, your credentials will be sent automatically once approved. If not, message @panda_engine_alerts_bot with your username to speed things up.
            </p>
            <button onClick={pfOpenTelegram} style={{ width: '100%', background: '#00b4ff', border: 'none', borderRadius: 8, color: '#050810', fontFamily: pfOrb, fontSize: 12, fontWeight: 700, letterSpacing: 2, padding: '14px', cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 30px rgba(0,180,255,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}>
              📨 MESSAGE @panda_engine_alerts_bot
            </button>
          </div>

          <button onClick={pfLogout} style={{ background: 'transparent', border: '1px solid #2a1525', borderRadius: 6, color: '#ff4d6d', fontFamily: pfMono, fontSize: 10, letterSpacing: 2, padding: '10px 20px', cursor: 'pointer' }}>SIGN OUT</button>
        </div>
      </div>
    </>
  );
}
