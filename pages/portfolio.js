import { useState, useEffect, useRef } from "react";
import Head from "next/head";

// ── HELPERS ──────────────────────────────────────────────────────────────────

function getSession() {
  const h = new Date().getUTCHours();
  if (h >= 22 || h < 6)  return { name: "ASIAN",    color: "#38bdf8", range: "22:00–06:00 UTC" };
  if (h >= 6  && h < 14) return { name: "LONDON",   color: "#fbbf24", range: "06:00–14:00 UTC" };
  return                         { name: "NEW YORK", color: "#00ff9f", range: "14:00–22:00 UTC" };
}

function padZ(n) { return String(n).padStart(2, "0"); }

// ── COUNTER COMPONENT ─────────────────────────────────────────────────────────

function Counter({ target, suffix = "", duration = 1800, active }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    setCount(0);
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const e = 1 - Math.pow(1 - p, 4);
      setCount(Math.floor(e * target));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setCount(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);
  return <>{count}{suffix}</>;
}

// ── SCROLL FADE COMPONENT ─────────────────────────────────────────────────────

function ScrollFade({ children, delay = 0 }) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } },
      { threshold: 0.07 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{
      opacity: vis ? 1 : 0,
      transform: vis ? "translateY(0)" : "translateY(22px)",
      transition: `opacity 0.65s ease ${delay}ms, transform 0.65s ease ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

// ── LIVE SESSION WIDGET ───────────────────────────────────────────────────────

function LiveSession() {
  const [session, setSession] = useState(getSession);
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => {
      setSession(getSession());
      const d = new Date();
      setTime(`${padZ(d.getUTCHours())}:${padZ(d.getUTCMinutes())}:${padZ(d.getUTCSeconds())} UTC`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 12,
      background: "var(--bg2)", border: "1px solid var(--border2)",
      padding: "10px 18px", marginTop: 28,
    }}>
      <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        Active Session
      </span>
      <div style={{
        width: 6, height: 6, borderRadius: "50%",
        background: session.color, boxShadow: `0 0 8px ${session.color}`,
        animation: "pulse 2s ease-in-out infinite",
      }} />
      <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: session.color, letterSpacing: "0.08em" }}>
        {session.name}
      </span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", borderLeft: "1px solid var(--border2)", paddingLeft: 12 }}>
        {time}
      </span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)", borderLeft: "1px solid var(--border2)", paddingLeft: 12, display: "inline-block" }}>
        {session.range}
      </span>
    </div>
  );
}

// ── ANIMATED FLOW DIAGRAM ─────────────────────────────────────────────────────

const FLOW_STEPS = [
  { layer: "Source",       name: "MT4 Files"      },
  { layer: "Engine",       name: "Python Scanner" },
  { layer: "Database",     name: "Supabase"       },
  { layer: "API Layer",    name: "Next.js Routes" },
  { layer: "Intelligence", name: "AI Agents"      },
  { layer: "Output",       name: "Dashboard"      },
];

function AnimatedFlow() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActive(a => (a + 1) % FLOW_STEPS.length), 700);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border2)", padding: 24 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 20 }}>
        System Data Flow — Every 5 Minutes
      </div>
      <div style={{ display: "flex", alignItems: "center", overflowX: "auto", padding: "20px 0" }}>
        {FLOW_STEPS.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div style={{ flex: 1 }}>
              <div style={{
                border: `1px solid ${active === i ? "rgba(0,255,159,0.55)" : "var(--border)"}`,
                background: active === i ? "var(--bg3)" : "var(--bg)",
                padding: "10px 14px", textAlign: "center",
                boxShadow: active === i ? "0 0 14px rgba(0,255,159,0.12)" : "none",
                transition: "all 0.35s ease",
              }}>
                <div style={{
                  fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase",
                  letterSpacing: "0.1em", marginBottom: 4,
                  color: active === i ? "var(--green)" : "var(--text3)",
                  transition: "color 0.35s",
                }}>{step.layer}</div>
                <div style={{
                  fontFamily: "var(--display)", fontSize: 12, fontWeight: 700,
                  color: active === i ? "#fff" : "var(--text2)",
                  transition: "color 0.35s",
                }}>{step.name}</div>
              </div>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <div style={{
                color: active === i ? "var(--green)" : "var(--text3)",
                fontSize: 16, flexShrink: 0, padding: "0 4px",
                fontWeight: active === i ? 700 : 400,
                transition: "color 0.35s",
              }}>&#8594;</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── STICKY NAV ────────────────────────────────────────────────────────────────

const NAV_SECTIONS = [
  { id: "s-hero",     label: "Intro"        },
  { id: "s-oneline",  label: "In One Line"  },
  { id: "s-overview", label: "Overview"     },
  { id: "s-arch",     label: "Architecture" },
  { id: "s-cap",      label: "Capabilities" },
  { id: "s-innov",    label: "Innovations"  },
  { id: "s-data",     label: "Data"         },
  { id: "s-pso",      label: "Why"          },
  { id: "s-stack",    label: "Stack"        },
  { id: "s-cta",      label: "Access"       },
];

function StickyNav({ active }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{
      position: "fixed", right: 28, top: "50%", transform: "translateY(-50%)",
      zIndex: 100, display: "flex", flexDirection: "column", gap: 10,
    }}>
      {NAV_SECTIONS.map((s) => (
        <div
          key={s.id}
          onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" })}
          onMouseEnter={() => setHovered(s.id)}
          onMouseLeave={() => setHovered(null)}
          style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, cursor: "pointer" }}
        >
          <span style={{
            fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase",
            letterSpacing: "0.1em", whiteSpace: "nowrap",
            color: active === s.id ? "var(--green)" : "var(--text3)",
            opacity: hovered === s.id || active === s.id ? 1 : 0,
            transform: hovered === s.id || active === s.id ? "translateX(0)" : "translateX(6px)",
            transition: "all 0.2s",
          }}>{s.label}</span>
          <div style={{
            width: active === s.id ? 8 : 5,
            height: active === s.id ? 8 : 5,
            borderRadius: "50%", flexShrink: 0,
            background: active === s.id ? "var(--green)" : hovered === s.id ? "var(--text)" : "var(--text3)",
            boxShadow: active === s.id ? "0 0 6px var(--green)" : "none",
            transition: "all 0.2s",
          }} />
        </div>
      ))}
    </div>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #070a0f;
    --bg2: #0c1018;
    --bg3: #111827;
    --border: rgba(0,255,159,0.12);
    --border2: rgba(255,255,255,0.06);
    --green: #00ff9f;
    --green-dim: rgba(0,255,159,0.15);
    --amber: #fbbf24;
    --amber-dim: rgba(251,191,36,0.12);
    --blue: #38bdf8;
    --blue-dim: rgba(56,189,248,0.12);
    --red: #ff4d6d;
    --text: #e2e8f0;
    --text2: #94a3b8;
    --text3: #475569;
    --mono: 'Space Mono', monospace;
    --display: 'Syne', sans-serif;
    --body: 'DM Mono', monospace;
  }

  html { scroll-behavior: smooth; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--body);
    font-size: 14px;
    line-height: 1.7;
    overflow-x: hidden;
  }

  .grid-bg {
    position: fixed; inset: 0;
    background-image:
      linear-gradient(rgba(0,255,159,0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,255,159,0.02) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none; z-index: 0;
  }

  .noise {
    position: fixed; inset: 0; opacity: 0.025;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    pointer-events: none; z-index: 0;
  }

  .container { position: relative; z-index: 1; max-width: 900px; margin: 0 auto; padding: 0 24px; }

  .hero { padding: 100px 0 80px; border-bottom: 1px solid var(--border2); }

  .status-bar {
    display: flex; align-items: center; gap: 8px; margin-bottom: 32px;
    font-family: var(--mono); font-size: 11px; color: var(--green);
    letter-spacing: 0.1em; text-transform: uppercase;
  }

  .status-dot {
    width: 7px; height: 7px; border-radius: 50%; background: var(--green);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.8); }
  }

  .hero-title {
    font-family: var(--display); font-size: clamp(38px, 6vw, 64px);
    font-weight: 800; line-height: 1.05; letter-spacing: -0.02em; color: #fff; margin-bottom: 8px;
  }
  .hero-title span { color: var(--green); }

  .hero-subtitle {
    font-family: var(--display); font-size: clamp(22px, 3vw, 32px);
    font-weight: 600; color: var(--text2); line-height: 1.2; margin-bottom: 28px;
  }

  .hero-desc {
    font-family: var(--body); font-size: 14px; color: var(--text2);
    max-width: 620px; line-height: 1.8; margin-bottom: 40px;
  }

  .hero-metrics {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 1px; background: var(--border2); border: 1px solid var(--border2); max-width: 680px;
  }

  .metric { background: var(--bg2); padding: 20px 24px; }

  .metric-value {
    font-family: var(--mono); font-size: 28px; font-weight: 700;
    color: var(--green); line-height: 1; margin-bottom: 4px;
  }

  .metric-label {
    font-family: var(--mono); font-size: 10px; color: var(--text3);
    letter-spacing: 0.08em; text-transform: uppercase;
  }

  section { padding: 72px 0; border-bottom: 1px solid var(--border2); }

  .section-tag {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.15em;
    text-transform: uppercase; color: var(--green); margin-bottom: 12px;
    display: flex; align-items: center; gap: 8px;
  }
  .section-tag::before {
    content: ''; display: inline-block; width: 20px; height: 1px; background: var(--green);
  }

  .section-title {
    font-family: var(--display); font-size: clamp(24px, 3vw, 34px); font-weight: 700;
    color: #fff; line-height: 1.15; margin-bottom: 40px; letter-spacing: -0.02em;
  }

  .overview-block {
    background: var(--bg2); border: 1px solid var(--border);
    padding: 32px 36px; position: relative; overflow: hidden;
  }
  .overview-block::before {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0;
    width: 3px; background: linear-gradient(to bottom, var(--green), transparent);
  }

  .overview-text { font-size: 15px; color: var(--text); line-height: 1.9; max-width: 760px; }
  .overview-text strong { color: #fff; font-weight: 500; }

  .arch-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 1px;
    background: var(--border2); border: 1px solid var(--border2); margin-bottom: 24px;
  }
  .arch-cell { background: var(--bg2); padding: 24px 28px; height: 100%; }
  .arch-layer { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 8px; }
  .arch-name { font-family: var(--display); font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 10px; }
  .arch-stack { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
  .arch-desc { font-size: 12px; color: var(--text2); line-height: 1.7; }

  .tag { font-family: var(--mono); font-size: 10px; padding: 3px 8px; border: 1px solid; letter-spacing: 0.05em; }
  .tag-green { border-color: var(--border); color: var(--green); background: var(--green-dim); }
  .tag-blue  { border-color: rgba(56,189,248,0.2); color: var(--blue); background: var(--blue-dim); }
  .tag-amber { border-color: rgba(251,191,36,0.2); color: var(--amber); background: var(--amber-dim); }
  .tag-dim   { border-color: var(--border2); color: var(--text2); background: transparent; }

  .cap-grid {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px;
    background: var(--border2); border: 1px solid var(--border2);
  }
  .cap-card { background: var(--bg2); padding: 28px 32px; transition: background 0.2s; cursor: default; height: 100%; }
  .cap-card:hover { background: var(--bg3); }
  .cap-icon { font-size: 20px; margin-bottom: 12px; }
  .cap-title { font-family: var(--display); font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 8px; }
  .cap-desc { font-size: 12px; color: var(--text2); line-height: 1.75; }
  .cap-sub { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 5px; }

  .innovation-list { display: flex; flex-direction: column; gap: 1px; background: var(--border2); border: 1px solid var(--border2); }
  .innovation-item {
    background: var(--bg2); padding: 24px 28px;
    display: grid; grid-template-columns: 48px 1fr; gap: 20px; align-items: start;
    transition: background 0.2s;
  }
  .innovation-item:hover { background: var(--bg3); }
  .innov-num { font-family: var(--mono); font-size: 11px; color: var(--text3); padding-top: 3px; letter-spacing: 0.1em; }
  .innov-title { font-family: var(--display); font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 6px; }
  .innov-desc { font-size: 12px; color: var(--text2); line-height: 1.75; }
  .innov-desc strong { color: var(--text); font-weight: 500; }

  .data-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px;
    background: var(--border2); border: 1px solid var(--border2); margin-bottom: 32px;
  }
  .data-cell { background: var(--bg2); padding: 28px; }
  .data-value { font-family: var(--mono); font-size: 36px; font-weight: 700; color: #fff; line-height: 1; margin-bottom: 6px; }
  .data-value span { color: var(--green); }
  .data-label { font-family: var(--mono); font-size: 10px; color: var(--text3); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; }
  .data-note { font-size: 11px; color: var(--text3); line-height: 1.5; }

  .pso-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--border2); border: 1px solid var(--border2); }
  .pso-card { background: var(--bg2); padding: 28px; height: 100%; }
  .pso-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border2); }
  .pso-label-p { color: var(--red); }
  .pso-label-s { color: var(--blue); }
  .pso-label-o { color: var(--green); }
  .pso-title { font-family: var(--display); font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 10px; line-height: 1.3; }
  .pso-body { font-size: 12px; color: var(--text2); line-height: 1.8; }

  .stack-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: var(--border2); border: 1px solid var(--border2); }
  .stack-row { background: var(--bg2); padding: 16px 24px; display: flex; align-items: baseline; gap: 16px; height: 100%; }
  .stack-layer { font-family: var(--mono); font-size: 10px; color: var(--text3); text-transform: uppercase; letter-spacing: 0.1em; min-width: 120px; flex-shrink: 0; }
  .stack-detail { font-size: 12px; color: var(--text2); line-height: 1.6; }

  .callout { background: var(--green-dim); border: 1px solid var(--border); padding: 18px 24px; margin-top: 28px; display: flex; gap: 12px; align-items: flex-start; }
  .callout-icon { color: var(--green); font-size: 14px; flex-shrink: 0; }
  .callout-text { font-size: 12px; color: var(--text2); line-height: 1.7; }
  .callout-text strong { color: var(--green); font-weight: 500; }

  .footer { padding: 48px 0; text-align: center; }
  .footer-name { font-family: var(--display); font-size: 22px; font-weight: 800; color: #fff; margin-bottom: 8px; }
  .footer-line { font-family: var(--mono); font-size: 11px; color: var(--text3); letter-spacing: 0.08em; }

  .fade-in { opacity: 0; transform: translateY(16px); animation: fadeUp 0.6s ease forwards; }
  @keyframes fadeUp { to { opacity: 1; transform: translateY(0); } }
  .delay-1 { animation-delay: 0.1s; }
  .delay-2 { animation-delay: 0.2s; }
  .delay-3 { animation-delay: 0.3s; }
  .delay-4 { animation-delay: 0.4s; }

  @media (max-width: 900px) {
    .sticky-nav-outer { display: none !important; }
    .float-cta-outer  { right: 16px !important; bottom: 16px !important; }
  }
  @media (max-width: 640px) {
    .arch-grid, .cap-grid, .pso-grid, .data-grid, .stack-grid { grid-template-columns: 1fr; }
    .hero { padding: 60px 0 48px; }
    .metric-value { font-size: 22px; }
  }
`;

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function Portfolio() {
  const [activeSection, setActiveSection] = useState("s-hero");
  const [showFloatCta, setShowFloatCta]   = useState(false);
  const [countersActive, setCountersActive] = useState(false);
  const metricsRef = useRef(null);

  // Track active section for sticky nav
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => { if (e.isIntersecting) setActiveSection(e.target.id); });
      },
      { rootMargin: "-35% 0px -35% 0px" }
    );
    NAV_SECTIONS.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  // Floating CTA visibility
  useEffect(() => {
    const onScroll = () => setShowFloatCta(window.scrollY > 500);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Counters trigger when metrics section enters view
  useEffect(() => {
    const el = metricsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setCountersActive(true); obs.disconnect(); } },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const METRICS = [
    { target: 30,  suffix: "K+",  label: "Signal Snapshots", dur: 1600 },
    { target: 300, suffix: "+",   label: "Tracked Signals",  dur: 1800 },
    { target: 400, suffix: "+",   label: "Trade Records",    dur: 1800 },
    { target: 57,  suffix: "",    label: "AI Memory Records",dur: 1200 },
    { target: 21,  suffix: "",    label: "Currency Pairs",   dur: 900  },
    { target: 5,   suffix: "min", label: "Engine Cycle",     dur: 700  },
  ];

  return (
    <>
      <Head>
        <title>Panda Engine — System Portfolio</title>
        <meta name="description" content="Autonomous Forex Intelligence Platform — full-stack trading intelligence system built by Boss-G." />
        <meta name="robots" content="index, follow" />
      </Head>

      <style jsx global>{styles}</style>

      <div className="grid-bg" />
      <div className="noise" />

      {/* STICKY NAV */}
      <div className="sticky-nav-outer" style={{ position: "fixed", right: 28, top: "50%", transform: "translateY(-50%)", zIndex: 100 }}>
        <StickyNav active={activeSection} />
      </div>

      {/* FLOATING CTA */}
      <div className="float-cta-outer" style={{
        position: "fixed", bottom: 32, right: 32, zIndex: 200,
        opacity: showFloatCta ? 1 : 0,
        transform: showFloatCta ? "translateY(0)" : "translateY(10px)",
        pointerEvents: showFloatCta ? "all" : "none",
        transition: "opacity 0.3s ease, transform 0.3s ease",
      }}>
        <a href="/dashboard" style={{
          display: "flex", alignItems: "center", gap: 8,
          fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.1em",
          textTransform: "uppercase", fontWeight: 700,
          color: "var(--bg)", background: "var(--green)",
          padding: "11px 20px", textDecoration: "none",
          boxShadow: "0 0 20px rgba(0,255,159,0.3)",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--bg)", animation: "pulse 2s ease-in-out infinite", flexShrink: 0 }} />
          Dashboard &#8594;
        </a>
      </div>

      <div className="container">

        {/* ── HERO ── */}
        <section id="s-hero" className="hero">
          <div className="status-bar fade-in">
            <div className="status-dot" />
            Live Production System · pandaengine.app · 21 Currency Pairs · 5-min Cycles
          </div>
          <h1 className="hero-title fade-in delay-1">Panda<span>Engine</span></h1>
          <h2 className="hero-subtitle fade-in delay-2">Autonomous Forex Intelligence Platform</h2>
          <p className="hero-desc fade-in delay-3">
            A full-stack trading intelligence system built from the ground up — combining real-time market
            scanning, signal lifecycle tracking, persistent AI memory, and a multi-tier SaaS product layer.
            Not a tutorial. Not a prototype. A production system used to process real-time data
            continuously with automated signal tracking and AI-assisted analysis — built on{" "}
            <span style={{ color: "var(--green)" }}>30,000+ data points</span> with a live user base.
          </p>
          <div ref={metricsRef} className="hero-metrics fade-in delay-4">
            {METRICS.map((m, i) => (
              <div key={i} className="metric">
                <div className="metric-value">
                  <Counter target={m.target} suffix={m.suffix} duration={m.dur} active={countersActive} />
                </div>
                <div className="metric-label">{m.label}</div>
              </div>
            ))}
          </div>
          <LiveSession />
        </section>

        {/* ── WHAT THIS MEANS ── */}
        <section id="s-oneline">
          <ScrollFade>
            <div className="section-tag">In One Line</div>
            <h2 className="section-title">What This Means</h2>
            <div className="overview-block">
              <p className="overview-text">
                Panda Engine turns raw forex market data into structured intelligence —
                identifying statistically proven setups, tracking their outcomes, and
                continuously learning which conditions produce real trading edge.
              </p>
            </div>
          </ScrollFade>
        </section>

        {/* ── OVERVIEW ── */}
        <section id="s-overview">
          <ScrollFade>
            <div className="section-tag">Overview</div>
            <h2 className="section-title">What This System Actually Does</h2>
            <div className="overview-block">
              <p className="overview-text">
                Panda Engine scans <strong>21 forex currency pairs</strong> every 5 minutes, computes a
                proprietary gap score from multi-timeframe currency strength data, and generates
                bias-confirmed trading signals using two distinct strategies — <strong>BB</strong> (breakout,
                gap &#8805;5) and <strong>INTRA</strong> (session-specific, gap &#8805;9 with price-level confirmation).
                <br /><br />
                Every signal is <strong>tracked from open to close</strong>: entry price, peak gap, hourly
                snapshots, close reason, and P&amp;L context are all stored. Over time, the AI layer mines
                this data to identify real statistical edges — which pairs produce alpha, which session is
                profitable, how long to hold, and when the signal is a dead zone. The system learns from
                itself.
                <br /><br />
                The frontend is a <strong>multi-tier SaaS product</strong> with role-based access, a landing
                page and pricing funnel, automated Telegram onboarding, economic news alerts, and an admin
                panel with an unrestricted AI coaching mode that remembers context across sessions.
              </p>
            </div>
          </ScrollFade>
        </section>

        {/* ── ARCHITECTURE ── */}
        <section id="s-arch">
          <ScrollFade>
            <div className="section-tag">Architecture</div>
            <h2 className="section-title">Technical Architecture</h2>
          </ScrollFade>
          <div className="arch-grid">
            {[
              { color: "var(--green)", layer: "Core Engine",     name: "Python Scanner",       tags: [["FastAPI","green"],["APScheduler","green"],["pandas","dim"]], desc: "Runs on a watchdog loop via START_PANDA.bat. Parses MT4 text files every 5 minutes, computes gap scores across D1/H4/H1, classifies momentum states, and pushes to Supabase. Handles signal entry logic, gap velocity, PDR caching, news alerts, and hourly AI snapshots." },
              { color: "var(--blue)",  layer: "Backend API",     name: "Next.js Route Handlers",tags: [["Next.js 14","blue"],["Node.js","blue"],["Supabase SDK","dim"]], desc: "12 API routes covering signal tracking, AI chat, memory CRUD, admin brain, PDR computation, economic news, auth, and Telegram webhooks. Shared Supabase client, role-based auth gates, ENGINE_SECRET header for engine communication." },
              { color: "var(--amber)", layer: "Data Layer",      name: "Supabase",              tags: [["PostgreSQL","amber"],["RLS","amber"],["21 Tables","dim"]], desc: "21 tables covering live pair data, signal snapshots, signal lifecycle, trade history, AI memories, admin brain, PDR cache, user management, and Telegram subscriptions. Service-role key isolated to API layer only." },
              { color: "var(--green)", layer: "AI Intelligence", name: "OpenAI Agent Layer",    tags: [["GPT-4o-mini","green"],["57 Memories","green"],["Dual Modes","dim"]], desc: "Three specialized agents: Signal Agent (gap/edge analysis), Journal Agent (trade history mining), Pattern Agent (execution gap, session bias, alpha/leak pairs). Master Agent injects all memories into every response." },
              { color: "var(--blue)",  layer: "Frontend",        name: "Next.js Dashboard",     tags: [["React","blue"],["12 Tabs","blue"],["Vercel","dim"]], desc: "~2,800 lines. 12-tab dashboard with pair cards, signal analytics, gap charts, economic calendar, trade calculator, signal tracker panel, and AI chat. Memory index via useMemo. Real-time confidence scoring with historical merge and conflict detection." },
              { color: "var(--amber)", layer: "SaaS Product",    name: "Monetization Layer",    tags: [["3 Tiers","amber"],["Telegram","amber"],["Admin Panel","dim"]], desc: "Free / Pro $29 / Elite $79. Landing page, pricing funnel, approval flow. Telegram bot auto-registers free users and delivers hourly AI narration. Admin panel with user management, tier gating, and feature flags." },
            ].map((cell, i) => (
              <ScrollFade key={i} delay={i * 60}>
                <div className="arch-cell">
                  <div className="arch-layer" style={{ color: cell.color }}>{cell.layer}</div>
                  <div className="arch-name">{cell.name}</div>
                  <div className="arch-stack">
                    {cell.tags.map(([t, c], j) => <span key={j} className={`tag tag-${c}`}>{t}</span>)}
                  </div>
                  <p className="arch-desc">{cell.desc}</p>
                </div>
              </ScrollFade>
            ))}
          </div>
          <ScrollFade delay={200}>
            <AnimatedFlow />
          </ScrollFade>
        </section>

        {/* ── CAPABILITIES ── */}
        <section id="s-cap">
          <ScrollFade>
            <div className="section-tag">Capabilities</div>
            <h2 className="section-title">Core Capabilities</h2>
          </ScrollFade>
          <div className="cap-grid">
            {[
              { icon: "⚡", title: "Real-Time Signal Engine",       desc: "Scans 21 currency pairs every 5 minutes. Computes a multi-timeframe gap score from currency strength differentials across D1, H4, and H1. Classifies 10 momentum states and generates directional bias. Signal validity determined by gap magnitude, PL zone, and momentum alignment.", tags: [["BB Strategy","green"],["INTRA Strategy","green"],["Gap Score ±18","dim"]] },
              { icon: "🔄", title: "Signal Lifecycle Tracking",     desc: "Every signal is tracked from open to close with hourly snapshots of gap, price, and momentum. Captures entry context (session, box trend, PDR strength), peak performance, and close reason. Produces a complete audit trail that feeds the AI analysis layer.", tags: [["Entry → Peak → Exit","blue"],["Close Reason","dim"],["30K+ Snapshots","dim"]] },
              { icon: "🧠", title: "Persistent AI Memory",          desc: "Three specialized agents mine signal and trade databases to produce durable memory records. The system identified a 91% win rate on BB gap ≥7 with PL confirmation (n=27), compared to 0% without it — a real statistical edge discovered autonomously.", tags: [["57 Memory Records","green"],["3 Agents","green"],["Auto-Learning","dim"]] },
              { icon: "📰", title: "Economic News Intelligence",    desc: "Parses ForexFactory live feed every 5 minutes, filters HIGH-impact events within the next 60 minutes, maps them to affected currency pairs, and fires Telegram alerts with deduplication. Prevents entering signals into news windows.", tags: [["ForexFactory Feed","amber"],["Pair Mapping","dim"],["Telegram Alerts","amber"]] },
              { icon: "📊", title: "Multi-Factor Confidence Scoring", desc: "Each signal receives a 0–100 confidence score from gap magnitude, momentum tier, PL zone, COT alignment, and historical edge data. A CONFLICT flag fires when current confidence diverges from proven historical win rates — surfacing regime changes automatically.", tags: [["5 Confidence Tiers","blue"],["Historical Merge","blue"],["Conflict Detection","dim"]] },
              { icon: "👤", title: "Admin Intelligence Mode",       desc: "Admin AI mode injects a personal brain (18 memory records) into every session. Detects natural language 'remember that...' patterns and auto-stores them to a persistent brain table. Functions as a context-aware trading coach with deep engine knowledge.", tags: [["Admin Brain","green"],["Auto-Memory","green"],["Unrestricted","dim"]] },
            ].map((c, i) => (
              <ScrollFade key={i} delay={i * 60}>
                <div className="cap-card" style={{ height: "100%" }}>
                  <div className="cap-icon">{c.icon}</div>
                  <div className="cap-title">{c.title}</div>
                  <p className="cap-desc">{c.desc}</p>
                  <div className="cap-sub">
                    {c.tags.map(([t, cl], j) => <span key={j} className={`tag tag-${cl}`}>{t}</span>)}
                  </div>
                </div>
              </ScrollFade>
            ))}
          </div>
        </section>

        {/* ── INNOVATIONS ── */}
        <section id="s-innov">
          <ScrollFade>
            <div className="section-tag">Key Innovations</div>
            <h2 className="section-title">What Makes This System Different</h2>
          </ScrollFade>
          <div className="innovation-list">
            {[
              { num: "01", title: "AI That Learns From Its Own Data",           desc: "The AI agents don't answer generic trading questions — they mine actual historical signal data, journal records, and lifecycle patterns to produce <strong>statistically-grounded findings</strong>. Findings persist as structured memory records and are injected into every future response." },
              { num: "02", title: "Two-Mode AI Architecture (Legal + Practical)", desc: "A deliberate product decision separates USER mode (narrator — describes data, no recommendations) from ADMIN mode (unrestricted coach with full engine knowledge). <strong>The guardrail is architectural, not a prompt patch.</strong> Legal protection built into the system design." },
              { num: "03", title: "Gap Velocity as a Data Asset",               desc: "<strong>gap_delta</strong> — the rate of change in gap score between cycles — is computed and stored on every snapshot for every pair. Built as a data asset now; designed to become a predictive feature once sufficient history validates its correlation with signal direction." },
              { num: "04", title: "Dual Win Rate Display with Conflict Detection", desc: "Every pair card shows both current confidence and historical win rate from AI memory. A <strong>CONFLICT badge</strong> fires automatically when these diverge — surfacing situations where recent conditions differ from historical patterns. Computed on every render, not manually triggered." },
              { num: "05", title: "Execution Gap Quantification",               desc: "The system discovered and quantified a <strong>22.9-point execution gap</strong> between signal win rate and actual trade win rate through AI journal analysis. This gap represents the psychological cost of discretionary execution — now a tracked metric, not an anecdote." },
              { num: "06", title: "Infrastructure Precedes the Insight",        desc: "PDR strength, box trend, session, and gap velocity are all captured <strong>at the moment of signal open</strong> — because that context cannot be reconstructed retroactively. Phase 8 will mine this data for lifecycle patterns. The data exists before the analysis is possible." },
            ].map((item, i) => (
              <ScrollFade key={i} delay={i * 50}>
                <div className="innovation-item">
                  <div className="innov-num">{item.num}</div>
                  <div>
                    <div className="innov-title">{item.title}</div>
                    <p className="innov-desc" dangerouslySetInnerHTML={{ __html: item.desc }} />
                  </div>
                </div>
              </ScrollFade>
            ))}
          </div>
        </section>

        {/* ── DATA SCALE ── */}
        <section id="s-data">
          <ScrollFade>
            <div className="section-tag">Data &amp; Scale</div>
            <h2 className="section-title">Built on Real Data</h2>
          </ScrollFade>
          <div className="data-grid">
            {[
              { val: "30",  suf: "K+", label: "Signal Snapshots", note: "Every pair, every 5-min cycle. gap + momentum + bias + gap_delta. 30K+ rows and growing." },
              { val: "326", suf: "+",  label: "Resolved Signals",  note: "BB and INTRA signals with entry, peak, close reason, session, box trend, and PDR at open." },
              { val: "439", suf: "",   label: "Trade Records",     note: "Real CSV import from cTrader. Foundation for Journal Agent and Pattern Agent analysis." },
              { val: "57",  suf: "",   label: "AI Memory Records", note: "22 signal + 21 journal + 14 pattern findings. Generated by agents, persisted in Supabase." },
              { val: "21",  suf: "",   label: "Tracked Pairs",     note: "Full coverage: AUD, CAD, EUR, GBP, JPY, NZD, USD crosses. Gap scores every cycle." },
              { val: "91",  suf: "%",  label: "Edge Win Rate",     note: "BB gap ≥7 + PL confirmed (n=27). Same gap without PL: 0% (n=53). AI-discovered edge." },
            ].map((d, i) => (
              <ScrollFade key={i} delay={i * 50}>
                <div className="data-cell">
                  <div className="data-value">{d.val}<span>{d.suf}</span></div>
                  <div className="data-label">{d.label}</div>
                  <p className="data-note">{d.note}</p>
                </div>
              </ScrollFade>
            ))}
          </div>
          <ScrollFade delay={200}>
            <div className="callout">
              <div className="callout-icon">&#9672;</div>
              <p className="callout-text">
                <strong>Data strategy:</strong> Every architectural decision prioritizes capturing context
                at the moment of signal open — because that context cannot be reconstructed retroactively.
                Phase 8 (Signal Agent v2) will mine this data for lifecycle patterns once 30+ days of
                tracker history accumulates.
              </p>
            </div>
          </ScrollFade>
        </section>

        {/* ── PSO ── */}
        <section id="s-pso">
          <ScrollFade>
            <div className="section-tag">Problem &#8594; Solution &#8594; Outcome</div>
            <h2 className="section-title">Why This System Exists</h2>
          </ScrollFade>
          <div className="pso-grid">
            {[
              { cls: "pso-label-p", lbl: "Problem",  title: "Trading edge is invisible without systematic data collection", body: "Manual trading produces intuitions, not evidence. Without structured signal tracking, lifecycle data, and session context, it is impossible to distinguish a real statistical edge from recency bias. The execution gap goes unmeasured and the system never learns." },
              { cls: "pso-label-s", lbl: "Solution", title: "A complete data infrastructure that captures everything, every cycle", body: "Panda Engine captures gap scores, signal entries, price levels, session context, box trends, PDR strength, and gap velocity on every 5-minute cycle. AI agents mine the accumulated data to surface real findings that support bias-confirmed decisions." },
              { cls: "pso-label-o", lbl: "Outcome",  title: "Quantified edges, identified leaks, a system that proves itself", body: "91% win rate on a specific setup (n=27). 0% on the same setup without confirmation (n=53). Asian session +1,582 pips vs. London −272. Execution gap quantified at 22.9 points. Findings extracted from real data by the system itself." },
            ].map((p, i) => (
              <ScrollFade key={i} delay={i * 80}>
                <div className="pso-card" style={{ height: "100%" }}>
                  <div className={`pso-label ${p.cls}`}>{p.lbl}</div>
                  <div className="pso-title">{p.title}</div>
                  <p className="pso-body">{p.body}</p>
                </div>
              </ScrollFade>
            ))}
          </div>
        </section>

        {/* ── STACK ── */}
        <section id="s-stack">
          <ScrollFade>
            <div className="section-tag">Technical Stack</div>
            <h2 className="section-title">Stack Decisions</h2>
          </ScrollFade>
          <div className="stack-grid">
            {[
              ["Core Engine",  "Python 3.11 + FastAPI + APScheduler — local execution with watchdog bat file; migrates to VPS once edge is statistically proven"],
              ["Frontend",     "Next.js 14 — ~2,800 lines main dashboard, 12 tabs, auto-deployed to Vercel on every push to main"],
              ["Database",     "Supabase (PostgreSQL) — 21 tables, RLS policies, service-role key isolated to API layer, schema managed via migrations"],
              ["AI Layer",     "OpenAI GPT-4o-mini — 3 specialized agents + Master Agent, 57 persistent memory records, dual-mode chat"],
              ["Market Data",  "MT4 text files (engine source), Twelve Data REST (PDR/OHLC), ForexFactory JSON (economic news)"],
              ["Auth & Access","Session cookie auth, role-based API gates (free/pro/elite/admin), Telegram bot auto-signup flow"],
              ["Notifications","Telegram Bot API — news alerts, hourly AI narration, signal alerts, onboarding, admin pings"],
              ["Payments",     "NowPayments (USDT Solana, 0.5% fee) — UAE-compatible, no KYC barrier; Stripe queued post business permit"],
            ].map(([layer, detail], i) => (
              <ScrollFade key={i} delay={i * 40}>
                <div className="stack-row">
                  <div className="stack-layer">{layer}</div>
                  <div className="stack-detail">{detail}</div>
                </div>
              </ScrollFade>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section id="s-cta">
          <ScrollFade>
            <div className="section-tag">Access</div>
            <h2 className="section-title">Explore the System</h2>
            <p style={{ fontFamily: "var(--body)", fontSize: 15, color: "var(--text2)", lineHeight: 1.8, maxWidth: 540, marginBottom: 32 }}>
              The platform is live and running in production.
              Explore the dashboard, signals, and analytics in real time.
            </p>
            <a href="/dashboard" style={{
              display: "inline-block", fontFamily: "var(--mono)", fontSize: 12,
              letterSpacing: "0.12em", textTransform: "uppercase",
              color: "var(--bg)", background: "var(--green)",
              padding: "14px 32px", textDecoration: "none", fontWeight: 700,
            }}>
              Open Dashboard &#8594;
            </a>
          </ScrollFade>
        </section>

        {/* ── FOOTER ── */}
        <div className="footer">
          <div className="footer-name">Panda Engine</div>
          <div className="footer-line" style={{ marginBottom: 6 }}>
            Designed and engineered end-to-end · Full-stack system · AI-integrated · Production SaaS
          </div>
          <div className="footer-line">
            pandaengine.app &nbsp;·&nbsp; Next.js · Python · Supabase · OpenAI
          </div>
        </div>

      </div>
    </>
  );
}
