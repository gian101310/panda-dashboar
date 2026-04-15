import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const mono = "'Share Tech Mono',monospace";
const orb = "'Orbitron',sans-serif";
const raj = "'Rajdhani',sans-serif";

const FEATURES = [
  { icon: '⚡', title: 'REAL-TIME SCORING', desc: '21 currency pairs scored every 5 minutes across gap, momentum, TBG zone, bias & confidence.' },
  { icon: '🎯', title: 'SIGNAL INTELLIGENCE', desc: 'Automated BUY/SELL signals with multi-strategy validation — bias-based and intraday execution.' },
  { icon: '📊', title: 'DEEP ANALYTICS', desc: 'Momentum heatmaps, spike detection, currency strength charts, and full signal history logging.' },
  { icon: '🔒', title: 'PRIVATE JOURNALING', desc: 'Track your trades with personal credentials. Import from cTrader or CSV — your data stays yours.' },
];

const STATS = [
  { value: '21', label: 'PAIRS TRACKED' },
  { value: '5min', label: 'REFRESH CYCLE' },
  { value: '24/7', label: 'ENGINE UPTIME' },
  { value: '10+', label: 'SCORING LAYERS' },
];

const TESTIMONIALS = [
  { text: 'Finally, a system that cuts through the noise. The gap scoring alone changed my process.', who: 'TRADER · UAE' },
  { text: 'Momentum heatmap gives me conviction I never had before. No more second-guessing entries.', who: 'SWING TRADER · UK' },
  { text: 'The signal log is invaluable for post-session review. I can see exactly what the engine saw.', who: 'DAY TRADER · EU' },
];
export default function LandingPage() {
  const router = useRouter();
  const [scrollY, setScrollY] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => { setVisible(true); }, []);
  useEffect(() => {
    const h = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  const bg = '#050810';
  const glow = 'rgba(0,255,159,0.06)';

  return (
    <>
      <Head>
        <title>PANDA ENGINE — Forex Intelligence Platform</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="description" content="Real-time forex scoring engine. 21 pairs, 5-minute cycles, multi-layer signal intelligence." />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <div style={{ background: bg, color: '#e8eaf0', minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
        {/* Grid overlay */}
        <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,180,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,255,0.03) 1px,transparent 1px)', backgroundSize: '50px 50px', pointerEvents: 'none', zIndex: 0 }} />

        {/* NAV */}
        <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: scrollY > 50 ? 'rgba(5,8,16,0.95)' : 'transparent', borderBottom: scrollY > 50 ? '1px solid #1a2540' : '1px solid transparent', backdropFilter: scrollY > 50 ? 'blur(12px)' : 'none', transition: 'all 0.3s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28 }}>🐼</span>
            <span style={{ fontFamily: orb, fontSize: 14, fontWeight: 900, letterSpacing: 4, color: '#00ff9f' }}>PANDA ENGINE</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/pricing')} style={{ background: 'none', border: 'none', color: '#8899aa', fontFamily: mono, fontSize: 11, letterSpacing: 2, cursor: 'pointer', padding: '8px 14px', transition: 'color 0.2s' }} className="nav-link">PRICING</button>
            <button onClick={() => router.push('/')} style={{ background: 'none', border: '1px solid #1a2540', borderRadius: 6, color: '#8899aa', fontFamily: mono, fontSize: 11, letterSpacing: 2, cursor: 'pointer', padding: '8px 18px', transition: 'all 0.2s' }} className="nav-link">LOG IN</button>
            <button onClick={() => router.push('/pricing')} style={{ background: '#00ff9f', border: 'none', borderRadius: 6, color: '#050810', fontFamily: orb, fontSize: 10, fontWeight: 700, letterSpacing: 2, cursor: 'pointer', padding: '9px 20px', transition: 'all 0.2s' }} className="cta-btn">GET ACCESS</button>
          </div>
        </nav>
        {/* HERO */}
        <section style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '120px 24px 80px' }}>
          <div style={{ position: 'absolute', top: '25%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle,${glow} 0%,transparent 70%)`, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '60%', right: '10%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,rgba(0,180,255,0.04) 0%,transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.8s cubic-bezier(0.16,1,0.3,1)' }}>
            <div style={{ fontSize: 72, marginBottom: 16, filter: 'drop-shadow(0 0 30px rgba(0,255,159,0.4))' }}>🐼</div>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 6, color: '#00b4ff', marginBottom: 20 }}>FOREX INTELLIGENCE SYSTEM</div>
            <h1 style={{ fontFamily: orb, fontSize: 'clamp(28px,5vw,56px)', fontWeight: 900, lineHeight: 1.15, margin: '0 0 20px', maxWidth: 700 }}>
              <span style={{ color: '#e8eaf0' }}>SEE THE MARKET</span><br />
              <span style={{ color: '#00ff9f', textShadow: '0 0 40px rgba(0,255,159,0.3)' }}>BEFORE IT MOVES</span>
            </h1>
            <p style={{ fontFamily: raj, fontSize: 'clamp(16px,2.2vw,20px)', fontWeight: 400, color: '#6b7d8e', maxWidth: 540, margin: '0 auto 36px', lineHeight: 1.6 }}>
              21 currency pairs. Scored every 5 minutes. Gap analysis, momentum tracking, TBG confirmation, and automated signal generation — all in one engine.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => router.push('/pricing')} style={{ background: '#00ff9f', border: 'none', borderRadius: 8, color: '#050810', fontFamily: orb, fontSize: 13, fontWeight: 700, letterSpacing: 2, padding: '15px 36px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 0 30px rgba(0,255,159,0.25)' }} className="cta-btn">START NOW →</button>
              <button onClick={() => { document.getElementById('features').scrollIntoView({ behavior: 'smooth' }); }} style={{ background: 'transparent', border: '1px solid #1a2540', borderRadius: 8, color: '#8899aa', fontFamily: mono, fontSize: 12, letterSpacing: 2, padding: '15px 30px', cursor: 'pointer', transition: 'all 0.2s' }} className="nav-link">LEARN MORE</button>
            </div>
          </div>
        </section>
        {/* STATS BAR */}
        <section style={{ position: 'relative', zIndex: 1, padding: '0 24px 80px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 1, background: '#1a2540', borderRadius: 12, overflow: 'hidden' }}>
            {STATS.map((s, i) => (
              <div key={i} style={{ background: '#0a0e1a', padding: '28px 20px', textAlign: 'center' }}>
                <div style={{ fontFamily: orb, fontSize: 28, fontWeight: 900, color: '#00ff9f', marginBottom: 6 }}>{s.value}</div>
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 3, color: '#445566' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" style={{ position: 'relative', zIndex: 1, padding: '80px 24px', maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 5, color: '#00b4ff', marginBottom: 12 }}>CORE CAPABILITIES</div>
            <h2 style={{ fontFamily: orb, fontSize: 'clamp(22px,3.5vw,36px)', fontWeight: 700, margin: 0, color: '#e8eaf0' }}>ENGINEERED FOR EDGE</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 20 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ background: 'linear-gradient(135deg,#0a0e1a,#0e1525)', border: '1px solid #1a2540', borderRadius: 12, padding: '32px 24px', transition: 'all 0.3s', cursor: 'default' }} className="feat-card">
                <div style={{ fontSize: 32, marginBottom: 16 }}>{f.icon}</div>
                <div style={{ fontFamily: orb, fontSize: 12, fontWeight: 700, letterSpacing: 2, color: '#00ff9f', marginBottom: 10 }}>{f.title}</div>
                <div style={{ fontFamily: raj, fontSize: 14, color: '#6b7d8e', lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </section>
        {/* SOCIAL PROOF */}
        <section style={{ position: 'relative', zIndex: 1, padding: '80px 24px', maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 50 }}>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 5, color: '#ffd166', marginBottom: 12 }}>FROM THE COMMUNITY</div>
            <h2 style={{ fontFamily: orb, fontSize: 'clamp(20px,3vw,30px)', fontWeight: 700, margin: 0 }}>TRADERS TRUST THE ENGINE</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 20 }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={i} style={{ background: '#0a0e1a', border: '1px solid #1a2540', borderRadius: 10, padding: '28px 22px', position: 'relative' }}>
                <div style={{ fontFamily: mono, fontSize: 28, color: '#1a2540', position: 'absolute', top: 12, left: 18 }}>"</div>
                <p style={{ fontFamily: raj, fontSize: 14, color: '#8899aa', lineHeight: 1.7, margin: '8px 0 16px', fontStyle: 'italic' }}>{t.text}</p>
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 3, color: '#00b4ff' }}>{t.who}</div>
              </div>
            ))}
          </div>
        </section>

        {/* FINAL CTA */}
        <section style={{ position: 'relative', zIndex: 1, padding: '100px 24px', textAlign: 'center' }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 500, height: 500, borderRadius: '50%', background: `radial-gradient(circle,${glow} 0%,transparent 70%)`, pointerEvents: 'none' }} />
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 5, color: '#00b4ff', marginBottom: 14 }}>READY?</div>
          <h2 style={{ fontFamily: orb, fontSize: 'clamp(24px,4vw,42px)', fontWeight: 900, margin: '0 0 16px' }}>
            STOP GUESSING.<br /><span style={{ color: '#00ff9f' }}>START SEEING.</span>
          </h2>
          <p style={{ fontFamily: raj, fontSize: 17, color: '#6b7d8e', maxWidth: 440, margin: '0 auto 32px', lineHeight: 1.6 }}>Join traders who use data-driven intelligence instead of gut feeling.</p>
          <button onClick={() => router.push('/pricing')} style={{ background: '#00ff9f', border: 'none', borderRadius: 8, color: '#050810', fontFamily: orb, fontSize: 14, fontWeight: 700, letterSpacing: 2, padding: '16px 44px', cursor: 'pointer', boxShadow: '0 0 40px rgba(0,255,159,0.3)', transition: 'all 0.2s' }} className="cta-btn">GET ACCESS →</button>
        </section>
        {/* FOOTER */}
        <footer style={{ position: 'relative', zIndex: 1, borderTop: '1px solid #1a2540', padding: '40px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🐼</span>
            <span style={{ fontFamily: orb, fontSize: 10, fontWeight: 700, letterSpacing: 3, color: '#445566' }}>PANDA ENGINE</span>
          </div>
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#1a2540' }}>© {new Date().getFullYear()} PANDA ENGINE · ALL RIGHTS RESERVED</div>
          <div style={{ display: 'flex', gap: 20 }}>
            <a href="/pricing" style={{ fontFamily: mono, fontSize: 10, letterSpacing: 2, color: '#445566', textDecoration: 'none' }}>PRICING</a>
            <a href="/" style={{ fontFamily: mono, fontSize: 10, letterSpacing: 2, color: '#445566', textDecoration: 'none' }}>LOGIN</a>
          </div>
        </footer>
      </div>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #050810; }
        .nav-link:hover { color: #e8eaf0 !important; border-color: #445566 !important; }
        .cta-btn:hover { transform: translateY(-2px); box-shadow: 0 0 50px rgba(0,255,159,0.4) !important; }
        .feat-card:hover { border-color: #00ff9f !important; transform: translateY(-4px); box-shadow: 0 8px 30px rgba(0,255,159,0.08); }
        @media(max-width:640px) {
          nav { padding: 12px 16px !important; }
          nav > div:last-child { gap: 6px !important; }
          nav button { padding: 6px 10px !important; font-size: 9px !important; }
        }
      `}</style>
    </>
  );
}