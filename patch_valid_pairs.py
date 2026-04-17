import re

filepath = r"C:\Users\Admin\panda-dashboard\pages\dashboard.js"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Find the ValidPairsTab function boundaries
start_marker = "// ===== VALID PAIRS TAB — auto-filtered tradable pairs =====\n"
end_marker = "\n// ===== OPEN TRADES PANEL (admin only) ====="

start_idx = content.index(start_marker)
end_idx = content.index(end_marker)

old_func = content[start_idx:end_idx]
print(f"Found ValidPairsTab: {len(old_func)} chars, starts at char {start_idx}")

# Build new function
new_func = r'''// ===== VALID PAIRS TAB — ITP + PBP classification =====
function ValidPairsTab({ data, trends, cotMap, confidenceMap }) {
  // Classify pairs into ITP (Intraday Play) and PBP (Pullback Play)
  const itp = [];
  const pbp = [];
  data.forEach(r => {
    const gap = r.gap ?? 0;
    const absGap = Math.abs(gap);
    const cf = confidenceMap && confidenceMap[r.symbol];
    const conf = cf ? cf.confidence : 0;
    const biasDir = gap > 0 ? 'BUY' : gap < 0 ? 'SELL' : 'WAIT';
    if (biasDir === 'WAIT') return;
    const zone = (r.tbg_zone || '').toUpperCase();
    const tbgValid = (biasDir === 'BUY' && zone === 'ABOVE') || (biasDir === 'SELL' && zone === 'BELOW');
    if (absGap >= 9 && tbgValid && conf >= 60) {
      itp.push(r);
    } else if (absGap >= 5 && absGap <= 8 && conf >= 50) {
      pbp.push(r);
    }
  });
  const cSort = (a,b) => {
    const ca = (confidenceMap&&confidenceMap[a.symbol]||{}).confidence||0;
    const cb = (confidenceMap&&confidenceMap[b.symbol]||{}).confidence||0;
    return cb - ca;
  };
  itp.sort(cSort);
  pbp.sort(cSort);
  const total = itp.length + pbp.length;

  if (total === 0) return (
    <div style={{textAlign:'center',padding:80,display:'flex',flexDirection:'column',gap:12,alignItems:'center'}}>
      <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:14,color:'var(--text-muted)',letterSpacing:3}}>NO VALID PLAYS RIGHT NOW</div>
      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--text-muted)',lineHeight:1.8}}>
        ITP: gap ≥ 9 + TBG valid + confidence ≥ 60<br/>
        PBP: gap 5-8 + confidence ≥ 50
      </div>
    </div>
  );

  const renderCard = (row, playType) => {
    const gap = row.gap ?? 0;
    const bias = gap > 0 ? {label:'BUY',color:'#00ff9f',border:'#00ff9f44',bg:'rgba(0,255,159,0.08)'} : {label:'SELL',color:'#ff4d6d',border:'#ff4d6d44',bg:'rgba(255,77,109,0.08)'};
    const t = trends[row.symbol] || {};
    const momColors = {STRONG:'#00ff9f',BUILDING:'#66ffcc',SPARK:'#ffd166',CONSOLIDATING:'#ffaa44',COOLING:'#ff7744',FADING:'#ff4d6d'};
    const mc = momColors[t.momentum] || '#888';
    const base = row.symbol?.slice(0,3), quote = row.symbol?.slice(3,6);
    const bc = cotMap[base], qc = cotMap[quote];
    const cotBias = bc && qc ? (bc.bias==='BULLISH'&&qc.bias==='BEARISH'?'BULLISH':bc.bias==='BEARISH'&&qc.bias==='BULLISH'?'BEARISH':null) : null;
    const cf = confidenceMap&&confidenceMap[row.symbol];
    const conf = cf ? cf.confidence : 0;
    const cs = confStyle(conf);
    const playColor = playType === 'ITP' ? '#00ff9f' : '#00b4ff';
    const playBg = playType === 'ITP' ? 'rgba(0,255,159,0.08)' : 'rgba(0,180,255,0.08)';
    const playBorder = playType === 'ITP' ? 'rgba(0,255,159,0.30)' : 'rgba(0,180,255,0.30)';
    return (
      <div key={row.symbol} style={{background:'var(--bg-card)',border:`2px solid ${bias.border}`,borderRadius:10,padding:'14px 18px',display:'flex',alignItems:'center',gap:16,position:'relative',overflow:'hidden',boxShadow:`0 0 16px ${bias.color}15`}}>
        <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,transparent,${bias.color},transparent)`}}/>
        <div style={{minWidth:100}}>
          <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:15,fontWeight:900,letterSpacing:2,color:'var(--text-primary)'}}>{row.symbol}</div>
          <div style={{display:'flex',gap:4,marginTop:4}}>
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:bias.color,background:bias.bg,border:`1px solid ${bias.border}`,borderRadius:4,padding:'2px 8px',fontWeight:700}}>{bias.label}</span>
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:playColor,background:playBg,border:`1px solid ${playBorder}`,borderRadius:4,padding:'2px 6px',fontWeight:700,letterSpacing:1}}>{playType}</span>
          </div>
        </div>
        <div style={{minWidth:55,textAlign:'center'}}>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'var(--text-muted)',letterSpacing:2}}>GAP</div>
          <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:22,fontWeight:900,color:bias.color,lineHeight:1}}>{gap>0?'+':''}{Number(gap).toFixed(0)}</div>
        </div>
        <div style={{flex:1,display:'flex',flexDirection:'column',gap:4}}>
          <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
            {t.momentum&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:mc,background:mc+'18',border:`1px solid ${mc}30`,borderRadius:4,padding:'2px 8px'}}>{t.momentum}</span>}
            {(()=>{const mu=getMatchup(row);if(!mu)return null;return(<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:mu.color,background:mu.color+'12',border:`1px solid ${mu.color}28`,borderRadius:4,padding:'1px 7px',whiteSpace:'nowrap'}}>{mu.label}</span>);})()}
          </div>
          {(()=>{
            const bh4=boxTrend(row.box_h4_trend),bh1=boxTrend(row.box_h1_trend);
            const bconf=boxConfirm(row.bias,row.box_h4_trend,row.box_h1_trend);
            if(!bh4&&!bh1&&!bconf)return null;
            return(<div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap',marginTop:3}}>
              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'var(--text-muted)',letterSpacing:1}}>BOX</span>
              {bh4&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:bh4.color,background:bh4.bg,border:`1px solid ${bh4.border}`,borderRadius:3,padding:'1px 6px'}}>H4 {bh4.label}</span>}
              {bh1&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:bh1.color,background:bh1.bg,border:`1px solid ${bh1.border}`,borderRadius:3,padding:'1px 6px'}}>H1 {bh1.label}</span>}
              {bconf&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:bconf.color,background:bconf.bg,border:`1px solid ${bconf.border}`,borderRadius:4,padding:'1px 7px',fontWeight:700,marginLeft:4}}>{bconf.label}</span>}
            </div>);
          })()}
          {(()=>{ const tbg=tbgZoneBadge(row.tbg_zone,row.bias); if(!tbg)return null; return(
            <div style={{display:'flex',alignItems:'center',gap:5,marginTop:3}}>
              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'var(--text-muted)',letterSpacing:1}}>FL-ST</span>
              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:tbg.color,background:tbg.bg,border:`1px solid ${tbg.border}`,borderRadius:4,padding:'1px 8px',fontWeight:700}}>{tbg.label}</span>
              {tbg.valid&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'#00ff9f',letterSpacing:1,fontWeight:700}}>CONTINUATION ✅</span>}
              {!tbg.valid&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'#ff7744',letterSpacing:1}}>CONTINUATION ⛔</span>}
            </div>
          );})()}
          <div style={{display:'flex',gap:8}}>
            {[['1H',t.delta1h],['4H',t.delta4h],['8H',t.delta8h]].map(([l,v])=>{const val=v??0;const c=Math.abs(val)<0.1?'var(--text-muted)':val>0?'#00ff9f':'#ff4d6d';return(<div key={l} style={{display:'flex',alignItems:'center',gap:3}}><span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'var(--text-muted)'}}>{l}</span><span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:c,fontWeight:700}}>{Math.abs(val)<0.1?'±0':(val>0?'+':'')+val}</span></div>);})}
          </div>
        </div>
        <div style={{minWidth:60,textAlign:'center'}}>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'var(--text-muted)',letterSpacing:2,marginBottom:2}}>STR</div>
          <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:14,fontWeight:700,color:(row.strength??0)>=2?'#ffd166':(row.strength??0)>=1?'#00b4ff':'var(--text-muted)'}}>{Number(row.strength??0).toFixed(2)}</div>
        </div>
        {(()=>{const af=atrFill(row.atr);if(!af)return null;return(
          <div style={{minWidth:70,textAlign:'center'}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'var(--text-muted)',letterSpacing:2,marginBottom:2}}>ATR/HR</div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--text-secondary)'}}>{af.pipsPerHour}p</div>
          </div>
        );})()}
        {(()=>{const adv=advScore(row);if(!adv)return null;return(
          <div style={{minWidth:90,textAlign:'center'}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'var(--text-muted)',letterSpacing:2,marginBottom:2}}>ADV</div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:adv.color,background:adv.bg,border:`1px solid ${adv.border}`,borderRadius:4,padding:'2px 6px',fontWeight:700}}>{adv.label}</div>
          </div>
        );})()}
        {cotBias&&<div style={{minWidth:60,textAlign:'center'}}>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'var(--text-muted)',letterSpacing:2,marginBottom:2}}>COT</div>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:cotBias==='BULLISH'?'#00ff9f':'#ff4d6d',fontWeight:700}}>{cotBias==='BULLISH'?'▲':'▼'} {cotBias}</div>
        </div>}
        {cs&&<div style={{minWidth:70,textAlign:'center'}}>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'var(--text-muted)',letterSpacing:2,marginBottom:2}}>CONF</div>
          <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:16,fontWeight:900,color:cs.color,lineHeight:1}}>{conf}</div>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:cs.color,marginTop:2}}>{cs.label}</div>
        </div>}
      </div>
    );
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      {itp.length > 0 && (<>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:0}}>
          <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:12,fontWeight:900,color:'#00ff9f',letterSpacing:3,background:'rgba(0,255,159,0.08)',border:'1px solid rgba(0,255,159,0.30)',borderRadius:6,padding:'4px 14px'}}>ITP</span>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'#00ff9f',fontWeight:700}}>INTRADAY PLAY</span>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:'var(--text-muted)'}}>{itp.length} pair{itp.length!==1?'s':''} · gap ≥ 9 · TBG ✓ · conf ≥ 60</span>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {itp.map(row => renderCard(row, 'ITP'))}
        </div>
      </>)}
      {itp.length > 0 && pbp.length > 0 && <div style={{height:1,background:'var(--border)',margin:'8px 0'}}/>}
      {pbp.length > 0 && (<>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:0}}>
          <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:12,fontWeight:900,color:'#00b4ff',letterSpacing:3,background:'rgba(0,180,255,0.08)',border:'1px solid rgba(0,180,255,0.30)',borderRadius:6,padding:'4px 14px'}}>PBP</span>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'#00b4ff',fontWeight:700}}>PULLBACK PLAY</span>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:'var(--text-muted)'}}>{pbp.length} pair{pbp.length!==1?'s':''} · gap 5-8 · conf ≥ 50</span>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {pbp.map(row => renderCard(row, 'PBP'))}
        </div>
      </>)}
    </div>
  );
}
'''

content = content[:start_idx] + new_func + content[end_idx:]

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("✅ ValidPairsTab replaced successfully")
# Count lines
line_count = content.count('\n') + 1
print(f"dashboard.js is now {line_count} lines")
