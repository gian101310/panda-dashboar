import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const pfMono = "'Share Tech Mono',monospace";
const pfOrb  = "'Orbitron',sans-serif";
const pfRaj  = "'Rajdhani',sans-serif";

const PF_BENEFITS = [
  { icon: '🎯', title: 'Precision Signals', desc: 'Every 5 minutes. 21 pairs. Multi-layer validation. No guesswork.' },
  { icon: '🧠', title: 'Automated Analysis', desc: 'D1, H4, H1 timeframe scoring computed automatically. You just read the result.' },
  { icon: '⏱️', title: 'Session Timing Edge', desc: 'Know exactly when London, NY, and Asia windows align with your setup.' },
  { icon: '🔍', title: 'Smart Trade Filtering', desc: 'Valid setups only. Invalid pairs are automatically hidden from your view.' },
];

const PF_STEPS = [
  { n: '01', label: 'REVIEW SIGNALS' },
  { n: '02', label: 'CONFIRM SETUP' },
  { n: '03', label: 'EXECUTE TRADE' },
];
export default function PfFunnelPage() {
  const router = useRouter();
  const [pfVisible, setPfVisible] = useState(false);
  useEffect(() => { setPfVisible(true); }, []);

  const pfGoPricing = () => router.push('/pricing');

  return (
    <>
      <Head>
        <title>PANDA ENGINE — Stop Guessing. Start Trading with Structure.</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="pf-funnel-wrap">
        <div className="pf-grid-bg" />

        <nav className="pf-nav">
          <div onClick={() => router.push('/')} className="pf-logo">
            <span style={{ fontSize: 26 }}>🐼</span>
            <span style={{ fontFamily: pfOrb, fontSize: 13, fontWeight: 900, letterSpacing: 4, color: '#00ff9f' }}>PANDA ENGINE</span>
          </div>
          <button onClick={() => router.push('/login')} className="pf-nav-login">LOG IN</button>
        </nav>
        <section className="pf-hero" style={{ opacity: pfVisible ? 1 : 0, transform: pfVisible ? 'translateY(0)' : 'translateY(20px)' }}>
          <div className="pf-glow" />
          <div style={{ fontFamily: pfMono, fontSize: 10, letterSpacing: 5, color: '#00b4ff', marginBottom: 16 }}>THE SYSTEM</div>
          <h1 style={{ fontFamily: pfOrb, fontSize: 'clamp(28px,5vw,52px)', fontWeight: 900, lineHeight: 1.1, margin: '0 0 18px', maxWidth: 780 }}>
            <span style={{ color: '#e8eaf0' }}>STOP GUESSING.</span><br />
            <span style={{ color: '#00ff9f', textShadow: '0 0 40px rgba(0,255,159,0.35)' }}>START TRADING WITH STRUCTURE.</span>
          </h1>
          <p style={{ fontFamily: pfRaj, fontSize: 'clamp(16px,2vw,19px)', color: '#6b7d8e', maxWidth: 560, margin: '0 auto 40px', lineHeight: 1.65 }}>
            The Panda Engine doesn't give you more noise. It gives you a repeatable process: precision signals, automated analysis, and session timing that actually matters.
          </p>
          <div className="pf-steps">
            {PF_STEPS.map((s, i) => (
              <div key={i} className="pf-step">
                <div style={{ fontFamily: pfOrb, fontSize: 28, fontWeight: 900, color: '#00ff9f' }}>{s.n}</div>
                <div style={{ fontFamily: pfMono, fontSize: 10, letterSpacing: 3, color: '#8899aa', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="pf-benefits">
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontFamily: pfMono, fontSize: 10, letterSpacing: 5, color: '#ffd166', marginBottom: 12 }}>WHAT YOU GET</div>
            <h2 style={{ fontFamily: pfOrb, fontSize: 'clamp(22px,3.5vw,34px)', fontWeight: 700, margin: 0 }}>FOUR EDGES. ONE ENGINE.</h2>
          </div>
          <div className="pf-benefit-grid">
            {PF_BENEFITS.map((b, i) => (
              <div key={i} className="pf-benefit-card">
                <div style={{ fontSize: 30, marginBottom: 14 }}>{b.icon}</div>
                <div style={{ fontFamily: pfOrb, fontSize: 13, fontWeight: 700, letterSpacing: 2, color: '#00ff9f', marginBottom: 10 }}>{b.title.toUpperCase()}</div>
                <div style={{ fontFamily: pfRaj, fontSize: 14.5, color: '#8899aa', lineHeight: 1.6 }}>{b.desc}</div>
              </div>
            ))}
          </div>
        </section>
        <section className="pf-cta">
          <div className="pf-glow" style={{ opacity: 0.8 }} />
          <h2 style={{ fontFamily: pfOrb, fontSize: 'clamp(22px,4vw,36px)', fontWeight: 900, margin: '0 0 14px' }}>
            READY TO SEE THE SYSTEM?
          </h2>
          <p style={{ fontFamily: pfRaj, fontSize: 17, color: '#6b7d8e', maxWidth: 440, margin: '0 auto 32px', lineHeight: 1.6 }}>
            Three tiers. Same engine. Pick the depth that matches how you trade.
          </p>
          <button onClick={pfGoPricing} className="pf-cta-btn">CONTINUE →</button>
          <div style={{ fontFamily: pfMono, fontSize: 9, letterSpacing: 3, color: '#445566', marginTop: 22 }}>
            MANUAL APPROVAL · INVITE QUALITY
          </div>
        </section>

        <footer className="pf-footer">
          <div style={{ fontFamily: pfMono, fontSize: 9, letterSpacing: 2, color: '#1a2540' }}>
            © {new Date().getFullYear()} PANDA ENGINE · ALL RIGHTS RESERVED
          </div>
        </footer>
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #050810; }
        .pf-funnel-wrap { background: #050810; color: #e8eaf0; min-height: 100vh; position: relative; overflow: hidden; }
        .pf-grid-bg { position: fixed; inset: 0; background-image: linear-gradient(rgba(0,180,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,255,0.03) 1px,transparent 1px); background-size: 50px 50px; pointer-events: none; z-index: 0; }
        .pf-nav { position: relative; z-index: 10; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1a2540; }
        .pf-logo { display: flex; align-items: center; gap: 10px; cursor: pointer; }
        .pf-nav-login { background: none; border: 1px solid #1a2540; border-radius: 6px; color: #8899aa; font-family: ${pfMono}; font-size: 11px; letter-spacing: 2px; cursor: pointer; padding: 8px 18px; transition: all 0.2s; }
        .pf-nav-login:hover { color: #e8eaf0; border-color: #445566; }
        .pf-hero { position: relative; z-index: 1; min-height: 80vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 80px 24px 60px; transition: all 0.8s cubic-bezier(0.16,1,0.3,1); }
        .pf-glow { position: absolute; top: 30%; left: 50%; transform: translate(-50%,-50%); width: 600px; height: 600px; border-radius: 50%; background: radial-gradient(circle,rgba(0,255,159,0.06) 0%,transparent 70%); pointer-events: none; }
        .pf-steps { display: flex; gap: 40px; flex-wrap: wrap; justify-content: center; margin-top: 12px; }
        .pf-step { display: flex; flex-direction: column; align-items: center; padding: 14px 22px; border: 1px solid #1a2540; border-radius: 10px; background: rgba(10,14,26,0.6); min-width: 140px; }
        .pf-benefits { position: relative; z-index: 1; padding: 80px 24px; max-width: 1020px; margin: 0 auto; }
        .pf-benefit-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(230px,1fr)); gap: 20px; }
        .pf-benefit-card { background: linear-gradient(135deg,#0a0e1a,#0e1525); border: 1px solid #1a2540; border-radius: 12px; padding: 30px 24px; transition: all 0.3s; }
        .pf-benefit-card:hover { border-color: #00ff9f; transform: translateY(-3px); box-shadow: 0 8px 30px rgba(0,255,159,0.08); }
        .pf-cta { position: relative; z-index: 1; padding: 90px 24px; text-align: center; }
        .pf-cta-btn { background: #00ff9f; border: none; border-radius: 8px; color: #050810; font-family: ${pfOrb}; font-size: 14px; font-weight: 700; letter-spacing: 2px; padding: 16px 44px; cursor: pointer; box-shadow: 0 0 40px rgba(0,255,159,0.28); transition: all 0.2s; }
        .pf-cta-btn:hover { transform: translateY(-2px); box-shadow: 0 0 55px rgba(0,255,159,0.45); }
        .pf-footer { position: relative; z-index: 1; border-top: 1px solid #1a2540; padding: 30px 24px; text-align: center; }
      `}</style>
    </>
  );
}
