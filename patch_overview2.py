import re

with open(r'pages\dashboard.js', 'r', encoding='utf-8') as f:
    content = f.read()

OLD = """          {lastUpdate&&<span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{formatTime(lastUpdate)}</span>}
        </div>
      </div>

    </div>
  );
}

const TABS"""

NEW = r"""          {lastUpdate&&<span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{formatTime(lastUpdate)}</span>}
        </div>
      </div>

      {/* ROW 2 — QUICK STATS */}
      <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(3,1fr)':'repeat(6,1fr)',gap:isMobile?6:10}}>
        {[
          {label:'VALID',value:validPairs.length,color:'#00b4ff',icon:'📊'},
          {label:'BUY',value:buyC,color:'#00ff9f',icon:'📈'},
          {label:'SELL',value:sellC,color:'#ff4d6d',icon:'📉'},
          {label:'BUILDING',value:momBuild,color:'#66ffcc',icon:'🔥'},
          {label:'SPIKES',value:spikeC,color:spikeC>0?'#ffd166':'#3a4568',icon:'⚡'},
          {label:'ALERTS',value:closeAlertC,color:closeAlertC>0?'#ff4d6d':'#3a4568',icon:'⚠️'},
        ].map(s=>(
          <div key={s.label} style={{padding:isMobile?'8px 6px':'10px 14px',background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:10,textAlign:'center'}}>
            <div style={{fontSize:isMobile?14:16,marginBottom:2}}>{s.icon}</div>
            <div style={{fontFamily:orb,fontSize:isMobile?16:20,fontWeight:700,color:s.color}}>{s.value}</div>
            <div style={{fontFamily:mono,fontSize:7,color:'var(--text-muted)',letterSpacing:2,marginTop:2}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ROW 3 — AI BRIEFING + CURRENCY FLOW */}
      <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?14:20}}>

        {/* AI BRIEFING */}
        <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:12,padding:isMobile?14:18,display:'flex',flexDirection:'column',gap:12}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:16}}>🧠</span>
              <span style={{fontFamily:orb,fontSize:11,color:'#7C3AED',letterSpacing:2,fontWeight:700}}>AI BRIEFING</span>
            </div>
            <button onClick={()=>{aiFetched.current=false;fetchAI();}} style={{background:'rgba(124,58,237,0.1)',border:'1px solid rgba(124,58,237,0.3)',borderRadius:6,padding:'3px 10px',fontFamily:mono,fontSize:8,color:'#7C3AED',cursor:'pointer',letterSpacing:1}}>REFRESH</button>
          </div>
          {aiLoading?(
            <div style={{display:'flex',alignItems:'center',gap:8,padding:20,justifyContent:'center'}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:'#7C3AED',animation:'dotpulse 1s ease-in-out infinite'}}/>
              <span style={{fontFamily:mono,fontSize:10,color:'var(--text-muted)',letterSpacing:2}}>ANALYZING...</span>
            </div>
          ):aiError?(
            <div style={{padding:12,background:'rgba(255,77,109,0.06)',borderRadius:8,fontFamily:raj,fontSize:13,color:'#ff4d6d'}}>{aiError}</div>
          ):aiSections?(
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {aiSections.summary&&<div style={{fontFamily:raj,fontSize:14,color:'var(--text-primary)',lineHeight:1.5}}>{aiSections.summary}</div>}
              {aiSections.opportunity&&<div style={{padding:'8px 12px',background:'rgba(0,255,159,0.06)',border:'1px solid rgba(0,255,159,0.15)',borderRadius:8}}>
                <div style={{fontFamily:mono,fontSize:8,color:'#00ff9f',letterSpacing:2,marginBottom:4,fontWeight:700}}>OPPORTUNITIES</div>
                <div style={{fontFamily:raj,fontSize:13,color:'rgba(0,255,159,0.85)',lineHeight:1.4}}>{aiSections.opportunity}</div>
              </div>}
              {aiSections.risk&&<div style={{padding:'8px 12px',background:'rgba(255,77,109,0.06)',border:'1px solid rgba(255,77,109,0.15)',borderRadius:8}}>
                <div style={{fontFamily:mono,fontSize:8,color:'#ff4d6d',letterSpacing:2,marginBottom:4,fontWeight:700}}>RISKS</div>
                <div style={{fontFamily:raj,fontSize:13,color:'rgba(255,77,109,0.85)',lineHeight:1.4}}>{aiSections.risk}</div>
              </div>}
            </div>
          ):<div style={{fontFamily:mono,fontSize:10,color:'var(--text-muted)',textAlign:'center',padding:20}}>No data</div>}
        </div>

        {/* CURRENCY FLOW */}
        <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:12,padding:isMobile?14:18,display:'flex',flexDirection:'column',gap:10}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:16}}>💱</span>
            <span style={{fontFamily:orb,fontSize:11,color:'#00b4ff',letterSpacing:2,fontWeight:700}}>CURRENCY FLOW</span>
          </div>
          {currStr.map((c,i)=>{
            const pct=Math.min(Math.abs(c.strength)/4*100,100);
            const clr=c.strength>0?'#00ff9f':'#ff4d6d';
            const flowClr=c.flow==='STRONG'?'#00ff9f':c.flow==='RISING'?'#66ffcc':c.flow==='WEAK'?'#ff4d6d':c.flow==='FALLING'?'#ff7744':'#3a4568';
            return <div key={c.currency} style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontFamily:orb,fontSize:12,fontWeight:700,color:i===0?'#00ff9f':i===currStr.length-1?'#ff4d6d':'var(--text-primary)',width:32}}>{c.currency}</span>
              <div style={{flex:1,height:6,background:'rgba(255,255,255,0.04)',borderRadius:3,overflow:'hidden',position:'relative'}}>
                <div style={{position:'absolute',left:c.strength>=0?'50%':'auto',right:c.strength<0?'50%':'auto',width:`${pct/2}%`,height:'100%',background:clr,borderRadius:3,boxShadow:`0 0 6px ${clr}40`,transition:'width 0.5s'}}/>
                <div style={{position:'absolute',left:'50%',top:0,width:1,height:'100%',background:'rgba(255,255,255,0.1)'}}/>
              </div>
              <span style={{fontFamily:mono,fontSize:9,color:clr,fontWeight:700,width:36,textAlign:'right'}}>{c.strength>0?'+':''}{c.strength.toFixed(1)}</span>
              <span style={{fontFamily:mono,fontSize:7,color:flowClr,letterSpacing:1,width:50,textAlign:'right'}}>{c.flow}</span>
            </div>;
          })}
          {/* Exposure */}
          {exposure.some(e=>e.abs>=2)&&<div style={{marginTop:4,padding:'6px 10px',background:'rgba(255,209,102,0.06)',border:'1px solid rgba(255,209,102,0.15)',borderRadius:6}}>
            <div style={{fontFamily:mono,fontSize:7,color:'#ffd166',letterSpacing:2,marginBottom:4}}>EXPOSURE WARNING</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {exposure.filter(e=>e.abs>=2).map(e=>(
                <span key={e.currency} style={{fontFamily:mono,fontSize:9,color:e.exposure>0?'#00ff9f':'#ff4d6d',background:e.exposure>0?'rgba(0,255,159,0.08)':'rgba(255,77,109,0.08)',border:`1px solid ${e.exposure>0?'rgba(0,255,159,0.2)':'rgba(255,77,109,0.2)'}`,borderRadius:4,padding:'2px 6px'}}>{e.currency} {e.exposure>0?'+':''}{e.exposure}</span>
              ))}
            </div>
          </div>}
        </div>
      </div>

      {/* ROW 4 — MOMENTUM DISTRIBUTION */}
      <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:12,padding:isMobile?'10px 14px':'12px 18px'}}>
        <div style={{fontFamily:orb,fontSize:10,color:'var(--text-muted)',letterSpacing:2,marginBottom:10}}>MOMENTUM DISTRIBUTION</div>
        <div style={{display:'flex',gap:3,height:28,borderRadius:6,overflow:'hidden'}}>
          {momStates.filter(s=>momCounts[s]>0).map(s=>{
            const pct=(momCounts[s]/21)*100;
            return <div key={s} title={`${s}: ${momCounts[s]}`} style={{width:`${pct}%`,background:momColors[s]||'#3a4568',display:'flex',alignItems:'center',justifyContent:'center',transition:'width 0.5s',minWidth:momCounts[s]>0?16:0,cursor:'default'}}>
              <span style={{fontFamily:mono,fontSize:7,color:'#0a0e17',fontWeight:700,whiteSpace:'nowrap'}}>{momCounts[s]}</span>
            </div>;
          })}
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>
          {momStates.filter(s=>momCounts[s]>0).map(s=>(
            <div key={s} style={{display:'flex',alignItems:'center',gap:4}}>
              <div style={{width:6,height:6,borderRadius:2,background:momColors[s]}}/>
              <span style={{fontFamily:mono,fontSize:7,color:'var(--text-muted)',letterSpacing:1}}>{s} ({momCounts[s]})</span>
            </div>
          ))}
        </div>
      </div>

      {/* ROW 5 — TOP SIGNALS */}
      {highTier.length>0&&<div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:12,padding:isMobile?14:18}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
          <span style={{fontSize:14}}>🎯</span>
          <span style={{fontFamily:orb,fontSize:10,color:'#00ff9f',letterSpacing:2,fontWeight:700}}>HIGH CONVICTION</span>
          <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>({highTier.length})</span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(auto-fill,minmax(200px,1fr))',gap:8}}>
          {highTier.slice(0,6).map(row=>{
            const gap=row.gap??0;const bias=biasFromGap(gap);const cf=confidenceMap[row.symbol];const conf=cf?.confidence||0;const cs=confStyle(conf);
            const edge=cf?.historical?.flag;const mom=trends[row.symbol]?.momentum||'';const tags=getTags(row);
            return <div key={row.symbol} onClick={()=>onSelectPair(row)} style={{padding:'10px 14px',background:'rgba(0,255,159,0.03)',border:'1px solid rgba(0,255,159,0.12)',borderRadius:10,cursor:'pointer',transition:'all 0.2s',display:'flex',flexDirection:'column',gap:6}} onMouseOver={e=>e.currentTarget.style.borderColor='rgba(0,255,159,0.35)'} onMouseOut={e=>e.currentTarget.style.borderColor='rgba(0,255,159,0.12)'}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontFamily:orb,fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{row.symbol}</span>
                <span style={{fontFamily:mono,fontSize:11,color:bias.color,fontWeight:700}}>{gap>0?'+':''}{Number(gap).toFixed(1)}</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                <span style={{fontFamily:mono,fontSize:9,color:bias.color,background:bias.bg,border:`1px solid ${bias.border}`,borderRadius:3,padding:'1px 6px'}}>{bias.label}</span>
                <span style={{fontFamily:mono,fontSize:9,color:cs.color,background:cs.bg,border:`1px solid ${cs.border}`,borderRadius:3,padding:'1px 6px'}}>{conf}</span>
                <span style={{fontFamily:mono,fontSize:8,color:momColors[mom]||'#3a4568',letterSpacing:1}}>{mom}</span>
              </div>
              {tags.length>0&&<div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {tags.map(t=><span key={t.label} style={{fontFamily:mono,fontSize:7,color:t.color,background:t.bg,borderRadius:3,padding:'1px 5px',letterSpacing:1}}>{t.label}</span>)}
              </div>}
            </div>;
          })}
        </div>
      </div>}

      {/* ROW 5B — MID TIER (collapsed) */}
      {midTier.length>0&&<div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:12,padding:isMobile?14:18}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
          <span style={{fontSize:14}}>📋</span>
          <span style={{fontFamily:orb,fontSize:10,color:'#ffd166',letterSpacing:2,fontWeight:700}}>MID CONVICTION</span>
          <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>({midTier.length})</span>
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {midTier.slice(0,12).map(row=>{
            const gap=row.gap??0;const bias=biasFromGap(gap);
            return <div key={row.symbol} onClick={()=>onSelectPair(row)} style={{padding:'6px 12px',background:'rgba(255,209,102,0.04)',border:'1px solid rgba(255,209,102,0.12)',borderRadius:8,cursor:'pointer',display:'flex',alignItems:'center',gap:8,transition:'all 0.2s'}} onMouseOver={e=>e.currentTarget.style.borderColor='rgba(255,209,102,0.35)'} onMouseOut={e=>e.currentTarget.style.borderColor='rgba(255,209,102,0.12)'}>
              <span style={{fontFamily:orb,fontSize:11,fontWeight:700,color:'var(--text-primary)'}}>{row.symbol}</span>
              <span style={{fontFamily:mono,fontSize:10,color:bias.color,fontWeight:700}}>{gap>0?'+':''}{Number(gap).toFixed(1)}</span>
              <span style={{fontFamily:mono,fontSize:8,color:bias.color,background:bias.bg,border:`1px solid ${bias.border}`,borderRadius:3,padding:'0px 5px'}}>{bias.label}</span>
            </div>;
          })}
        </div>
      </div>}

      {/* ROW 6 — ACTIVE TRACKERS */}
      {trackers.length>0&&<div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:12,padding:isMobile?14:18}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
          <span style={{fontSize:14}}>📡</span>
          <span style={{fontFamily:orb,fontSize:10,color:'#00b4ff',letterSpacing:2,fontWeight:700}}>ACTIVE TRACKERS</span>
          <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>({trackers.length})</span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(auto-fill,minmax(180px,1fr))',gap:8}}>
          {trackers.slice(0,8).map(tk=>{
            const bias=tk.direction==='BUY'?{color:'#00ff9f',bg:'rgba(0,255,159,0.08)'}:{color:'#ff4d6d',bg:'rgba(255,77,109,0.08)'};
            const age=tk.opened_at?Math.round((Date.now()-new Date(tk.opened_at).getTime())/3600000):0;
            return <div key={tk.id||tk.symbol} style={{padding:'8px 12px',background:bias.bg,border:`1px solid ${bias.color}20`,borderRadius:8}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                <span style={{fontFamily:orb,fontSize:12,fontWeight:700,color:'var(--text-primary)'}}>{tk.symbol}</span>
                <span style={{fontFamily:mono,fontSize:9,color:bias.color,fontWeight:700}}>{tk.direction}</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>Gap: {Number(tk.gap_at_open||0).toFixed(1)}</span>
                <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>Peak: {Number(tk.peak_gap||0).toFixed(1)}</span>
                {age>0&&<span style={{fontFamily:mono,fontSize:8,color:'#00b4ff'}}>{age}h</span>}
              </div>
            </div>;
          })}
        </div>
      </div>}

      {/* ROW 7 — STRONGEST SIGNAL HIGHLIGHT */}
      {strongest&&Math.abs(strongest.gap??0)>=5&&<div style={{padding:isMobile?'10px 14px':'12px 20px',background:'linear-gradient(135deg,rgba(0,180,255,0.06),rgba(124,58,237,0.06))',border:'1px solid rgba(0,180,255,0.15)',borderRadius:12,display:'flex',alignItems:isMobile?'flex-start':'center',gap:isMobile?10:20,flexDirection:isMobile?'column':'row',cursor:'pointer'}} onClick={()=>onSelectPair(strongest)}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:18}}>👑</span>
          <div>
            <div style={{fontFamily:mono,fontSize:7,color:'var(--text-muted)',letterSpacing:2}}>STRONGEST SIGNAL</div>
            <div style={{fontFamily:orb,fontSize:16,fontWeight:700,color:'var(--text-primary)'}}>{strongest.symbol}</div>
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <span style={{fontFamily:mono,fontSize:13,color:biasFromGap(strongest.gap??0).color,fontWeight:700}}>{(strongest.gap??0)>0?'+':''}{Number(strongest.gap??0).toFixed(1)} GAP</span>
          <span style={{fontFamily:mono,fontSize:10,color:biasFromGap(strongest.gap??0).color,background:biasFromGap(strongest.gap??0).bg,border:`1px solid ${biasFromGap(strongest.gap??0).border}`,borderRadius:4,padding:'2px 8px'}}>{biasFromGap(strongest.gap??0).label}</span>
          {confidenceMap[strongest.symbol]&&<span style={{fontFamily:mono,fontSize:10,color:confStyle(confidenceMap[strongest.symbol].confidence).color,background:confStyle(confidenceMap[strongest.symbol].confidence).bg,border:`1px solid ${confStyle(confidenceMap[strongest.symbol].confidence).border}`,borderRadius:4,padding:'2px 8px'}}>CONF {confidenceMap[strongest.symbol].confidence}</span>}
          <span style={{fontFamily:mono,fontSize:9,color:momColors[trends[strongest.symbol]?.momentum]||'#3a4568',letterSpacing:1}}>{trends[strongest.symbol]?.momentum||''}</span>
        </div>
      </div>}

    </div>
  );
}

const TABS"""

count = content.count(OLD)
if count != 1:
    print(f"ERROR: Found {count} matches for old string!")
    exit(1)

content = content.replace(OLD, NEW)

with open(r'pages\dashboard.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Done! Replaced closing with full component body.")
print(f"Total lines: {content.count(chr(10))+1}")
