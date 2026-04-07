import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';

/* ─── constants ─── */
const mono = "'Share Tech Mono',monospace";
const orb  = "'Orbitron',sans-serif";
const raj  = "'Rajdhani',sans-serif";

const SESSIONS = [
  { name:'SYDNEY',  start:22, end:7  },
  { name:'TOKYO',   start:0,  end:9  },
  { name:'LONDON',  start:7,  end:16 },
  { name:'NEW YORK',start:12, end:21 },
];

function activeSessions(){
  const h = new Date().getUTCHours();
  return SESSIONS.filter(s=>{
    if(s.start<s.end) return h>=s.start&&h<s.end;
    return h>=s.start||h<s.end;
  }).map(s=>s.name);
}

function utcTime(){
  const d=new Date();
  return d.toISOString().slice(11,19)+' UTC';
}

/* ─── page ─── */
export default function StreamPage(){
  const [pairs,setPairs]=useState([]);
  const [heroIdx,setHeroIdx]=useState(0);
  const [fade,setFade]=useState(true);
  const [clock,setClock]=useState(utcTime());
  const [sessions,setSessions]=useState(activeSessions());
  const heroRef=useRef(0);

  /* fetch /api/data every 30s */
  const fetchData=useCallback(async()=>{
    try{
      const r=await fetch('/api/data');
      const json=await r.json();
      const rows=Array.isArray(json)?json:(json.data||[]);
      const valid=rows.filter(p=>{
        const g=parseFloat(p.gap)||0;
        return g>=5||g<=-5;
      }).map(p=>{
        const g=parseFloat(p.gap)||0;
        return {pair:p.symbol, bias:g>=5?'BUY':'SELL', strong:Math.abs(g)>=8, gap:g};
      }).sort((a,b)=>Math.abs(b.gap)-Math.abs(a.gap));
      setPairs(valid);
    }catch(e){console.error(e)}
  },[]);

  useEffect(()=>{fetchData();const i=setInterval(fetchData,30000);return()=>clearInterval(i)},[fetchData]);

  /* hero rotation */
  useEffect(()=>{
    if(!pairs.length)return;
    const i=setInterval(()=>{
      setFade(false);
      setTimeout(()=>{
        heroRef.current=(heroRef.current+1)%pairs.length;
        setHeroIdx(heroRef.current);
        setFade(true);
      },400);
    },3000);
    return()=>clearInterval(i);
  },[pairs]);

  /* clock */
  useEffect(()=>{
    const i=setInterval(()=>{setClock(utcTime());setSessions(activeSessions())},1000);
    return()=>clearInterval(i);
  },[]);

  const top=pairs.filter(p=>p.strong);
  const hero=pairs[heroIdx]||null;

  return(
    <>
    <Head>
      <title>FOREX ENGINE — Live Signals</title>
      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap" rel="stylesheet"/>
    </Head>
    <div style={S.root}>

      {/* watermark */}
      <div style={S.watermark}>FOREX ENGINE</div>

      {/* ─── TOP BAR ─── */}
      <div style={S.topBar}>
        <div style={S.liveWrap}>
          <span style={S.liveDot}/>
          <span style={S.liveText}>LIVE</span>
        </div>
        <div style={S.sessionWrap}>
          {SESSIONS.map(s=>{
            const active=sessions.includes(s.name);
            return <span key={s.name} style={{...S.sessionTag,...(active?S.sessionActive:S.sessionDim)}}>{s.name}</span>
          })}
          <span style={S.clock}>{clock}</span>
        </div>
      </div>

      {/* ─── HERO ─── */}
      <div style={S.heroSection}>
        {hero?(
          <div key={heroIdx} style={{...S.heroCard,opacity:fade?1:0,transform:fade?'scale(1)':'scale(0.92)',
            boxShadow:hero.bias==='BUY'?'0 0 80px rgba(0,255,159,.25), 0 0 160px rgba(0,255,159,.08)':'0 0 80px rgba(255,77,109,.25), 0 0 160px rgba(255,77,109,.08)'}}>
            <div style={S.heroPair}>{hero.pair}</div>
            <div style={{...S.heroBias,color:hero.bias==='BUY'?'#00ff9f':'#ff4d6d',
              textShadow:hero.bias==='BUY'?'0 0 40px rgba(0,255,159,.6)':'0 0 40px rgba(255,77,109,.6)'}}>{hero.bias}</div>
          </div>
        ):(
          <div style={S.emptyHero}>
            <div style={S.scanTitle}>SCANNING MARKETS…</div>
            <div style={S.scanSub}>WAITING FOR HIGH-PROBABILITY SETUPS</div>
            <div style={S.ctaInline}>Join VIP — Get alerts instantly</div>
          </div>
        )}
      </div>

      {/* ─── TOP SIGNALS ─── */}
      {top.length>0&&(
        <div style={S.section}>
          <div style={S.sectionTitle}>TOP SIGNALS — HIGH PROBABILITY</div>
          <div style={S.topGrid}>
            {top.map((p,i)=>(
              <div key={p.pair} style={{...S.topCard,animationDelay:`${i*.12}s`,
                borderColor:p.bias==='BUY'?'rgba(0,255,159,.35)':'rgba(255,77,109,.35)',
                boxShadow:p.bias==='BUY'?'0 0 30px rgba(0,255,159,.12)':'0 0 30px rgba(255,77,109,.12)'}}>
                <div style={S.topPair}>{p.pair}</div>
                <div style={{...S.topBias,color:p.bias==='BUY'?'#00ff9f':'#ff4d6d'}}>{p.bias}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── ALL SIGNALS GRID ─── */}
      {pairs.length>0&&(
        <div style={S.section}>
          <div style={S.sectionTitle}>ALL VALID SIGNALS</div>
          <div style={S.allGrid}>
            {pairs.map((p,i)=>(
              <div key={p.pair} style={{...S.gridCard,animationDelay:`${i*.07}s`,
                borderColor:p.bias==='BUY'?'rgba(0,255,159,.2)':'rgba(255,77,109,.2)'}}>
                <div style={S.gridPair}>{p.pair}</div>
                <div style={{...S.gridBias,color:p.bias==='BUY'?'#00ff9f':'#ff4d6d'}}>{p.bias}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── BOTTOM BAR ─── */}
      <div style={S.bottomBar}>
        <span style={S.disclaimer}>Educational purposes only — not financial advice</span>
        <span style={S.ctaBottom}>Join VIP — Link in Description</span>
      </div>

    </div>

    <style jsx global>{`
      *{margin:0;padding:0;box-sizing:border-box}
      html,body{background:#0a0c10;overflow-x:hidden}
      @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
      @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
      @keyframes softGlow{0%,100%{filter:brightness(1)}50%{filter:brightness(1.12)}}
    `}</style>
    </>
  );
}

/* ─── styles ─── */
const S={
  root:{
    width:'1920px',height:'1080px',position:'relative',overflow:'hidden',
    background:'linear-gradient(160deg,#0a0c10 0%,#0f1218 40%,#111520 100%)',
    display:'flex',flexDirection:'column',padding:'32px 64px',
  },
  watermark:{
    position:'absolute',bottom:'80px',right:'64px',
    fontFamily:"'Orbitron',sans-serif",fontSize:'14px',fontWeight:700,letterSpacing:'6px',
    color:'rgba(255,255,255,.04)',userSelect:'none',pointerEvents:'none',
  },
  topBar:{
    display:'flex',justifyContent:'space-between',alignItems:'center',
    height:'40px',marginBottom:'24px',flexShrink:0,
  },
  liveWrap:{display:'flex',alignItems:'center',gap:'10px'},
  liveDot:{
    width:'10px',height:'10px',borderRadius:'50%',background:'#ff4d6d',
    animation:'pulse 1.4s ease-in-out infinite',
  },
  liveText:{fontFamily:"'Orbitron',sans-serif",fontSize:'16px',fontWeight:700,color:'#ff4d6d',letterSpacing:'4px'},
  sessionWrap:{display:'flex',alignItems:'center',gap:'12px'},
  sessionTag:{fontFamily:"'Share Tech Mono',monospace",fontSize:'13px',padding:'4px 12px',borderRadius:'4px',letterSpacing:'1px'},
  sessionActive:{background:'rgba(0,180,255,.15)',color:'#00b4ff',border:'1px solid rgba(0,180,255,.3)'},
  sessionDim:{background:'rgba(255,255,255,.03)',color:'rgba(255,255,255,.2)',border:'1px solid rgba(255,255,255,.06)'},
  clock:{fontFamily:"'Share Tech Mono',monospace",fontSize:'14px',color:'rgba(255,255,255,.4)',marginLeft:'8px'},
  heroSection:{
    flex:'0 0 auto',display:'flex',justifyContent:'center',alignItems:'center',
    minHeight:'320px',marginBottom:'28px',
  },
  heroCard:{
    textAlign:'center',padding:'48px 80px',borderRadius:'20px',
    background:'rgba(255,255,255,.02)',backdropFilter:'blur(4px)',
    border:'1px solid rgba(255,255,255,.06)',
    transition:'opacity .4s ease, transform .4s ease',
  },
  heroPair:{fontFamily:"'Orbitron',sans-serif",fontSize:'72px',fontWeight:900,color:'#fff',letterSpacing:'6px',lineHeight:1.1},
  heroBias:{fontFamily:"'Orbitron',sans-serif",fontSize:'56px',fontWeight:700,letterSpacing:'10px',marginTop:'8px'},
  emptyHero:{textAlign:'center'},
  scanTitle:{fontFamily:"'Orbitron',sans-serif",fontSize:'28px',fontWeight:700,color:'rgba(255,255,255,.35)',letterSpacing:'6px'},
  scanSub:{fontFamily:"'Rajdhani',sans-serif",fontSize:'18px',color:'rgba(255,255,255,.18)',marginTop:'12px',letterSpacing:'2px'},
  ctaInline:{fontFamily:"'Rajdhani',sans-serif",fontSize:'16px',color:'#00b4ff',marginTop:'24px',letterSpacing:'1px',opacity:.6},
  section:{marginBottom:'24px',flexShrink:0},
  sectionTitle:{fontFamily:"'Orbitron',sans-serif",fontSize:'14px',fontWeight:700,color:'rgba(255,255,255,.3)',letterSpacing:'5px',marginBottom:'14px'},
  topGrid:{display:'flex',gap:'16px',flexWrap:'wrap'},
  topCard:{
    padding:'20px 32px',borderRadius:'12px',textAlign:'center',
    background:'rgba(255,255,255,.03)',border:'1px solid',
    animation:'fadeUp .5s ease both, softGlow 3s ease-in-out infinite',
    minWidth:'180px',
  },
  topPair:{fontFamily:"'Orbitron',sans-serif",fontSize:'22px',fontWeight:700,color:'#fff',letterSpacing:'3px'},
  topBias:{fontFamily:"'Orbitron',sans-serif",fontSize:'20px',fontWeight:700,letterSpacing:'4px',marginTop:'4px'},
  allGrid:{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'12px'},
  gridCard:{
    padding:'14px 20px',borderRadius:'10px',textAlign:'center',
    background:'rgba(255,255,255,.02)',border:'1px solid',
    animation:'fadeUp .4s ease both',
  },
  gridPair:{fontFamily:"'Share Tech Mono',monospace",fontSize:'17px',fontWeight:400,color:'rgba(255,255,255,.85)',letterSpacing:'2px'},
  gridBias:{fontFamily:"'Orbitron',sans-serif",fontSize:'16px',fontWeight:700,letterSpacing:'3px',marginTop:'2px'},
  bottomBar:{
    marginTop:'auto',display:'flex',justifyContent:'space-between',alignItems:'center',
    paddingTop:'16px',borderTop:'1px solid rgba(255,255,255,.05)',flexShrink:0,
  },
  disclaimer:{fontFamily:"'Rajdhani',sans-serif",fontSize:'13px',color:'rgba(255,255,255,.15)',letterSpacing:'1px'},
  ctaBottom:{fontFamily:"'Orbitron',sans-serif",fontSize:'13px',color:'#00b4ff',letterSpacing:'3px',opacity:.5},
};
