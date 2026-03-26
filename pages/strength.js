import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import ThemeToggle from '../components/ThemeToggle';

const mono = "'Share Tech Mono', monospace";
const orb  = "'Orbitron', sans-serif";

const CURRENCY_COLORS = {
  EUR: '#00b4ff', GBP: '#9b59b6', AUD: '#f39c12',
  NZD: '#27ae60', USD: '#2ecc71', CAD: '#e74c3c', JPY: '#e67e22',
};

const PERIODS = [
  { label: 'H1',  value: 24  },
  { label: 'H4',  value: 48  },
  { label: 'D1',  value: 168 },
  { label: 'W1',  value: 336 },
];

export default function StrengthPage() {
  const canvasRef    = useRef(null);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [active,     setActive]     = useState({ EUR:true, GBP:true, AUD:true, NZD:true, USD:true, CAD:true, JPY:true });
  const [period,     setPeriod]     = useState(48);
  const [hovIdx,     setHovIdx]     = useState(null);
  const [isAdmin,    setIsAdmin]    = useState(false);
  const [user,       setUser]       = useState(null);
  const [canvasW,    setCanvasW]    = useState(0);

  // Auth
  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(d => {
      setUser(d);
      if (d.role === 'admin') setIsAdmin(true);
    }).catch(() => { window.location.href = '/'; });
  }, []);

  // Load data
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/currency-strength?periods=' + period);
      if (r.status === 401) { window.location.href = '/'; return; }
      setData(await r.json());
    } catch(e) {}
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  // ResizeObserver — watch canvas width, trigger redraw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      setCanvasW(canvas.clientWidth);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    // Use offsetWidth as fallback, force minimum
    const W = canvas.offsetWidth || canvasW || 600;
    const H = 380;
    canvas.width  = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    const PAD = { top:30, right:70, bottom:50, left:55 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top  - PAD.bottom;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'var(--bg-secondary)';
    ctx.fillRect(0, 0, W, H);

    const currencies = Object.keys(CURRENCY_COLORS).filter(c => active[c]);
    const labels = data.labels || [];
    const n = labels.length;
    if (n < 2) {
      ctx.fillStyle = 'var(--text-muted)';
      ctx.font = '12px ' + mono;
      ctx.textAlign = 'center';
      ctx.fillText('NOT ENOUGH DATA', W/2, H/2);
      return;
    }

    // Min/max
    let minV = Infinity, maxV = -Infinity;
    currencies.forEach(c => {
      (data.series[c] || []).forEach(v => {
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      });
    });
    const pad = Math.max(0.2, (maxV - minV) * 0.15);
    minV -= pad; maxV += pad;
    const range = maxV - minV || 1;

    const xOf = i => PAD.left + (i / (n - 1)) * chartW;
    const yOf = v => PAD.top + chartH - ((v - minV) / range) * chartH;

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 6; g++) {
      const y = PAD.top + (g / 6) * chartH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + chartW, y); ctx.stroke();
    }

    // Zero line
    const y0 = yOf(0);
    if (y0 >= PAD.top && y0 <= PAD.top + chartH) {
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(PAD.left, y0); ctx.lineTo(PAD.left + chartW, y0); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '9px ' + mono;
      ctx.textAlign = 'right';
      ctx.fillText('0', PAD.left - 5, y0 + 3);
    }

    // Y labels
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px ' + mono;
    ctx.textAlign = 'right';
    for (let g = 0; g <= 4; g++) {
      const v = minV + (g / 4) * range;
      ctx.fillText(v.toFixed(2), PAD.left - 6, yOf(v) + 3);
    }

    // X labels
    const step = Math.max(1, Math.floor(n / 8));
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '8px ' + mono;
    ctx.textAlign = 'center';
    for (let i = 0; i < n; i += step) {
      ctx.fillText(labels[i], xOf(i), PAD.top + chartH + 16);
    }

    // Currency lines
    currencies.forEach(c => {
      const vals = data.series[c];
      const color = CURRENCY_COLORS[c];
      if (!vals || vals.length < 2) return;

      // Gradient fill
      const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + chartH);
      grad.addColorStop(0, color + '33');
      grad.addColorStop(1, color + '00');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(xOf(0), yOf(vals[0]));
      vals.forEach((v,i) => { if(i>0) ctx.lineTo(xOf(i), yOf(v)); });
      ctx.lineTo(xOf(vals.length-1), PAD.top + chartH);
      ctx.lineTo(xOf(0), PAD.top + chartH);
      ctx.closePath();
      ctx.fill();

      // Line
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      vals.forEach((v,i) => { i===0 ? ctx.moveTo(xOf(i),yOf(v)) : ctx.lineTo(xOf(i),yOf(v)); });
      ctx.stroke();

      // End label
      const lastV = vals[vals.length-1];
      ctx.fillStyle = color;
      ctx.font = 'bold 9px ' + mono;
      ctx.textAlign = 'left';
      ctx.fillText(c + ' ' + (lastV > 0 ? '+' : '') + lastV.toFixed(2), xOf(vals.length-1) + 5, yOf(lastV) + 3);
    });

    // Hover
    if (hovIdx !== null && hovIdx < n) {
      const x = xOf(hovIdx);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3,3]);
      ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + chartH); ctx.stroke();
      ctx.setLineDash([]);
      currencies.forEach(c => {
        const v = data.series[c]?.[hovIdx];
        if (v === undefined) return;
        ctx.beginPath();
        ctx.arc(x, yOf(v), 4, 0, Math.PI*2);
        ctx.fillStyle = CURRENCY_COLORS[c];
        ctx.fill();
        ctx.strokeStyle = 'var(--bg-primary)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }

    ctx.textAlign = 'left';
  }, [data, active, hovIdx, canvasW]);

  function onMouseMove(e) {
    if (!data || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const chartW = rect.width - 55 - 70;
    const n = data.labels?.length || 1;
    setHovIdx(Math.max(0, Math.min(n-1, Math.round(((x-55)/chartW)*(n-1)))));
  }

  function toggleCurrency(c) {
    setActive(prev => {
      const on = Object.values(prev).filter(Boolean).length;
      if (prev[c] && on === 1) return prev;
      return { ...prev, [c]: !prev[c] };
    });
  }

  const ranking = data?.ranking || [];
  const hoverVals = hovIdx !== null && data
    ? Object.fromEntries(Object.keys(CURRENCY_COLORS).map(c => [c, data.series[c]?.[hovIdx]]))
    : null;

  return (
    <>
      <Head><title>PANDA - CURRENCY STRENGTH</title><meta charSet="utf-8"/></Head>
      <div style={{ minHeight:'100vh', background:'var(--bg-primary)', display:'flex', flexDirection:'column', fontFamily:mono }}>
        <div style={{ position:'fixed', inset:0, backgroundImage:'linear-gradient(var(--grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--grid-line) 1px,transparent 1px)', backgroundSize:'40px 40px', pointerEvents:'none', zIndex:0 }}/>

        {/* HEADER */}
        <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 20px', background:'var(--bg-secondary)', borderBottom:'1px solid var(--border)', position:'sticky', top:0, zIndex:100 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontFamily:orb, fontWeight:900, fontSize:13, letterSpacing:4, color:'#00ff9f' }}>CURRENCY STRENGTH</span>
            <span style={{ fontFamily:mono, fontSize:8, letterSpacing:3, color:'var(--text-muted)' }}>PANDA ENGINE</span>
          </div>
          <div style={{ display:'flex', gap:7, alignItems:'center' }}>
            <ThemeToggle />
            <button onClick={() => window.location.href='/dashboard'} style={{ background:'rgba(0,255,159,0.08)', border:'1px solid #00ff9f44', borderRadius:5, color:'#00ff9f', fontFamily:mono, fontSize:9, padding:'5px 10px', cursor:'pointer' }}>DASHBOARD</button>
            <button onClick={() => window.location.href='/journal'} style={{ background:'rgba(255,209,102,0.06)', border:'1px solid #ffd16633', borderRadius:5, color:'#ffd166', fontFamily:mono, fontSize:9, padding:'5px 10px', cursor:'pointer' }}>JOURNAL</button>
            {isAdmin && <button onClick={() => window.location.href='/admin'} style={{ background:'rgba(255,209,102,0.08)', border:'1px solid #ffd16644', borderRadius:5, color:'#ffd166', fontFamily:mono, fontSize:9, padding:'5px 10px', cursor:'pointer' }}>ADMIN</button>}
          </div>
        </header>

        <div style={{ flex:1, padding:'16px 20px', zIndex:1, display:'flex', flexDirection:'column', gap:14 }}>

          {/* CONTROLS */}
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <div style={{ display:'flex', background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:7, overflow:'hidden' }}>
              {PERIODS.map(p => (
                <button key={p.value} onClick={() => setPeriod(p.value)} style={{ background: period===p.value ? 'rgba(0,255,159,0.15)' : 'transparent', border:'none', borderRight:'1px solid var(--border)', color: period===p.value ? '#00ff9f' : 'var(--text-muted)', fontFamily:mono, fontSize:9, letterSpacing:2, padding:'6px 14px', cursor:'pointer' }}>
                  {p.label}
                </button>
              ))}
            </div>
            <button onClick={load} disabled={loading} style={{ background:'transparent', border:'1px solid var(--border-bright)', borderRadius:5, color:'#00b4ff', fontFamily:mono, fontSize:9, padding:'6px 10px', cursor:'pointer' }}>
              {loading ? 'LOADING...' : 'REFRESH'}
            </button>
            <div style={{ marginLeft:'auto', fontFamily:mono, fontSize:8, color:'var(--text-muted)', letterSpacing:2 }}>
              {data?.labels?.length || 0} DATA POINTS
            </div>
          </div>

          {/* CURRENCY TOGGLES */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {Object.keys(CURRENCY_COLORS).map(c => {
              const on = active[c];
              const color = CURRENCY_COLORS[c];
              const rank = ranking.find(r => r.currency === c);
              return (
                <button key={c} onClick={() => toggleCurrency(c)} style={{ background: on ? color+'18' : 'transparent', border:`2px solid ${on ? color : 'var(--border)'}`, borderRadius:8, padding:'8px 14px', cursor:'pointer', transition:'all 0.15s' }}>
                  <div style={{ fontFamily:orb, fontSize:10, fontWeight:700, color: on ? color : 'var(--text-muted)', letterSpacing:2 }}>{c}</div>
                  {rank && <div style={{ fontFamily:mono, fontSize:8, color: on ? (rank.value>=0?'#00ff9f':'#e74c3c') : 'var(--text-muted)', marginTop:2 }}>
                    {rank.value>=0?'+':''}{rank.value.toFixed(3)}
                  </div>}
                </button>
              );
            })}
          </div>

          {/* CHART + RANKING */}
          <div style={{ display:'flex', gap:14, flex:1, minHeight:400 }}>

            {/* CHART */}
            <div style={{ flex:1, background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:10, padding:'14px', display:'flex', flexDirection:'column', gap:10, position:'relative', minWidth:0 }}>
              <div style={{ fontFamily:orb, fontSize:10, fontWeight:700, color:'#00ff9f', letterSpacing:3 }}>
                STRENGTH CHART
                <span style={{ fontFamily:mono, fontSize:8, color:'var(--text-muted)', marginLeft:10 }}>(EMA 0.3 smoothed)</span>
              </div>

              {loading ? (
                <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:11, letterSpacing:3 }}>CALCULATING...</div>
              ) : (
                <canvas
                  ref={canvasRef}
                  onMouseMove={onMouseMove}
                  onMouseLeave={() => setHovIdx(null)}
                  style={{ width:'100%', height:'380px', display:'block', cursor:'crosshair' }}
                />
              )}

              {/* Hover tooltip */}
              {hoverVals && hovIdx !== null && data?.labels?.[hovIdx] && (
                <div style={{ position:'absolute', top:40, left:70, background:'rgba(8,12,24,0.95)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 12px', pointerEvents:'none', zIndex:10 }}>
                  <div style={{ fontFamily:mono, fontSize:8, color:'var(--text-muted)', marginBottom:4 }}>{data.labels[hovIdx]}</div>
                  {Object.keys(CURRENCY_COLORS).filter(c => active[c])
                    .sort((a,b) => (hoverVals[b]||0)-(hoverVals[a]||0))
                    .map(c => (
                      <div key={c} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:CURRENCY_COLORS[c] }}/>
                        <span style={{ fontFamily:mono, fontSize:9, color:CURRENCY_COLORS[c], minWidth:30 }}>{c}</span>
                        <span style={{ fontFamily:mono, fontSize:9, color:'var(--text-primary)' }}>
                          {hoverVals[c] !== undefined ? (hoverVals[c]>0?'+':'')+hoverVals[c].toFixed(3) : '---'}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* RANKING */}
            <div style={{ width:200, background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:10, padding:'14px', display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ fontFamily:orb, fontSize:10, fontWeight:700, color:'#00ff9f', letterSpacing:3 }}>RANKING</div>
              {ranking.map((r, i) => {
                const color = CURRENCY_COLORS[r.currency];
                const maxVal = Math.max(...ranking.map(x => Math.abs(x.value)), 0.01);
                return (
                  <div key={r.currency} style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontFamily:mono, fontSize:9, color:'var(--text-muted)', width:14 }}>#{i+1}</span>
                    <span style={{ fontFamily:orb, fontSize:9, fontWeight:700, color, width:30 }}>{r.currency}</span>
                    <div style={{ flex:1, background:'var(--bg-card)', borderRadius:3, height:6, overflow:'hidden' }}>
                      <div style={{ width:`${Math.abs(r.value)/maxVal*100}%`, height:'100%', background: r.value>=0 ? color : '#e74c3c', borderRadius:3 }}/>
                    </div>
                    <span style={{ fontFamily:mono, fontSize:8, color: r.value>=0?'#00ff9f':'#e74c3c', width:42, textAlign:'right' }}>
                      {r.value>=0?'+':''}{r.value.toFixed(3)}
                    </span>
                  </div>
                );
              })}

              {/* Best Setup */}
              {ranking.length >= 2 && (
                <div style={{ marginTop:8, padding:'10px', background:'var(--bg-card)', borderRadius:8, border:'1px solid var(--border)' }}>
                  <div style={{ fontFamily:mono, fontSize:8, color:'var(--text-muted)', letterSpacing:2, marginBottom:6 }}>BEST SETUP</div>
                  <div style={{ fontFamily:orb, fontSize:14, fontWeight:900, color:'#fff', letterSpacing:2 }}>
                    {ranking[0].currency}/{ranking[ranking.length-1].currency}
                  </div>
                  <div style={{ display:'flex', gap:6, marginTop:4 }}>
                    <span style={{ fontFamily:mono, fontSize:8, color:'#00ff9f' }}>LONG {ranking[0].currency}</span>
                    <span style={{ fontFamily:mono, fontSize:8, color:'#e74c3c' }}>SHORT {ranking[ranking.length-1].currency}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
