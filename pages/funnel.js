import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const mono = "'Share Tech Mono',monospace";
const orb  = "'Orbitron',sans-serif";
const raj  = "'Rajdhani',sans-serif";

const TIERS = [
  {
    name: 'STARTER', price: '0', period: '', sub: 'FREE FOR 1 WEEK', color: '#445566', tag: null,
    features: ['Live signals tab','Position calculator'],
    cta: 'START FREE TRIAL', tier: 'starter',
  },
  {
    name: 'PRO', price: '99', period: '/mo', sub: 'or $3,499 one-time (lifetime)', color: '#00ff9f', tag: 'MOST POPULAR',
    features: ['Everything in Starter, plus:','Panel tab','Full data table','Valid setups tab','Panda AI assistant','Research tab'],
    cta: 'GO PRO →', tier: 'pro',
  },
  {
    name: 'ELITE', price: '699', period: '/mo', sub: 'or $4,999 one-time (lifetime)', color: '#00b4ff', tag: 'FULL ACCESS',
    features: ['Everything in Pro, plus:','Overview tab','Signal logs tab','Valid pairs filter','Telegram signal alerts','Spike signal alerts','Private trading journal','Chart tab','MT4/MT5 Panda Indicators','Bias detection indicators'],
    cta: 'GO ELITE →', tier: 'elite',
  },
];

export default function FunnelPage() {
  const router = useRouter();
  const [vis, setVis] = useState(false);
  const [signals, setSignals] = useState([]);
  const [signalCount, setSignalCount] = useState(0);

  // Signup modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTier, setModalTier] = useState('starter');
  const [modalEmail, setModalEmail] = useState('');
  const [modalUser, setModalUser] = useState('');
  const [modalBusy, setModalBusy] = useState(false);
  const [modalOk, setModalOk] = useState(false);
  const [modalErr, setModalErr] = useState('');
  const [modalToken, setModalToken] = useState('');

  useEffect(() => { setVis(true); }, []);
  useEffect(() => {
    fetch('/api/public-signals').then(r => r.json()).then(d => {
      if (d.signals) { setSignals(d.signals); setSignalCount(d.count); }
    }).catch(() => {});
  }, []);

  const openSignup = (tier) => {
    setModalTier(tier); setModalEmail(''); setModalUser('');
    setModalOk(false); setModalErr(''); setModalToken(''); setModalOpen(true);
  };
  const submitSignup = async () => {
    if (!modalEmail.includes('@')) { setModalErr('Valid email required'); return; }
    setModalBusy(true); setModalErr('');
    try {
      const r = await fetch('/api/pf-signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: modalEmail, username: modalUser, tier: modalTier })
      });
      const j = await r.json();
      if (r.ok) { setModalOk(true); setModalToken(j.token || ''); } else setModalErr(j.error || 'Request failed');
    } catch { setModalErr('Network error'); }
    setModalBusy(false);
  };

  const S = styles;

  return (
    <>
      <Head>
        <title>Panda Engine — Forex Direction Intelligence</title>
        <meta name="description" content="Stop guessing forex direction. Trade confirmed currency strength shifts with real-time gap, strength, and momentum signals across 21 pairs." />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div style={S.wrap}>
        <div style={S.gridBg} />

        {/* NAV */}
        <nav style={S.nav}>
          <div onClick={() => router.push('/')} style={S.logo}>
            <span style={{ fontSize: 28 }}>🐼</span>
            <span style={{ fontFamily: orb, fontSize: 13, fontWeight: 900, letterSpacing: 4, color: '#00ff9f' }}>PANDA ENGINE</span>
          </div>
          <button onClick={() => router.push('/login')} style={S.navBtn}>LOG IN</button>
        </nav>

        {/* HERO */}
        <section style={{ ...S.section, minHeight: '85vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingTop: 100, paddingBottom: 60, opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(24px)', transition: 'all 0.8s cubic-bezier(0.16,1,0.3,1)' }}>
          <div style={S.glow} />
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 6, color: '#00b4ff', marginBottom: 20 }}>FOREX DIRECTION INTELLIGENCE</div>
          <h1 style={{ fontFamily: orb, fontSize: 'clamp(26px,5vw,48px)', fontWeight: 900, lineHeight: 1.12, margin: '0 0 22px', maxWidth: 720 }}>
            <span style={{ color: '#e8eaf0' }}>Stop guessing.</span><br />
            <span style={{ color: '#00ff9f', textShadow: '0 0 40px rgba(0,255,159,0.3)' }}>Trade confirmed strength shifts.</span>
          </h1>
          <p style={{ fontFamily: raj, fontSize: 'clamp(15px,2vw,18px)', color: '#6b7d8e', maxWidth: 520, margin: '0 auto 36px', lineHeight: 1.7 }}>
            The engine scans 21 currency pairs every 5 minutes. It measures the gap between currencies, confirms direction with strength data, and times your entry with momentum — so you trade facts, not feelings.
          </p>
          <button onClick={() => openSignup('starter')} style={S.ctaBtn}>SEE LIVE SIGNALS — FREE</button>
          <div style={{ display: 'flex', gap: 24, marginTop: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['21 pairs tracked', '5-min refresh cycle', 'No lagging indicators'].map((t, i) => (
              <span key={i} style={{ fontFamily: mono, fontSize: 10, letterSpacing: 1, color: '#445566', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#00ff9f', fontSize: 10 }}>✓</span> {t}
              </span>
            ))}
          </div>
        </section>

        {/* ═══ DEEP DIVE: DIRECTIONAL BIAS ═══ */}
        <section style={{ ...S.section, padding: '80px 24px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }} className="deep-grid">
            {/* Visual — mock scoring panel */}
            <div style={{ background: 'linear-gradient(135deg,#0a0e1a,#0e1525)', border: '1px solid rgba(0,255,159,0.12)', borderRadius: 16, padding: '32px 28px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
              <div style={{ fontFamily: mono, fontSize: 9, color: '#445566', letterSpacing: 3, marginBottom: 20 }}>DIRECTIONAL BIAS · LIVE</div>
              {[
                { pair: 'NZDUSD', gap: 14, dir: 'BUY', d1: '+6', h4: '+5', h1: '+3' },
                { pair: 'GBPAUD', gap: -12, dir: 'SELL', d1: '-5', h4: '-4', h1: '-3' },
                { pair: 'EURJPY', gap: 3, dir: 'WAIT', d1: '+2', h4: '+1', h1: '0' },
              ].map((r, i) => {
                const c = r.dir === 'BUY' ? '#00ff9f' : r.dir === 'SELL' ? '#ff4d6d' : '#445566';
                return <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <span style={{ fontFamily: orb, fontSize: 14, fontWeight: 700, color: '#e8eaf0', letterSpacing: 2, width: 100 }}>{r.pair}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[{ label: 'D1', val: r.d1 }, { label: 'H4', val: r.h4 }, { label: 'H1', val: r.h1 }].map(t => (
                      <div key={t.label} style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: mono, fontSize: 8, color: '#445566', letterSpacing: 1 }}>{t.label}</div>
                        <div style={{ fontFamily: mono, fontSize: 12, color: t.val.startsWith('-') ? '#ff4d6d' : t.val === '0' ? '#445566' : '#00ff9f' }}>{t.val}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: orb, fontSize: 16, fontWeight: 900, color: c }}>{Math.abs(r.gap)}</span>
                    <span style={{ fontFamily: mono, fontSize: 9, color: c, background: `${c}12`, border: `1px solid ${c}30`, borderRadius: 3, padding: '2px 8px', letterSpacing: 1 }}>{r.dir}</span>
                  </div>
                </div>;
              })}
              <div style={{ marginTop: 16, fontFamily: mono, fontSize: 9, color: '#445566', letterSpacing: 1, textAlign: 'center' }}>GAP = BASE SCORE − QUOTE SCORE · RANGE ±18</div>
            </div>
            {/* Copy */}
            <div>
              <span style={{ fontFamily: mono, fontSize: 9, color: '#00ff9f', letterSpacing: 4, background: 'rgba(0,255,159,0.08)', border: '1px solid rgba(0,255,159,0.15)', borderRadius: 4, padding: '4px 12px', display: 'inline-block', marginBottom: 20 }}>DIRECTIONAL BIAS</span>
              <h2 style={{ fontFamily: orb, fontSize: 'clamp(22px,3vw,34px)', fontWeight: 900, letterSpacing: 2, lineHeight: 1.2, margin: '0 0 20px' }}>
                Know Which Side Is <span style={{ color: '#00ff9f' }}>Actually Strong</span>
              </h2>
              <p style={{ fontFamily: raj, fontSize: 16, color: '#8899aa', lineHeight: 1.65, margin: '0 0 24px' }}>
                The engine scores each currency independently across Daily, H4, and H1 timeframes — then calculates the gap between them. A gap of +14 means one side is overwhelmingly stronger. A gap of +3 means the market hasn't decided yet.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { icon: '🎯', text: 'Gap ≥ 5 = clear directional bias (BUY or SELL)' },
                  { icon: '⚡', text: 'Gap ≥ 9 = strong enough for market execution' },
                  { icon: '🛡️', text: 'Gap < 5 = WAIT — no edge, no trade' },
                ].map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 16 }}>{b.icon}</span>
                    <span style={{ fontFamily: raj, fontSize: 14, color: '#6b7d8e' }}>{b.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══ DEEP DIVE: MOMENTUM INTELLIGENCE ═══ */}
        <section style={{ ...S.section, padding: '40px 24px 80px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }} className="deep-grid">
            {/* Copy (left — alternating) */}
            <div>
              <span style={{ fontFamily: mono, fontSize: 9, color: '#00b4ff', letterSpacing: 4, background: 'rgba(0,180,255,0.08)', border: '1px solid rgba(0,180,255,0.15)', borderRadius: 4, padding: '4px 12px', display: 'inline-block', marginBottom: 20 }}>MOMENTUM INTELLIGENCE</span>
              <h2 style={{ fontFamily: orb, fontSize: 'clamp(22px,3vw,34px)', fontWeight: 900, letterSpacing: 2, lineHeight: 1.2, margin: '0 0 20px' }}>
                See When a Move Is <span style={{ color: '#00b4ff' }}>Building or Dying</span>
              </h2>
              <p style={{ fontFamily: raj, fontSize: 16, color: '#8899aa', lineHeight: 1.65, margin: '0 0 24px' }}>
                Most traders enter too late — after the move already happened. The engine classifies every pair into one of 10 momentum states, from the first spark of energy to full exhaustion.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { icon: '🔥', text: 'BUILDING / ACCELERATING — early move, best entries' },
                  { icon: '📈', text: 'STRONG / EXTENDED — move in progress, ride or wait' },
                  { icon: '⚠️', text: 'FADING / REVERSING — momentum dying, protect or exit' },
                ].map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 16 }}>{b.icon}</span>
                    <span style={{ fontFamily: raj, fontSize: 14, color: '#6b7d8e' }}>{b.text}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Visual — momentum state cards */}
            <div style={{ background: 'linear-gradient(135deg,#0a0e1a,#0e1525)', border: '1px solid rgba(0,180,255,0.12)', borderRadius: 16, padding: '32px 28px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
              <div style={{ fontFamily: mono, fontSize: 9, color: '#445566', letterSpacing: 3, marginBottom: 20 }}>MOMENTUM STATES · LIVE</div>
              {[
                { pair: 'NZDUSD', state: 'BUILDING', icon: '🔥', color: '#00ff9f', change: '+3.2' },
                { pair: 'GBPJPY', state: 'ACCELERATING', icon: '🚀', color: '#00b4ff', change: '+5.8' },
                { pair: 'EURUSD', state: 'STRONG', icon: '📈', color: '#66ffcc', change: '+1.4' },
                { pair: 'USDCAD', state: 'FADING', icon: '📉', color: '#ffd166', change: '-2.1' },
                { pair: 'AUDJPY', state: 'REVERSING', icon: '🔄', color: '#ff4d6d', change: '-4.6' },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <span style={{ fontFamily: orb, fontSize: 13, fontWeight: 700, color: '#e8eaf0', letterSpacing: 2, width: 90 }}>{r.pair}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14 }}>{r.icon}</span>
                    <span style={{ fontFamily: mono, fontSize: 10, color: r.color, letterSpacing: 1 }}>{r.state}</span>
                  </div>
                  <span style={{ fontFamily: mono, fontSize: 12, color: r.change.startsWith('-') ? '#ff4d6d' : '#00ff9f' }}>{r.change}</span>
                </div>
              ))}
              <div style={{ marginTop: 16, fontFamily: mono, fontSize: 9, color: '#445566', letterSpacing: 1, textAlign: 'center' }}>10 STATES · UPDATED EVERY CYCLE</div>
            </div>
          </div>
        </section>

        {/* PROBLEM */}
        <section style={{ ...S.section, padding: '80px 24px', maxWidth: 800, margin: '0 auto' }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 5, color: '#ff4d6d', marginBottom: 14, textAlign: 'center' }}>THE REAL PROBLEM</div>
          <h2 style={{ fontFamily: orb, fontSize: 'clamp(20px,3.5vw,30px)', fontWeight: 700, textAlign: 'center', margin: '0 0 40px' }}>WHY 90% OF FOREX TRADERS LOSE</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 20 }}>
            {[
              { icon: '🎲', title: 'No directional bias', desc: 'They enter trades without knowing which currency is actually strong or weak right now.' },
              { icon: '⏰', title: 'Late entries', desc: 'By the time their indicator signals, the move already happened. They chase — and lose.' },
              { icon: '📉', title: 'Lagging tools', desc: 'RSI, MACD, moving averages — all computed from past price. They tell you what happened, not what\'s happening.' },
            ].map((p, i) => (
              <div key={i} style={{ background: 'linear-gradient(135deg,#0a0e1a,#0e1525)', border: '1px solid #1a2540', borderRadius: 12, padding: '28px 22px' }}>
                <div style={{ fontSize: 28, marginBottom: 14 }}>{p.icon}</div>
                <div style={{ fontFamily: orb, fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#ff4d6d', marginBottom: 10 }}>{p.title.toUpperCase()}</div>
                <div style={{ fontFamily: raj, fontSize: 14, color: '#6b7d8e', lineHeight: 1.65 }}>{p.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* MECHANISM */}
        <section style={{ ...S.section, padding: '80px 24px', maxWidth: 900, margin: '0 auto' }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 5, color: '#ffd166', marginBottom: 14, textAlign: 'center' }}>THE ENGINE</div>
          <h2 style={{ fontFamily: orb, fontSize: 'clamp(20px,3.5vw,30px)', fontWeight: 700, textAlign: 'center', margin: '0 0 14px' }}>THREE LAYERS. ONE DIRECTION.</h2>
          <p style={{ fontFamily: raj, fontSize: 15, color: '#6b7d8e', textAlign: 'center', maxWidth: 520, margin: '0 auto 44px', lineHeight: 1.6 }}>Each layer answers a different question. Together, they give you a confirmed trade direction — not a guess.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 20 }}>
            {[
              { n: '01', label: 'DIRECTIONAL BIAS', color: '#00ff9f', icon: '📊', desc: 'A multi-timeframe strength model that reveals the dominant side of a currency pair and filters out weak or unclear market conditions.' },
              { n: '02', label: 'STRENGTH', color: '#00b4ff', icon: '💪', desc: 'Confirms whether the strong currency is getting stronger and the weak one is getting weaker. No confirmation = no trade.' },
              { n: '03', label: 'MOMENTUM', color: '#ffd166', icon: '⚡', desc: 'Tells you WHEN to enter. Building momentum means the move is starting. Fading momentum means step aside.' },
            ].map((m, i) => (
              <div key={i} style={{ background: 'linear-gradient(135deg,#0a0e1a,#0e1525)', border: `1px solid ${m.color}22`, borderRadius: 12, padding: '32px 24px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${m.color}66,transparent)` }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{ fontFamily: orb, fontSize: 24, fontWeight: 900, color: m.color }}>{m.n}</span>
                  <span style={{ fontSize: 20 }}>{m.icon}</span>
                </div>
                <div style={{ fontFamily: orb, fontSize: 12, fontWeight: 700, letterSpacing: 2, color: m.color, marginBottom: 12 }}>{m.label}</div>
                <div style={{ fontFamily: raj, fontSize: 14, color: '#8899aa', lineHeight: 1.65 }}>{m.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <span style={{ fontFamily: mono, fontSize: 11, color: '#445566', letterSpacing: 2 }}>BIAS tells direction → STRENGTH confirms → MOMENTUM times entry</span>
          </div>
        </section>

        {/* LIVE PROOF */}
        {signals.length > 0 && (
          <section style={{ ...S.section, padding: '80px 24px', maxWidth: 700, margin: '0 auto' }}>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 5, color: '#00ff9f', marginBottom: 14, textAlign: 'center' }}>LIVE RIGHT NOW</div>
            <h2 style={{ fontFamily: orb, fontSize: 'clamp(20px,3.5vw,28px)', fontWeight: 700, textAlign: 'center', margin: '0 0 10px' }}>TOP SIGNALS</h2>
            <p style={{ fontFamily: raj, fontSize: 14, color: '#6b7d8e', textAlign: 'center', marginBottom: 32 }}>These are real signals from the engine — updated every 60 seconds.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {signals.map((s, i) => {
                const isBuy = s.direction === 'BUY';
                const c = isBuy ? '#00ff9f' : '#ff4d6d';
                return (
                  <div key={i} style={{ background: 'linear-gradient(135deg,#0a0e1a,#0e1525)', border: `1px solid ${c}22`, borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontFamily: orb, fontSize: 14, fontWeight: 900, letterSpacing: 2, color: '#e8eaf0', filter: 'blur(5px)', userSelect: 'none' }}>{s.symbol}</span>
                      <span style={{ fontFamily: mono, fontSize: 10, color: c, background: `${c}12`, border: `1px solid ${c}33`, borderRadius: 4, padding: '2px 8px', fontWeight: 700 }}>{s.direction}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <span style={{ fontFamily: mono, fontSize: 11, color: c, filter: 'blur(5px)', userSelect: 'none' }}>GAP {s.gap}</span>
                      <span style={{ fontFamily: mono, fontSize: 10, color: '#8899aa' }}>{s.momentum}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#445566' }}>SHOWING {signalCount} ACTIVE SIGNALS · FULL DASHBOARD HAS 21 PAIRS + ANALYTICS</span>
            </div>
          </section>
        )}

        {/* HOW IT WORKS */}
        <section style={{ ...S.section, padding: '80px 24px', maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 5, color: '#00b4ff', marginBottom: 14 }}>YOUR WORKFLOW</div>
          <h2 style={{ fontFamily: orb, fontSize: 'clamp(20px,3.5vw,28px)', fontWeight: 700, margin: '0 0 40px' }}>THREE STEPS. EVERY SESSION.</h2>
          {[
            { n: '01', title: 'OPEN THE DASHBOARD', desc: 'See all 21 pairs ranked by gap score. Valid signals are highlighted. Invalid setups are greyed out.' },
            { n: '02', title: 'CHECK CONFIRMATION', desc: 'Look at strength, momentum, and Panda Lines zone. All three agree? The setup is confirmed.' },
            { n: '03', title: 'EXECUTE WITH CONFIDENCE', desc: 'Use the position calculator, set your risk, and take the trade. The engine did the analysis — you just execute.' },
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 20, textAlign: 'left', marginBottom: 32, alignItems: 'flex-start' }}>
              <div style={{ fontFamily: orb, fontSize: 32, fontWeight: 900, color: '#00b4ff', lineHeight: 1, minWidth: 50 }}>{step.n}</div>
              <div>
                <div style={{ fontFamily: orb, fontSize: 12, fontWeight: 700, letterSpacing: 2, color: '#e8eaf0', marginBottom: 6 }}>{step.title}</div>
                <div style={{ fontFamily: raj, fontSize: 14, color: '#6b7d8e', lineHeight: 1.65 }}>{step.desc}</div>
              </div>
            </div>
          ))}
        </section>

        {/* WHAT YOU SEE */}
        <section style={{ ...S.section, padding: '60px 24px', maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 5, color: '#ffd166', marginBottom: 14 }}>DASHBOARD PREVIEW</div>
          <h2 style={{ fontFamily: orb, fontSize: 'clamp(20px,3.5vw,28px)', fontWeight: 700, margin: '0 0 14px' }}>EVERYTHING IN ONE SCREEN</h2>
          <p style={{ fontFamily: raj, fontSize: 14, color: '#6b7d8e', marginBottom: 32, lineHeight: 1.6 }}>Gap scores, strength trends, momentum states, valid setups — all updating every 5 minutes across 21 pairs.</p>
          <div style={{ background: 'linear-gradient(135deg,#0a0e1a,#0e1525)', border: '1px solid #1a2540', borderRadius: 14, padding: '40px 24px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, opacity: 0.45, filter: 'blur(1px)' }}>
              {['AUDJPY +8.2','NZDCAD +7.1','GBPAUD -6.5','EURJPY +5.8','NZDUSD +5.4','GBPJPY -5.1'].map((p, i) => (
                <div key={i} style={{ background: '#05080f', border: '1px solid #1a254044', borderRadius: 8, padding: '14px 10px', fontFamily: mono, fontSize: 11, color: p.includes('+') ? '#00ff9f' : '#ff4d6d', textAlign: 'center' }}>{p}</div>
              ))}
            </div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,8,16,0.7)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: orb, fontSize: 16, fontWeight: 700, color: '#e8eaf0', marginBottom: 12 }}>UNLOCK FULL DASHBOARD</div>
                <button onClick={() => openSignup('starter')} style={{ ...S.ctaBtn, fontSize: 11, padding: '12px 28px' }}>START FREE →</button>
              </div>
            </div>
          </div>
        </section>

        {/* TRUST */}
        <section style={{ ...S.section, padding: '60px 24px', maxWidth: 700, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 16, textAlign: 'center' }}>
            {[
              { val: '21', label: 'PAIRS TRACKED' },
              { val: '5 min', label: 'REFRESH CYCLE' },
              { val: '78%', label: 'BB SIGNAL WIN RATE' },
              { val: '24/5', label: 'MARKET COVERAGE' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'linear-gradient(135deg,#0a0e1a,#0e1525)', border: '1px solid #1a2540', borderRadius: 10, padding: '24px 14px' }}>
                <div style={{ fontFamily: orb, fontSize: 28, fontWeight: 900, color: '#00ff9f', marginBottom: 6 }}>{s.val}</div>
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#445566' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* PRICING */}
        <section style={{ ...S.section, padding: '80px 24px', maxWidth: 1020, margin: '0 auto' }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 5, color: '#ffd166', marginBottom: 14, textAlign: 'center' }}>PRICING</div>
          <h2 style={{ fontFamily: orb, fontSize: 'clamp(22px,4vw,34px)', fontWeight: 700, textAlign: 'center', margin: '0 0 10px' }}>ONE ENGINE. THREE LEVELS.</h2>
          <p style={{ fontFamily: raj, fontSize: 15, color: '#6b7d8e', textAlign: 'center', maxWidth: 440, margin: '0 auto 44px', lineHeight: 1.6 }}>Every tier runs on the same core intelligence. Pick the depth that matches your trading.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20, alignItems: 'start' }}>
            {TIERS.map((t, i) => {
              const isPro = t.name === 'PRO';
              return (
                <div key={i} style={{ background: isPro ? 'linear-gradient(135deg,#0a1420,#0e1a2a)' : 'linear-gradient(135deg,#0a0e1a,#0e1525)', border: `1px solid ${isPro ? '#00ff9f33' : '#1a2540'}`, borderRadius: 14, padding: '36px 28px', position: 'relative', transform: isPro ? 'scale(1.03)' : 'none', boxShadow: isPro ? '0 0 50px rgba(0,255,159,0.08)' : 'none' }}>
                  {t.tag && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: t.color, color: '#050810', fontFamily: orb, fontSize: 8, fontWeight: 700, letterSpacing: 2, padding: '4px 14px', borderRadius: 20 }}>{t.tag}</div>}
                  <div style={{ fontFamily: orb, fontSize: 12, fontWeight: 700, letterSpacing: 3, color: t.color, marginBottom: 20 }}>{t.name}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
                    <span style={{ fontFamily: mono, fontSize: 14, color: '#445566' }}>$</span>
                    <span style={{ fontFamily: orb, fontSize: 48, fontWeight: 900, color: '#e8eaf0' }}>{t.price}</span>
                    <span style={{ fontFamily: mono, fontSize: 12, color: '#445566' }}>{t.period}</span>
                  </div>
                  {t.sub && <div style={{ fontFamily: mono, fontSize: 10, color: '#ffd166', letterSpacing: 1, marginBottom: 22 }}>{t.sub}</div>}
                  {!t.sub && <div style={{ marginBottom: 22 }} />}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                    {t.features.map((f, j) => (
                      <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ color: t.color, fontSize: 12 }}>✓</span>
                        <span style={{ fontFamily: raj, fontSize: 14, color: '#8899aa' }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => openSignup(t.tier)} style={{ width: '100%', background: isPro ? '#00ff9f' : 'transparent', border: `1px solid ${t.color}`, borderRadius: 8, color: isPro ? '#050810' : t.color, fontFamily: orb, fontSize: 11, fontWeight: 700, letterSpacing: 2, padding: '14px', cursor: 'pointer', transition: 'all 0.2s' }}>{t.cta}</button>
                </div>
              );
            })}
          </div>
        </section>

        {/* FINAL CTA */}
        <section style={{ ...S.section, padding: '90px 24px', textAlign: 'center' }}>
          <div style={S.glow} />
          <h2 style={{ fontFamily: orb, fontSize: 'clamp(22px,4vw,36px)', fontWeight: 900, margin: '0 0 14px' }}>READY TO TRADE WITH STRUCTURE?</h2>
          <p style={{ fontFamily: raj, fontSize: 16, color: '#6b7d8e', maxWidth: 420, margin: '0 auto 32px', lineHeight: 1.6 }}>Join the engine. See the signals. Make better decisions.</p>
          <button onClick={() => openSignup('starter')} style={S.ctaBtn}>START FREE →</button>
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 3, color: '#445566', marginTop: 22 }}>NO CREDIT CARD · INSTANT ACCESS · CANCEL ANYTIME</div>
        </section>

        {/* FOOTER */}
        <footer style={{ position: 'relative', zIndex: 1, borderTop: '1px solid #1a2540', padding: '36px 24px', textAlign: 'center' }}>
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#1a2540' }}>© {new Date().getFullYear()} PANDA ENGINE · ALL RIGHTS RESERVED</div>
        </footer>

        {/* SIGNUP MODAL */}
        {modalOpen && (
          <div onClick={() => setModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'linear-gradient(135deg,#0a0e1a,#0e1525)', border: '1px solid #1a2540', borderRadius: 14, padding: '32px 28px', maxWidth: 420, width: '100%', position: 'relative' }}>
              <button onClick={() => setModalOpen(false)} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', color: '#445566', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
              {modalOk ? (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                  <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 4, color: '#00ff9f', marginBottom: 10 }}>REQUEST RECEIVED</div>
                  <h3 style={{ fontFamily: orb, fontSize: 20, fontWeight: 900, margin: '0 0 12px' }}>{modalTier === 'starter' ? 'ACCOUNT CREATED' : 'PENDING APPROVAL'}</h3>
                  <p style={{ fontFamily: raj, fontSize: 14, color: '#8899aa', lineHeight: 1.6, marginBottom: 20 }}>
                    {modalTier === 'starter' ? 'Your FREE account is ready. Message our Telegram bot below to receive your login credentials instantly.' : 'Your ' + modalTier.toUpperCase() + ' request is queued. Admin has been notified. Message the bot to get credentials once approved.'}
                  </p>
                  <button onClick={() => window.open('https://t.me/Panda_new_user_alert_bot?start=' + modalToken, '_blank')} style={{ width: '100%', background: '#00b4ff', border: 'none', borderRadius: 8, color: '#050810', fontFamily: orb, fontSize: 11, fontWeight: 700, letterSpacing: 2, padding: '12px', cursor: 'pointer', marginBottom: 10 }}>📨 GET MY PASSWORD</button>
                  <button onClick={() => setModalOpen(false)} style={{ width: '100%', background: 'transparent', border: '1px solid #1a2540', borderRadius: 8, color: '#445566', fontFamily: mono, fontSize: 10, letterSpacing: 2, padding: '10px', cursor: 'pointer' }}>CLOSE</button>
                </div>
              ) : (
                <>
                  <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 4, color: '#00b4ff', marginBottom: 8 }}>SIGN UP · {modalTier.toUpperCase()}</div>
                  <h3 style={{ fontFamily: orb, fontSize: 22, fontWeight: 900, margin: '0 0 8px' }}>REQUEST ACCESS</h3>
                  <p style={{ fontFamily: raj, fontSize: 13, color: '#6b7d8e', marginBottom: 22, lineHeight: 1.5 }}>Submit your details. Free accounts get instant access. Pro/Elite require admin approval.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
                    <input value={modalEmail} onChange={e => setModalEmail(e.target.value)} placeholder="your@email.com" type="email" style={S.input} />
                    <input value={modalUser} onChange={e => setModalUser(e.target.value)} placeholder="preferred username (optional)" style={S.input} />
                  </div>
                  {modalErr && <div style={{ fontFamily: mono, fontSize: 11, color: '#ff4d6d', marginBottom: 12 }}>⚠ {modalErr}</div>}
                  <button onClick={submitSignup} disabled={modalBusy} style={{ width: '100%', background: '#00ff9f', border: 'none', borderRadius: 8, color: '#050810', fontFamily: orb, fontSize: 12, fontWeight: 700, letterSpacing: 2, padding: '14px', cursor: 'pointer', opacity: modalBusy ? 0.6 : 1, marginBottom: 10 }}>{modalBusy ? 'SUBMITTING...' : 'REQUEST ACCESS →'}</button>
                  <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#445566', textAlign: 'center' }}>
                    ALREADY HAVE AN ACCOUNT? <span onClick={() => router.push('/login')} style={{ color: '#00b4ff', cursor: 'pointer' }}>LOG IN</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <style jsx global>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #050810; }
          button:hover { opacity: 0.92; }
          @media (max-width:768px) {
            .deep-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          }
        `}</style>
      </div>
    </>
  );
}

const styles = {
  wrap: { background: '#050810', color: '#e8eaf0', minHeight: '100vh', position: 'relative', overflow: 'hidden' },
  gridBg: { position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,180,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,255,0.03) 1px,transparent 1px)', backgroundSize: '50px 50px', pointerEvents: 'none', zIndex: 0 },
  nav: { position: 'relative', zIndex: 10, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1a2540' },
  logo: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' },
  navBtn: { background: 'none', border: '1px solid #1a2540', borderRadius: 6, color: '#8899aa', fontFamily: mono, fontSize: 11, letterSpacing: 2, cursor: 'pointer', padding: '8px 18px' },
  section: { position: 'relative', zIndex: 1 },
  glow: { position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle,rgba(0,255,159,0.05) 0%,transparent 70%)', pointerEvents: 'none' },
  ctaBtn: { background: '#00ff9f', border: 'none', borderRadius: 8, color: '#050810', fontFamily: orb, fontSize: 13, fontWeight: 700, letterSpacing: 2, padding: '16px 40px', cursor: 'pointer', boxShadow: '0 0 40px rgba(0,255,159,0.25)', transition: 'all 0.2s' },
  input: { background: '#05080f', border: '1px solid #1a2540', borderRadius: 6, padding: '12px 14px', color: '#e8eaf0', fontFamily: raj, fontSize: 14, outline: 'none' },
};
