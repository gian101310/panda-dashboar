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

  const top=pairs.filter(p=>p.strong).slice(0,6);
  const hero=pairs[heroIdx]||null;
  const isBuy=hero&&hero.bias==='BUY';
  const neonG='#00ffae';
  const neonR='#ff4d6d';
  const heroColor=isBuy?neonG:neonR;

  return(
    <>
    <Head>
      <title>FOREX ENGINE — Live Signals</title>
      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700;900&family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap" rel="stylesheet"/>
    </Head>
    <div style={S.root}>

      {/* ── radial glow behind hero ── */}
      <div style={{...S.heroGlow,background:hero
        ?`radial-gradient(ellipse 600px 400px at 50% 46%,${isBuy?'rgba(0,255,174,.07)':'rgba(255,77,109,.07)'},transparent 70%)`
        :'radial-gradient(ellipse 500px 350px at 50% 46%,rgba(0,180,255,.04),transparent 70%)'}}/>

      {/* ── subtle grid texture ── */}
      <div style={S.gridTexture}/>

      {/* ─── TOP BAR ─── */}
      <div style={S.topBar}>
        <div style={S.liveWrap}>
          <span style={S.liveDot}/><span style={S.liveText}>LIVE</span>
        </div>
        <div style={S.sessionWrap}>
          {SESSIONS.map(s=>{
            const active=sessions.includes(s.name);
            return <span key={s.name} style={{...S.sessionTag,...(active?S.sessionActive:S.sessionDim)}}>{s.name}</span>
          })}
          <span style={S.clock}>{clock}</span>
        </div>
      </div>

      {/* ─── HERO (center of gravity) ─── */}
      <div style={S.heroSection}>
        {hero?(
          <div key={heroIdx} style={{...S.heroCard,
            opacity:fade?1:0,transform:fade?'scale(1)':'scale(0.94)',
            borderColor:isBuy?'rgba(0,255,174,.15)':'rgba(255,77,109,.15)',
            boxShadow:`0 0 120px ${isBuy?'rgba(0,255,174,.12)':'rgba(255,77,109,.12)'}, inset 0 0 80px ${isBuy?'rgba(0,255,174,.03)':'rgba(255,77,109,.03)'}`}}>
            <div style={S.heroPair}>{hero.pair}</div>
            <div style={{...S.heroBias,color:heroColor,
              textShadow:`0 0 60px ${heroColor}88, 0 0 120px ${heroColor}33`}}>
              {hero.bias}
            </div>
            <div style={{...S.heroUnderline,background:heroColor,boxShadow:`0 0 20px ${heroColor}66`}}/>
          </div>
        ):(
          <div style={S.emptyHero}>
            <div style={S.scanPulse}/>
            <div style={S.scanTitle}>SCANNING MARKETS…</div>
            <div style={S.scanSub}>WAITING FOR HIGH-PROBABILITY SETUPS</div>
            <div style={S.ctaInline}>Join VIP — Get alerts instantly</div>
          </div>
        )}
      </div>

      {/* ─── TOP SIGNALS ROW ─── */}
      {top.length>0&&(
        <div style={S.topSection}>
          <div style={S.topLabel}>HIGH PROBABILITY</div>
          <div style={S.topRow}>
            {top.map((p,i)=>{
              const c=p.bias==='BUY'?neonG:neonR;
              return(
                <div key={p.pair} style={{...S.topCard,animationDelay:`${i*.1}s`,
                  borderColor:c+'33',
                  boxShadow:`0 0 24px ${c}11, inset 0 0 20px ${c}06`}}>
                  <div style={S.topPair}>{p.pair}</div>
                  <div style={{...S.topBias,color:c}}>{p.bias}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── FOOTER ─── */}
      <div style={S.footer}>
        <span style={S.footerMain}>LIVE FOREX SIGNALS • 24/7</span>
        <span style={S.footerDisclaim}>Educational purposes only — not financial advice</span>
      </div>

    </div>

    <style jsx global>{`
      *{margin:0;padding:0;box-sizing:border-box}
      html,body{background:#060810;overflow:hidden}
      @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
      @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
      @keyframes glowPulse{0%,100%{opacity:.7}50%{opacity:1}}
      @keyframes scanPing{0%{transform:scale(.8);opacity:.6}50%{transform:scale(1.1);opacity:.15}100%{transform:scale(.8);opacity:.6}}
    `}</style>
    </>
  );
}

/* ─── styles ─── */
const S={
  root:{
    width:'1920px',height:'1080px',position:'relative',overflow:'hidden',
    background:'linear-gradient(170deg,#060810 0%,#0a0e18 35%,#0c1020 60%,#080c16 100%)',
    display:'flex',flexDirection:'column',padding:'40px 80px',
  },
  heroGlow:{
    position:'absolute',inset:0,pointerEvents:'none',zIndex:0,
  },
  gridTexture:{
    position:'absolute',inset:0,pointerEvents:'none',zIndex:0,opacity:.03,
    backgroundImage:'linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px)',
    backgroundSize:'80px 80px',
  },

  /* top bar */
  topBar:{
    display:'flex',justifyContent:'space-between',alignItems:'center',
    height:'36px',marginBottom:'0',flexShrink:0,position:'relative',zIndex:1,
  },
  liveWrap:{display:'flex',alignItems:'center',gap:'12px'},
  liveDot:{
    width:'9px',height:'9px',borderRadius:'50%',background:'#ff4d6d',
    boxShadow:'0 0 12px rgba(255,77,109,.6)',
    animation:'pulse 1.6s ease-in-out infinite',
  },
  liveText:{fontFamily:orb,fontSize:'14px',fontWeight:700,color:'#ff4d6d',letterSpacing:'5px',
    textShadow:'0 0 20px rgba(255,77,109,.4)'},
  sessionWrap:{display:'flex',alignItems:'center',gap:'14px'},
  sessionTag:{fontFamily:mono,fontSize:'12px',padding:'5px 14px',borderRadius:'6px',letterSpacing:'1.5px',
    transition:'all .3s ease'},
  sessionActive:{background:'rgba(0,180,255,.1)',color:'#00b4ff',border:'1px solid rgba(0,180,255,.25)',
    boxShadow:'0 0 16px rgba(0,180,255,.08)'},
  sessionDim:{background:'transparent',color:'rgba(255,255,255,.15)',border:'1px solid rgba(255,255,255,.06)'},
  clock:{fontFamily:mono,fontSize:'13px',color:'rgba(255,255,255,.3)',marginLeft:'10px',letterSpacing:'2px'},

  /* hero — dominant center */
  heroSection:{
    flex:1,display:'flex',justifyContent:'center',alignItems:'center',
    position:'relative',zIndex:1,
  },
  heroCard:{
    textAlign:'center',padding:'52px 100px 44px',borderRadius:'28px',
    background:'linear-gradient(160deg,rgba(255,255,255,.025),rgba(255,255,255,.008))',
    backdropFilter:'blur(8px)',
    border:'1px solid',
    transition:'opacity .45s ease, transform .45s ease',
    animation:'glowPulse 4s ease-in-out infinite',
    position:'relative',
  },
  heroPair:{fontFamily:orb,fontSize:'120px',fontWeight:900,color:'#fff',letterSpacing:'10px',lineHeight:1},
  heroBias:{fontFamily:orb,fontSize:'72px',fontWeight:700,letterSpacing:'14px',marginTop:'4px'},
  heroUnderline:{width:'120px',height:'3px',borderRadius:'2px',margin:'16px auto 0',opacity:.6},

  /* empty state */
  emptyHero:{textAlign:'center',position:'relative'},
  scanPulse:{
    position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
    width:'200px',height:'200px',borderRadius:'50%',
    border:'1px solid rgba(0,180,255,.1)',
    animation:'scanPing 3s ease-in-out infinite',pointerEvents:'none',
  },
  scanTitle:{fontFamily:orb,fontSize:'32px',fontWeight:700,color:'rgba(255,255,255,.25)',letterSpacing:'8px'},
  scanSub:{fontFamily:raj,fontSize:'18px',color:'rgba(255,255,255,.12)',marginTop:'14px',letterSpacing:'3px'},
  ctaInline:{fontFamily:raj,fontSize:'16px',color:'#00b4ff',marginTop:'32px',letterSpacing:'2px',opacity:.4},

  /* top signals row */
  topSection:{flexShrink:0,position:'relative',zIndex:1,paddingBottom:'8px'},
  topLabel:{fontFamily:orb,fontSize:'11px',fontWeight:500,color:'rgba(255,255,255,.18)',
    letterSpacing:'6px',textAlign:'center',marginBottom:'16px'},
  topRow:{display:'flex',justifyContent:'center',gap:'20px',flexWrap:'nowrap'},
  topCard:{
    padding:'18px 36px',borderRadius:'14px',textAlign:'center',
    background:'rgba(255,255,255,.02)',border:'1px solid',
    animation:'fadeUp .5s ease both',
    minWidth:'160px',
  },
  topPair:{fontFamily:orb,fontSize:'20px',fontWeight:700,color:'rgba(255,255,255,.9)',letterSpacing:'3px'},
  topBias:{fontFamily:orb,fontSize:'17px',fontWeight:700,letterSpacing:'5px',marginTop:'4px'},

  /* footer */
  footer:{
    flexShrink:0,display:'flex',flexDirection:'column',alignItems:'center',
    gap:'6px',paddingTop:'12px',position:'relative',zIndex:1,
  },
  footerMain:{fontFamily:orb,fontSize:'11px',fontWeight:500,color:'rgba(255,255,255,.12)',letterSpacing:'6px'},
  footerDisclaim:{fontFamily:raj,fontSize:'12px',color:'rgba(255,255,255,.08)',letterSpacing:'1px'},
};
