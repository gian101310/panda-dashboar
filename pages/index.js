import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const mono = "'Share Tech Mono',monospace";
const orb  = "'Orbitron',sans-serif";
const raj  = "'Rajdhani',sans-serif";

const FEATURES = [
  { icon:'⚡', title:'REAL-TIME SIGNALS', desc:'BUY and SELL signals generated every 5 minutes across 21 forex pairs. Multi-strategy validation with BB and INTRA logic.', color:'#00ff9f' },
  { icon:'🎯', title:'GAP SCORING ENGINE', desc:'Proprietary currency strength scoring across D1, H4 and H1 timeframes. The gap score reveals true directional bias — not noise.', color:'#00b4ff' },
  { icon:'📊', title:'MOMENTUM TRACKING', desc:'10 momentum states from SPARK to REVERSING. Know when a move is building, peaking, or dying — before it shows on the chart.', color:'#66ffcc' },
  { icon:'🧠', title:'PANDA AI', desc:'AI-powered market narrator that analyzes all 21 pairs, surfaces opportunities, and coaches your decision-making in real time.', color:'#7C3AED' },
  { icon:'🔥', title:'SPIKE DETECTION', desc:'Instant alerts when gap scores jump 7+ points. The engine catches the move — you decide whether to ride it.', color:'#ffd166' },
  { icon:'🛡️', title:'EDGE VALIDATION', desc:'Historical win rates by gap level, PL confirmation, and session. Know your real edge with data, not gut feeling.', color:'#10B981' },
];

const STEPS = [
  { num:'01', title:'ENGINE SCANS', desc:'Every 5 minutes, the engine reads MT4 data across all 21 pairs, computes gap scores, momentum states, and confidence levels.', color:'#00ff9f' },
  { num:'02', title:'SIGNALS FIRE', desc:'When conditions align — gap threshold, momentum confirmation, PL zone — the engine generates a signal with full context.', color:'#00b4ff' },
  { num:'03', title:'YOU DECIDE', desc:'Signals land on your dashboard with all the data. Confidence score, edge history, session context. You make the call.', color:'#7C3AED' },
];

const TIERS = [
  { name:'FREE', price:'0', period:'', color:'#445566', tag:null, features:['Live signals tab','Position calculator','Economic calendar','COT report access'], cta:'START FREE', tier:'starter' },
  { name:'PRO', price:'29', period:'/mo', color:'#00ff9f', tag:'MOST POPULAR', features:['Everything in Free','Full data table + gap chart','Valid setups tab','Spike detection','Panda AI assistant'], cta:'GO PRO →', tier:'pro' },
  { name:'ELITE', price:'79', period:'/mo', color:'#00b4ff', tag:'FULL ACCESS', features:['Everything in Pro','Live panels view','Signal analytics','Full signal + spike logs','TradingView charts','Telegram alerts'], cta:'GO ELITE →', tier:'elite' },
];

const TESTIMONIALS = [
  { text:'The gap scoring changed everything. I stopped guessing and started seeing the actual flow.', who:'Swing Trader · UAE', stat:'+1,580 pips tracked' },
  { text:'Momentum states alone are worth the subscription. Knowing when a move is BUILDING vs FADING is pure edge.', who:'Day Trader · UK', stat:'6 months active' },
  { text:'Signal log lets me review what the engine saw versus what I did. My execution gap dropped 40%.', who:'Intraday · EU', stat:'200+ trades logged' },
];

function useInView(ref) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold: 0.15 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref]);
  return inView;
}

function Section({ children, id }) {
  const ref = useRef(null);
  const inView = useInView(ref);
  return <section ref={ref} id={id} style={{ opacity: inView ? 1 : 0, transform: inView ? 'translateY(0)' : 'translateY(40px)', transition: 'all 0.8s cubic-bezier(0.16,1,0.3,1)' }}>{children}</section>;
}

function LiveCounter({ end, suffix, label, delay }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref);
  useEffect(() => {
    if (!inView) return;
    const t = setTimeout(() => {
      let s = 0; const step = end / 30;
      const iv = setInterval(() => { s += step; if (s >= end) { setVal(end); clearInterval(iv); } else setVal(Math.round(s)); }, 40);
      return () => clearInterval(iv);
    }, delay);
    return () => clearTimeout(t);
  }, [inView, end, delay]);
  return <div ref={ref} style={{ textAlign: 'center' }}>
    <div style={{ fontFamily: orb, fontSize: 48, fontWeight: 900, lineHeight: 1, color: '#00ff9f', textShadow: '0 0 30px rgba(0,255,159,0.3)' }}>{val}{suffix}</div>
    <div style={{ fontFamily: mono, fontSize: 10, color: '#4a5578', letterSpacing: 3, marginTop: 8 }}>{label}</div>
  </div>;
}

function OrbitalRing() {
  return <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 500, height: 500, pointerEvents: 'none' }}>
    <svg viewBox="0 0 500 500" style={{ width: '100%', height: '100%', animation: 'orbSpin 60s linear infinite' }}>
      <defs>
        <linearGradient id="orbG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#00ff9f" stopOpacity="0.3"/><stop offset="50%" stopColor="#00b4ff" stopOpacity="0.1"/><stop offset="100%" stopColor="#7C3AED" stopOpacity="0.2"/></linearGradient>
      </defs>
      <ellipse cx="250" cy="250" rx="220" ry="80" fill="none" stroke="url(#orbG)" strokeWidth="0.8" transform="rotate(-15,250,250)"/>
      <ellipse cx="250" cy="250" rx="180" ry="65" fill="none" stroke="url(#orbG)" strokeWidth="0.5" transform="rotate(25,250,250)" opacity="0.5"/>
      <ellipse cx="250" cy="250" rx="240" ry="95" fill="none" stroke="url(#orbG)" strokeWidth="0.3" transform="rotate(-40,250,250)" opacity="0.3"/>
      {[0,45,90,135,180,225,270,315].map(a => {
        const r = 220, cx = 250 + r * Math.cos((a - 15) * Math.PI / 180), cy = 250 + 80 * Math.sin((a - 15) * Math.PI / 180);
        return <circle key={a} cx={cx} cy={cy} r="2" fill="#00ff9f" opacity="0.6"><animate attributeName="opacity" values="0.2;0.8;0.2" dur={`${3 + a * 0.01}s`} repeatCount="indefinite"/></circle>;
      })}
    </svg>
  </div>;
}

export default function LandingPage() {
  const router = useRouter();
  const [scrollY, setScrollY] = useState(0);
  const [liveSignals, setLiveSignals] = useState([]);
  const [pairCount, setPairCount] = useState(21);

  useEffect(() => {
    fetch('/api/pf-me').then(r => r.json()).then(d => {
      if (d && d.username) {
        if (d.pf_approved === false) router.replace('/pending');
        else router.replace(d.role === 'admin' ? '/admin' : '/dashboard');
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const h = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  useEffect(() => {
    fetch('/api/public-signals').then(r => r.json()).then(d => {
      if (d.signals) setLiveSignals(d.signals.slice(0, 6));
      if (d.total) setPairCount(d.total);
    }).catch(() => {});
  }, []);

  return (
    <>
      <Head>
        <title>PANDA ENGINE — Forex Intelligence Platform</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <meta name="description" content="Real-time forex intelligence. 21 pairs scored every 5 minutes. Momentum tracking, AI insights, and signal validation — built for traders who want edge, not noise."/>
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      </Head>

      <div style={{ background: '#050810', color: '#e8f0ff', minHeight: '100vh', position: 'relative', overflow: 'hidden', fontFamily: raj }}>
        {/* Grid texture */}
        <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,180,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,255,0.02) 1px,transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none', zIndex: 0 }}/>
        {/* Noise */}
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', opacity: 0.015, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }}/>

        {/* ═══ NAV ═══ */}
        <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: scrollY > 60 ? 'rgba(5,8,16,0.92)' : 'transparent', borderBottom: scrollY > 60 ? '1px solid rgba(255,255,255,0.06)' : 'none', backdropFilter: scrollY > 60 ? 'blur(16px)' : 'none', transition: 'all 0.4s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 26 }}>🐼</span>
            <span style={{ fontFamily: orb, fontSize: 13, fontWeight: 900, letterSpacing: 4, color: '#00ff9f' }}>PANDA ENGINE</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a href="#features" style={{ color: '#6b7fa8', fontFamily: mono, fontSize: 10, letterSpacing: 2, textDecoration: 'none', padding: '8px 14px' }}>FEATURES</a>
            <a href="#pricing" style={{ color: '#6b7fa8', fontFamily: mono, fontSize: 10, letterSpacing: 2, textDecoration: 'none', padding: '8px 14px' }}>PRICING</a>
            <button onClick={() => router.push('/login')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: '#8899bb', fontFamily: mono, fontSize: 10, letterSpacing: 2, cursor: 'pointer', padding: '8px 18px' }}>LOG IN</button>
            <button onClick={() => router.push('/funnel')} style={{ background: 'linear-gradient(135deg,#00ff9f,#00cc7a)', border: 'none', borderRadius: 6, color: '#050810', fontFamily: orb, fontSize: 9, fontWeight: 700, letterSpacing: 2, cursor: 'pointer', padding: '10px 22px', boxShadow: '0 0 20px rgba(0,255,159,0.2)' }}>GET ACCESS</button>
          </div>
        </nav>

        {/* ═══ HERO ═══ */}
        <section style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '140px 24px 100px' }}>
          {/* Radial glows */}
          <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translate(-50%,-50%)', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle,rgba(0,255,159,0.06) 0%,transparent 60%)', pointerEvents: 'none' }}/>
          <div style={{ position: 'absolute', bottom: '10%', right: '15%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle,rgba(0,180,255,0.04) 0%,transparent 60%)', pointerEvents: 'none' }}/>
          <div style={{ position: 'absolute', top: '40%', left: '10%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,rgba(124,58,237,0.04) 0%,transparent 60%)', pointerEvents: 'none' }}/>

          <OrbitalRing/>

          {/* Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 20, background: 'rgba(0,255,159,0.06)', border: '1px solid rgba(0,255,159,0.15)', marginBottom: 32, animation: 'fadeSlideUp 0.6s ease 0.2s both' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff9f', animation: 'pulse 2s ease-in-out infinite' }}/>
            <span style={{ fontFamily: mono, fontSize: 10, color: '#00ff9f', letterSpacing: 2 }}>ENGINE RUNNING · {pairCount} PAIRS LIVE</span>
          </div>

          {/* Title */}
          <h1 style={{ fontFamily: orb, fontSize: 'clamp(36px,6vw,72px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: 6, margin: 0, animation: 'fadeSlideUp 0.8s ease 0.4s both', maxWidth: 900 }}>
            <span style={{ color: '#e8f0ff' }}>FOREX</span><br/>
            <span style={{ background: 'linear-gradient(135deg,#00ff9f,#00b4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>INTELLIGENCE</span>
          </h1>

          <p style={{ fontFamily: raj, fontSize: 'clamp(16px,2vw,22px)', color: '#6b7fa8', maxWidth: 560, lineHeight: 1.5, margin: '24px 0 40px', animation: 'fadeSlideUp 0.8s ease 0.6s both', fontWeight: 500 }}>
            21 pairs scored every 5 minutes. Momentum tracking, AI insights, and signal validation — built for traders who want edge, not noise.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 16, animation: 'fadeSlideUp 0.8s ease 0.8s both', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={() => router.push('/funnel')} style={{ background: 'linear-gradient(135deg,#00ff9f,#00cc7a)', border: 'none', borderRadius: 8, color: '#050810', fontFamily: orb, fontSize: 12, fontWeight: 700, letterSpacing: 3, cursor: 'pointer', padding: '16px 40px', boxShadow: '0 0 30px rgba(0,255,159,0.25)', transition: 'all 0.3s' }}>START FREE</button>
            <button onClick={() => { const el = document.getElementById('features'); el?.scrollIntoView({ behavior: 'smooth' }); }} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#8899bb', fontFamily: mono, fontSize: 11, letterSpacing: 2, cursor: 'pointer', padding: '16px 32px', transition: 'all 0.3s' }}>SEE HOW IT WORKS ↓</button>
          </div>

          {/* Stats bar */}
          <div style={{ display: 'flex', gap: 48, marginTop: 80, animation: 'fadeSlideUp 0.8s ease 1s both', flexWrap: 'wrap', justifyContent: 'center' }}>
            <LiveCounter end={21} suffix="" label="PAIRS TRACKED" delay={0}/>
            <LiveCounter end={5} suffix="min" label="SIGNAL CYCLE" delay={200}/>
            <LiveCounter end={10} suffix="" label="MOMENTUM STATES" delay={400}/>
            <LiveCounter end={3} suffix="x" label="TIMEFRAME SCORING" delay={600}/>
          </div>
        </section>

        {/* ═══ LIVE SIGNAL TICKER ═══ */}
        {liveSignals.length > 0 && <div style={{ position: 'relative', zIndex: 1, padding: '20px 0', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,255,159,0.02)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 32, animation: 'tickerScroll 20s linear infinite', whiteSpace: 'nowrap' }}>
            {[...liveSignals, ...liveSignals].map((s, i) => {
              const c = s.direction === 'BUY' ? '#00ff9f' : '#ff4d6d';
              return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{ fontFamily: orb, fontSize: 12, fontWeight: 700, color: '#e8f0ff' }}>{s.symbol}</span>
                <span style={{ fontFamily: mono, fontSize: 10, color: c, background: `${c}12`, border: `1px solid ${c}30`, borderRadius: 3, padding: '2px 8px' }}>{s.direction}</span>
                <span style={{ fontFamily: mono, fontSize: 10, color: '#4a5578' }}>·</span>
              </div>;
            })}
          </div>
        </div>}

        {/* ═══ FEATURES ═══ */}
        <Section id="features">
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '120px 24px' }}>
            <div style={{ textAlign: 'center', marginBottom: 80 }}>
              <span style={{ fontFamily: mono, fontSize: 10, color: '#00b4ff', letterSpacing: 4, display: 'block', marginBottom: 16 }}>WHAT THE ENGINE DOES</span>
              <h2 style={{ fontFamily: orb, fontSize: 'clamp(24px,4vw,42px)', fontWeight: 900, lineHeight: 1.15, letterSpacing: 3, margin: 0 }}>
                SIX LAYERS OF<br/><span style={{ color: '#00ff9f' }}>INTELLIGENCE</span>
              </h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 20 }}>
              {FEATURES.map((f, i) => <div key={f.title} style={{ padding: '32px 28px', background: 'rgba(12,18,32,0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, position: 'relative', overflow: 'hidden', transition: 'all 0.3s', cursor: 'default' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${f.color}60,transparent)` }}/>
                <div style={{ fontSize: 28, marginBottom: 16 }}>{f.icon}</div>
                <h3 style={{ fontFamily: orb, fontSize: 14, fontWeight: 700, letterSpacing: 2, color: f.color, marginBottom: 12, margin: 0 }}>{f.title}</h3>
                <p style={{ fontFamily: raj, fontSize: 15, color: '#8899bb', lineHeight: 1.5, margin: 0 }}>{f.desc}</p>
              </div>)}
            </div>
          </div>
        </Section>

        {/* ═══ HOW IT WORKS ═══ */}
        <Section id="how">
          <div style={{ maxWidth: 1000, margin: '0 auto', padding: '80px 24px 120px' }}>
            <div style={{ textAlign: 'center', marginBottom: 80 }}>
              <span style={{ fontFamily: mono, fontSize: 10, color: '#00b4ff', letterSpacing: 4, display: 'block', marginBottom: 16 }}>THE PROCESS</span>
              <h2 style={{ fontFamily: orb, fontSize: 'clamp(24px,4vw,42px)', fontWeight: 900, letterSpacing: 3, margin: 0 }}>
                HOW IT <span style={{ color: '#00ff9f' }}>WORKS</span>
              </h2>
            </div>
            <div style={{ display: 'flex', gap: 0, position: 'relative', flexWrap: 'wrap', justifyContent: 'center' }}>
              {/* Connecting line */}
              <div style={{ position: 'absolute', top: 40, left: '15%', right: '15%', height: 1, background: 'linear-gradient(90deg,transparent,rgba(0,255,159,0.2),rgba(0,180,255,0.2),rgba(124,58,237,0.2),transparent)', display: 'flex' }}/>
              {STEPS.map((s, i) => <div key={s.num} style={{ flex: 1, minWidth: 240, padding: '0 20px', textAlign: 'center', position: 'relative' }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: `${s.color}08`, border: `2px solid ${s.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', position: 'relative' }}>
                  <span style={{ fontFamily: orb, fontSize: 24, fontWeight: 900, color: s.color }}>{s.num}</span>
                  <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: `1px solid ${s.color}15` }}/>
                </div>
                <h3 style={{ fontFamily: orb, fontSize: 14, fontWeight: 700, letterSpacing: 2, color: s.color, marginBottom: 12, margin: '0 0 12px' }}>{s.title}</h3>
                <p style={{ fontFamily: raj, fontSize: 14, color: '#6b7fa8', lineHeight: 1.5, margin: 0 }}>{s.desc}</p>
              </div>)}
            </div>
          </div>
        </Section>

        {/* ═══ DASHBOARD PREVIEW ═══ */}
        <Section id="preview">
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 120px', textAlign: 'center' }}>
            <span style={{ fontFamily: mono, fontSize: 10, color: '#00b4ff', letterSpacing: 4, display: 'block', marginBottom: 16 }}>SEE IT IN ACTION</span>
            <h2 style={{ fontFamily: orb, fontSize: 'clamp(22px,3.5vw,36px)', fontWeight: 900, letterSpacing: 3, margin: '0 0 48px' }}>
              YOUR <span style={{ color: '#00ff9f' }}>COMMAND CENTER</span>
            </h2>
            <div style={{ background: 'rgba(12,18,32,0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 4, boxShadow: '0 20px 80px rgba(0,0,0,0.5)' }}>
              <div style={{ background: 'linear-gradient(135deg,#0a0e18,#0d1424)', borderRadius: 12, padding: '40px 32px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, minHeight: 300 }}>
                {['NZDUSD +11.2 BUY', 'GBPAUD -8.1 SELL', 'AUDJPY +7.6 BUY', 'EURNZD -6.8 SELL'].map((s, i) => {
                  const [sym, gap, dir] = s.split(' ');
                  const c = dir === 'BUY' ? '#00ff9f' : '#ff4d6d';
                  return <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${c}20`, borderRadius: 10, padding: '20px 16px', textAlign: 'left' }}>
                    <div style={{ fontFamily: orb, fontSize: 14, fontWeight: 700, color: '#e8f0ff', marginBottom: 8 }}>{sym}</div>
                    <div style={{ fontFamily: orb, fontSize: 28, fontWeight: 900, color: c, marginBottom: 4 }}>{gap}</div>
                    <span style={{ fontFamily: mono, fontSize: 10, color: c, background: `${c}12`, border: `1px solid ${c}30`, borderRadius: 3, padding: '2px 8px' }}>{dir}</span>
                  </div>;
                })}
              </div>
            </div>
            <p style={{ fontFamily: mono, fontSize: 10, color: '#4a5578', letterSpacing: 2, marginTop: 20 }}>LIVE DASHBOARD · UPDATES EVERY 5 MINUTES</p>
          </div>
        </Section>

        {/* ═══ TESTIMONIALS ═══ */}
        <Section id="proof">
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px 120px' }}>
            <div style={{ textAlign: 'center', marginBottom: 60 }}>
              <span style={{ fontFamily: mono, fontSize: 10, color: '#00b4ff', letterSpacing: 4, display: 'block', marginBottom: 16 }}>FROM THE COMMUNITY</span>
              <h2 style={{ fontFamily: orb, fontSize: 'clamp(22px,3.5vw,36px)', fontWeight: 900, letterSpacing: 3, margin: 0 }}>
                TRADERS <span style={{ color: '#00ff9f' }}>TRUST THE DATA</span>
              </h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 20 }}>
              {TESTIMONIALS.map((t, i) => <div key={i} style={{ padding: '28px 24px', background: 'rgba(12,18,32,0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14 }}>
                <p style={{ fontFamily: raj, fontSize: 16, color: '#8899bb', lineHeight: 1.5, margin: '0 0 20px', fontStyle: 'italic' }}>"{t.text}"</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: mono, fontSize: 10, color: '#4a5578', letterSpacing: 1 }}>{t.who}</span>
                  <span style={{ fontFamily: mono, fontSize: 9, color: '#00ff9f', background: 'rgba(0,255,159,0.08)', border: '1px solid rgba(0,255,159,0.15)', borderRadius: 4, padding: '3px 8px' }}>{t.stat}</span>
                </div>
              </div>)}
            </div>
          </div>
        </Section>

        {/* ═══ PRICING ═══ */}
        <Section id="pricing">
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px 120px' }}>
            <div style={{ textAlign: 'center', marginBottom: 60 }}>
              <span style={{ fontFamily: mono, fontSize: 10, color: '#00b4ff', letterSpacing: 4, display: 'block', marginBottom: 16 }}>CHOOSE YOUR TIER</span>
              <h2 style={{ fontFamily: orb, fontSize: 'clamp(22px,3.5vw,36px)', fontWeight: 900, letterSpacing: 3, margin: 0 }}>
                SIMPLE <span style={{ color: '#00ff9f' }}>PRICING</span>
              </h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 20 }}>
              {TIERS.map((t, i) => <div key={t.name} style={{ padding: '32px 28px', background: t.tag ? 'rgba(0,255,159,0.03)' : 'rgba(12,18,32,0.6)', border: `1px solid ${t.tag ? 'rgba(0,255,159,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 14, position: 'relative', textAlign: 'center' }}>
                {t.tag && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', fontFamily: mono, fontSize: 9, color: '#050810', background: t.color, padding: '4px 16px', borderRadius: 20, letterSpacing: 2, fontWeight: 700 }}>{t.tag}</div>}
                <div style={{ fontFamily: orb, fontSize: 14, fontWeight: 700, letterSpacing: 3, color: t.color, marginBottom: 16 }}>{t.name}</div>
                <div style={{ fontFamily: orb, fontSize: 48, fontWeight: 900, color: '#e8f0ff', lineHeight: 1 }}>${t.price}<span style={{ fontFamily: mono, fontSize: 14, color: '#4a5578' }}>{t.period}</span></div>
                <div style={{ margin: '24px 0', display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
                  {t.features.map(f => <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: raj, fontSize: 14, color: '#8899bb' }}>
                    <span style={{ color: t.color, fontSize: 12 }}>✓</span>{f}
                  </div>)}
                </div>
                <button onClick={() => router.push('/funnel')} style={{ width: '100%', padding: '14px 0', fontFamily: orb, fontSize: 10, fontWeight: 700, letterSpacing: 3, cursor: 'pointer', borderRadius: 8, border: t.tag ? 'none' : `1px solid ${t.color}40`, background: t.tag ? `linear-gradient(135deg,${t.color},${t.color}cc)` : 'rgba(255,255,255,0.04)', color: t.tag ? '#050810' : t.color, boxShadow: t.tag ? `0 0 20px ${t.color}25` : 'none', transition: 'all 0.3s' }}>{t.cta}</button>
              </div>)}
            </div>
          </div>
        </Section>

        {/* ═══ FINAL CTA ═══ */}
        <section style={{ position: 'relative', zIndex: 1, padding: '100px 24px 120px', textAlign: 'center' }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle,rgba(0,255,159,0.05) 0%,transparent 60%)', pointerEvents: 'none' }}/>
          <div style={{ position: 'relative', maxWidth: 600, margin: '0 auto' }}>
            <h2 style={{ fontFamily: orb, fontSize: 'clamp(24px,4vw,42px)', fontWeight: 900, letterSpacing: 3, margin: '0 0 20px', lineHeight: 1.2 }}>
              STOP GUESSING.<br/><span style={{ color: '#00ff9f' }}>START SEEING.</span>
            </h2>
            <p style={{ fontFamily: raj, fontSize: 18, color: '#6b7fa8', lineHeight: 1.5, marginBottom: 40 }}>
              The engine is already running. 21 pairs. Every 5 minutes. The only question is whether you're watching.
            </p>
            <button onClick={() => router.push('/funnel')} style={{ background: 'linear-gradient(135deg,#00ff9f,#00cc7a)', border: 'none', borderRadius: 8, color: '#050810', fontFamily: orb, fontSize: 14, fontWeight: 700, letterSpacing: 4, cursor: 'pointer', padding: '18px 48px', boxShadow: '0 0 40px rgba(0,255,159,0.3)', transition: 'all 0.3s' }}>GET ACCESS NOW</button>
          </div>
        </section>

        {/* ═══ FOOTER ═══ */}
        <footer style={{ position: 'relative', zIndex: 1, borderTop: '1px solid rgba(255,255,255,0.04)', padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>🐼</span>
            <span style={{ fontFamily: orb, fontSize: 11, fontWeight: 700, letterSpacing: 3, color: '#00ff9f' }}>PANDA ENGINE</span>
          </div>
          <p style={{ fontFamily: mono, fontSize: 9, color: '#2a3548', letterSpacing: 2, margin: 0 }}>
            FOREX INTELLIGENCE PLATFORM · NOT FINANCIAL ADVICE · USE AT YOUR OWN RISK
          </p>
          <p style={{ fontFamily: mono, fontSize: 8, color: '#1a2538', letterSpacing: 1, marginTop: 8 }}>© 2026 PANDA ENGINE</p>
        </footer>
      </div>

      {/* ═══ CSS ═══ */}
      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        @keyframes fadeSlideUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        @keyframes orbSpin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        @keyframes tickerScroll { from { transform:translateX(0); } to { transform:translateX(-50%); } }
        button:hover { opacity:0.9; transform:translateY(-1px); }
        a:hover { color:#00ff9f !important; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:#050810; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.08); border-radius:2px; }
        @media (max-width:768px) {
          nav { padding:12px 16px !important; }
          nav > div:last-child a { display:none; }
        }
      `}</style>
    </>
  );
}
