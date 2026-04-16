import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const mono = "'Share Tech Mono',monospace";
const orb = "'Orbitron',sans-serif";
const raj = "'Rajdhani',sans-serif";

const TIERS = [
  {
    name: 'FREE', price: '0', period: '', color: '#445566', tag: null,
    features: ['Live signal tab', 'Position calculator', 'Economic calendar', 'COT report'],
    cta: 'START FREE', href: '/login',
  },
  {
    name: 'PRO', price: '29', period: '/mo', color: '#00ff9f', tag: 'MOST POPULAR',
    features: ['Everything in Free', 'Signal tab (real-time)', 'Full data table', 'Gap score chart', 'Valid setups tab', 'Spike detection widgets', 'Momentum heatmap'],
    cta: 'GO PRO →', href: '/login',
  },
  {
    name: 'ELITE', price: '79', period: '/mo', color: '#00b4ff', tag: 'FULL ACCESS',
    features: ['Everything in Pro', 'Live panels view', 'Spike log history', 'TradingView chart tab', 'Private trading journal', 'Telegram spike alerts', 'Currency strength charts', 'Engine health monitor', 'Early access to new features'],
    cta: 'GO ELITE →', href: '/login',
  },
];
export default function PricingPage() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => { setVisible(true); }, []);

  return (
    <>
      <Head>
        <title>PANDA ENGINE — Pricing</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ background: '#050810', color: '#e8eaf0', minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,180,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,255,0.03) 1px,transparent 1px)', backgroundSize: '50px 50px', pointerEvents: 'none', zIndex: 0 }} />

        {/* NAV */}
        <nav style={{ position: 'relative', zIndex: 10, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1a2540' }}>
          <div onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <span style={{ fontSize: 28 }}>🐼</span>
            <span style={{ fontFamily: orb, fontSize: 14, fontWeight: 900, letterSpacing: 4, color: '#00ff9f' }}>PANDA ENGINE</span>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', color: '#8899aa', fontFamily: mono, fontSize: 11, letterSpacing: 2, cursor: 'pointer', padding: '8px 14px' }} className="nav-link">HOME</button>
            <button onClick={() => router.push('/login')} style={{ background: 'none', border: '1px solid #1a2540', borderRadius: 6, color: '#8899aa', fontFamily: mono, fontSize: 11, letterSpacing: 2, cursor: 'pointer', padding: '8px 18px' }} className="nav-link">LOG IN</button>
          </div>
        </nav>
        {/* HERO */}
        <section style={{ position: 'relative', zIndex: 1, padding: '80px 24px 40px', textAlign: 'center', opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease-out' }}>
          <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%,-50%)', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle,rgba(0,255,159,0.05) 0%,transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 5, color: '#00b4ff', marginBottom: 14 }}>CHOOSE YOUR EDGE</div>
          <h1 style={{ fontFamily: orb, fontSize: 'clamp(26px,4.5vw,44px)', fontWeight: 900, margin: '0 0 16px' }}>
            ONE ENGINE.<br /><span style={{ color: '#00ff9f' }}>THREE LEVELS.</span>
          </h1>
          <p style={{ fontFamily: raj, fontSize: 17, color: '#6b7d8e', maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>Every tier runs on the same core intelligence. Pick the depth that matches your trading.</p>
        </section>

        {/* TIERS */}
        <section style={{ position: 'relative', zIndex: 1, padding: '40px 24px 80px', maxWidth: 1020, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20, alignItems: 'start' }}>
            {TIERS.map((t, i) => {
              const isPro = t.name === 'PRO';
              return (
                <div key={i} style={{ background: isPro ? 'linear-gradient(135deg,#0a1420,#0e1a2a)' : 'linear-gradient(135deg,#0a0e1a,#0e1525)', border: `1px solid ${isPro ? '#00ff9f33' : '#1a2540'}`, borderRadius: 14, padding: '36px 28px', position: 'relative', transform: isPro ? 'scale(1.03)' : 'none', boxShadow: isPro ? '0 0 50px rgba(0,255,159,0.08)' : 'none' }} className="tier-card">
                  {t.tag && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: t.color, color: '#050810', fontFamily: orb, fontSize: 8, fontWeight: 700, letterSpacing: 2, padding: '4px 14px', borderRadius: 20 }}>{t.tag}</div>}
                  <div style={{ fontFamily: orb, fontSize: 12, fontWeight: 700, letterSpacing: 3, color: t.color, marginBottom: 20 }}>{t.name}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 28 }}>
                    <span style={{ fontFamily: mono, fontSize: 14, color: '#445566' }}>$</span>
                    <span style={{ fontFamily: orb, fontSize: 48, fontWeight: 900, color: '#e8eaf0' }}>{t.price}</span>
                    <span style={{ fontFamily: mono, fontSize: 12, color: '#445566' }}>{t.period}</span>
                  </div>                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                    {t.features.map((f, j) => (
                      <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ color: t.color, fontSize: 12 }}>✓</span>
                        <span style={{ fontFamily: raj, fontSize: 14, color: '#8899aa' }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => router.push(t.href)} style={{ width: '100%', background: isPro ? '#00ff9f' : 'transparent', border: `1px solid ${t.color}`, borderRadius: 8, color: isPro ? '#050810' : t.color, fontFamily: orb, fontSize: 11, fontWeight: 700, letterSpacing: 2, padding: '14px', cursor: 'pointer', transition: 'all 0.2s' }} className={isPro ? 'cta-btn' : 'tier-btn'}>{t.cta}</button>
                </div>
              );
            })}
          </div>
        </section>
        {/* EARLY ACCESS CTA */}
        <section style={{ position: 'relative', zIndex: 1, padding: '60px 24px 80px', textAlign: 'center', maxWidth: 500, margin: '0 auto' }}>
          <div style={{ background: 'linear-gradient(135deg,#0a0e1a,#0e1525)', border: '1px solid #1a2540', borderRadius: 14, padding: '40px 28px' }}>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 4, color: '#ffd166', marginBottom: 10 }}>LIMITED SPOTS</div>
            <h3 style={{ fontFamily: orb, fontSize: 20, fontWeight: 700, margin: '0 0 10px' }}>JOIN THE WAITLIST</h3>
            <p style={{ fontFamily: raj, fontSize: 14, color: '#6b7d8e', marginBottom: 24, lineHeight: 1.5 }}>Get notified when new slots open. Early members lock in launch pricing.</p>
            {submitted ? (
              <div style={{ fontFamily: mono, fontSize: 13, color: '#00ff9f', padding: '14px', border: '1px solid #00ff9f33', borderRadius: 8, background: 'rgba(0,255,159,0.05)' }}>✓ YOU'RE ON THE LIST</div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" style={{ flex: 1, background: '#05080f', border: '1px solid #1a2540', borderRadius: 6, padding: '12px 14px', color: '#e8eaf0', fontFamily: raj, fontSize: 14, outline: 'none' }} />
                <button onClick={() => { if (email.includes('@')) setSubmitted(true); }} style={{ background: '#00ff9f', border: 'none', borderRadius: 6, color: '#050810', fontFamily: orb, fontSize: 10, fontWeight: 700, letterSpacing: 2, padding: '12px 20px', cursor: 'pointer', whiteSpace: 'nowrap' }} className="cta-btn">NOTIFY ME</button>
              </div>
            )}
          </div>
        </section>
        {/* FOOTER */}
        <footer style={{ position: 'relative', zIndex: 1, borderTop: '1px solid #1a2540', padding: '36px 24px', textAlign: 'center' }}>
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#1a2540' }}>© {new Date().getFullYear()} PANDA ENGINE · ALL RIGHTS RESERVED</div>
        </footer>
      </div>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #050810; }
        .nav-link:hover { color: #e8eaf0 !important; border-color: #445566 !important; }
        .cta-btn:hover { transform: translateY(-2px); box-shadow: 0 0 50px rgba(0,255,159,0.4) !important; }
        .tier-btn:hover { background: rgba(255,255,255,0.05) !important; }
        .tier-card:hover { border-color: #00ff9f44 !important; }
        input:focus { border-color: #00ff9f !important; box-shadow: 0 0 10px rgba(0,255,159,0.15) !important; }
        @media(max-width:640px) {
          nav { padding: 12px 16px !important; }
          nav button { padding: 6px 10px !important; font-size: 9px !important; }
        }
      `}</style>
    </>
  );
}