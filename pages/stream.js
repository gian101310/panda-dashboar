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

function nearbyLevel(row){
  const price=Number(row.pl_price);
  if(!Number.isFinite(price)||price<=0)return null;
  const pip=row.symbol?.includes('JPY')?.01:.0001;
  const support=[],resistance=[];
  for(const [name,raw] of [['PDH',row.pdh],['PDL',row.pdl],['PWH',row.pwh],['PWL',row.pwl]]){
    if(raw==null||raw==='')continue;
    const level=Number(raw);
    if(!Number.isFinite(level)||level<=0)continue;
    const distance=Math.abs(level-price)/pip;
    if(distance>30)continue;
    if(level<=price)support.push({name,distance});
    if(level>=price)resistance.push({name,distance});
  }
  support.sort((a,b)=>a.distance-b.distance);
  resistance.sort((a,b)=>a.distance-b.distance);
  if(support.length&&resistance.length)return 'BETWEEN SUPPORT & RESISTANCE';
  const levels=support.length?support:resistance;
  if(!levels.length)return null;
  const stack=levels.length>1&&levels[1].distance-levels[0].distance<=10;
  return `${stack?'STACKED':'NEAR'} ${support.length?'SUPPORT':'RESISTANCE'} (${levels.slice(0,stack?2:1).map(x=>x.name).join(' + ')})`;
}

function pullbackLevels(row,bias){
  const keys=bias==='BUY'?[['PDL',row.pdl],['PWL',row.pwl],['PML',row.pml],['PYL',row.pyl]]
    :[['PDH',row.pdh],['PWH',row.pwh],['PMH',row.pmh],['PYH',row.pyh]];
  return keys.filter(([,value])=>value!=null&&value!==''&&Number.isFinite(Number(value)))
    .sort((a,b)=>bias==='BUY'?Number(b[1])-Number(a[1]):Number(a[1])-Number(b[1]))
    .slice(0,2).map(([name,value])=>`${name} ${Number(value).toFixed(row.symbol?.includes('JPY')?3:5)}`);
}

function streamPairs(rows){
  return rows.filter(row=>{
    const gap=Number(row.gap);
    return row.symbol&&!row.hard_invalid&&Number.isFinite(gap)&&Math.abs(gap)>=5;
  }).map(row=>{
    const gap=Number(row.gap),bias=gap>=5?'BUY':'SELL';
    return {...row,pair:row.symbol,gap,bias,level:nearbyLevel(row),pullback:pullbackLevels(row,bias)};
  }).sort((a,b)=>Math.abs(b.gap)-Math.abs(a.gap));
}

/* ─── page ─── */
export default function StreamPage(){
  const [pairs,setPairs]=useState([]);
  const [heroIdx,setHeroIdx]=useState(0);
  const [fade,setFade]=useState(true);
  const [clock,setClock]=useState(utcTime());
  const [sessions,setSessions]=useState(activeSessions());
  const [flash,setFlash]=useState(false);
  const [newSignal,setNewSignal]=useState(false);
  const heroRef=useRef(0);
  const prevPairsRef=useRef('');
  const sweepKey=useRef(0);
  const startTime=useRef(Date.now());
  const [uptime,setUptime]=useState('00:00:00');
  const [lastRefresh,setLastRefresh]=useState('--:--:--');
  const [signalCount,setSignalCount]=useState(0);
  const [dataError,setDataError]=useState('');

  /* fetch /api/data every 30s */
  const fetchData=useCallback(async()=>{
    try{
      const r=await fetch('/api/data');
      if(r.status===401){setDataError('Sign in with an approved Panda account to view live Stream data.');setPairs([]);setSignalCount(0);return;}
      if(!r.ok)throw new Error(`Stream data request failed (${r.status})`);
      const json=await r.json();
      const rows=Array.isArray(json)?json:(json.data||[]);
      const valid=streamPairs(rows);
      /* detect new/changed signals */
      const sig=valid.map(p=>p.pair+p.bias).join(',');
      if(prevPairsRef.current&&sig!==prevPairsRef.current){
        setFlash(true);setNewSignal(true);sweepKey.current++;
        setTimeout(()=>setFlash(false),800);
        setTimeout(()=>setNewSignal(false),2200);
      }
      prevPairsRef.current=sig;
      setPairs(valid);
      setSignalCount(valid.length);
      setLastRefresh(new Date().toISOString().slice(11,19));
      setDataError('');
    }catch(e){console.error(e);setDataError('Live data is temporarily unavailable.');}
  },[]);

  useEffect(()=>{fetchData();const i=setInterval(fetchData,30000);return()=>clearInterval(i)},[fetchData]);

  /* hero rotation — 5s interval */
  useEffect(()=>{
    if(!pairs.length)return;
    const i=setInterval(()=>{
      setFade(false);
      setTimeout(()=>{
        heroRef.current=(heroRef.current+1)%pairs.length;
        setHeroIdx(heroRef.current);
        setFade(true);
      },450);
    },5000);
    return()=>clearInterval(i);
  },[pairs]);

  /* clock */
  useEffect(()=>{
    const i=setInterval(()=>{setClock(utcTime());setSessions(activeSessions());
      const diff=Math.floor((Date.now()-startTime.current)/1000);
      const hh=String(Math.floor(diff/3600)).padStart(2,'0');
      const mm=String(Math.floor((diff%3600)/60)).padStart(2,'0');
      const ss=String(diff%60).padStart(2,'0');
      setUptime(hh+':'+mm+':'+ss);
    },1000);
    return()=>clearInterval(i);
  },[]);

  const hero=pairs[heroIdx%pairs.length]||null;
  const isBuy=hero&&hero.bias==='BUY';
  const neonG='#00ffae';
  const neonR='#ff4d6d';
  const heroColor=isBuy?neonG:neonR;
  const heroRgba=isBuy?'0,255,174':'255,77,109';

  return(
    <>
    <Head>
      <title>FOREX ENGINE — Live Signals</title>
      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700;900&family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap" rel="stylesheet"/>
    </Head>
    <div style={S.root}>

      {/* ── slow moving background gradient ── */}
      <div style={S.bgShift}/>
      {/* ── grid texture ── */}
      <div style={S.gridTexture}/>
      {/* ── light sweep every ~10s ── */}
      <div style={S.lightSweep}/>

      {/* ── radial glow behind hero ── */}
      <div style={{...S.heroGlow,background:hero
        ?`radial-gradient(ellipse 700px 500px at 50% 44%,rgba(${heroRgba},.09),transparent 70%)`
        :'radial-gradient(ellipse 500px 350px at 50% 44%,rgba(0,180,255,.04),transparent 70%)'}}/>

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

      {/* ─── LIVE TICKER BAR ─── */}
      <div style={S.tickerBar}>
        <div style={S.tickerInner}>
          <span style={S.tickerDot}/>
          <span style={S.tickerLabel}>LIVE</span>
          <span style={S.tickerSep}>│</span>
          <span style={S.tickerText}>Auto Signals Active</span>
          <span style={S.tickerSep}>│</span>
          <span style={S.tickerText}>Updates in Real-Time</span>
          <span style={S.tickerSep}>│</span>
          <span style={S.tickerText}>{signalCount} Active Signal{signalCount!==1?'s':''}</span>
          <span style={S.tickerSep}>│</span>
          <span style={S.tickerText}>Last Refresh: {lastRefresh}</span>
        </div>
      </div>

      {/* ─── CORNER OVERLAYS ─── */}
      {/* top-left: uptime */}
      <div style={S.overlayTL}>
        <span style={S.overlayIcon}>▶</span>
        <span style={S.overlayVal}>{uptime}</span>
        <span style={S.overlayDim}>STREAM UPTIME</span>
      </div>
      {/* top-right: signal count */}
      <div style={S.overlayTR}>
        <span style={S.overlayDim}>ACTIVE SIGNALS</span>
        <span style={{...S.overlayVal,color:signalCount>0?'#00ffae':'rgba(255,255,255,.3)'}}>{signalCount}</span>
      </div>
      {/* bottom-left: branding */}
      <div style={S.overlayBL}>
        <span style={S.brandMark}>FOREX ENGINE</span>
        <span style={S.brandSub}>Powered by Panda Engine</span>
      </div>

      {/* ─── HERO ─── */}
      <div style={S.heroSection}>
        {hero?(
          <div key={heroIdx} style={{...S.heroCard,
            opacity:fade?1:0,
            transform:fade?'scale(1)':'scale(0.95)',
            borderColor:flash?heroColor+'88':`rgba(${heroRgba},.15)`,
            boxShadow:flash
              ?`0 0 60px rgba(${heroRgba},.35), 0 0 160px rgba(${heroRgba},.15), inset 0 0 60px rgba(${heroRgba},.06)`
              :`0 0 100px rgba(${heroRgba},.1), inset 0 0 60px rgba(${heroRgba},.03)`}}>
            {/* shimmer sweep on new signal */}
            <div key={sweepKey.current} style={S.shimmer}/>
            <div style={S.heroPair}>{hero.pair}</div>
            <div style={{...S.heroBias,color:heroColor,
              textShadow:`0 0 50px ${heroColor}88, 0 0 100px ${heroColor}44, 0 0 200px ${heroColor}22`}}>
              {hero.bias}
            </div>
            {/* animated underline */}
            <div style={{...S.heroUnderline,background:`linear-gradient(90deg,transparent,${heroColor},transparent)`,
              boxShadow:`0 0 16px ${heroColor}66`,
              animation:fade?'underlineExpand .6s ease both':'none'}}/>
            {/* NEW SIGNAL badge */}
            {newSignal&&<div style={{...S.newBadge,color:heroColor,borderColor:heroColor+'44'}}>NEW SIGNAL</div>}
          </div>
        ):(
          <div style={S.emptyHero}>
            <div style={S.scanRing}/>
            <div style={S.scanRing2}/>
            <div style={S.scanTitle}>{dataError?'STREAM DATA UNAVAILABLE':'SCANNING MARKETS…'}</div>
            <div style={S.scanSub}>{dataError||'WAITING FOR VALID PAIRS'}</div>
            {dataError?.startsWith('Sign in')&&<a href="/login" style={S.ctaInline}>SIGN IN</a>}
          </div>
        )}
      </div>

      {/* ─── ALL VALID PAIRS ─── */}
      {pairs.length>0&&(
        <div style={S.topSection}>
          <div style={S.topLabel}>VALID PAIRS · {pairs.length} LIVE</div>
          <div style={S.topRow}>
            {pairs.map((p,i)=>{
              const c=p.bias==='BUY'?neonG:neonR;
              const isHero=hero&&p.pair===hero.pair;
              const tf=[p.base_score_tf&&`${p.pair.slice(0,3)} ${p.base_score_tf}`,p.quote_score_tf&&`${p.pair.slice(3,6)} ${p.quote_score_tf}`].filter(Boolean).join(' · ');
              return(
                <div key={p.pair} style={{...S.topCard,animationDelay:`${i*.1}s`,
                  borderColor:isHero?c+'66':c+'28',
                  background:isHero?'rgba(255,255,255,.04)':'rgba(255,255,255,.015)',
                  boxShadow:isHero?`0 0 22px ${c}22, inset 0 0 18px ${c}08`:`0 0 16px ${c}08`,
                  transition:'all .5s ease'}}>
                  <div style={S.cardHeader}><span style={S.topPair}>{p.pair}</span><span style={{...S.cardGap,color:c}}>{p.gap>0?'+':''}{p.gap.toFixed(1)}</span></div>
                  <div style={S.cardMeta}><span style={{...S.topBias,color:c}}>{p.bias}</span><span>{Math.abs(p.gap)>=9&&p.pl_zone!=='BETWEEN'?'INTRA':'BB'}</span><span>{p.momentum||'NEUTRAL'}</span></div>
                  <div style={S.cardLine}><b>CONF</b> {p.confidence||'—'} <b>PL</b> {p.pl_zone||'—'}</div>
                  <div style={S.cardLine}><b>BOX</b> H4 {p.box_h4_trend||'—'} · H1 {p.box_h1_trend||'—'}</div>
                  <div style={S.cardLine}><b>EXTREME TF</b> {tf||'NONE'}</div>
                  <div style={S.cardLine}><b>PB ENTRY</b> {p.pullback.join(' · ')||'—'}</div>
                  {p.level&&<div style={{...S.cardLevel,color:p.level.includes('RESISTANCE')?'#ffaa44':'#00b4ff'}}>⚠ {p.level}</div>}
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
      html,body{background:#060810;overflow-x:hidden;overflow-y:auto}
      @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
      @keyframes pulse{0%,100%{opacity:1}50%{opacity:.2}}
      @keyframes glowPulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.08)}}
      @keyframes biasPulse{0%,100%{opacity:.85}50%{opacity:1}}
      @keyframes scanPing{0%{transform:translate(-50%,-50%) scale(.7);opacity:.5}50%{transform:translate(-50%,-50%) scale(1.2);opacity:.08}100%{transform:translate(-50%,-50%) scale(.7);opacity:.5}}
      @keyframes scanPing2{0%{transform:translate(-50%,-50%) scale(.9);opacity:.3}50%{transform:translate(-50%,-50%) scale(1.4);opacity:.04}100%{transform:translate(-50%,-50%) scale(.9);opacity:.3}}
      @keyframes underlineExpand{from{width:0;opacity:0}to{width:140px;opacity:.7}}
      @keyframes shimmerSweep{0%{transform:translateX(-100%) skewX(-15deg)}100%{transform:translateX(300%) skewX(-15deg)}}
      @keyframes badgeFade{0%{opacity:0;transform:translateY(6px)}15%{opacity:1;transform:translateY(0)}85%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-4px)}}
      @keyframes bgDrift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
      @keyframes sweepLight{0%{transform:translateX(-100%);opacity:0}10%{opacity:.04}50%{opacity:.02}100%{transform:translateX(200%);opacity:0}}
      @keyframes tickerGlow{0%,100%{box-shadow:0 0 20px rgba(0,255,174,.08),inset 0 0 20px rgba(0,255,174,.03)}50%{box-shadow:0 0 30px rgba(0,255,174,.14),inset 0 0 30px rgba(0,255,174,.05)}}
      @keyframes dotBlink{0%,100%{opacity:1;box-shadow:0 0 8px #00ffae}50%{opacity:.4;box-shadow:0 0 4px #00ffae}}
    `}</style>
    </>
  );
}

/* ─── styles ─── */
const S={
  root:{
    width:'100%',minHeight:'100vh',position:'relative',overflow:'hidden',
    background:'linear-gradient(170deg,#050710 0%,#0a0e1a 35%,#0c1024 60%,#070b14 100%)',
    display:'flex',flexDirection:'column',padding:'32px clamp(20px,4vw,80px)',
  },
  bgShift:{
    position:'absolute',inset:0,pointerEvents:'none',zIndex:0,
    background:'linear-gradient(135deg,rgba(0,40,80,.08),rgba(10,5,30,.06),rgba(0,60,60,.05))',
    backgroundSize:'400% 400%',
    animation:'bgDrift 25s ease infinite',
  },
  gridTexture:{
    position:'absolute',inset:0,pointerEvents:'none',zIndex:0,opacity:.025,
    backgroundImage:'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)',
    backgroundSize:'80px 80px',
  },
  lightSweep:{
    position:'absolute',inset:0,pointerEvents:'none',zIndex:0,
    width:'40%',height:'100%',
    background:'linear-gradient(90deg,transparent,rgba(255,255,255,.03),transparent)',
    animation:'sweepLight 12s ease-in-out infinite',
  },
  heroGlow:{
    position:'absolute',inset:0,pointerEvents:'none',zIndex:0,
    transition:'background .6s ease',
  },

  /* top bar */
  topBar:{
    display:'flex',justifyContent:'space-between',alignItems:'center',
    height:'36px',marginBottom:'0',flexShrink:0,position:'relative',zIndex:1,
  },
  liveWrap:{display:'flex',alignItems:'center',gap:'12px'},
  liveDot:{
    width:'10px',height:'10px',borderRadius:'50%',background:'#ff4d6d',
    boxShadow:'0 0 14px rgba(255,77,109,.7),0 0 40px rgba(255,77,109,.2)',
    animation:'pulse 1.5s ease-in-out infinite',
  },
  liveText:{fontFamily:orb,fontSize:'14px',fontWeight:700,color:'#ff4d6d',letterSpacing:'5px',
    textShadow:'0 0 24px rgba(255,77,109,.5)'},
  sessionWrap:{display:'flex',alignItems:'center',gap:'14px'},
  sessionTag:{fontFamily:mono,fontSize:'12px',padding:'5px 14px',borderRadius:'6px',letterSpacing:'1.5px',
    transition:'all .4s ease'},
  sessionActive:{background:'rgba(0,180,255,.1)',color:'#00b4ff',border:'1px solid rgba(0,180,255,.25)',
    boxShadow:'0 0 18px rgba(0,180,255,.1)'},
  sessionDim:{background:'transparent',color:'rgba(255,255,255,.12)',border:'1px solid rgba(255,255,255,.05)'},
  clock:{fontFamily:mono,fontSize:'13px',color:'rgba(255,255,255,.25)',marginLeft:'10px',letterSpacing:'2px'},

  /* hero */
  heroSection:{
    flex:1,minHeight:'250px',display:'flex',justifyContent:'center',alignItems:'center',
    position:'relative',zIndex:1,
  },
  heroCard:{
    textAlign:'center',padding:'28px clamp(28px,5vw,90px)',borderRadius:'30px',
    background:'linear-gradient(160deg,rgba(255,255,255,.03),rgba(255,255,255,.005))',
    backdropFilter:'blur(12px)',
    border:'1.5px solid',
    transition:'opacity .5s ease, transform .5s ease, box-shadow .5s ease, border-color .3s ease',
    animation:'glowPulse 5s ease-in-out infinite',
    position:'relative',overflow:'hidden',
  },
  shimmer:{
    position:'absolute',top:0,left:0,width:'40%',height:'100%',
    background:'linear-gradient(90deg,transparent,rgba(255,255,255,.06),transparent)',
    animation:'shimmerSweep .8s ease-out',
    pointerEvents:'none',
  },
  heroPair:{fontFamily:orb,fontSize:'clamp(48px,6vw,100px)',fontWeight:900,color:'#fff',letterSpacing:'6px',lineHeight:1,
    position:'relative',zIndex:1},
  heroBias:{fontFamily:orb,fontSize:'clamp(42px,4vw,62px)',fontWeight:700,letterSpacing:'10px',marginTop:'2px',
    animation:'biasPulse 3s ease-in-out infinite',position:'relative',zIndex:1},
  heroUnderline:{height:'3px',borderRadius:'2px',margin:'18px auto 0',opacity:.7,
    position:'relative',zIndex:1},
  newBadge:{
    position:'absolute',bottom:'-44px',left:'50%',transform:'translateX(-50%)',
    fontFamily:orb,fontSize:'12px',fontWeight:500,letterSpacing:'5px',
    padding:'5px 20px',borderRadius:'20px',border:'1px solid',
    background:'rgba(0,0,0,.4)',backdropFilter:'blur(4px)',
    animation:'badgeFade 2.2s ease both',whiteSpace:'nowrap',
  },

  /* empty state */
  emptyHero:{textAlign:'center',position:'relative'},
  scanRing:{
    position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
    width:'220px',height:'220px',borderRadius:'50%',
    border:'1px solid rgba(0,180,255,.08)',
    animation:'scanPing 3.5s ease-in-out infinite',pointerEvents:'none',
  },
  scanRing2:{
    position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
    width:'280px',height:'280px',borderRadius:'50%',
    border:'1px solid rgba(0,180,255,.05)',
    animation:'scanPing2 4.5s ease-in-out infinite',pointerEvents:'none',
  },
  scanTitle:{fontFamily:orb,fontSize:'34px',fontWeight:700,color:'rgba(255,255,255,.2)',letterSpacing:'8px',
    position:'relative',zIndex:1},
  scanSub:{fontFamily:raj,fontSize:'18px',color:'rgba(255,255,255,.1)',marginTop:'14px',letterSpacing:'3px',
    position:'relative',zIndex:1},
  ctaInline:{fontFamily:raj,fontSize:'16px',color:'#00b4ff',marginTop:'36px',letterSpacing:'2px',opacity:.35,
    position:'relative',zIndex:1},

  /* top signals row */
  topSection:{flexShrink:0,position:'relative',zIndex:1,paddingBottom:'8px'},
  topLabel:{fontFamily:orb,fontSize:'11px',fontWeight:500,color:'rgba(255,255,255,.15)',
    letterSpacing:'4px',textAlign:'center',marginBottom:'10px'},
  topRow:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:'10px'},
  topCard:{
    padding:'10px 12px',borderRadius:'12px',textAlign:'left',minHeight:'150px',
    border:'1px solid',
    animation:'fadeUp .5s ease both',
    minWidth:0,
  },
  cardHeader:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'6px'},
  topPair:{fontFamily:orb,fontSize:'16px',fontWeight:700,color:'rgba(255,255,255,.88)',letterSpacing:'1px'},
  cardGap:{fontFamily:orb,fontSize:'18px',fontWeight:900},
  cardMeta:{display:'flex',alignItems:'center',gap:'8px',fontFamily:mono,fontSize:'10px',color:'rgba(255,255,255,.52)',whiteSpace:'nowrap',margin:'5px 0 6px'},
  topBias:{fontFamily:orb,fontSize:'11px',fontWeight:700,letterSpacing:'1px'},
  cardLine:{fontFamily:mono,fontSize:'9px',lineHeight:'15px',color:'rgba(255,255,255,.55)',overflowWrap:'anywhere'},
  cardLevel:{fontFamily:mono,fontSize:'9px',lineHeight:'15px',fontWeight:700,overflowWrap:'anywhere'},

  /* live ticker bar */
  tickerBar:{
    position:'relative',zIndex:2,marginTop:'10px',marginBottom:'0',flexShrink:0,
  },
  tickerInner:{
    display:'flex',alignItems:'center',justifyContent:'center',gap:'16px',
    padding:'10px 32px',borderRadius:'10px',
    background:'linear-gradient(90deg,rgba(0,255,174,.04),rgba(0,255,174,.08),rgba(0,255,174,.04))',
    border:'1px solid rgba(0,255,174,.18)',
    animation:'tickerGlow 4s ease-in-out infinite',
  },
  tickerDot:{
    width:'8px',height:'8px',borderRadius:'50%',background:'#00ffae',flexShrink:0,
    animation:'dotBlink 1.8s ease-in-out infinite',
  },
  tickerLabel:{fontFamily:orb,fontSize:'13px',fontWeight:700,color:'#00ffae',letterSpacing:'4px'},
  tickerSep:{fontFamily:mono,fontSize:'14px',color:'rgba(0,255,174,.25)',userSelect:'none'},
  tickerText:{fontFamily:mono,fontSize:'13px',color:'rgba(0,255,174,.7)',letterSpacing:'1px'},

  /* corner overlays */
  overlayTL:{
    position:'absolute',top:'88px',left:'80px',zIndex:2,display:'flex',alignItems:'center',gap:'8px',
  },
  overlayIcon:{fontFamily:mono,fontSize:'10px',color:'#00ffae',opacity:.6},
  overlayVal:{fontFamily:mono,fontSize:'14px',color:'rgba(255,255,255,.5)',letterSpacing:'2px'},
  overlayDim:{fontFamily:raj,fontSize:'11px',color:'rgba(255,255,255,.2)',letterSpacing:'2px',textTransform:'uppercase'},
  overlayTR:{
    position:'absolute',top:'88px',right:'80px',zIndex:2,display:'flex',alignItems:'center',gap:'8px',
  },
  overlayBL:{
    position:'absolute',bottom:'56px',left:'80px',zIndex:2,display:'flex',flexDirection:'column',gap:'2px',
  },
  brandMark:{fontFamily:orb,fontSize:'13px',fontWeight:700,color:'rgba(255,255,255,.06)',letterSpacing:'6px'},
  brandSub:{fontFamily:raj,fontSize:'11px',color:'rgba(255,255,255,.04)',letterSpacing:'2px'},

  /* footer */
  footer:{
    flexShrink:0,display:'flex',flexDirection:'column',alignItems:'center',
    gap:'6px',paddingTop:'14px',position:'relative',zIndex:1,
  },
  footerMain:{fontFamily:orb,fontSize:'11px',fontWeight:500,color:'rgba(255,255,255,.1)',letterSpacing:'6px'},
  footerDisclaim:{fontFamily:raj,fontSize:'12px',color:'rgba(255,255,255,.06)',letterSpacing:'1px'},
};
