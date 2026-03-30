import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import ThemeToggle from '../components/ThemeToggle';

const mono = "'Share Tech Mono',monospace";
const orb  = "'Orbitron',sans-serif";
const raj  = "'Rajdhani',sans-serif";
const ALL_PAIRS = ['AUDJPY','AUDCAD','AUDNZD','AUDUSD','CADJPY','EURAUD','EURCAD','EURGBP','EURJPY','EURNZD','EURUSD','GBPAUD','GBPCAD','GBPJPY','GBPNZD','GBPUSD','NZDCAD','NZDJPY','NZDUSD','USDCAD','USDJPY'];

// ===== MOMENTUM ACTION GUIDE =====
const MOMENTUM_GUIDE = {
  STRONG:        { icon:'🔥', action:'RIDE IT — Trend fully aligned',       desc:'All 3 timeframes aligned',       color:'#00ff9f' },
  BUILDING:      { icon:'🚀', action:'ENTER NOW — Momentum confirmed',      desc:'Short + mid rising',             color:'#66ffcc' },
  SPARK:         { icon:'⚡', action:'WATCH — Wait for confirmation',       desc:'Early signal, not confirmed',    color:'#ffd166' },
  CONSOLIDATING: { icon:'🔵', action:'HOLD — Normal pause, do NOT close',  desc:'Strong trend resting',           color:'#00b4ff' },
  COOLING:       { icon:'🌡️', action:'TIGHTEN SL — Momentum slowing',      desc:'Slowing but trend intact',       color:'#ffaa44' },
  FADING:        { icon:'📉', action:'CONSIDER CLOSING — Gap shrinking',   desc:'Gap losing ground toward ±5',    color:'#ff7744' },
  REVERSING:     { icon:'⚠️', action:'CLOSE POSITION — Trend breaking',    desc:'Gap near 0, all TF negative',   color:'#ff4d6d' },
  STABLE:        { icon:'▬',  action:'MONITOR — No strong momentum',       desc:'Gap valid but flat',             color:'var(--text-secondary)' },
  NEUTRAL:       { icon:'○',  action:'WAIT — No valid signal yet',         desc:'Gap below ±5 threshold',         color:'var(--text-muted)' },
  EMERGING:      { icon:'📈', action:'PREPARE ENTRY — Signal emerging',    desc:'Short term rising',              color:'#66ffcc' },
};

// ===== UTILS =====
function stateColor(s) {
  if (!s) return 'var(--text-muted)';
  if (s.includes('EXPAND_BULL'))        return '#00ff9f';
  if (s.includes('STABLE_BULL'))        return '#66ffcc';
  if (s.includes('DEEP_PULLBACK_BULL')) return '#ffd166';
  if (s.includes('PULLBACK_BULL'))      return '#ffaa44';
  if (s.includes('EXPAND_BEAR'))        return '#ff4d6d';
  if (s.includes('STABLE_BEAR'))        return '#ff7090';
  if (s.includes('DEEP_PULLBACK_BEAR')) return '#ff9944';
  if (s.includes('PULLBACK_BEAR'))      return '#ffbb66';
  return 'var(--text-secondary)';
}
function biasFromGap(gap) {
  if (gap >= 5)  return { label:'BUY',  color:'#00ff9f', bg:'rgba(0,255,159,0.12)', border:'rgba(0,255,159,0.4)' };
  if (gap <= -5) return { label:'SELL', color:'#ff4d6d', bg:'rgba(255,77,109,0.12)', border:'rgba(255,77,109,0.4)' };
  return         { label:'WAIT', color:'var(--text-muted)', bg:'rgba(40,50,80,0.3)', border:'rgba(40,50,80,0.5)' };
}
function isValid(gap) { return gap >= 5 || gap <= -5; }

// ===== CURRENCY STRENGTH MATCHUP LABEL (v2) =====
// Score rules (from Panda Playbook): 4-6 = STRONG, 1-3 = NEUTRAL/WEAK, 0 = NEUTRAL
function scoreLabel(score) {
  const v = score || 0;
  if (v >= 4)  return 'STRONG';
  if (v <= -4) return 'WEAK';
  return 'NEUTRAL';
}
function getMatchup(row) {
  // row must have base_currency, quote_currency, base_d1..h1, quote_d1..h1 from Supabase v3
  if (!row || row.hard_invalid) return null;
  const gap = row.gap ?? 0;
  if (Math.abs(gap) < 5) return null;

  // Use the strongest individual TF score (same logic as cBot)
  const baseVals  = [row.base_d1, row.base_h4, row.base_h1].filter(v => v != null);
  const quoteVals = [row.quote_d1, row.quote_h4, row.quote_h1].filter(v => v != null);
  if (!baseVals.length || !quoteVals.length) return null;

  const baseScore  = gap > 0
    ? Math.max(...baseVals.filter(v => v > 0), 0)
    : Math.min(...baseVals.filter(v => v < 0), 0);
  const quoteScore = gap > 0
    ? Math.min(...quoteVals.filter(v => v < 0), 0)
    : Math.max(...quoteVals.filter(v => v > 0), 0);

  const bl = scoreLabel(baseScore);
  const ql = scoreLabel(quoteScore);
  const baseCur  = row.base_currency  || row.symbol?.slice(0,3) || '';
  const quoteCur = row.quote_currency || row.symbol?.slice(3,6) || '';

  if (bl === 'STRONG' && ql === 'STRONG') return { label: 'STRONG vs STRONG', color: '#ffd166', note: 'CONFLICT' };
  if (bl === 'STRONG' && ql === 'WEAK')   return { label: `${baseCur} STRONG / ${quoteCur} WEAK`,   color: '#00ff9f', note: 'IDEAL' };
  if (bl === 'WEAK'   && ql === 'STRONG') return { label: `${baseCur} WEAK / ${quoteCur} STRONG`,   color: '#ff4d6d', note: 'IDEAL' };
  if (bl === 'STRONG' && ql === 'NEUTRAL')return { label: `${baseCur} STRONG / ${quoteCur} NEUTRAL`,color: '#66ffcc', note: 'GOOD' };
  if (bl === 'NEUTRAL'&& ql === 'STRONG') return { label: `${baseCur} NEUTRAL / ${quoteCur} STRONG`,color: '#ff7090', note: 'GOOD' };
  if (bl === 'WEAK'   && ql === 'WEAK')   return { label: 'WEAK vs WEAK',   color: '#ffaa44', note: 'AVOID' };
  return { label: `${bl} / ${ql}`, color: 'var(--text-muted)', note: '' };
}
function signalLabel(signal, strength) {
  if (signal==='STRONG'||strength>=2) return { icon:'🔥', text:'STRONG', color:'#ffd166' };
  if (signal==='MODERATE'||strength>=1) return { icon:'⚡', text:'MOD',  color:'#00b4ff' };
  return { icon:'·', text:'WEAK', color:'var(--text-muted)' };
}
function strColor(v) {
  if (v>=4) return '#00ff9f'; if (v>=2) return '#66ffcc';
  if (v>=1) return '#ffd166'; if (v>0) return '#ffaa44';
  return 'var(--text-muted)';
}
function formatTime(dt) {
  if (!dt) return '—';
  try { return new Date(dt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}); }
  catch { return '—'; }
}
function formatDt(dt) {
  if (!dt) return '—';
  try {
    const d=new Date(dt);
    return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})+' '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  } catch { return '—'; }
}
function timeAgo(dt) {
  if (!dt) return '';
  try {
    const parsed = new Date(dt.endsWith('Z') ? dt : dt + 'Z');
    const diff = Math.floor((Date.now() - parsed.getTime()) / 1000);
    if (diff < 0) return 'just now';
    if (diff < 120) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  } catch { return ''; }
}

// ===== SOUND ALERT =====
function playBeep(type='spike') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === 'spike') {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } else {
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch {}
}

// ===== TREND ARROW =====
function TrendArrow({ trend, size=13 }) {
  if (trend==='STRONGER') return <span style={{color:'#00ff9f',fontSize:size,fontWeight:700,lineHeight:1}}>▲</span>;
  if (trend==='WEAKER')   return <span style={{color:'#ff4d6d',fontSize:size,fontWeight:700,lineHeight:1}}>▼</span>;
  return <span style={{color:'var(--text-muted)',fontSize:size,lineHeight:1}}>▬</span>;
}

// ===== SPARKLINE =====
function Sparkline({ data, color, w=70, h=22 }) {
  if (!data||data.length<2) return <span style={{color:'var(--border)',fontSize:9}}>NO HIST</span>;
  const pad=2,min=Math.min(...data),max=Math.max(...data),range=max-min||0.1;
  const pts=data.map((v,i)=>{const x=pad+(i/(data.length-1))*(w-pad*2);const y=h-pad-((v-min)/range)*(h-pad*2);return `${x.toFixed(1)},${y.toFixed(1)}`;}).join(' ');
  const last=pts.split(' ').pop().split(',');
  return <svg width={w} height={h}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/><circle cx={last[0]} cy={last[1]} r="2.5" fill={color}/></svg>;
}

// ===== DELTA CHIP =====
function DeltaChip({ label, delta }) {
  const v=delta??0;
  const color=Math.abs(v)<0.1?'var(--border)':v>0?'#00ff9f':'#ff4d6d';
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2,flex:1}}>
      <span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)'}}>{label}</span>
      <span style={{fontFamily:mono,fontSize:11,color,fontWeight:700}}>{Math.abs(v)<0.1?'±0':(v>0?'+':'')+v}</span>
    </div>
  );
}

// ===== SPIKE BANNER =====
function SpikeBanner({ spikes, prefs, onToggle }) {
  const visible = prefs?.spike_banner_visible !== false;

  if (!visible) return (
    <button onClick={onToggle} style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:5,color:'var(--text-muted)',fontFamily:mono,fontSize:8,padding:'4px 12px',cursor:'pointer',margin:'0 20px 8px',letterSpacing:2}}>
      SHOW SPIKE BANNER ▼
    </button>
  );

  if (!spikes || spikes.length === 0) return null;

  return (
    <div style={{margin:'0 20px 10px',background:'rgba(255,209,102,0.06)',border:'1px solid rgba(255,209,102,0.3)',borderRadius:10,padding:'10px 14px',zIndex:1,position:'relative'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:8,height:8,borderRadius:'50%',background:'#ffd166',boxShadow:'0 0 8px #ffd166',animation:'blink 1s infinite'}}/>
          <span style={{fontFamily:mono,fontSize:10,color:'#ffd166',letterSpacing:3,fontWeight:700}}>⚡ JUST FIRED — LAST 20 MIN</span>
          <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{spikes.length} signal{spikes.length>1?'s':''}</span>
        </div>
        <button onClick={onToggle} style={{background:'transparent',border:'1px solid var(--border)',borderRadius:4,color:'var(--text-muted)',fontFamily:mono,fontSize:8,padding:'2px 8px',cursor:'pointer'}}>HIDE ▲</button>
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {spikes.map((s,i) => {
          const bias=biasFromGap(s.gap);
          const momColor=s.momentum==='STRONG'?'#00ff9f':s.momentum==='BUILDING'?'#66ffcc':s.momentum==='SPARK'?'#ffd166':s.momentum==='CONSOLIDATING'?'#00b4ff':'#ffaa44';
          return (
            <div key={i} style={{background:'var(--bg-card)',border:`1px solid ${bias.border}`,borderRadius:8,padding:'8px 12px',display:'flex',flexDirection:'column',gap:4,minWidth:130}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                <span style={{fontFamily:orb,fontSize:12,fontWeight:700,color:'var(--text-primary)'}}>{s.symbol}</span>
                <span style={{fontFamily:mono,fontSize:9,color:bias.color,background:bias.bg,border:`1px solid ${bias.border}`,borderRadius:3,padding:'1px 5px'}}>{bias.label}</span>
              </div>
              <div style={{display:'flex',alignItems:'baseline',gap:4}}>
                <span style={{fontFamily:orb,fontSize:18,fontWeight:900,color:bias.color,lineHeight:1}}>{s.gap>0?'+':''}{s.gap}</span>
                <span style={{fontFamily:mono,fontSize:9,color:momColor}}>{s.momentum}</span>
              </div>
              {(() => { const g = MOMENTUM_GUIDE[s.momentum]; return g ? (
                <span style={{fontFamily:mono,fontSize:9,color:g.color,fontWeight:700}}>👉 {g.action}</span>
              ) : null; })()}
              <span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)'}}>{timeAgo(s.fired_at)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== MOMENTUM HEATMAP =====
function MomentumHeatmap({ data, heatmapData, visible, onToggle }) {
  const [loading, setLoading] = useState(false);
  const [hData, setHData] = useState(heatmapData || {});

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetch('/api/heatmap').then(r=>r.json()).then(d=>{ setHData(d||{}); setLoading(false); }).catch(()=>setLoading(false));
  }, [visible]);

  function cellColor(val) {
    if (val === null || val === undefined) return 'var(--border)';
    const v = parseFloat(val);
    if (v >= 3)   return '#00ff9f';
    if (v >= 1.5) return '#66ffcc';
    if (v >= 0.5) return '#224433';
    if (v >= 0)   return 'var(--border)';
    if (v >= -0.5) return '#332222';
    if (v >= -1.5) return '#ff7090';
    return '#ff4d6d';
  }
  function cellText(val) {
    if (val === null || val === undefined) return '—';
    const v = parseFloat(val);
    return (v > 0 ? '+' : '') + v.toFixed(1);
  }
  function cellTextColor(val) {
    if (val === null || val === undefined) return 'var(--text-muted)';
    const v = parseFloat(val);
    if (Math.abs(v) >= 1.5) return 'var(--text-primary)';
    if (Math.abs(v) >= 0.5) return 'var(--text-secondary)';
    return 'var(--text-muted)';
  }

  if (!visible) return (
    <button onClick={onToggle} style={{background:'rgba(0,180,255,0.04)',border:'1px solid var(--border)',borderRadius:5,color:'var(--text-muted)',fontFamily:mono,fontSize:8,padding:'4px 12px',cursor:'pointer',margin:'0 20px 8px',letterSpacing:2}}>
      SHOW HEATMAP ▼
    </button>
  );

  const COLS = ['1H','4H','8H'];

  return (
    <div style={{margin:'0 20px 12px',background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 16px',zIndex:1}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontFamily:orb,fontSize:11,fontWeight:700,color:'#00b4ff',letterSpacing:3}}>MOMENTUM HEATMAP</span>
          <span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:1}}>ALL 21 PAIRS × 1H / 4H / 8H</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {/* Legend */}
          <div style={{display:'flex',alignItems:'center',gap:4}}>
            {[['#00ff9f','STRONG↑'],['var(--border)','FLAT'],['#ff4d6d','STRONG↓']].map(([c,l])=>(
              <div key={l} style={{display:'flex',alignItems:'center',gap:3}}>
                <div style={{width:10,height:10,background:c,borderRadius:2}}/>
                <span style={{fontFamily:mono,fontSize:7,color:'var(--text-muted)'}}>{l}</span>
              </div>
            ))}
          </div>
          <button onClick={onToggle} style={{background:'transparent',border:'1px solid var(--border)',borderRadius:4,color:'var(--text-muted)',fontFamily:mono,fontSize:8,padding:'2px 8px',cursor:'pointer'}}>HIDE ▲</button>
        </div>
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:20,fontFamily:mono,fontSize:10,color:'var(--text-muted)',letterSpacing:2}}>LOADING...</div>
      ) : (
        <div style={{overflowX:'auto'}}>
          <table style={{borderCollapse:'collapse',width:'100%'}}>
            <thead>
              <tr>
                <th style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',padding:'4px 8px',textAlign:'left',borderBottom:'1px solid var(--border)',minWidth:80}}>PAIR</th>
                <th style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',padding:'4px 8px',textAlign:'center',borderBottom:'1px solid var(--border)',minWidth:50}}>GAP</th>
                {COLS.map(c=><th key={c} style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',padding:'4px 8px',textAlign:'center',borderBottom:'1px solid var(--border)',minWidth:60}}>{c}</th>)}
                <th style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',padding:'4px 8px',textAlign:'center',borderBottom:'1px solid var(--border)',minWidth:60}}>STR</th>
                <th style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',padding:'4px 8px',textAlign:'left',borderBottom:'1px solid var(--border)'}}>MOMENTUM</th>
              </tr>
            </thead>
            <tbody>
              {ALL_PAIRS.map(symbol => {
                const row = data.find(r=>r.symbol===symbol);
                const hRow = hData[symbol] || {};
                const gap = row?.gap ?? 0;
                const valid = isValid(gap);
                const bias = biasFromGap(gap);
                const momentum = row?.momentum || '—';
                const momColor = momentum==='STRONG'?'#00ff9f':momentum==='BUILDING'?'#66ffcc':momentum==='SPARK'?'#ffd166':momentum==='CONSOLIDATING'?'#00b4ff':momentum==='COOLING'?'#ffaa44':momentum==='FADING'?'#ff7744':momentum==='REVERSING'?'#ff4d6d':'var(--text-muted)';

                return (
                  <tr key={symbol} style={{borderBottom:'1px solid var(--border)',opacity:valid?1:0.35}}>
                    <td style={{padding:'5px 8px',fontFamily:orb,fontSize:11,fontWeight:700,color:valid?'var(--text-primary)':'var(--text-muted)'}}>{symbol}</td>
                    <td style={{padding:'5px 8px',textAlign:'center',fontFamily:mono,fontSize:11,color:bias.color,fontWeight:700}}>{gap>0?'+':''}{gap}</td>
                    {[hRow.h1, hRow.h4, hRow.h8].map((v,i)=>(
                      <td key={i} style={{padding:'3px 4px',textAlign:'center'}}>
                        <div style={{background:cellColor(v),borderRadius:4,padding:'4px 6px',margin:'0 2px'}}>
                          <span style={{fontFamily:mono,fontSize:10,color:cellTextColor(v),fontWeight:700}}>{cellText(v)}</span>
                        </div>
                      </td>
                    ))}
                    <td style={{padding:'5px 8px',textAlign:'center',fontFamily:mono,fontSize:11,color:strColor(row?.strength||0),fontWeight:700}}>{(row?.strength||0).toFixed(1)}</td>
                    <td style={{padding:'5px 8px',fontFamily:mono,fontSize:9,color:momColor}}>{momentum}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ===== ALERT SETTINGS MODAL =====
function AlertSettingsModal({ prefs, onClose, onSave, username }) {
  const [form, setForm] = useState({
    sound_enabled:        prefs?.sound_enabled ?? true,
    browser_notif_enabled: prefs?.browser_notif_enabled ?? false,
    telegram_enabled:     prefs?.telegram_enabled ?? false,
    heatmap_visible:      prefs?.heatmap_visible ?? true,
    spike_banner_visible: prefs?.spike_banner_visible ?? true,
    subscribed_pairs:     prefs?.subscribed_pairs ?? ALL_PAIRS,
    telegram_chat_id:     prefs?.telegram_chat_id ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [notifStatus, setNotifStatus] = useState('');

  async function requestBrowserNotif() {
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setForm(f=>({...f, browser_notif_enabled: true}));
        setNotifStatus('✅ Browser notifications enabled!');
        new Notification('🐼 PANDA ENGINE', { body: 'Notifications are now active!', icon: '/favicon.ico' });
      } else {
        setNotifStatus('❌ Permission denied by browser');
      }
    } catch { setNotifStatus('❌ Browser notifications not supported'); }
  }

  function togglePair(sym) {
    setForm(f => ({
      ...f,
      subscribed_pairs: f.subscribed_pairs.includes(sym)
        ? f.subscribed_pairs.filter(s=>s!==sym)
        : [...f.subscribed_pairs, sym]
    }));
  }

  async function save() {
    setSaving(true);
    await fetch('/api/alert-prefs', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(form),
    });
    onSave(form);
    setSaving(false);
    onClose();
  }

  const inp = {background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:5,padding:'7px 10px',color:'var(--text-primary)',fontFamily:raj,fontSize:14,width:'100%',boxSizing:'border-box'};
  const lbl = {fontFamily:mono,fontSize:9,letterSpacing:2,color:'var(--text-muted)',display:'block',marginBottom:4};
  const toggleRow = (label, key, color='#00ff9f') => (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
      <span style={{fontFamily:raj,fontSize:15,color:'var(--text-secondary)'}}>{label}</span>
      <div onClick={()=>setForm(f=>({...f,[key]:!f[key]}))} style={{width:44,height:24,borderRadius:12,background:form[key]?color+'33':'var(--border)',border:`1px solid ${form[key]?color:'var(--text-muted)'}`,cursor:'pointer',position:'relative',transition:'all 0.2s'}}>
        <div style={{position:'absolute',top:3,left:form[key]?22:3,width:16,height:16,borderRadius:'50%',background:form[key]?color:'var(--text-muted)',transition:'left 0.2s'}}/>
      </div>
    </div>
  );

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'var(--bg-card)',border:'1px solid #1e3060',borderRadius:12,padding:28,width:480,maxHeight:'90vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:16}}>
        <div style={{fontFamily:orb,fontSize:14,fontWeight:700,color:'#ffd166',letterSpacing:3}}>🔔 ALERT SETTINGS</div>

        {/* Toggle switches */}
        <div style={{background:'var(--bg-card)',borderRadius:8,padding:'0 14px'}}>
          {toggleRow('🔊 Sound Alert on spike', 'sound_enabled', '#00ff9f')}
          {toggleRow('📊 Show Spike Banner', 'spike_banner_visible', '#ffd166')}
          {toggleRow('🗺️ Show Heatmap', 'heatmap_visible', '#00b4ff')}
          {toggleRow('📱 Browser Notifications', 'browser_notif_enabled', '#00b4ff')}
          {toggleRow('📨 Telegram Alerts', 'telegram_enabled', '#00ff9f')}
        </div>

        {/* Browser notif request */}
        {form.browser_notif_enabled && (
          <div style={{background:'rgba(0,180,255,0.07)',border:'1px solid rgba(0,180,255,0.3)',borderRadius:8,padding:'10px 14px'}}>
            <button onClick={requestBrowserNotif} style={{background:'rgba(0,180,255,0.12)',border:'1px solid #00b4ff',borderRadius:5,color:'#00b4ff',fontFamily:mono,fontSize:9,letterSpacing:2,padding:'7px 14px',cursor:'pointer',width:'100%'}}>
              REQUEST BROWSER PERMISSION
            </button>
            {notifStatus && <div style={{fontFamily:mono,fontSize:9,color:'#00b4ff',marginTop:6}}>{notifStatus}</div>}
          </div>
        )}

        {/* Telegram chat ID */}
        {form.telegram_enabled && (
          <div style={{background:'rgba(0,255,159,0.05)',border:'1px solid rgba(0,255,159,0.2)',borderRadius:8,padding:'12px 14px',display:'flex',flexDirection:'column',gap:8}}>
            <label style={lbl}>YOUR TELEGRAM CHAT ID (optional — for personal alerts)</label>
            <input style={inp} value={form.telegram_chat_id} onChange={e=>setForm(f=>({...f,telegram_chat_id:e.target.value}))} placeholder="e.g. 123456789 (leave blank for group only)" />
            <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:1}}>
              All alerts go to the group by default. Add your personal chat ID to also receive individual alerts.
              To get your chat ID: message @userinfobot on Telegram.
            </div>
          </div>
        )}

        {/* Pair subscriptions */}
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <label style={{...lbl,marginBottom:0}}>SUBSCRIBED PAIRS ({form.subscribed_pairs.length}/21)</label>
            <div style={{display:'flex',gap:6}}>
              <button onClick={()=>setForm(f=>({...f,subscribed_pairs:[...ALL_PAIRS]}))} style={{background:'transparent',border:'1px solid var(--border)',borderRadius:4,color:'#00ff9f',fontFamily:mono,fontSize:8,padding:'3px 7px',cursor:'pointer'}}>ALL</button>
              <button onClick={()=>setForm(f=>({...f,subscribed_pairs:[]}))} style={{background:'transparent',border:'1px solid var(--border)',borderRadius:4,color:'#ff4d6d',fontFamily:mono,fontSize:8,padding:'3px 7px',cursor:'pointer'}}>NONE</button>
            </div>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
            {ALL_PAIRS.map(s=>{
              const active=form.subscribed_pairs.includes(s);
              return (
                <button key={s} onClick={()=>togglePair(s)} style={{background:active?'rgba(0,255,159,0.1)':'transparent',border:`1px solid ${active?'#00ff9f':'var(--border)'}`,borderRadius:4,color:active?'#00ff9f':'var(--text-muted)',fontFamily:mono,fontSize:9,padding:'4px 8px',cursor:'pointer'}}>
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{display:'flex',gap:8,marginTop:4}}>
          <button onClick={onClose} style={{flex:1,background:'transparent',border:'1px solid var(--border)',borderRadius:5,color:'var(--text-muted)',fontFamily:mono,fontSize:10,padding:'9px',cursor:'pointer'}}>CANCEL</button>
          <button onClick={save} disabled={saving} style={{flex:2,background:'rgba(255,209,102,0.1)',border:'1px solid #ffd166',borderRadius:5,color:'#ffd166',fontFamily:mono,fontSize:10,letterSpacing:2,padding:'9px',cursor:'pointer'}}>{saving?'SAVING...':'SAVE SETTINGS'}</button>
        </div>
      </div>
    </div>
  );
}

// ===== GAP CHART =====
function GapChart() {
  const TFS=['1H','4H','DAILY','1W','ALL'];
  const [symbols,setSymbols]=useState(['EURUSD']);
  const [tf,setTf]=useState('DAILY');
  const [charts,setCharts]=useState({});
  const [loading,setLoading]=useState(false);
  const [hover,setHover]=useState(null);
  const svgRef=useRef(null);
  const COLORS=['#00b4ff','#00ff9f','#ffd166','#ff4d6d','#ff9944','#cc77ff'];

  async function loadSymbol(sym) {
    try {
      const res=await fetch(`/api/gap-chart?symbol=${sym}&timeframe=${tf}`);
      if(!res.ok) return;
      const d=await res.json();
      setCharts(prev=>({...prev,[sym]:d}));
    } catch {}
  }
  useEffect(()=>{setLoading(true);setCharts({});Promise.all(symbols.map(s=>loadSymbol(s))).finally(()=>setLoading(false));},[symbols,tf]);

  function toggleSymbol(sym) {
    setSymbols(prev=>{
      if(prev.includes(sym)) return prev.length>1?prev.filter(s=>s!==sym):prev;
      if(prev.length>=3) return [...prev.slice(1),sym];
      return [...prev,sym];
    });
  }

  const W=760,H=260,PAD={top:20,right:20,bottom:40,left:45};
  const cW=W-PAD.left-PAD.right,cH=H-PAD.top-PAD.bottom;
  const allGaps=Object.values(charts).flatMap(c=>(c.data||[]).map(d=>parseFloat(d.gap)||0));
  const axisMin=Math.min(...allGaps,-12),axisMax=Math.max(...allGaps,12),rangeG=axisMax-axisMin;
  const longestKey=Object.keys(charts).sort((a,b)=>(charts[b]?.data?.length||0)-(charts[a]?.data?.length||0))[0];
  const xData=longestKey?(charts[longestKey]?.data||[]):[];
  function toX(i,total){return PAD.left+(i/Math.max(total-1,1))*cW;}
  function toY(g){return PAD.top+cH-((g-axisMin)/rangeG)*cH;}
  const zeroY=toY(0);

  function handleMouseMove(e) {
    if(!svgRef.current||!xData.length) return;
    const rect=svgRef.current.getBoundingClientRect();
    const mouseX=(e.clientX-rect.left)*(W/rect.width)-PAD.left;
    const idx=Math.max(0,Math.min(xData.length-1,Math.round((mouseX/cW)*(xData.length-1))));
    const vals={};
    symbols.forEach(s=>{const cd=charts[s]?.data;if(cd){const ri=Math.round(idx*(cd.length-1)/(xData.length-1||1));vals[s]=parseFloat(cd[Math.min(ri,cd.length-1)]?.gap)||0;}});
    setHover({idx,ts:xData[idx]?.timestamp,vals});
  }

  const gridVals=[-12,-9,-6,-3,0,3,6,9,12];
  return (
    <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:10,padding:'16px 18px',display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <div style={{fontFamily:orb,fontSize:12,fontWeight:700,color:'#00b4ff',letterSpacing:3}}>GAP HISTORY CHART</div>
        <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>UP TO 3 PAIRS</span>
        <div style={{display:'flex',gap:4,marginLeft:'auto'}}>
          {TFS.map(t=><button key={t} onClick={()=>setTf(t)} style={{background:tf===t?'rgba(0,180,255,0.15)':'transparent',border:`1px solid ${tf===t?'#00b4ff':'var(--border)'}`,borderRadius:4,color:tf===t?'#00b4ff':'var(--text-muted)',fontFamily:mono,fontSize:9,padding:'4px 9px',cursor:'pointer'}}>{t}</button>)}
        </div>
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
        {ALL_PAIRS.map((s,i)=>{const active=symbols.includes(s);const ci=symbols.indexOf(s);const col=active?COLORS[ci]:'var(--border)';return <button key={s} onClick={()=>toggleSymbol(s)} style={{background:active?col+'18':'transparent',border:`1px solid ${col}`,borderRadius:4,color:active?col:'var(--text-muted)',fontFamily:mono,fontSize:9,padding:'3px 8px',cursor:'pointer',fontWeight:active?700:400}}>{s}</button>;})}
      </div>
      <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
        {symbols.map((s,i)=>{const trend=charts[s]?.trend||'STABLE';return(<div key={s} style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:18,height:3,background:COLORS[i],borderRadius:2}}/><span style={{fontFamily:orb,fontSize:11,fontWeight:700,color:COLORS[i]}}>{s}</span><TrendArrow trend={trend} size={13}/><span style={{fontFamily:mono,fontSize:9,color:trend==='STRONGER'?'#00ff9f':trend==='WEAKER'?'#ff4d6d':'var(--text-muted)'}}>{trend}</span></div>);})}
      </div>
      {hover&&<div style={{display:'flex',gap:16,padding:'6px 10px',background:'var(--bg-card)',borderRadius:6,border:'1px solid var(--border)',flexWrap:'wrap'}}><span style={{fontFamily:mono,fontSize:10,color:'var(--text-muted)'}}>{hover.ts}</span>{Object.entries(hover.vals).map(([s,v],i)=><span key={s} style={{fontFamily:mono,fontSize:10,color:COLORS[symbols.indexOf(s)],fontWeight:700}}>{s}: {v>0?'+':''}{v.toFixed(0)}</span>)}</div>}
      {loading?<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:H}}><span style={{fontFamily:mono,fontSize:11,color:'var(--text-muted)',letterSpacing:2}}>LOADING...</span></div>:(
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:'auto',cursor:'crosshair'}} onMouseMove={handleMouseMove} onMouseLeave={()=>setHover(null)}>
          {gridVals.map(g=><g key={g}><line x1={PAD.left} y1={toY(g)} x2={W-PAD.right} y2={toY(g)} stroke={g===0?'var(--text-muted)':g===5||g===-5?'#223344':'var(--border)'} strokeWidth={g===0?1.5:0.5} strokeDasharray={g===5||g===-5?'4,4':g===0?undefined:'2,4'}/><text x={PAD.left-5} y={toY(g)+4} fill={g===0?'var(--text-muted)':g===5?'#00ff9f66':g===-5?'#ff4d6d66':'var(--text-muted)'} fontSize={9} textAnchor="end" fontFamily={mono}>{g>0?'+':''}{g}</text></g>)}
          <rect x={PAD.left} y={toY(12)} width={cW} height={toY(5)-toY(12)} fill="rgba(0,255,159,0.03)"/>
          <rect x={PAD.left} y={toY(-5)} width={cW} height={toY(-12)-toY(-5)} fill="rgba(255,77,109,0.03)"/>
          {symbols.map((s,ci)=>{const cd=charts[s]?.data;if(!cd||cd.length<2) return null;const col=COLORS[ci];const linePath=cd.map((d,i)=>`${i===0?'M':'L'}${toX(i,cd.length).toFixed(1)},${toY(parseFloat(d.gap)||0).toFixed(1)}`).join(' ');const fX=toX(0,cd.length).toFixed(1),lX=toX(cd.length-1,cd.length).toFixed(1);const aP=cd.map((d,i)=>`${i===0?'M':'L'}${toX(i,cd.length).toFixed(1)},${toY(Math.max(parseFloat(d.gap)||0,0)).toFixed(1)}`).join(' ')+` L${lX},${zeroY.toFixed(1)} L${fX},${zeroY.toFixed(1)} Z`;const bP=cd.map((d,i)=>`${i===0?'M':'L'}${toX(i,cd.length).toFixed(1)},${toY(Math.min(parseFloat(d.gap)||0,0)).toFixed(1)}`).join(' ')+` L${lX},${zeroY.toFixed(1)} L${fX},${zeroY.toFixed(1)} Z`;return(<g key={s}><path d={aP} fill={col+'14'}/><path d={bP} fill="#ff4d6d0a"/><path d={linePath} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round"/></g>);})}
          {hover&&xData.length>0&&<><line x1={toX(hover.idx,xData.length)} y1={PAD.top} x2={toX(hover.idx,xData.length)} y2={H-PAD.bottom} stroke="#ffffff22" strokeWidth={1} strokeDasharray="3,3"/>{symbols.map((s,ci)=>{const cd=charts[s]?.data;if(!cd) return null;const ri=Math.round(hover.idx*(cd.length-1)/(xData.length-1||1));const g=parseFloat(cd[Math.min(ri,cd.length-1)]?.gap)||0;return <circle key={s} cx={toX(hover.idx,xData.length)} cy={toY(g)} r={4} fill={COLORS[ci]} stroke="#fff" strokeWidth={1.5}/>;})}</>}
          {xData.filter((_,i)=>{const step=Math.max(1,Math.floor(xData.length/7));return i%step===0||i===xData.length-1;}).map(d=>{const i=xData.indexOf(d);return <text key={i} x={toX(i,xData.length)} y={H-PAD.bottom+14} fill="var(--text-muted)" fontSize={8} textAnchor="middle" fontFamily={mono}>{(d.timestamp||'').slice(5,16)}</text>;})}
        </svg>
      )}
    </div>
  );
}

// ===== ECONOMIC CALENDAR =====
function EconomicCalendar({ pairs }) {
  const [events,setEvents]=useState([]);
  const [loading,setLoading]=useState(false);
  const [filter,setFilter]=useState('ALL');
  const activeCurrencies=new Set();
  (pairs||[]).forEach(p=>{if(p.symbol?.length>=6){activeCurrencies.add(p.symbol.slice(0,3));activeCurrencies.add(p.symbol.slice(3,6));}});
  async function load(){setLoading(true);try{const res=await fetch('/api/calendar');setEvents(await res.json());}catch{}setLoading(false);}
  useEffect(()=>{load();},[]);
  function getCountdown(dateStr,timeStr){try{if(!dateStr||!timeStr||timeStr==='All Day'||timeStr==='Tentative') return null;const dt=new Date(`${dateStr} ${timeStr}`);if(isNaN(dt)) return null;const diff=dt-new Date();if(diff<0) return null;const h=Math.floor(diff/3600000),m=Math.floor((diff%3600000)/60000);return `${h}h ${m}m`;}catch{return null;}}
  function getImpact(impact){const i=(impact||'').toLowerCase();if(i==='high') return{color:'#ff4d6d',icon:'🔴'};if(i==='medium'||i==='med') return{color:'#ffd166',icon:'🟡'};return{color:'#00ff9f',icon:'🟢'};}
  let filtered=events;
  if(filter==='HIGH') filtered=events.filter(e=>e.impact?.toLowerCase()==='high');
  if(filter==='MED') filtered=events.filter(e=>['medium','med'].includes(e.impact?.toLowerCase()));
  if(filter==='LOW') filtered=events.filter(e=>!['high','medium','med'].includes(e.impact?.toLowerCase()));
  const highSoon=events.filter(e=>{if(e.impact?.toLowerCase()!=='high') return false;if(!activeCurrencies.has(e.currency)) return false;const c=getCountdown(e.date,e.time);return c&&parseInt(c)<1;});
  const cbRates=[{currency:'USD',bank:'Fed',rate:'4.50%',trend:'→',color:'#00b4ff'},{currency:'EUR',bank:'ECB',rate:'2.65%',trend:'↓',color:'#ffd166'},{currency:'GBP',bank:'BOE',rate:'4.50%',trend:'↓',color:'#00ff9f'},{currency:'JPY',bank:'BOJ',rate:'0.50%',trend:'↑',color:'#ff9944'},{currency:'AUD',bank:'RBA',rate:'4.10%',trend:'↓',color:'#ff4d6d'},{currency:'CAD',bank:'BOC',rate:'2.75%',trend:'↓',color:'#cc77ff'},{currency:'NZD',bank:'RBNZ',rate:'3.75%',trend:'↓',color:'#00ffcc'}];
  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      {highSoon.length>0&&<div style={{background:'rgba(255,77,109,0.08)',border:'1px solid rgba(255,77,109,0.4)',borderRadius:8,padding:'10px 14px'}}><div style={{fontFamily:mono,fontSize:10,color:'#ff4d6d',letterSpacing:2,marginBottom:5}}>⚠️ HIGH IMPACT NEWS IN &lt;1 HOUR</div>{highSoon.map((e,i)=><div key={i} style={{fontFamily:mono,fontSize:11,color:'#ff9944'}}>🔴 {e.currency} — {e.title}</div>)}</div>}
      <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:10,padding:'14px 16px'}}>
        <div style={{fontFamily:orb,fontSize:11,fontWeight:700,color:'#ffd166',letterSpacing:3,marginBottom:10}}>CENTRAL BANK RATES</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {cbRates.map(cb=><div key={cb.currency} style={{background:'var(--bg-card)',border:`1px solid ${cb.color}33`,borderRadius:6,padding:'8px 14px',minWidth:88,display:'flex',flexDirection:'column',gap:4}}><div style={{display:'flex',alignItems:'center',gap:6,justifyContent:'space-between'}}><span style={{fontFamily:orb,fontSize:12,fontWeight:700,color:cb.color}}>{cb.currency}</span><span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)'}}>{cb.bank}</span></div><div style={{display:'flex',alignItems:'center',gap:5}}><span style={{fontFamily:mono,fontSize:15,color:'var(--text-primary)',fontWeight:700}}>{cb.rate}</span><span style={{fontSize:14,color:cb.trend==='↑'?'#00ff9f':cb.trend==='↓'?'#ff4d6d':'#ffd166'}}>{cb.trend}</span></div></div>)}
        </div>
      </div>
      <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:10,padding:'14px 16px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <div style={{fontFamily:orb,fontSize:11,fontWeight:700,color:'#00b4ff',letterSpacing:3}}>THIS WEEK — EVENTS</div>
          <div style={{display:'flex',gap:5}}>
            {['ALL','HIGH','MED','LOW'].map(f=><button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?'rgba(0,180,255,0.12)':'transparent',border:`1px solid ${filter===f?'#00b4ff':'var(--border)'}`,borderRadius:4,color:filter===f?'#00b4ff':'var(--text-muted)',fontFamily:mono,fontSize:9,padding:'3px 8px',cursor:'pointer'}}>{f}</button>)}
            <button onClick={load} style={{background:'transparent',border:'1px solid var(--border)',borderRadius:4,color:'var(--text-muted)',fontFamily:mono,fontSize:9,padding:'3px 7px',cursor:'pointer'}}>⟳</button>
          </div>
        </div>
        {loading?<div style={{textAlign:'center',padding:20,fontFamily:mono,fontSize:10,color:'var(--text-muted)'}}>LOADING...</div>:filtered.length===0?<div style={{textAlign:'center',padding:20,fontFamily:mono,fontSize:10,color:'var(--text-muted)'}}>NO EVENTS</div>:(
          <div style={{display:'flex',flexDirection:'column',gap:5,maxHeight:400,overflowY:'auto'}}>
            {filtered.slice(0,60).map((e,i)=>{const imp=getImpact(e.impact);const countdown=getCountdown(e.date,e.time);const isActive=activeCurrencies.has(e.currency);return(
              <div key={i} style={{display:'grid',gridTemplateColumns:'24px 46px 1fr 120px 90px',alignItems:'center',gap:10,padding:'8px 10px',background:isActive?'rgba(0,180,255,0.04)':'transparent',border:`1px solid ${isActive?'#1e306044':'var(--border)'}`,borderRadius:6}}>
                <span style={{fontSize:14,textAlign:'center'}}>{imp.icon}</span>
                <span style={{fontFamily:orb,fontSize:11,fontWeight:700,color:isActive?'var(--text-primary)':'var(--text-muted)'}}>{e.currency}</span>
                <span style={{fontFamily:raj,fontSize:14,color:isActive?'var(--text-secondary)':'var(--text-secondary)'}}>{e.title}</span>
                <div style={{display:'flex',flexDirection:'column',gap:2}}>{e.forecast&&<span style={{fontFamily:mono,fontSize:10,color:'#00b4ff'}}>F: {e.forecast}</span>}{e.previous&&<span style={{fontFamily:mono,fontSize:10,color:'var(--text-muted)'}}>P: {e.previous}</span>}{e.actual&&<span style={{fontFamily:mono,fontSize:10,color:'#00ff9f'}}>A: {e.actual}</span>}</div>
                <div style={{textAlign:'right'}}>{countdown?<span style={{fontFamily:mono,fontSize:11,color:imp.color,fontWeight:700}}>in {countdown}</span>:<span style={{fontFamily:mono,fontSize:10,color:'var(--text-muted)'}}>{e.time||e.date?.slice(5)}</span>}</div>
              </div>
            );})}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== POSITION CALCULATOR =====
function PositionCalculator() {
  const [mode,setMode]=useState('pct');
  const [balance,setBalance]=useState('50000');
  const [risk,setRisk]=useState('1');
  const [riskFixed,setRiskFixed]=useState('500');
  const [sl,setSl]=useState('20');
  const [pair,setPair]=useState('EURUSD');
  const [entry,setEntry]=useState('');
  const [tp,setTp]=useState('');
  const isJpy=pair.includes('JPY');
  const pipSize=isJpy?0.01:0.0001;
  const pipValue=isJpy?1000:10;
  const riskAmount=mode==='pct'?(parseFloat(balance)||0)*(parseFloat(risk)||0)/100:(parseFloat(riskFixed)||0);
  const slPips=parseFloat(sl)||1;
  const lotSize=riskAmount>0&&slPips>0?(riskAmount/(slPips*pipValue)).toFixed(2):'0.00';
  const pipVal=(pipValue*parseFloat(lotSize||0)).toFixed(2);
  let rr=null,potProfit=null;
  if(entry&&tp){const e=parseFloat(entry),t=parseFloat(tp);if(!isNaN(e)&&!isNaN(t)){const rwPips=Math.abs(t-e)/pipSize;rr=slPips>0?(rwPips/slPips).toFixed(2):null;potProfit=(rwPips*pipValue*parseFloat(lotSize)).toFixed(2);}}
  const inp={background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:5,padding:'8px 10px',color:'var(--text-primary)',fontFamily:raj,fontSize:14,width:'100%',boxSizing:'border-box'};
  const lbl={fontFamily:mono,fontSize:9,letterSpacing:2,color:'var(--text-muted)',display:'block',marginBottom:4};
  return (
    <div style={{display:'flex',flexDirection:'column',gap:12,maxWidth:860}}>
      <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:10,padding:'18px 20px'}}>
        <div style={{fontFamily:orb,fontSize:12,fontWeight:700,color:'#00ff9f',letterSpacing:3,marginBottom:14}}>POSITION SIZE CALCULATOR</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
          <div><label style={lbl}>PAIR</label><select style={inp} value={pair} onChange={e=>setPair(e.target.value)}>{ALL_PAIRS.map(p=><option key={p} value={p}>{p}</option>)}</select></div>
          <div><label style={lbl}>ACCOUNT BALANCE ($)</label><input style={inp} type="number" value={balance} onChange={e=>setBalance(e.target.value)} placeholder="50000"/></div>
          <div><label style={lbl}>STOP LOSS (PIPS)</label><input style={inp} type="number" value={sl} onChange={e=>setSl(e.target.value)} placeholder="20"/></div>
        </div>
        <div style={{marginTop:12}}>
          <label style={lbl}>RISK TYPE</label>
          <div style={{display:'flex',gap:8,marginBottom:10}}>
            <button onClick={()=>setMode('pct')} style={{flex:1,background:mode==='pct'?'rgba(0,255,159,0.12)':'transparent',border:`1px solid ${mode==='pct'?'#00ff9f':'var(--border)'}`,borderRadius:5,color:mode==='pct'?'#00ff9f':'var(--text-muted)',fontFamily:mono,fontSize:9,letterSpacing:2,padding:'7px',cursor:'pointer'}}>% OF BALANCE</button>
            <button onClick={()=>setMode('fixed')} style={{flex:1,background:mode==='fixed'?'rgba(0,180,255,0.12)':'transparent',border:`1px solid ${mode==='fixed'?'#00b4ff':'var(--border)'}`,borderRadius:5,color:mode==='fixed'?'#00b4ff':'var(--text-muted)',fontFamily:mono,fontSize:9,letterSpacing:2,padding:'7px',cursor:'pointer'}}>FIXED $ AMOUNT</button>
          </div>
          {mode==='pct'?(<div><label style={lbl}>RISK %</label><div style={{display:'flex',gap:6,alignItems:'center'}}><input style={{...inp,flex:1}} type="number" step="0.1" value={risk} onChange={e=>setRisk(e.target.value)} placeholder="1"/><div style={{display:'flex',gap:4}}>{['0.5','1','1.5','2','3'].map(v=><button key={v} onClick={()=>setRisk(v)} style={{background:risk===v?'rgba(0,255,159,0.12)':'transparent',border:`1px solid ${risk===v?'#00ff9f':'var(--border)'}`,borderRadius:4,color:risk===v?'#00ff9f':'var(--text-muted)',fontFamily:mono,fontSize:9,padding:'5px 8px',cursor:'pointer'}}>{v}%</button>)}</div></div></div>):(<div><label style={lbl}>RISK AMOUNT ($)</label><div style={{display:'flex',gap:6,alignItems:'center'}}><input style={{...inp,flex:1}} type="number" step="50" value={riskFixed} onChange={e=>setRiskFixed(e.target.value)} placeholder="500"/><div style={{display:'flex',gap:4}}>{['100','250','500','1000'].map(v=><button key={v} onClick={()=>setRiskFixed(v)} style={{background:riskFixed===v?'rgba(0,180,255,0.12)':'transparent',border:`1px solid ${riskFixed===v?'#00b4ff':'var(--border)'}`,borderRadius:4,color:riskFixed===v?'#00b4ff':'var(--text-muted)',fontFamily:mono,fontSize:9,padding:'5px 8px',cursor:'pointer'}}>${v}</button>)}</div></div></div>)}
        </div>
        <div style={{marginTop:14,display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
          {[{label:'RISK AMOUNT',value:`$${riskAmount.toFixed(2)}`,color:'#ffd166'},{label:'LOT SIZE',value:lotSize,color:'#00ff9f',big:true},{label:'PIP VALUE',value:`$${pipVal}/pip`,color:'#00b4ff'}].map(s=><div key={s.label} style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 14px'}}><div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2,marginBottom:4}}>{s.label}</div><div style={{fontFamily:orb,fontSize:s.big?24:16,fontWeight:900,color:s.color,textShadow:`0 0 12px ${s.color}66`}}>{s.value}</div></div>)}
        </div>
      </div>
      <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:10,padding:'18px 20px'}}>
        <div style={{fontFamily:orb,fontSize:12,fontWeight:700,color:'#ffd166',letterSpacing:3,marginBottom:14}}>RISK / REWARD CALCULATOR</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div><label style={lbl}>ENTRY PRICE</label><input style={inp} type="number" step="0.00001" value={entry} onChange={e=>setEntry(e.target.value)} placeholder={isJpy?'150.000':'1.08000'}/></div>
          <div><label style={lbl}>TAKE PROFIT</label><input style={inp} type="number" step="0.00001" value={tp} onChange={e=>setTp(e.target.value)} placeholder={isJpy?'151.000':'1.09000'}/></div>
        </div>
        {rr&&<div style={{marginTop:12,display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>{[{label:'R:R RATIO',value:`1:${rr}`,color:parseFloat(rr)>=2?'#00ff9f':parseFloat(rr)>=1?'#ffd166':'#ff4d6d'},{label:'POTENTIAL PROFIT',value:`$${potProfit}`,color:'#00ff9f'},{label:'MAX LOSS',value:`$${riskAmount.toFixed(2)}`,color:'#ff4d6d'}].map(s=><div key={s.label} style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 14px'}}><div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2,marginBottom:4}}>{s.label}</div><div style={{fontFamily:orb,fontSize:20,fontWeight:900,color:s.color,textShadow:`0 0 10px ${s.color}66`}}>{s.value}</div></div>)}</div>}
      </div>
    </div>
  );
}

// ===== ENGINE HEALTH =====
function EngineHealth() {
  const [health,setHealth]=useState(null);
  const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{setLoading(true);try{const res=await fetch('/api/engine-health');if(res.ok) setHealth(await res.json());}catch{}setLoading(false);},[]);
  useEffect(()=>{load();const t=setInterval(load,30000);return()=>clearInterval(t);},[load]);
  if(loading) return <div style={{textAlign:'center',padding:60,fontFamily:mono,fontSize:10,color:'var(--text-muted)',letterSpacing:3}}>LOADING ENGINE STATUS...</div>;
  if(!health) return <div style={{textAlign:'center',padding:60,fontFamily:mono,fontSize:10,color:'#ff4d6d'}}>ENGINE HEALTH UNAVAILABLE</div>;
  const statusColor=health.isAlive?'#00ff9f':'#ff4d6d';
  return (
    <div style={{display:'flex',flexDirection:'column',gap:12,maxWidth:700}}>
      <div style={{background:health.isAlive?'rgba(0,255,159,0.06)':'rgba(255,77,109,0.08)',border:`1px solid ${statusColor}44`,borderRadius:10,padding:'16px 20px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:14,height:14,borderRadius:'50%',background:statusColor,boxShadow:`0 0 10px ${statusColor}`,animation:'blink 2s infinite'}}/>
          <div><div style={{fontFamily:orb,fontSize:16,fontWeight:900,color:statusColor,letterSpacing:3}}>{health.status}</div><div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',marginTop:2}}>{health.isAlive?`Last run ${health.minutesAgo} min ago`:`⚠️ No update for ${health.minutesAgo} minutes!`}</div></div>
        </div>
        <button onClick={load} style={{background:'transparent',border:'1px solid var(--border)',borderRadius:5,color:'#00b4ff',fontFamily:mono,fontSize:9,padding:'5px 12px',cursor:'pointer'}}>⟳</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
        {[{label:'LAST RUN',value:health.lastRun?formatDt(health.lastRun):'Never',color:'#00b4ff'},{label:'TOTAL PAIRS',value:health.total,color:'var(--text-primary)'},{label:'VALID PAIRS',value:health.valid,color:'#00ff9f'},{label:'STALE PAIRS',value:health.stale,color:health.stale>0?'#ffd166':'var(--text-muted)'},{label:'MINUTES AGO',value:health.minutesAgo,color:health.minutesAgo>20?'#ff4d6d':'#00ff9f'},{label:'STATUS',value:health.status,color:statusColor}].map(s=><div key={s.label} style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 14px'}}><div style={{fontFamily:mono,fontSize:8,letterSpacing:2,color:'var(--text-muted)',marginBottom:4}}>{s.label}</div><div style={{fontFamily:orb,fontSize:14,fontWeight:700,color:s.color}}>{s.value}</div></div>)}
      </div>
      {health.stale>0&&<div style={{background:'rgba(255,209,102,0.07)',border:'1px solid rgba(255,209,102,0.3)',borderRadius:8,padding:'10px 14px',fontFamily:mono,fontSize:10,color:'#ffd166'}}>⚠️ {health.stale} pair(s) stale. Check MT4 is running.</div>}
    </div>
  );
}

// ===== COT ROW =====
function CotRow({ cot }) {
  const isBull=cot.bias==='BULLISH';const color=isBull?'#00ff9f':'#ff4d6d';
  return (
    <div style={{display:'flex',alignItems:'center',gap:14,padding:'12px 16px',background:isBull?'rgba(0,255,159,0.04)':'rgba(255,77,109,0.04)',borderRadius:8,border:`1px solid ${color}22`}}>
      <div style={{fontFamily:orb,fontSize:14,fontWeight:700,color:'var(--text-primary)',minWidth:40}}>{cot.currency}</div>
      <div style={{flex:1}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}><span style={{fontFamily:mono,fontSize:10,color:'#00ff9f'}}>LONG {cot.longNonComm?.toLocaleString()}</span><span style={{fontFamily:mono,fontSize:10,color:'#ff4d6d'}}>SHORT {cot.shortNonComm?.toLocaleString()}</span></div>
        <div style={{height:7,background:'var(--border)',borderRadius:3,overflow:'hidden'}}><div style={{width:`${cot.sentimentPct}%`,height:'100%',background:`linear-gradient(90deg,${color},#00b4ff)`,borderRadius:3}}/></div>
      </div>
      <div style={{minWidth:110,textAlign:'right'}}><div style={{fontFamily:orb,fontSize:14,fontWeight:700,color}}>{isBull?'▲':'▼'} {cot.bias}</div><div style={{fontFamily:mono,fontSize:10,color:'var(--text-muted)',marginTop:2}}>NET {cot.netPos>0?'+':''}{cot.netPos?.toLocaleString()}</div>{cot.change!==undefined&&<div style={{fontFamily:mono,fontSize:9,color:cot.change>=0?'#00ff9f':'#ff4d6d',marginTop:2}}>WoW {cot.change>=0?'+':''}{cot.change?.toLocaleString()}</div>}</div>
    </div>
  );
}

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 14px',display:'flex',flexDirection:'column',gap:3,minWidth:90,flex:1}}>
      <div style={{fontFamily:mono,fontSize:9,letterSpacing:2,color:'var(--text-muted)'}}>{label}</div>
      <div style={{fontFamily:orb,fontSize:18,fontWeight:700,color,textShadow:`0 0 10px ${color}66`}}>{value}</div>
      {sub&&<div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{sub}</div>}
    </div>
  );
}

// ===== PAIR CARD =====
function PairCard({ row, trend, cotBias }) {
  const gap=row.gap??0,valid=isValid(gap),bias=biasFromGap(gap),sig=signalLabel(row.signal,row.strength),strVal=row.strength??0,sc=stateColor(row.state),t=trend||{};
  const sparkColor=t.trend1h==='STRONGER'?'#00ff9f':t.trend1h==='WEAKER'?'#ff4d6d':'var(--text-muted)';
  const momIcons={BUILDING:'🚀',EMERGING:'📈',FADING:'📉',COOLING:'🌡️',REVERSAL:'⚠️',NEUTRAL:'▬',SPARK:'⚡',STRONG:'🔥',STABLE:'▬',CONSOLIDATING:'🔵',REVERSING:'⚠️'};
  const gapTrend=(row.delta_short??0)>0.5?'STRONGER':(row.delta_short??0)<-0.5?'WEAKER':'STABLE';
  if(!valid) return (
    <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px',display:'flex',flexDirection:'column',gap:7,opacity:0.4}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><span style={{fontFamily:orb,fontSize:12,fontWeight:700,letterSpacing:2,color:'var(--border)'}}>{row.symbol}</span><span style={{fontFamily:mono,fontSize:9,color:'var(--border)',background:'var(--border)',border:'1px solid var(--border)',borderRadius:4,padding:'2px 7px'}}>WAIT</span></div>
      <div style={{display:'flex',alignItems:'baseline',gap:4}}><span style={{fontFamily:orb,fontSize:22,fontWeight:900,color:'#1e2840',lineHeight:1}}>{gap>0?'+':''}{Number(gap).toFixed(1)}</span><span style={{fontFamily:mono,fontSize:9,color:'var(--border)'}}>GAP</span></div>
    </div>
  );
  return (
    <div style={{background:'linear-gradient(160deg,var(--bg-card),var(--bg-card))',border:`1px solid ${t.closeAlert?'#ff4d6d':bias.border}`,borderRadius:10,padding:'12px 14px',display:'flex',flexDirection:'column',gap:8,position:'relative',overflow:'hidden',boxShadow:t.closeAlert?'0 0 16px rgba(255,77,109,0.2)':`0 0 12px ${bias.color}0d`,transition:'transform 0.12s'}} onMouseEnter={e=>e.currentTarget.style.transform='translateY(-2px)'} onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}>
      <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${t.closeAlert?'#ff4d6d':bias.color}88,transparent)`}}/>
      {t.closeAlert&&<div style={{background:'rgba(255,77,109,0.1)',border:'1px solid rgba(255,77,109,0.4)',borderRadius:5,padding:'4px 8px',display:'flex',alignItems:'center',gap:5}}><span>⚠️</span><span style={{fontFamily:mono,fontSize:9,color:'#ff4d6d',letterSpacing:1}}>CONSIDER CLOSING</span></div>}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><span style={{fontFamily:orb,fontSize:13,fontWeight:900,letterSpacing:2,color:'var(--text-primary)'}}>{row.symbol}</span><div style={{display:'flex',alignItems:'center',gap:5}}><span style={{fontSize:12}}>{sig.icon}</span><span style={{fontFamily:mono,fontSize:10,color:bias.color,background:bias.bg,border:`1px solid ${bias.border}`,borderRadius:4,padding:'2px 7px',fontWeight:700}}>{bias.label}</span></div></div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontFamily:orb,fontSize:26,fontWeight:900,color:bias.color,textShadow:`0 0 14px ${bias.color}99`,lineHeight:1}}>{gap>0?'+':''}{Number(gap).toFixed(1)}</span>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:1}}><TrendArrow trend={gapTrend} size={15}/><span style={{fontFamily:mono,fontSize:7,color:gapTrend==='STRONGER'?'#00ff9f':gapTrend==='WEAKER'?'#ff4d6d':'var(--text-muted)',letterSpacing:0.5}}>{gapTrend==='STRONGER'?'STR':gapTrend==='WEAKER'?'WKN':'STB'}</span></div>
        </div>
        <Sparkline data={t.history} color={sparkColor}/>
      </div>
      {(()=>{const mu=getMatchup(row);if(!mu)return null;return(<div style={{display:'flex',alignItems:'center',gap:6,marginTop:2}}><span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:1}}>MATCHUP</span><span style={{fontFamily:mono,fontSize:9,color:mu.color,background:mu.color+'12',border:`1px solid ${mu.color}30`,borderRadius:4,padding:'1px 7px',whiteSpace:'nowrap'}}>{mu.label}</span>{mu.note==='IDEAL'&&<span style={{fontFamily:mono,fontSize:7,color:mu.color,letterSpacing:1,opacity:0.8}}>IDEAL</span>}{mu.note==='AVOID'&&<span style={{fontFamily:mono,fontSize:7,color:'#ffaa44',letterSpacing:1,opacity:0.8}}>AVOID</span>}</div>);})()}{cotBias&&<div style={{display:'flex',alignItems:'center',gap:4}}><span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:1}}>COT</span><span style={{fontFamily:mono,fontSize:9,color:cotBias.bias==='BULLISH'?'#00ff9f':'#ff4d6d',background:cotBias.bias==='BULLISH'?'rgba(0,255,159,0.08)':'rgba(255,77,109,0.08)',border:`1px solid ${cotBias.bias==='BULLISH'?'#00ff9f33':'#ff4d6d33'}`,borderRadius:3,padding:'1px 5px'}}>{cotBias.bias==='BULLISH'?'▲':'▼'} {cotBias.bias}</span></div>}
      <div style={{display:'flex',flexDirection:'column',gap:3}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontFamily:mono,fontSize:10,color:t.momentumColor||'var(--text-muted)',background:(t.momentumColor||'var(--text-muted)')+'18',border:`1px solid ${(t.momentumColor||'var(--text-muted)')}30`,borderRadius:4,padding:'2px 8px',letterSpacing:1}}>{momIcons[t.momentum]||'▬'} {t.momentum||'NEUTRAL'}</span>
          {t.velocity&&t.velocity!=='STABLE'&&<span style={{fontFamily:mono,fontSize:9,color:t.velocity==='ACCELERATING'?'#00ff9f':'#ffaa44'}}>{t.velocity==='ACCELERATING'?'⚡ ACC':'↘ DEC'}</span>}
        </div>
        {(() => { const g = MOMENTUM_GUIDE[t.momentum]; return g ? (
          <div style={{display:'flex',alignItems:'center',gap:4}}>
            <span style={{fontFamily:mono,fontSize:9,color:g.color,background:g.color+'12',borderRadius:3,padding:'1px 6px',letterSpacing:0.5,fontWeight:700}}>👉 {g.action}</span>
          </div>
        ) : null; })()}
      </div>
      <div style={{display:'flex',background:'var(--bg-card)',borderRadius:6,padding:'6px 8px'}}><DeltaChip label="1H" delta={t.delta1h}/><div style={{width:1,background:'var(--border)',margin:'0 4px'}}/><DeltaChip label="4H" delta={t.delta4h}/><div style={{width:1,background:'var(--border)',margin:'0 4px'}}/><DeltaChip label="8H" delta={t.delta8h}/></div>
      <div style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:5,height:5,borderRadius:'50%',background:sc,flexShrink:0}}/><span style={{fontFamily:mono,fontSize:9,color:sc}}>{row.state||'NEUTRAL'}</span></div>
      <div style={{background:'var(--bg-card)',borderRadius:6,padding:'7px 10px',display:'flex',flexDirection:'column',gap:5}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2}}>STRENGTH</span><span style={{fontFamily:orb,fontSize:15,fontWeight:700,color:strColor(strVal),textShadow:`0 0 8px ${strColor(strVal)}66`}}>{Number(strVal).toFixed(2)}</span></div><div style={{height:4,background:'var(--border)',borderRadius:2,overflow:'hidden'}}><div style={{width:`${Math.min(100,(Math.abs(strVal)/30)*100)}%`,height:'100%',background:strColor(strVal),borderRadius:2}}/></div></div>
      <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid var(--border)',paddingTop:5}}><span style={{fontFamily:mono,fontSize:9,color:sig.color}}>{sig.icon} {sig.text}</span><span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{formatTime(row.updated_at)}</span></div>
    </div>
  );
}


// ===== VALID SETUPS TAB =====
function ValidSetupsTab({ data, trends, cotMap }) {
  const MOMENTUM_GUIDE = {
    STRONG:        { action:'RIDE IT',         color:'#ffd166' },
    BUILDING:      { action:'ENTER NOW',       color:'#00ff9f' },
    SPARK:         { action:'WATCH',           color:'#00b4ff' },
    CONSOLIDATING: { action:'HOLD',            color:'#00b4ff' },
    COOLING:       { action:'TIGHTEN SL',      color:'#ffaa44' },
    FADING:        { action:'CONSIDER CLOSING',color:'#ff4d6d' },
    REVERSING:     { action:'CLOSE POSITION',  color:'#ff4d6d' },
  };
  const mono = "'Share Tech Mono',monospace";
  const orb  = "'Orbitron',sans-serif";

  const valid = data
    .filter(r => Math.abs(r.gap ?? 0) >= 5)
    .sort((a,b) => Math.abs(b.gap??0) - Math.abs(a.gap??0));

  if (valid.length === 0) return (
    <div style={{textAlign:'center',padding:80,fontFamily:mono,fontSize:11,letterSpacing:3,color:'var(--text-muted)'}}>
      NO VALID SETUPS — WAITING FOR GAP &gt;= 5
    </div>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      <div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2,marginBottom:4}}>
        {valid.length} VALID SETUP{valid.length!==1?'S':''} · GAP &gt;= 5
      </div>
      {valid.map(row => {
        const gap = row.gap ?? 0;
        const bias = gap > 0 ? { label:'BUY', color:'#00ff9f', border:'#00ff9f33', bg:'rgba(0,255,159,0.08)' }
                              : { label:'SELL', color:'#ff4d6d', border:'#ff4d6d33', bg:'rgba(255,77,109,0.08)' };
        const t = trends[row.symbol] || {};
        const g = MOMENTUM_GUIDE[t.momentum];
        const strVal = row.strength ?? 0;
        const strC = strVal >= 2 ? '#ffd166' : strVal >= 1 ? '#00b4ff' : 'var(--text-muted)';
        const cotBias = (function() {
          const base = row.symbol?.slice(0,3), quote = row.symbol?.slice(3);
          const bc = cotMap[base], qc = cotMap[quote];
          if (!bc || !qc) return null;
          if (bc.net_position > 0 && qc.net_position < 0) return 'BULLISH';
          if (bc.net_position < 0 && qc.net_position > 0) return 'BEARISH';
          return 'NEUTRAL';
        })();

        return (
          <div key={row.symbol} style={{background:'linear-gradient(160deg,var(--bg-card),var(--bg-card))',border:`1px solid ${bias.border}`,borderRadius:10,padding:'14px 16px',display:'flex',alignItems:'center',gap:14,position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${bias.color}88,transparent)`}}/>

            {/* PAIR + BIAS */}
            <div style={{minWidth:90}}>
              <div style={{fontFamily:orb,fontSize:14,fontWeight:900,letterSpacing:2,color:'var(--text-primary)'}}>{row.symbol}</div>
              <span style={{fontFamily:mono,fontSize:10,color:bias.color,background:bias.bg,border:`1px solid ${bias.border}`,borderRadius:4,padding:'2px 8px',fontWeight:700}}>{bias.label}</span>
            </div>

            {/* GAP */}
            <div style={{minWidth:60,textAlign:'center'}}>
              <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:2}}>GAP</div>
              <div style={{fontFamily:orb,fontSize:20,fontWeight:900,color:bias.color,lineHeight:1}}>{gap>0?'+':''}{Number(gap).toFixed(1)}</div>
            </div>

            {/* MOMENTUM + ACTION */}
            <div style={{flex:1}}>
              <div style={{fontFamily:mono,fontSize:9,color:t.momentumColor||'var(--text-muted)',background:(t.momentumColor||'var(--text-muted)')+'18',border:`1px solid ${(t.momentumColor||'var(--text-muted)')}30`,borderRadius:4,padding:'2px 8px',display:'inline-block',marginBottom:4}}>{t.momentum||'NEUTRAL'}</div>
              {g && <div style={{fontFamily:mono,fontSize:10,color:g.color,fontWeight:700}}>👉 {g.action}</div>}{(()=>{const mu=getMatchup(row);if(!mu)return null;return(<div style={{fontFamily:mono,fontSize:9,color:mu.color,background:mu.color+'12',border:`1px solid ${mu.color}28`,borderRadius:4,padding:'2px 7px',display:'inline-block',marginTop:3,whiteSpace:'nowrap'}}>{mu.label}{mu.note&&<span style={{marginLeft:5,opacity:0.7,fontSize:8}}>{mu.note}</span>}</div>);})()}
            </div>

            {/* STRENGTH */}
            <div style={{minWidth:70,textAlign:'center'}}>
              <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:2,marginBottom:2}}>STRENGTH</div>
              <div style={{fontFamily:orb,fontSize:14,fontWeight:700,color:strC}}>{Number(strVal).toFixed(2)}</div>
              <div style={{height:3,background:'var(--border)',borderRadius:2,overflow:'hidden',marginTop:3}}>
                <div style={{width:`${Math.min(100,(Math.abs(strVal)/30)*100)}%`,height:'100%',background:strC,borderRadius:2}}/>
              </div>
            </div>

            {/* COT */}
            <div style={{minWidth:70,textAlign:'center'}}>
              <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:2,marginBottom:2}}>COT</div>
              {cotBias ? (
                <div style={{fontFamily:mono,fontSize:9,color:cotBias==='BULLISH'?'#00ff9f':cotBias==='BEARISH'?'#ff4d6d':'var(--text-muted)',background:cotBias==='BULLISH'?'rgba(0,255,159,0.08)':cotBias==='BEARISH'?'rgba(255,77,109,0.08)':'transparent',border:`1px solid ${cotBias==='BULLISH'?'#00ff9f33':cotBias==='BEARISH'?'#ff4d6d33':'var(--border)'}`,borderRadius:3,padding:'2px 6px'}}>
                  {cotBias==='BULLISH'?'▲':cotBias==='BEARISH'?'▼':'–'} {cotBias}
                </div>
              ) : <div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>–</div>}
            </div>

            {/* STATE */}
            <div style={{minWidth:80,textAlign:'right'}}>
              <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:2,marginBottom:2}}>STATE</div>
              <div style={{fontFamily:mono,fontSize:9,color:'var(--text-secondary)'}}>{row.state||'NEUTRAL'}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
// ===== VALID PAIRS TAB — auto-filtered tradable pairs =====
function ValidPairsTab({ data, trends, cotMap }) {
  const valid = data.filter(r => {
    const gap = r.gap ?? 0;
    if (Math.abs(gap) < 5) return false;
    const t = trends[r.symbol] || {};
    const mom = t.momentum;
    if (!['STRONG','BUILDING','SPARK'].includes(mom)) return false;
    const isBuy = gap > 0;
    const d1h = t.delta1h ?? 0;
    const d4h = t.delta4h ?? 0;
    if (isBuy  && (d1h <= 0 || d4h <= 0)) return false;
    if (!isBuy && (d1h >= 0 || d4h >= 0)) return false;
    return true;
  }).sort((a,b) => Math.abs(b.gap??0) - Math.abs(a.gap??0));

  if (valid.length === 0) return (
    <div style={{textAlign:'center',padding:80,display:'flex',flexDirection:'column',gap:12,alignItems:'center'}}>
      <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:14,color:'var(--text-muted)',letterSpacing:3}}>NO VALID PAIRS RIGHT NOW</div>
      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--text-muted)',lineHeight:1.8}}>
        Waiting for: gap &gt;= 5 + momentum BUILDING/STRONG + 1H &amp; 4H aligned
      </div>
    </div>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
        <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:11,fontWeight:700,color:'#00ff9f',letterSpacing:3}}>VALID PAIRS</span>
        <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:'var(--text-muted)'}}>{valid.length} pair{valid.length!==1?'s':''} · gap + momentum + heatmap all aligned</span>
      </div>
      {valid.map(row => {
        const gap = row.gap ?? 0;
        const bias = gap > 0 ? {label:'BUY',color:'#00ff9f',border:'#00ff9f44',bg:'rgba(0,255,159,0.08)'} : {label:'SELL',color:'#ff4d6d',border:'#ff4d6d44',bg:'rgba(255,77,109,0.08)'};
        const t = trends[row.symbol] || {};
        const momColors = {STRONG:'#00ff9f',BUILDING:'#66ffcc',SPARK:'#ffd166'};
        const mc = momColors[t.momentum] || '#ffd166';
        const base = row.symbol?.slice(0,3), quote = row.symbol?.slice(3,6);
        const bc = cotMap[base], qc = cotMap[quote];
        const cotBias = bc && qc ? (bc.bias==='BULLISH'&&qc.bias==='BEARISH'?'BULLISH':bc.bias==='BEARISH'&&qc.bias==='BULLISH'?'BEARISH':null) : null;
        const actions = {STRONG:'RIDE IT',BUILDING:'ENTER NOW',SPARK:'WATCH'};
        return (
          <div key={row.symbol} style={{background:'var(--bg-card)',border:`2px solid ${bias.border}`,borderRadius:10,padding:'14px 18px',display:'flex',alignItems:'center',gap:16,position:'relative',overflow:'hidden',boxShadow:`0 0 16px ${bias.color}15`}}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,transparent,${bias.color},transparent)`}}/>
            <div style={{minWidth:100}}>
              <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:15,fontWeight:900,letterSpacing:2,color:'var(--text-primary)'}}>{row.symbol}</div>
              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:bias.color,background:bias.bg,border:`1px solid ${bias.border}`,borderRadius:4,padding:'2px 8px',fontWeight:700}}>{bias.label}</span>
            </div>
            <div style={{minWidth:55,textAlign:'center'}}>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'var(--text-muted)',letterSpacing:2}}>GAP</div>
              <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:22,fontWeight:900,color:bias.color,lineHeight:1}}>{gap>0?'+':''}{Number(gap).toFixed(0)}</div>
            </div>
            <div style={{flex:1,display:'flex',flexDirection:'column',gap:4}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:mc,background:mc+'18',border:`1px solid ${mc}30`,borderRadius:4,padding:'2px 8px'}}>{t.momentum}</span>
                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:mc,fontWeight:700}}>👉 {actions[t.momentum]||''}</span>{(()=>{const mu=getMatchup(row);if(!mu)return null;return(<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:mu.color,background:mu.color+'12',border:`1px solid ${mu.color}28`,borderRadius:4,padding:'1px 7px',marginLeft:6,whiteSpace:'nowrap'}}>{mu.label}</span>);})()}
              </div>
              <div style={{display:'flex',gap:8}}>
                {[['1H',t.delta1h],['4H',t.delta4h],['8H',t.delta8h]].map(([l,v])=>{const val=v??0;const c=Math.abs(val)<0.1?'var(--text-muted)':val>0?'#00ff9f':'#ff4d6d';return(<div key={l} style={{display:'flex',alignItems:'center',gap:3}}><span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'var(--text-muted)'}}>{l}</span><span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:c,fontWeight:700}}>{Math.abs(val)<0.1?'±0':(val>0?'+':'')+val}</span></div>);})}
              </div>
            </div>
            <div style={{minWidth:60,textAlign:'center'}}>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'var(--text-muted)',letterSpacing:2,marginBottom:2}}>STR</div>
              <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:14,fontWeight:700,color:(row.strength??0)>=2?'#ffd166':(row.strength??0)>=1?'#00b4ff':'var(--text-muted)'}}>{Number(row.strength??0).toFixed(2)}</div>
            </div>
            {cotBias&&<div style={{minWidth:60,textAlign:'center'}}>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'var(--text-muted)',letterSpacing:2,marginBottom:2}}>COT</div>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:cotBias==='BULLISH'?'#00ff9f':'#ff4d6d',fontWeight:700}}>{cotBias==='BULLISH'?'▲':'▼'} {cotBias}</div>
            </div>}
          </div>
        );
      })}
    </div>
  );
}

// ===== SPIKE LOG TAB — full history =====
function SpikeLogTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    fetch('/api/spikes?limit=500')
      .then(r=>r.json())
      .then(d=>{ setLogs(Array.isArray(d)?d:[]); setLoading(false); })
      .catch(()=>setLoading(false));
  }, []);

  const filtered = filter==='ALL' ? logs : logs.filter(s => s.bias===filter);

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:11,fontWeight:700,color:'#ffd166',letterSpacing:3}}>SPIKE LOG</span>
        <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:'var(--text-muted)'}}>{logs.length} total signals</span>
        <div style={{display:'flex',gap:5,marginLeft:'auto'}}>
          {['ALL','BUY','SELL'].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?'rgba(255,209,102,0.12)':'transparent',border:`1px solid ${filter===f?'#ffd166':'var(--border)'}`,borderRadius:4,color:filter===f?'#ffd166':'var(--text-muted)',fontFamily:"'Share Tech Mono',monospace",fontSize:9,padding:'3px 10px',cursor:'pointer'}}>{f}</button>
          ))}
        </div>
      </div>
      {loading ? (
        <div style={{textAlign:'center',padding:40,fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--text-muted)',letterSpacing:2}}>LOADING...</div>
      ) : filtered.length === 0 ? (
        <div style={{textAlign:'center',padding:40,fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--text-muted)'}}>NO SPIKES RECORDED YET</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:4}}>
          {filtered.map((s,i) => {
            const isBuy = s.bias==='BUY' || (s.gap??0)>0;
            const color = isBuy ? '#00ff9f' : '#ff4d6d';
            const momColors = {STRONG:'#00ff9f',BUILDING:'#66ffcc',SPARK:'#ffd166',CONSOLIDATING:'#00b4ff',COOLING:'#ffaa44',FADING:'#ff7744',REVERSING:'#ff4d6d'};
            const mc = momColors[s.momentum] || '#ffd166';
            return (
              <div key={s.id||i} style={{display:'grid',gridTemplateColumns:'90px 55px 55px 100px 80px 140px 1fr 80px',alignItems:'center',gap:10,padding:'9px 12px',background:i%2===0?'var(--bg-card)':'transparent',border:'1px solid var(--border)',borderLeft:`3px solid ${color}`,borderRadius:6}}>
                <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:11,fontWeight:700,color:'var(--text-primary)'}}>{s.symbol}</span>
                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:color,fontWeight:700,background:color+'15',borderRadius:3,padding:'1px 6px',textAlign:'center'}}>{s.bias||( (s.gap??0)>0?'BUY':'SELL')}</span>
                <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:12,fontWeight:700,color,textAlign:'center'}}>{(s.gap??0)>0?'+':''}{s.gap}</span>
                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:mc}}>{s.momentum}</span><span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:(()=>{if(!s.base_score&&!s.quote_score)return'var(--text-muted)';const abs=(v)=>Math.abs(v||0);const bl=abs(s.base_score)>=4?'STRONG':abs(s.base_score)>=1?'WEAK':'NEUTRAL';const ql=abs(s.quote_score)>=4?'STRONG':abs(s.quote_score)>=1?'WEAK':'NEUTRAL';return bl==='STRONG'&&ql==='WEAK'?'#00ff9f':bl==='WEAK'&&ql==='STRONG'?'#ff4d6d':'var(--text-muted)';})()}}>{(()=>{if(!s.base_score&&!s.quote_score)return'—';const abs=(v)=>Math.abs(v||0);const bl=abs(s.base_score)>=4?'STR':abs(s.base_score)>=1?'WK':'N';const ql=abs(s.quote_score)>=4?'STR':abs(s.quote_score)>=1?'WK':'N';return bl+' vs '+ql;})()}</span>
                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:'var(--text-muted)',textAlign:'center'}}>{Number(s.strength??0).toFixed(2)}</span>
                <div style={{display:'flex',gap:8}}>
                  {[['1H',s.delta_short],['4H',s.delta_mid]].map(([l,v])=>{const val=parseFloat(v??0);const c=Math.abs(val)<0.1?'var(--text-muted)':val>0?'#00ff9f':'#ff4d6d';return(<span key={l} style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:c}}>{l}:{val>0?'+':''}{val?.toFixed(1)}</span>);})}
                </div>
                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:'var(--text-muted)',textAlign:'right'}}>{timeAgo(s.fired_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===== MAIN DASHBOARD =====
const TABS = ['PANELS','TABLE','GAP CHART','CALENDAR','CALCULATOR','COT REPORT','SETUPS','VALID PAIRS','SPIKE LOG'];
const FILTERS = ['ALL','BUY','SELL','STRONG','⚠️ CLOSE'];
const SORTS   = [
  {label:'SYMBOL A-Z',value:'symbol_asc'},
  {label:'STRENGTH ↓',value:'strength_desc'},
  {label:'GAP ↓',value:'gap_desc'},
  {label:'MOMENTUM',value:'momentum'},
  {label:'1H CHANGE',value:'delta1h'},
];

export default function Dashboard() {
  const [data,       setData]       = useState([]);
  const [trends,     setTrends]     = useState({});
  const [cotData,    setCotData]    = useState([]);
  const [spikes,     setSpikes]     = useState([]);
  const [prefs,      setPrefs]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [cotLoading, setCotLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [filter,     setFilter]     = useState('ALL');
  const [sort,       setSort]       = useState('symbol_asc');
  const [search,     setSearch]     = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tab,        setTab]        = useState('PANELS');
  const [isAdmin,    setIsAdmin]    = useState(false);
  const [user,       setUser]       = useState(null);
  const [showAlertSettings, setShowAlertSettings] = useState(false);
  const [popup,      setPopup]      = useState(null);

  const prevSpikesRef = useRef([]);
  const cotMap = {};
  cotData.forEach(c=>{ cotMap[c.currency]=c; });

  // Load preferences
  useEffect(()=>{
    fetch('/api/alert-prefs').then(r=>r.json()).then(d=>setPrefs(d)).catch(()=>{});
  },[]);

  const fetchData = useCallback(async (silent=false) => {
    if(!silent) setLoading(true); else setRefreshing(true);
    try {
      const [dr,tr] = await Promise.all([fetch('/api/data'), fetch('/api/strength-history')]);
      if(dr.status===401){window.location.href='/';return;}
      const [d,t] = await Promise.all([dr.json(),tr.json()]);
      setData(Array.isArray(d)?d:[]);
      setTrends(t&&typeof t==='object'?t:{});
      setLastUpdate(new Date());
    } catch {}
    setLoading(false); setRefreshing(false);
  },[]);

  const fetchSpikes = useCallback(async () => {
    try {
      const res = await fetch(`/api/spikes?since=${new Date(Date.now()-20*60*1000).toISOString()}&limit=10`);
      if(!res.ok) return;
      const newSpikes = await res.json();
      
      // Check for NEW spikes since last check
      const prevIds = new Set(prevSpikesRef.current.map(s=>s.id));
      const brandNew = newSpikes.filter(s => !prevIds.has(s.id));
      
      if (brandNew.length > 0 && prevSpikesRef.current.length > 0) {
        // Sound alert
        if (prefs?.sound_enabled !== false) {
          playBeep('spike');
        }
        // Browser notification
        if (prefs?.browser_notif_enabled && Notification.permission === 'granted') {
          brandNew.forEach(s => {
            new Notification(`🐼 ${s.symbol} — ${s.bias}`, {
              body: `Gap: ${s.gap > 0 ? '+' : ''}${s.gap} | ${s.momentum}`,
              icon: '/favicon.ico',
            });
          });
        }
        // Show popup
        setPopup(brandNew[0]);
        setTimeout(()=>setPopup(null), 5000);
      }
      
      prevSpikesRef.current = newSpikes;
      setSpikes(newSpikes);
    } catch {}
  },[prefs]);

  const fetchCot = useCallback(async () => {
    setCotLoading(true);
    try{const res=await fetch('/api/cot');setCotData(await res.json());}catch{}
    setCotLoading(false);
  },[]);

  useEffect(()=>{fetchData();},[fetchData]);
  useEffect(()=>{const t=setInterval(()=>fetchData(true),15000);return()=>clearInterval(t);},[fetchData]);
  useEffect(()=>{const t=setInterval(fetchSpikes,15000);fetchSpikes();return()=>clearInterval(t);},[fetchSpikes]);
  useEffect(()=>{if(tab==='COT REPORT'&&cotData.length===0) fetchCot();},[tab,cotData.length,fetchCot]);
  useEffect(()=>{fetchCot();},[fetchCot]);
  useEffect(()=>{fetch('/api/me').then(r=>r.json()).then(d=>{setUser(d);if(d.role==='admin') setIsAdmin(true);}).catch(()=>{});},[]);

  async function handleLogout(){await fetch('/api/logout',{method:'POST'});window.location.href='/';}

  function toggleHeatmap() { setPrefs(p=>({...p,heatmap_visible:!p?.heatmap_visible})); }
  function toggleSpikeBanner() { setPrefs(p=>({...p,spike_banner_visible:!p?.spike_banner_visible})); }

  const validPairs=data.filter(r=>isValid(r.gap??0));
  let displayed=filter==='ALL'?[...data]:[...validPairs];
  if(search) displayed=displayed.filter(r=>r.symbol?.toLowerCase().includes(search.toLowerCase()));
  if(filter==='BUY') displayed=displayed.filter(r=>(r.gap??0)>=5);
  if(filter==='SELL') displayed=displayed.filter(r=>(r.gap??0)<=-5);
  if(filter==='STRONG') displayed=displayed.filter(r=>r.signal==='STRONG'||r.strength>=2);
  if(filter==='⚠️ CLOSE') displayed=displayed.filter(r=>trends[r.symbol]?.closeAlert);

  if(sort==='symbol_asc') displayed.sort((a,b)=>(a.symbol||'').localeCompare(b.symbol||''));
  if(sort==='strength_desc') displayed.sort((a,b)=>(b.strength||0)-(a.strength||0));
  if(sort==='gap_desc') displayed.sort((a,b)=>Math.abs(b.gap||0)-Math.abs(a.gap||0));
  if(sort==='delta1h') displayed.sort((a,b)=>(trends[b.symbol]?.delta1h||0)-(trends[a.symbol]?.delta1h||0));
  if(sort==='momentum'){const ord={BUILDING:0,SPARK:0,STRONG:0,EMERGING:1,STABLE:2,NEUTRAL:3,CONSOLIDATING:3,COOLING:4,FADING:5,REVERSING:6};displayed.sort((a,b)=>(ord[trends[a.symbol]?.momentum]??3)-(ord[trends[b.symbol]?.momentum]??3));}

  const buyCount=validPairs.filter(r=>(r.gap??0)>=5).length;
  const sellCount=validPairs.filter(r=>(r.gap??0)<=-5).length;
  const strongCount=validPairs.filter(r=>r.signal==='STRONG'||r.strength>=2).length;
  const closeAlerts=Object.values(trends).filter(t=>t.closeAlert).length;
  const buildingCount=Object.values(trends).filter(t=>['BUILDING','STRONG','SPARK'].includes(t.momentum)).length;

  const hdr={padding:'9px 11px',fontFamily:mono,fontSize:9,letterSpacing:2,color:'var(--text-muted)',textAlign:'left',borderBottom:'1px solid var(--border)',fontWeight:400};
  const tdc={padding:'9px 11px',fontFamily:raj,fontSize:13,fontWeight:500,color:'var(--text-secondary)',verticalAlign:'middle'};

  function getPairCotBias(symbol) {
    if(!symbol||symbol.length<6) return null;
    const base=symbol.slice(0,3),quote=symbol.slice(3,6);
    const baseCot=cotMap[base],quoteCot=cotMap[quote];
    if(!baseCot&&!quoteCot) return null;
    if(baseCot&&!quoteCot) return baseCot;
    if(!baseCot&&quoteCot) return{...quoteCot,bias:quoteCot.bias==='BULLISH'?'BEARISH':'BULLISH'};
    if(baseCot.bias==='BULLISH'&&quoteCot.bias==='BEARISH') return{bias:'BULLISH'};
    if(baseCot.bias==='BEARISH'&&quoteCot.bias==='BULLISH') return{bias:'BEARISH'};
    return null;
  }

  return (
    <>
      <Head>
        <title>PANDA ENGINE — LIVE</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <style>{`@media print{body{visibility:hidden!important;}} *{-webkit-touch-callout:none;}`}</style>
      </Head>

      {/* ALERT SETTINGS MODAL */}
      {showAlertSettings && <AlertSettingsModal prefs={prefs} onClose={()=>setShowAlertSettings(false)} onSave={setPrefs} />}

      {/* POPUP NOTIFICATION */}
      {popup && (
        <div style={{position:'fixed',top:20,right:20,zIndex:3000,background:'var(--bg-card)',border:`1px solid ${popup.gap>=5?'#00ff9f':'#ff4d6d'}`,borderRadius:10,padding:'14px 18px',boxShadow:`0 0 24px ${popup.gap>=5?'rgba(0,255,159,0.3)':'rgba(255,77,109,0.3)'}`,animation:'slideIn 0.3s ease',minWidth:200}}>
          <div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2,marginBottom:4}}>⚡ NEW SPIKE</div>
          <div style={{fontFamily:orb,fontSize:16,fontWeight:900,color:popup.gap>=5?'#00ff9f':'#ff4d6d'}}>{popup.symbol}</div>
          <div style={{fontFamily:mono,fontSize:12,color:'var(--text-primary)',marginTop:2}}>Gap: {popup.gap>0?'+':''}{popup.gap} | {popup.bias}</div>
          <div style={{fontFamily:mono,fontSize:10,color:'var(--text-muted)',marginTop:2}}>{popup.momentum}</div>
          <button onClick={()=>setPopup(null)} style={{position:'absolute',top:8,right:8,background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:14}}>✕</button>
        </div>
      )}

      <div style={{minHeight:'100vh',background:'var(--bg-primary)',display:'flex',flexDirection:'column'}}>
        <div style={{position:'fixed',inset:0,backgroundImage:'linear-gradient(var(--grid-line) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,255,0.025) 1px,transparent 1px)',backgroundSize:'40px 40px',pointerEvents:'none',zIndex:0}}/>

        {/* HEADER */}
        <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 20px',background:'var(--bg-secondary)',borderBottom:'1px solid var(--border)',position:'sticky',top:0,zIndex:100}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:22}}>🐼</span>
            <div><div style={{fontFamily:orb,fontWeight:900,fontSize:13,letterSpacing:4,color:'#00ff9f'}}>PANDA ENGINE</div><div style={{fontFamily:mono,fontSize:8,letterSpacing:3,color:'var(--text-muted)'}}>FOREX INTELLIGENCE · LIVE</div></div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,flex:1,justifyContent:'center'}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:'#00ff9f',boxShadow:'0 0 8px #00ff9f',animation:'blink 2s infinite'}}/>
            <span style={{fontFamily:mono,fontSize:10,letterSpacing:2,color:'#00ff9f'}}>LIVE</span>
            <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{lastUpdate?formatTime(lastUpdate):'...'}</span>
            {refreshing&&<span style={{color:'#00b4ff',animation:'spin 1s linear infinite',display:'inline-block',fontSize:14}}>↻</span>}
            {spikes.length>0&&<div style={{display:'flex',alignItems:'center',gap:4,background:'rgba(255,209,102,0.1)',border:'1px solid rgba(255,209,102,0.3)',borderRadius:4,padding:'2px 8px'}}><span style={{width:6,height:6,borderRadius:'50%',background:'#ffd166',animation:'blink 1s infinite',display:'inline-block'}}/><span style={{fontFamily:mono,fontSize:8,color:'#ffd166',letterSpacing:1}}>{spikes.length} SPIKE{spikes.length>1?'S':''}</span></div>}
          </div>
          <div style={{display:'flex',gap:7}}>
            {/* Alert settings button */}
            <button onClick={()=>setShowAlertSettings(true)} style={{background:'rgba(255,209,102,0.06)',border:'1px solid #ffd16633',borderRadius:5,color:'#ffd166',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>🔔 ALERTS</button>
            <button onClick={()=>fetchData(true)} style={{background:'transparent',border:'1px solid #1e3060',borderRadius:5,color:'#00b4ff',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>⟳</button>
            {(isAdmin||user?.role==='vip'||user?.feature_access?.includes('journal'))&&<button onClick={()=>window.location.href='/journal'} style={{background:'rgba(255,209,102,0.06)',border:'1px solid #ffd16633',borderRadius:5,color:'#ffd166',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>📓 JOURNAL</button>}
            <button onClick={()=>window.location.href='/strength'} style={{background:'rgba(78,154,241,0.06)',border:'1px solid #4e9af133',borderRadius:5,color:'#4e9af1',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>STRENGTH</button>
            {isAdmin&&<button onClick={()=>window.location.href='/admin'} style={{background:'rgba(255,209,102,0.08)',border:'1px solid #ffd16644',borderRadius:5,color:'#ffd166',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>🛡️ ADMIN</button>}
            <button onClick={handleLogout} style={{background:'transparent',border:'1px solid #2a1525',borderRadius:5,color:'#ff4d6d',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>LOGOUT</button>
          </div>
        </header>

        {/* CLOSE ALERTS BANNER */}
        {closeAlerts>0&&(
          <div style={{background:'rgba(255,77,109,0.07)',borderBottom:'1px solid rgba(255,77,109,0.25)',padding:'7px 20px',display:'flex',alignItems:'center',gap:10,zIndex:1}}>
            <span>⚠️</span><span style={{fontFamily:mono,fontSize:10,color:'#ff4d6d',letterSpacing:2}}>{closeAlerts} POSITION{closeAlerts>1?'S':''} SHOWING REVERSAL SIGNAL</span>
            <button onClick={()=>{setFilter('⚠️ CLOSE');setTab('PANELS');}} style={{background:'rgba(255,77,109,0.12)',border:'1px solid rgba(255,77,109,0.35)',borderRadius:4,color:'#ff4d6d',fontFamily:mono,fontSize:9,padding:'2px 10px',cursor:'pointer',marginLeft:'auto'}}>VIEW →</button>
          </div>
        )}

        {/* STATS */}
        <div style={{display:'flex',gap:7,padding:'10px 20px',overflowX:'auto',zIndex:1}}>
          <StatCard label="PAIRS"       value={data.length}     color="#00b4ff"/>
          <StatCard label="📈 BUY"      value={buyCount}        color="#00ff9f"/>
          <StatCard label="📉 SELL"     value={sellCount}       color="#ff4d6d"/>
          <StatCard label="🔥 STRONG"   value={strongCount}     color="#ffd166"/>
          <StatCard label="🚀 BUILDING" value={buildingCount}   color="#00ff9f" sub="momentum"/>
          <StatCard label="⚡ SPIKES"   value={spikes.length}   color={spikes.length>0?'#ffd166':'var(--text-muted)'} sub="last 20min"/>
          <StatCard label="⚠️ ALERTS"   value={closeAlerts}     color={closeAlerts>0?'#ff4d6d':'var(--text-muted)'}/>
        </div>

        {/* SPIKE BANNER */}
        <SpikeBanner spikes={spikes} prefs={prefs} onToggle={toggleSpikeBanner}/>

        {/* HEATMAP — always visible on panels/table */}
        {['PANELS','TABLE'].includes(tab) && (
          <MomentumHeatmap data={data} visible={prefs?.heatmap_visible!==false} onToggle={toggleHeatmap}/>
        )}

        {/* TABS */}
        <div style={{display:'flex',alignItems:'center',gap:7,padding:'0 20px 10px',flexWrap:'wrap',zIndex:1}}>
          <div style={{display:'flex',background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:7,overflow:'hidden'}}>
            {TABS.map((t,i)=><button key={t} onClick={()=>setTab(t)} style={{background:tab===t?'rgba(0,180,255,0.15)':'transparent',border:'none',borderRight:i<TABS.length-1?'1px solid var(--border)':'none',color:tab===t?'#00b4ff':'var(--text-muted)',fontFamily:mono,fontSize:9,letterSpacing:2,padding:'7px 12px',cursor:'pointer',whiteSpace:'nowrap'}}>{t}</button>)}
            {isAdmin&&<button onClick={()=>setTab('ENGINE')} style={{background:tab==='ENGINE'?'rgba(255,209,102,0.15)':'transparent',border:'none',borderLeft:'1px solid var(--border)',color:tab==='ENGINE'?'#ffd166':'var(--text-muted)',fontFamily:mono,fontSize:9,letterSpacing:2,padding:'7px 12px',cursor:'pointer'}}>🏥 ENGINE</button>}
          </div>
          {['PANELS','TABLE'].includes(tab)&&(
            <>
              <div style={{display:'flex',gap:4}}>
                {FILTERS.map(f=><button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?(f==='⚠️ CLOSE'?'rgba(255,77,109,0.12)':'rgba(0,180,255,0.1)'):'transparent',border:`1px solid ${filter===f?(f==='⚠️ CLOSE'?'#ff4d6d':'#00b4ff'):'var(--border)'}`,borderRadius:5,color:filter===f?(f==='⚠️ CLOSE'?'#ff4d6d':'#00b4ff'):'var(--text-muted)',fontFamily:mono,fontSize:9,letterSpacing:1,padding:'5px 9px',cursor:'pointer'}}>{f}</button>)}
              </div>
              <input style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:5,padding:'6px 10px',color:'var(--text-primary)',fontFamily:raj,fontSize:13,flex:1,minWidth:120}} placeholder="🔍 SEARCH..." value={search} onChange={e=>setSearch(e.target.value)}/>
              <select style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:5,padding:'6px 10px',color:'var(--text-secondary)',fontFamily:mono,fontSize:9,cursor:'pointer'}} value={sort} onChange={e=>setSort(e.target.value)}>
                {SORTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </>
          )}
        </div>

        {/* CONTENT */}
        <div style={{flex:1,padding:'0 20px 20px',zIndex:1}}>
          {loading?(
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,padding:80}}>
              <div style={{width:10,height:10,borderRadius:'50%',background:'#00ff9f',animation:'dotpulse 1s ease-in-out infinite'}}/>
              <span style={{fontFamily:mono,fontSize:12,letterSpacing:3,color:'var(--text-muted)'}}>LOADING...</span>
            </div>
          ):tab==='PANELS'?(
            displayed.length===0
              ?<div style={{textAlign:'center',padding:60,fontFamily:mono,fontSize:11,letterSpacing:3,color:'var(--text-muted)'}}>NO PAIRS MATCH</div>
              :<><div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2,marginBottom:10}}>{filter==='ALL'?`${displayed.length} PAIRS · ${buyCount} BUY · ${sellCount} SELL`:`${displayed.length} PAIRS`}</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(195px,1fr))',gap:10}}>
                {displayed.map(row=><PairCard key={row.symbol} row={row} trend={trends[row.symbol]} cotBias={getPairCotBias(row.symbol)}/>)}
              </div></>
          ):tab==='SETUPS'?(<ValidSetupsTab data={data} trends={trends} cotMap={cotMap}/>
):tab==='VALID PAIRS'?(<ValidPairsTab data={data} trends={trends} cotMap={cotMap}/>
):tab==='SPIKE LOG'?(<SpikeLogTab/>
):tab==='TABLE'?(
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
                <thead><tr style={{background:'var(--bg-hover)'}}>{['#','SYMBOL','GAP','▲▼','BIAS','MOMENTUM','MATCHUP','1H','4H','8H','CHART','STATE','STR','SIG','COT','⚠️'].map(h=><th key={h} style={hdr}>{h}</th>)}</tr></thead>
                <tbody>
                  {displayed.length===0?<tr><td colSpan={15} style={{textAlign:'center',padding:40,fontFamily:mono,fontSize:10,color:'var(--text-muted)'}}>NO DATA</td></tr>
                  :displayed.map((row,idx)=>{
                    const gap=row.gap??0,valid=isValid(gap),bias=biasFromGap(gap),t=trends[row.symbol]||{},sv=row.strength??0;
                    const sc2=t.trend1h==='STRONGER'?'#00ff9f':t.trend1h==='WEAKER'?'#ff4d6d':'var(--text-muted)';
                    const gapTrend=(row.delta_short??0)>0.5?'STRONGER':(row.delta_short??0)<-0.5?'WEAKER':'STABLE';
                    const cotB=getPairCotBias(row.symbol);
                    return(
                      <tr key={row.symbol} style={{borderBottom:'1px solid var(--border)',opacity:valid?1:0.4}}>
                        <td style={{...tdc,fontFamily:mono,fontSize:9,color:'var(--text-muted)',textAlign:'center'}}>{idx+1}</td>
                        <td style={{...tdc,fontFamily:orb,fontSize:11,fontWeight:700,color:valid?'var(--text-primary)':'var(--text-muted)'}}>{row.symbol}</td>
                        <td style={{...tdc,fontFamily:mono,fontSize:12,color:bias.color,fontWeight:700}}>{gap>0?'+':''}{Number(gap).toFixed(1)}</td>
                        <td style={tdc}><TrendArrow trend={gapTrend} size={14}/></td>
                        <td style={tdc}><span style={{border:`1px solid ${bias.border}`,borderRadius:3,padding:'1px 6px',fontFamily:mono,fontSize:9,color:bias.color,background:bias.bg}}>{bias.label}</span></td>
                        <td style={{...tdc,fontFamily:mono,fontSize:9,color:t.momentumColor||'var(--text-muted)'}}>{t.momentum||'—'}</td><td style={{...tdc}}>{(()=>{const mu=getMatchup(row);if(!mu)return <span style={{color:'var(--text-muted)'}}>—</span>;return <span style={{fontFamily:mono,fontSize:9,color:mu.color,background:mu.color+'12',border:`1px solid ${mu.color}28`,borderRadius:4,padding:'1px 6px',whiteSpace:'nowrap'}}>{mu.label}</span>;})()}</td>
                        {['delta1h','delta4h','delta8h'].map(k=><td key={k} style={{...tdc,fontFamily:mono,fontSize:10,color:(t[k]||0)>0?'#00ff9f':(t[k]||0)<0?'#ff4d6d':'var(--text-muted)'}}>{t[k]!==undefined?(t[k]>0?'+':'')+t[k]:'—'}</td>)}
                        <td style={tdc}><Sparkline data={t.history||[]} color={sc2} w={55} h={18}/></td>
                        <td style={{...tdc,fontFamily:mono,fontSize:9,color:stateColor(row.state)}}>{row.state||'—'}</td>
                        <td style={tdc}><div style={{display:'flex',alignItems:'center',gap:5}}><div style={{flex:1,height:4,background:'var(--border)',borderRadius:2,overflow:'hidden',minWidth:40}}><div style={{width:`${Math.min(100,(Math.abs(sv)/30)*100)}%`,height:'100%',background:strColor(sv),borderRadius:2}}/></div><span style={{fontFamily:orb,fontSize:10,color:strColor(sv),fontWeight:700,minWidth:28}}>{Number(sv).toFixed(1)}</span></div></td>
                        <td style={tdc}>{(()=>{const s=signalLabel(row.signal,sv);return<span style={{fontFamily:mono,fontSize:9,color:s.color}}>{s.icon}</span>;})()}</td>
                        <td style={tdc}>{cotB?<span style={{fontFamily:mono,fontSize:9,color:cotB.bias==='BULLISH'?'#00ff9f':'#ff4d6d'}}>{cotB.bias==='BULLISH'?'▲':'▼'}</span>:<span style={{color:'var(--text-muted)'}}>—</span>}</td>
                        <td style={tdc}>{t.closeAlert?<span style={{fontFamily:mono,fontSize:9,color:'#ff4d6d'}}>⚠️</span>:<span style={{color:'var(--text-muted)'}}>—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ):tab==='GAP CHART'?<GapChart/>
           :tab==='CALENDAR'?<EconomicCalendar pairs={validPairs}/>
           :tab==='CALCULATOR'?<PositionCalculator/>
           :tab==='ENGINE'?<EngineHealth/>
           :tab==='COT REPORT'?(
            <div style={{maxWidth:860,margin:'0 auto'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                <div><div style={{fontFamily:orb,fontSize:15,fontWeight:700,color:'#00b4ff',letterSpacing:3}}>COT REPORT</div><div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2,marginTop:3}}>CFTC · NON-COMMERCIAL · WEEKLY</div></div>
                <button onClick={fetchCot} style={{background:'transparent',border:'1px solid #1e3060',borderRadius:5,color:'#00b4ff',fontFamily:mono,fontSize:9,padding:'5px 12px',cursor:'pointer'}}>{cotLoading?'↻ LOADING':'⟳ REFRESH'}</button>
              </div>
              {cotLoading?<div style={{textAlign:'center',padding:60,fontFamily:mono,fontSize:11,color:'var(--text-muted)'}}>FETCHING COT DATA...</div>
               :cotData.length===0?<div style={{textAlign:'center',padding:60,fontFamily:mono,fontSize:10,color:'var(--text-muted)'}}>NO DATA — Click REFRESH</div>
               :<div style={{display:'flex',flexDirection:'column',gap:8}}>{[...cotData].sort((a,b)=>b.netPos-a.netPos).map(cot=><CotRow key={cot.currency} cot={cot}/>)}</div>}
            </div>
          ):null}
        </div>

        <div style={{fontFamily:mono,fontSize:9,letterSpacing:2,color:'var(--text-muted)',textAlign:'center',padding:'8px 20px',borderTop:'1px solid var(--border)',zIndex:1}}>
          PANDA ENGINE · 15s REFRESH · {displayed.length} PAIRS{closeAlerts>0?` · ⚠️ ${closeAlerts} ALERT${closeAlerts>1?'S':''}`:''}
        </div>
      </div>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes blink{0%,100%{opacity:1;}50%{opacity:0.3;}}
        @keyframes dotpulse{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.5);opacity:0.5;}}
        @keyframes slideIn{from{transform:translateX(100px);opacity:0;}to{transform:translateX(0);opacity:1;}}
        button:hover{opacity:0.8;}
        select option{background:var(--bg-secondary);}
        input:focus,select:focus{outline:none;border-color:#00b4ff!important;}
        tr:hover td{background:rgba(0,180,255,0.02)!important;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-track{background:var(--bg-primary);}
        ::-webkit-scrollbar-thumb{background:var(--border-bright);border-radius:2px;}
      `}</style>
    </>
  );
}