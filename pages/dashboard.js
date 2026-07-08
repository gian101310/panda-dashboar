import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { TrendingUp, AlertTriangle, Shield, Zap, Activity, Eye, Radio, Brain, Crosshair, Gauge } from 'lucide-react';

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
function isNeutralMatchup(row) {
  if (!row) return false;
  const isBuy = (row.gap ?? 0) > 0;
  const bv = [row.base_d1, row.base_h4, row.base_h1].filter(v => v != null);
  const qv = [row.quote_d1, row.quote_h4, row.quote_h1].filter(v => v != null);
  if (!bv.length || !qv.length) return false;
  const bs = isBuy ? Math.max(...bv.filter(v => v > 0), 0) : Math.min(...bv.filter(v => v < 0), 0);
  const qs = isBuy ? Math.min(...qv.filter(v => v < 0), 0) : Math.max(...qv.filter(v => v > 0), 0);
  return scoreLabel(bs) === 'NEUTRAL' && scoreLabel(qs) === 'NEUTRAL';
}
function isMarketOpen() {
  const now = new Date();
  const day = now.getUTCDay();   // 0=Sun, 6=Sat
  const h = now.getUTCHours();
  if (day === 6) return false;           // All Saturday
  if (day === 0 && h < 22) return false; // Sunday before 22:00 UTC
  if (day === 5 && h >= 22) return false; // Friday after 22:00 UTC
  return true;
}
function getMaturity(sampleSize) {
  if (sampleSize >= 50) return 'proven';
  if (sampleSize >= 20) return 'developing';
  return null;
}
function getMomentumAction(momentum, bias, trend) {
  const g = MOMENTUM_GUIDE[momentum];
  if (!g) return null;
  // Entry-action states must agree with bias direction
  const entryStates = ['STRONG','BUILDING','SPARK','EMERGING'];
  if (entryStates.includes(momentum)) {
    const t1 = trend?.trend1h;
    const t4 = trend?.trend4h;
    const aligned = (bias === 'BUY' && (t1 === 'STRONGER' || t4 === 'STRONGER'))
                 || (bias === 'SELL' && (t1 === 'WEAKER' || t4 === 'WEAKER'));
    if (aligned) return g;
    if (bias === 'WAIT') return { icon:'▬', action:'WAIT — No valid bias yet', desc:'Momentum building but gap below ±5', color:'var(--text-muted)' };
    return { icon:'⚠️', action:'COUNTER — Momentum opposes bias', desc:`${momentum} momentum but trend misaligned with ${bias}`, color:'#ffaa44' };
  }
  return g;
}
function getEdgeMemory(row, memoryIndex) {
  if (!memoryIndex || !row) return null;
  const absGap = Math.abs(row.gap || 0);
  if (absGap < 5) return null;
  const gapBucket = String(Math.min(Math.floor(absGap), 12));
  const zone = (row.pl_zone || '').toUpperCase();
  const bias = row.bias;
  const plConfirmed = (bias === 'BUY' && zone === 'ABOVE') || (bias === 'SELL' && zone === 'BELOW');
  const plStr = plConfirmed ? 'confirmed' : 'unconfirmed';
  const mem = (memoryIndex.gap_pl || {})[`BB_${gapBucket}_${plStr}`]
           || (memoryIndex.gap_only || {})[`BB_${gapBucket}`]
           || (memoryIndex.general || {})['BB_strategy_overall']
           || null;
  if (!mem) return null;
  const maturity = getMaturity(mem.sample_size);
  const wr = mem.win_rate;
  const resRate = mem.metadata?.win_rate_total;
  let flag = null;
  if (maturity === 'proven' && wr >= 70 && (resRate == null || resRate >= 25)) flag = 'PROVEN_EDGE';
  if (maturity === 'proven' && wr <= 30) flag = 'DEAD_ZONE';
  return { flag, mem, maturity, winRate: wr, resRate, sample: mem.sample_size };
}

// ===== PDR BADGE =====
function PdrBadge({ pdr }) {
  if (!pdr || pdr.strength == null) return null;
  const mono = "'Share Tech Mono',monospace";
  const color = pdr.strong ? '#00ff9f' : '#6b7280';
  return (
    <span style={{fontFamily:mono,fontSize:8,padding:'1px 5px',borderRadius:4,
      background:pdr.strong?'rgba(0,255,159,0.12)':'rgba(107,114,128,0.12)',
      color,border:`1px solid ${color}40`,marginLeft:4,letterSpacing:1}}>
      PDR {Number(pdr.strength).toFixed(2)} {pdr.direction==='BULLISH'?'▲':'▼'} {pdr.strong?'STRONG':'WEAK'}
    </span>
  );
}

// ===== LIVE PDR BADGE (broker data from v2 exporter — preferred over Twelve Data) =====
function LivePdrBadge({ row }) {
  if (row?.pdr_dir == null) return null;
  const monoF = "'Share Tech Mono',monospace";
  const strong = !!row.pdr_strong_live;
  const color = strong ? '#00ff9f' : '#6b7280';
  return (
    <span style={{fontFamily:monoF,fontSize:8,padding:'1px 5px',borderRadius:4,
      background:strong?'rgba(0,255,159,0.12)':'rgba(107,114,128,0.12)',
      color,border:`1px solid ${color}40`,letterSpacing:1}}>
      {row.pdr_dir==='BULLISH'?'▲':'▼'} {Number(row.pdr_ratio??0).toFixed(2)} {strong?'STRONG':'WEAK'} <span style={{color:'#00ff9f',fontSize:7}}>LIVE</span>
    </span>
  );
}

// ===== PDR VERDICT (plain-language: does yesterday support this trade?) =====
function PdrVerdict({ row, pdr }) {
  const gap = row?.gap ?? 0;
  if (Math.abs(gap) < 5) return null;
  const dir = gap > 0 ? 'BUY' : 'SELL';
  // Prefer live broker PDR (v2 exporter), fallback to Twelve Data
  const pdrDir = row?.pdr_dir != null ? row.pdr_dir : pdr?.direction;
  const pdrStrong = row?.pdr_dir != null ? !!row.pdr_strong_live : !!pdr?.strong;
  if (pdrDir == null) return null;
  const monoF = "'Share Tech Mono',monospace";
  const aligned = (dir === 'BUY' && pdrDir === 'BULLISH') || (dir === 'SELL' && pdrDir === 'BEARISH');
  let v;
  if (aligned && pdrStrong) v = { txt: `✓ SUPPORTS ${dir}`, c: '#00ff9f', tip: `Yesterday was a strong ${pdrDir.toLowerCase()} day that held its move — it supports today's ${dir} bias. Continuation conditions met on the PDR side.` };
  else if (aligned) v = { txt: '~ WEAK SUPPORT', c: '#ffd166', tip: `Yesterday moved with the ${dir} bias but without conviction (small body or heavy retrace). Not a filter-kill, but no real tailwind either.` };
  else v = { txt: `✗ AGAINST ${dir}`, c: '#ffaa44', tip: `Yesterday moved AGAINST today's ${dir} bias. This is NOT a continuation setup — treat it as a riskier trend-turn attempt: extra confirmation, smaller size, or skip.` };
  return (
    <span title={v.tip} style={{fontFamily:monoF,fontSize:8,padding:'1px 6px',borderRadius:4,marginLeft:4,
      color:v.c,background:v.c+'12',border:`1px solid ${v.c}35`,fontWeight:700,letterSpacing:0.5,cursor:'help'}}>
      {v.txt}
    </span>
  );
}

// ===== TRADE VERDICT (Boss-G execution rules) =====
// Rule 1: |gap| >= 9 + Panda Lines agree = MARKET EXECUTION. PDR = bonus confirmation only.
// Rule 2: valid bias (|gap| 5-8.9, or 9+ without PL) = PULLBACK PLAY — never "no trade".
// Rule 3: live pullback detection — price retraced 30-60% of today's move OR sitting at a Panda Line.
function isPullbackZoneNow(row, dir) {
  const pb = row?.pullback_pct;
  const adrUsed = row?.adr_used_pct;
  // GUARD: there must be a real move to pull back FROM (day covered >=30% of ADR)
  // and price must have actually retraced (>=20%). Being near a line without a
  // prior move is NOT a pullback — it's just proximity.
  const moved = adrUsed != null && adrUsed >= 30;
  const retraced = pb != null && pb >= 20;
  const pbOk = moved && pb != null && pb >= 30 && pb <= 60;
  let lineOk = false;
  const price = row?.pl_price, st = row?.pl_st, fl = row?.pl_fl, atr = row?.atr;
  if (moved && retraced && price && atr && (st != null || fl != null)) {
    const pip = row.symbol?.includes('JPY') ? 0.01 : 0.0001;
    const lines = [st, fl].filter(x => x != null);
    const distPips = Math.min(...lines.map(l => Math.abs(price - l))) / pip;
    lineOk = distPips <= atr * 0.15; // at a Panda Line AFTER a real retrace
  }
  return { now: pbOk || lineOk, pbOk, lineOk, pb };
}

function computeVerdict(row, pdr, t) {
  const gap = row?.gap ?? 0;
  const ag = Math.abs(gap);
  if (ag < 5 || row?.hard_invalid) {
    if (row?.consolidating === true) return { icon: '🔵', txt: 'NO TRADE — WAIT FOR BREAKOUT', hint: 'No valid bias and price is compressed. Let it pick a direction first.', c: '#6b7280' };
    return { icon: '⚪', txt: 'NO TRADE — WAIT', hint: 'No valid bias right now (gap below 5 or hard invalid).', c: '#6b7280' };
  }
  const dir = gap > 0 ? 'BUY' : 'SELL';
  const p = computePhase(row, pdr) || {};
  const label = p.label || '';
  const pdrAligned = !!p.pdrAligned;
  const pdrNote = pdrAligned ? ' PDR supports — bonus confirmation ✓.' : '';

  // Safety overrides first
  if ((t && t.closeAlert) || label.includes('AT RISK')) return { icon: '🔴', txt: 'CLOSE / PROTECT', hint: 'Trend is at risk. No new entries — protect any open trade.', c: '#ff4d6d' };
  if (label.includes('LATE') || label.includes('EXTENDED')) return { icon: '🟠', txt: `${dir} VALID — TOO LATE, WAIT FOR PULLBACK`, hint: 'Bias is valid but the move is mature or the daily range is spent. No market entry — only a pullback re-entry.', c: '#ffaa44' };

  const zone = (row?.pl_zone || '').toUpperCase();
  const plValid = (dir === 'BUY' && zone === 'ABOVE') || (dir === 'SELL' && zone === 'BELOW');
  const z = isPullbackZoneNow(row, dir);

  // RULE 1 — market execution
  if (ag >= 9 && plValid) {
    return { icon: '🟢', txt: `MARKET EXECUTE ${dir}`, hint: `Gap 9+ with Panda Lines confirmed — market execution rule met.${pdrNote || ' PDR not aligned — still valid, bonus missing.'}`, c: '#00ff9f' };
  }

  // RULE 2 — pullback play (valid bias, gap 5-8.9, or 9+ without PL confirmation)
  if (z.now) {
    const where = z.lineOk && z.pbOk ? 'price is AT the Panda Line and retraced ' + Math.round(z.pb) + '%' : z.lineOk ? 'price is AT the Panda Line' : `retraced ${Math.round(z.pb)}% of today's move`;
    return { icon: '🟢', txt: `ENTER ${dir} — IN PULLBACK ZONE NOW`, hint: `Bias confirmed and ${where} — this is the pullback area. Market-enter here with stop beyond the line/extreme instead of waiting for a pending order.${pdrNote}`, c: '#00ff9f' };
  }
  const pbInfo = z.pb != null ? ` Currently retraced ${Math.round(z.pb)}%.` : '';
  return { icon: '🟡', txt: `PULLBACK PLAY ${dir} — WAIT FOR ZONE`, hint: `Bias confirmed${ag >= 9 ? ' (gap 9+ but Panda Lines not confirming yet)' : ''} — wait for a 30-60% retrace or a tag of the Panda Line / PB ENTRY level.${pbInfo}${pdrNote}`, c: '#ffd166' };
}

function VerdictBanner({ row, pdr, t, compact }) {
  const v = computeVerdict(row, pdr, t);
  if (!v) return null;
  const monoF = "'Share Tech Mono',monospace";
  if (compact) return (
    <span title={v.hint} style={{fontFamily:monoF,fontSize:9,color:v.c,background:v.c+'14',border:`1px solid ${v.c}40`,borderRadius:4,padding:'2px 8px',fontWeight:700,letterSpacing:0.5,cursor:'help',whiteSpace:'nowrap',display:'inline-block'}}>{v.icon} {v.txt}</span>
  );
  return (
    <div title={v.hint} style={{display:'flex',flexDirection:'column',gap:2,background:v.c+'10',border:`1px solid ${v.c}45`,borderLeft:`3px solid ${v.c}`,borderRadius:6,padding:'6px 10px',cursor:'help'}}>
      <span style={{fontFamily:monoF,fontSize:10,color:v.c,fontWeight:700,letterSpacing:1}}>{v.icon} {v.txt}</span>
      <span style={{fontFamily:monoF,fontSize:8,color:'var(--text-muted)',lineHeight:1.35}}>{v.hint}</span>
    </div>
  );
}

// ===== TREND PHASE (catching vs riding vs chasing) =====
// Combines structural state + momentum + gap trajectory + PDR into one
// entry-timing answer. Read-only view logic — no locked formulas touched.
function computePhase(row, pdr) {
  const gap = row.gap ?? 0, ag = Math.abs(gap);
  if (ag < 5 || row.hard_invalid) return null;
  const dir = gap > 0 ? 'BUY' : 'SELL';
  const state = row.state || '';
  const mom = row.momentum || '';
  const dm = row.delta_mid ?? 0;
  const withTrend = dir === 'BUY' ? dm > 0 : dm < 0;
  const fading = mom === 'FADING' || mom === 'COOLING' || mom === 'REVERSING' || mom === 'REVERSAL';
  // Live broker PDR (v2 exporter) preferred; Twelve Data fallback
  const pdrAligned = row.pdr_dir != null
    ? !!(row.pdr_strong_live && ((dir === 'BUY' && row.pdr_dir === 'BULLISH') || (dir === 'SELL' && row.pdr_dir === 'BEARISH')))
    : !!(pdr && pdr.strong && ((dir === 'BUY' && pdr.direction === 'BULLISH') || (dir === 'SELL' && pdr.direction === 'BEARISH')));
  const utcH = new Date().getUTCHours();
  const asian = utcH >= 22 || utcH < 6;

  const igniting = mom === 'SPARK' || mom === 'BUILDING' || mom === 'EMERGING';
  let phase;
  if (state.startsWith('DEEP_PULLBACK')) phase = { label: '⚠ TREND AT RISK', color: '#ff4d6d', tip: 'Deep pullback — trend may be ending. No new entries.' };
  else if (state.startsWith('PULLBACK')) phase = { label: '🎯 PULLBACK ZONE', color: '#ffd166', tip: 'Healthy pullback inside a valid trend — this is the continuation entry window, not chasing.' };
  else if (fading) phase = { label: "🌙 LATE — DON'T CHASE", color: '#ffaa44', tip: 'Momentum fading — the move is mature. Entering here is chasing.' };
  else if (igniting && ag <= 9) phase = { label: '🚀 START — CATCHING', color: '#00ff9f', tip: 'Momentum igniting (SPARK/BUILDING) with gap still early — catching the start of the trend.' };
  else if (state.startsWith('EXPAND') && ag <= 9) phase = { label: '🚀 START — CATCHING', color: '#00ff9f', tip: 'Fresh expansion, gap still early — catching the start of the trend.' };
  else if (igniting || state.startsWith('EXPAND')) phase = { label: '🔥 MID — RIDING', color: '#00b4ff', tip: 'Established trend still pushing — good for holders, be selective adding new.' };
  else if (row.consolidating === true) phase = { label: '🔵 CONSOLIDATING', color: '#6b7280', tip: 'Price compressed — last 6 hours covered under 25% of an average day. Energy building; wait for the break.' };
  else if (ag >= 12) phase = { label: '🌙 EXTENDED', color: '#ffaa44', tip: 'Gap at the top of the valid range (5–12) — much of the move may be done. Wait for a pullback.' };
  else phase = withTrend
    ? { label: '🔥 MID — RIDING', color: '#00b4ff', tip: 'Trend intact and gap holding with direction.' }
    : { label: '⏸ STALLING', color: '#6b7280', tip: 'Gap not making progress — wait for expansion or a pullback.' };

  // Live ADR check overrides optimistic phases: fuel mostly burned = late, price-confirmed
  const adrUsed = row.adr_used_pct;
  if (adrUsed != null && adrUsed >= 70 && (phase.label.includes('START') || phase.label.includes('MID'))) {
    phase = { label: '🌙 LATE — ADR SPENT', color: '#ffaa44', tip: `Today already used ${Math.round(adrUsed)}% of its average daily range — most of the fuel is burned. Wait for a pullback or the next session.` };
  }

  const checks = [
    { k: 'BIAS', ok: true },
    { k: 'PDR', ok: pdrAligned },
    { k: 'ASIAN', ok: asian },
  ];
  const continuation = pdrAligned && asian && (phase.label.includes('PULLBACK') || phase.label.includes('START') || phase.label.includes('MID'));
  return { ...phase, dir, checks, continuation, pdrAligned, asian, adrUsed, pullbackPct: row.pullback_pct, livePdr: row.pdr_dir != null };
}

function PhaseBadge({ row, pdr }) {
  const p = computePhase(row, pdr);
  if (!p) return null;
  const monoF = "'Share Tech Mono',monospace";
  return (
    <div style={{display:'flex',flexDirection:'column',gap:3,marginTop:2}}>
      <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}>
        <span style={{fontFamily:monoF,fontSize:8,color:'var(--text-secondary)',letterSpacing:1,fontWeight:600}}>PHASE</span>
        <span title={p.tip} style={{fontFamily:monoF,fontSize:9,color:p.color,background:p.color+'14',border:`1px solid ${p.color}40`,borderRadius:4,padding:'1px 7px',fontWeight:700,cursor:'help',letterSpacing:0.5}}>{p.label}</span>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
        {p.checks.map(c=>(<span key={c.k} style={{fontFamily:monoF,fontSize:7,color:c.ok?'#00ff9f':'#6b7280',background:c.ok?'rgba(0,255,159,0.08)':'rgba(107,114,128,0.08)',border:`1px solid ${c.ok?'#00ff9f30':'#6b728030'}`,borderRadius:3,padding:'1px 5px',letterSpacing:0.5}}>{c.ok?'✓':'○'} {c.k}</span>))}
        {p.continuation && <span title="Valid bias + strong aligned PDR + Asian session — your continuation checklist is complete." style={{fontFamily:monoF,fontSize:8,color:'#ffd166',background:'rgba(255,209,102,0.12)',border:'1px solid rgba(255,209,102,0.4)',borderRadius:3,padding:'1px 6px',fontWeight:700,letterSpacing:0.5,cursor:'help'}}>★ CONTINUATION SETUP</span>}
      </div>
      {(p.adrUsed!=null||p.pullbackPct!=null)&&<div style={{display:'flex',alignItems:'center',gap:6}}>
        {p.adrUsed!=null&&<span title="How much of an average daily range today has already covered. Above 70% = the move is mostly done for the day." style={{fontFamily:monoF,fontSize:8,color:p.adrUsed>=70?'#ffaa44':'var(--text-muted)',cursor:'help'}}>ADR {Math.round(p.adrUsed)}% used</span>}
        {p.pullbackPct!=null&&<span title="How far price has retraced from today's extreme in your trade direction. 30-60% = healthy continuation pullback; above 80% = trend failing." style={{fontFamily:monoF,fontSize:8,color:p.pullbackPct>=30&&p.pullbackPct<=60?'#ffd166':'var(--text-muted)',cursor:'help'}}>PB {Math.round(p.pullbackPct)}%</span>}
        {p.livePdr&&<span title="PDR computed live from your broker's daily candles (v2 exporter)" style={{fontFamily:monoF,fontSize:7,color:'#00ff9f',letterSpacing:0.5}}>LIVE</span>}
      </div>}
    </div>
  );
}

// ===== PHASE LEGEND (fixed banner under Overview) =====
const PHASE_LEGEND = [
  { icon: '🚀', name: 'START — CATCHING', color: '#00ff9f', what: 'Gap fresh (5–9) and momentum igniting (SPARK/BUILDING) or expanding.', action: 'Best entries live here. You are catching the start, not chasing.' },
  { icon: '🔥', name: 'MID — RIDING', color: '#00b4ff', what: 'Trend established and still pushing with direction.', action: 'Good for trades already open. Be selective adding new — prefer a pullback.' },
  { icon: '🎯', name: 'PULLBACK ZONE', color: '#ffd166', what: 'Healthy pullback inside a valid trend.', action: 'Your continuation entry window. With ✓ PDR + ✓ ASIAN this is the A+ setup.' },
  { icon: '🌙', name: "LATE — DON'T CHASE", color: '#ffaa44', what: 'Momentum FADING/COOLING — the move is mature.', action: 'No new entries. Entering here is chasing the end of the move.' },
  { icon: '🌙', name: 'EXTENDED', color: '#ffaa44', what: 'Gap at the top of the valid 5–12 range.', action: 'Most of the move may be done. Wait for the pullback instead.' },
  { icon: '⚠', name: 'TREND AT RISK', color: '#ff4d6d', what: 'Deep pullback — trend structure breaking down.', action: 'Stand aside. Existing trades: consider tightening or closing.' },
  { icon: '⏸', name: 'STALLING', color: '#6b7280', what: 'Valid gap but no progress either way.', action: 'Wait for expansion or a pullback before acting.' },
  { icon: '🔵', name: 'CONSOLIDATING', color: '#6b7280', what: 'Price compressed — last 6 hours covered under 25% of an average day.', action: 'Energy is building. Wait for the breakout; do not trade inside the box.' },
  { icon: '🌙', name: 'LATE — ADR SPENT', color: '#ffaa44', what: 'Today already used 70%+ of its average daily range.', action: 'Fuel is burned. No chasing — wait for a pullback or the next session.' },
];

function PhaseLegend({ isMobile }) {
  const monoF = "'Share Tech Mono',monospace";
  return (
    <div style={{marginTop:14,background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px'}}>
      <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:11,fontWeight:700,letterSpacing:2,color:'var(--text-secondary)',marginBottom:8}}>PHASE GUIDE — WHERE AM I IN THE TREND?</div>
      <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(auto-fit,minmax(280px,1fr))',gap:8}}>
        {PHASE_LEGEND.map(p=>(
          <div key={p.name} style={{display:'flex',flexDirection:'column',gap:3,background:'rgba(0,0,0,0.15)',border:`1px solid ${p.color}25`,borderRadius:7,padding:'8px 10px'}}>
            <span style={{fontFamily:monoF,fontSize:10,color:p.color,fontWeight:700,letterSpacing:0.5}}>{p.icon} {p.name}</span>
            <span style={{fontFamily:monoF,fontSize:9,color:'var(--text-muted)',lineHeight:1.45}}>{p.what}</span>
            <span style={{fontFamily:monoF,fontSize:9,color:'var(--text-secondary)',lineHeight:1.45}}>👉 {p.action}</span>
          </div>
        ))}
      </div>
      <div style={{fontFamily:monoF,fontSize:9,color:'var(--text-muted)',marginTop:8,lineHeight:1.5}}>Checklist chips on each card: <span style={{color:'#00ff9f'}}>✓ BIAS</span> gap in valid 5–12 range · <span style={{color:'#00ff9f'}}>✓ PDR</span> yesterday closed strong in your direction · <span style={{color:'#00ff9f'}}>✓ ASIAN</span> Asian session live. All three + a catchable phase = <span style={{color:'#ffd166',fontWeight:700}}>★ CONTINUATION SETUP</span>.</div>
      <div style={{fontFamily:monoF,fontSize:9,color:'var(--text-muted)',marginTop:6,lineHeight:1.6}}>
        <span style={{color:'var(--text-secondary)',fontWeight:700,letterSpacing:1}}>PDR — DOES YESTERDAY SUPPORT THE TRADE? </span>
        <span style={{color:'#00ff9f'}}>✓ SUPPORTS</span> yesterday moved your direction and held it — best conditions (A-play) ·
        <span style={{color:'#ffd166'}}> ~ WEAK SUPPORT</span> right direction, no conviction — neutral ·
        <span style={{color:'#ffaa44'}}> ✗ AGAINST</span> yesterday moved the other way — not a continuation; trend-turn attempt only with extra confirmation, smaller size, or skip.
      </div>
      <div style={{fontFamily:monoF,fontSize:9,color:'var(--text-muted)',marginTop:6,lineHeight:1.6}}>
        <span style={{color:'var(--text-secondary)',fontWeight:700,letterSpacing:1}}>TELEGRAM SNAPSHOT — ACTION WORDS: </span>
        <span style={{color:'#00ff9f'}}>EXECUTE</span> gap 9+ & Panda Lines confirmed — market entry rule met ·
        <span style={{color:'#00ff9f'}}> ENTER PB</span> price is in the pullback area right now ·
        <span style={{color:'#ffd166'}}> PB WAIT</span> valid bias — wait for a 30-60% retrace or Panda Line tag ·
        <span style={{color:'#ffaa44'}}> NO CHASE</span> too late, no new entries ·
        <span style={{color:'#ff4d6d'}}> CLOSE?</span> trend at risk — protect open trades ·
        <span style={{color:'#6b7280'}}> WAIT</span> no valid bias.
      </div>
      <div style={{fontFamily:monoF,fontSize:9,color:'var(--text-muted)',marginTop:4,lineHeight:1.6}}>
        <span style={{color:'var(--text-secondary)',fontWeight:700,letterSpacing:1}}>SNAPSHOT PDR WORDS: </span>
        <span style={{color:'#00ff9f'}}>SUPPORTS</span> yesterday moved WITH the bias and held — continuation backdrop ·
        <span style={{color:'#ffd166'}}> WEAK SUP</span> right direction, no conviction ·
        <span style={{color:'#ffaa44'}}> AGAINST</span> yesterday opposed the bias — trend-turn risk. On WAIT pairs the raw form shows instead (▲/▼ strength + S strong / w weak).
      </div>
    </div>
  );
}

// ===== BOX TREND DETECTION =====
function boxTrend(trend) {
  if (!trend || trend === 'UNKNOWN') return null;
  const map = {
    UPTREND:   { label: '▲ UP',   color: '#00ff9f', bg: 'rgba(0,255,159,0.10)', border: 'rgba(0,255,159,0.35)' },
    DOWNTREND: { label: '▼ DOWN', color: '#ff4d6d', bg: 'rgba(255,77,109,0.10)', border: 'rgba(255,77,109,0.35)' },
    RANGING:   { label: '↔ RNG',  color: '#ffd166', bg: 'rgba(255,209,102,0.10)', border: 'rgba(255,209,102,0.35)' },
  };
  return map[trend] || null;
}

// ===== BOX CONFIRMATION + ATR FILL HELPERS =====
function boxConfirm(bias, h4Trend, h1Trend) {
  if (!h4Trend || h4Trend === 'UNKNOWN') return null;
  const isBuy  = bias === 'BUY';
  const good   = isBuy ? 'UPTREND'   : 'DOWNTREND';
  const bad    = isBuy ? 'DOWNTREND' : 'UPTREND';
  if (h4Trend === good  && h1Trend === good)  return { label:'✅ CONFIRMED', color:'#00ff9f', bg:'rgba(0,255,159,0.10)', border:'rgba(0,255,159,0.35)' };
  if (h4Trend === good  && h1Trend !== bad)   return { label:'⚠️ WAIT H1',  color:'#ffd166', bg:'rgba(255,209,102,0.10)', border:'rgba(255,209,102,0.35)' };
  if (h4Trend === bad)                         return { label:'❌ SKIP',     color:'#ff4d6d', bg:'rgba(255,77,109,0.10)',  border:'rgba(255,77,109,0.35)' };
  return { label:'⚠️ RANGING', color:'#ffd166', bg:'rgba(255,209,102,0.10)', border:'rgba(255,209,102,0.35)' };
}
// ===== PL ZONE BADGE (CONTINUATIONday validity) =====
// BUY  valid = price ABOVE both Panda Lines
// SELL valid = price BELOW both Panda Lines
// BETWEEN   = not valid for intra game
function plZoneBadge(zone, bias) {
  if (!zone) return null;
  const isBuy  = bias === 'BUY';
  const isSell = bias === 'SELL';
  if (zone === 'ABOVE')   return isBuy  ? { label:'🟢 ABOVE LINES', color:'#00ff9f', bg:'rgba(0,255,159,0.10)',  border:'rgba(0,255,159,0.35)',  valid:true  }
                                        : { label:'⬆️ ABOVE LINES', color:'#ffd166', bg:'rgba(255,209,102,0.10)', border:'rgba(255,209,102,0.35)', valid:false };
  if (zone === 'BELOW')   return isSell ? { label:'🔴 BELOW LINES', color:'#ff4d6d', bg:'rgba(255,77,109,0.10)',  border:'rgba(255,77,109,0.35)',  valid:true  }
                                        : { label:'⬇️ BELOW LINES', color:'#ffd166', bg:'rgba(255,209,102,0.10)', border:'rgba(255,209,102,0.35)', valid:false };
  if (zone === 'BETWEEN') return         { label:'↔️ BETWEEN',      color:'#ffaa44', bg:'rgba(255,170,68,0.10)',  border:'rgba(255,170,68,0.35)',  valid:false };
  return null;
}

function atrFill(atrPoints, currentPrice, entryPrice) {
  // atrPoints from Supabase is in points (e.g. 776 = 7.76 pips for non-JPY, 776 = 776 pips for JPY)
  // We just show ATR/24 = pips per hour as context
  if (!atrPoints || atrPoints <= 0) return null;
  const atrPips = atrPoints / 100; // convert points to pips
  const pipsPerHour = atrPips / 24;
  if (pipsPerHour <= 0) return null;
  return { pipsPerHour: pipsPerHour.toFixed(1), atrPips: atrPips.toFixed(0) };
}

// ===== ADVANCE SCORE WARNING =====
// ADV scores project: H1=tomorrow, H4=next week, D1=next month
// ===== ADV TIMEFRAME HOLD/EXIT LOGIC =====
// H1 ADV → next-day bias (always evaluated)
// H4 ADV → next-week bias (critical on Thu/Fri — hold over weekend?)
// D1 ADV → next-month bias (critical last 3 days of month — hold into new month?)
// Returns: { label, color, bg, border, detail, level, verdicts:{h1,h4,d1}, holdExit }
function advScore(row) {
  // ADV SUBSTITUTION READING (Boss-G spec):
  // NEXT DAY  = current D1 + current H4 + ADV H1 (replaces H1 only where ADV H1 has a score)
  // NEXT WEEK = current D1 + ADV H4 + ADV H1 (replace where present; valid from Friday close)
  // NEXT MONTH = ADV D1 + ADV H4 + ADV H1 (replace where present)
  // ADV score of 0 = walang score -> keep the current TF score (nothing changes).
  if (!row) return null;
  const abD1 = row.adv_base_d1 ?? 0, abH4 = row.adv_base_h4 ?? 0, abH1 = row.adv_base_h1 ?? 0;
  const aqD1 = row.adv_quote_d1 ?? 0, aqH4 = row.adv_quote_h4 ?? 0, aqH1 = row.adv_quote_h1 ?? 0;
  if (!abD1 && !abH4 && !abH1 && !aqD1 && !aqH4 && !aqH1) return null; // no advance data at all
  const bD1c = row.base_d1 ?? 0, bH4c = row.base_h4 ?? 0, bH1c = row.base_h1 ?? 0;
  const qD1c = row.quote_d1 ?? 0, qH4c = row.quote_h4 ?? 0, qH1c = row.quote_h1 ?? 0;
  const sub = (adv, cur) => (adv !== 0 ? adv : cur);
  const advH1 = (bD1c + bH4c + sub(abH1, bH1c)) - (qD1c + qH4c + sub(aqH1, qH1c));                       // next-day reading
  const advH4 = (bD1c + sub(abH4, bH4c) + sub(abH1, bH1c)) - (qD1c + sub(aqH4, qH4c) + sub(aqH1, qH1c)); // next-week reading
  const advD1 = (sub(abD1, bD1c) + sub(abH4, bH4c) + sub(abH1, bH1c)) - (sub(aqD1, qD1c) + sub(aqH4, qH4c) + sub(aqH1, qH1c)); // next-month reading
  const isBuy = (row.gap ?? 0) > 0;
  const okH1 = isBuy ? advH1 >= 5 : advH1 <= -5;
  const okH4 = isBuy ? advH4 >= 5 : advH4 <= -5;
  const okD1 = isBuy ? advD1 >= 5 : advD1 <= -5;
  // Time context
  const now = new Date();
  const dow = now.getUTCDay(); // 0=Sun..5=Fri
  const dom = now.getUTCDate();
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()+1, 0)).getUTCDate();
  const isFriWindow = dow >= 4 || dow === 0; // Thu-Sun: weekend decision window
  const isMonthEnd  = (lastDay - dom) <= 2;  // Last 3 days of month
  // Per-TF verdicts
  const fmtg = v => (v>0?'+':'')+v;
  const h1v = okH1 ? {tag:'HOLD',note:`Next-day reading ${fmtg(advH1)} keeps the bias`,c:'#00ff9f'} : {tag:'EXIT',note:`Next-day reading ${fmtg(advH1)} loses the bias`,c:'#ff4d6d'};
  const h4v = okH4 ? {tag:'HOLD',note:(isFriWindow?'Safe to hold over weekend':`Next-week reading ${fmtg(advH4)} keeps the bias`)+' · valid from Fri close',c:'#00ff9f'} : {tag:'EXIT',note:(isFriWindow?'Exit before weekend — next-week reading weak':`Next-week reading ${fmtg(advH4)} loses the bias`)+' · valid from Fri close',c:'#ff4d6d'};
  const d1v = okD1 ? {tag:'HOLD',note:isMonthEnd?'Safe to hold into new month':`Next-month reading ${fmtg(advD1)} keeps the bias`,c:'#00ff9f'} : {tag:'EXIT',note:isMonthEnd?'Exit before month end — next-month reading weak':`Next-month reading ${fmtg(advD1)} loses the bias`,c:'#ff4d6d'};
  // Combined hold/exit
  const exits = [!okH1, !okH4, !okD1].filter(Boolean).length;
  let holdExit, label, color, bg, border, level;
  if (exits === 0) {
    holdExit = 'HOLD'; label = '🟢 HOLD'; color = '#00ff9f';
    bg = 'rgba(0,255,159,0.08)'; border = 'rgba(0,255,159,0.25)'; level = 'OK';
  } else if (exits === 1 && okH4) {
    holdExit = 'HOLD'; label = '🟡 HOLD — H1 WEAK'; color = '#ffd166';
    bg = 'rgba(255,209,102,0.10)'; border = 'rgba(255,209,102,0.35)'; level = 'WARN';
  } else if (exits >= 2 || !okH4) {
    holdExit = 'EXIT'; label = '🔴 EXIT'; color = '#ff4d6d';
    bg = 'rgba(255,77,109,0.10)'; border = 'rgba(255,77,109,0.35)'; level = 'BAD';
  } else {
    holdExit = 'HOLD'; label = '🟡 HOLD — CAUTION'; color = '#ffd166';
    bg = 'rgba(255,209,102,0.10)'; border = 'rgba(255,209,102,0.35)'; level = 'WARN';
  }
  const fmt = v => (v>0?'+':'')+v;
  const detail = `TMRW:${fmt(advH1)} WK:${fmt(advH4)} MTH:${fmt(advD1)}`;
  // Contextual urgency flags
  const urgent = [];
  if (isFriWindow && !okH4) urgent.push('⚠️ WEEKEND');
  if (isMonthEnd  && !okD1) urgent.push('⚠️ MONTH-END');
  return { label, color, bg, border, detail, level, holdExit, urgent,
    verdicts: { h1:h1v, h4:h4v, d1:d1v }, gaps: { h1:advH1, h4:advH4, d1:advD1 } };
}

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
  if (bl === 'NEUTRAL'&& ql === 'NEUTRAL')return { label: 'NEUTRAL vs NEUTRAL', color: '#ff4d6d', note: 'INVALID' };
  return { label: `${bl} / ${ql}`, color: 'var(--text-muted)', note: '' };
}
// ===== CONFIDENCE SCORING =====
function computeConfidence(row, trend, cotBias, memoryIndex) {
  if (!row) return null;
  const gap = Math.abs(row.gap ?? 0);
  const biasLabel = row.bias || biasFromGap(row.gap ?? 0).label;
  const isBuy = (row.gap ?? 0) > 0;
  const baseVals = [row.base_d1, row.base_h4, row.base_h1].filter(v => v != null);
  const quoteVals = [row.quote_d1, row.quote_h4, row.quote_h1].filter(v => v != null);
  const bsRaw = baseVals.length ? (isBuy ? Math.max(...baseVals.filter(v => v > 0), 0) : Math.min(...baseVals.filter(v => v < 0), 0)) : 0;
  const qsRaw = quoteVals.length ? (isBuy ? Math.min(...quoteVals.filter(v => v < 0), 0) : Math.max(...quoteVals.filter(v => v > 0), 0)) : 0;
  const bl = scoreLabel(bsRaw);
  const ql = scoreLabel(qsRaw);
  let score = 0;
  const reasons = [];
  if (gap >= 8) { score += 25; reasons.push('GAP≥8 +25'); }
  else if (gap >= 5) { score += 15; reasons.push('GAP≥5 +15'); }
  const diff = Math.abs(bsRaw - qsRaw);
  if (diff >= 8) { score += 20; reasons.push('MU≥8 +20'); }
  else if (diff >= 5) { score += 10; reasons.push('MU≥5 +10'); }
  const pl = plZoneBadge(row.pl_zone, biasLabel);
  const flStValid = pl?.valid === true;
  if (flStValid) { score += 15; reasons.push('PL✅ +15'); }
  const goodTrend = isBuy ? 'UPTREND' : 'DOWNTREND';
  const h1Ok = row.box_h1_trend === goodTrend;
  const h4Ok = row.box_h4_trend === goodTrend;
  if (h1Ok && h4Ok) { score += 10; reasons.push('H1+H4 +10'); }
  else if (h1Ok) { score += 5; reasons.push('H1 +5'); }
  if (cotBias) {
    const cb = typeof cotBias === 'string' ? cotBias : cotBias.bias;
    if ((biasLabel === 'BUY' && cb === 'BULLISH') || (biasLabel === 'SELL' && cb === 'BEARISH')) { score += 10; reasons.push('COT +10'); }
  }
  const mom = trend?.momentum || row.momentum || '';
  if (mom === 'STRONG') { score += 10; reasons.push('MOM+10'); }
  else if (mom === 'BUILDING') { score += 5; reasons.push('MOM+5'); }
  const str = Math.abs(row.strength ?? 0);
  if (str >= 3) { score += 10; reasons.push('STR≥3 +10'); }
  else if (str >= 1) { score += 5; reasons.push('STR≥1 +5'); }
  if (row.box_h4_trend && row.box_h4_trend !== 'UNKNOWN' && !h4Ok) { score -= 10; reasons.push('H4✗ -10'); }
  if (!flStValid) { score -= 15; reasons.push('PL✗ -15'); }
  if (['FADING','REVERSING','COOLING','NEUTRAL'].includes(mom)) { score -= 10; reasons.push('MOMWK -10'); }
  score = Math.max(0, Math.min(100, score));
  // Historical edge lookup from memoryIndex
  const edge = memoryIndex ? getEdgeMemory(row, memoryIndex) : null;
  const historical = edge ? { winRate: edge.winRate, resRate: edge.resRate, sample: edge.sample, maturity: edge.maturity, flag: edge.flag } : null;
  // Conflict: real-time confidence high but proven historical win rate low
  const conflict = historical && historical.maturity === 'proven' && score >= 70 && historical.winRate != null && Math.round(historical.winRate * 100) <= 50;
  return { confidence: score, reasons, historical, conflict };
}
function confStyle(c) {
  if (c == null) return null;
  if (c >= 90) return { label:'ELITE', color:'#00ff9f', bg:'rgba(0,255,159,0.10)', border:'rgba(0,255,159,0.35)' };
  if (c >= 75) return { label:'HIGH', color:'#00b4ff', bg:'rgba(0,180,255,0.10)', border:'rgba(0,180,255,0.35)' };
  if (c >= 60) return { label:'MOD', color:'#ffd166', bg:'rgba(255,209,102,0.10)', border:'rgba(255,209,102,0.35)' };
  if (c >= 40) return { label:'LOW', color:'#ffaa44', bg:'rgba(255,170,68,0.10)', border:'rgba(255,170,68,0.35)' };
  return { label:'WEAK', color:'var(--text-muted)', bg:'rgba(40,50,80,0.15)', border:'rgba(40,50,80,0.35)' };
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
    // Handle: "2026-03-31T00:07:31", "2026-03-31 00:07:31", "2026-03-31T00:07:31Z"
    let s = String(dt).trim().replace(' ', 'T');
    if (!s.endsWith('Z') && !s.includes('+')) s += 'Z';
    const parsed = new Date(s);
    if (isNaN(parsed.getTime())) return '';
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
                const valid = isValid(gap) && !row?.hard_invalid && !isNeutralMatchup(row);
                const bias = biasFromGap(gap);
                const momentum = row?.momentum || '—';
                const momColor = momentum==='STRONG'?'#00ff9f':momentum==='BUILDING'?'#66ffcc':momentum==='SPARK'?'#ffd166':momentum==='CONSOLIDATING'?'#00b4ff':momentum==='COOLING'?'#ffaa44':momentum==='FADING'?'#ff7744':momentum==='REVERSING'?'#ff4d6d':'var(--text-muted)';

                return (
                  <tr key={symbol} style={{borderBottom:'1px solid var(--border)'}}>
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
  const COLORS=['#00b4ff','#00ff9f','#ffd166','#ff4d6d','#ff9944','#cc77ff','#ff77cc','#77ffcc','#ffcc77','#4499ff','#ff9977','#99ff77'];

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
        <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>SELECT UP TO 3 PAIRS</span>
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
      {hover&&<div style={{display:'flex',gap:16,padding:'6px 10px',background:'var(--bg-card)',borderRadius:6,border:'1px solid var(--border)',flexWrap:'wrap'}}><span style={{fontFamily:mono,fontSize:10,color:'var(--text-muted)'}}>{hover.ts}</span>{Object.entries(hover.vals).map(([s,v],i)=>{ return <span key={s} style={{fontFamily:mono,fontSize:10,color:COLORS[symbols.indexOf(s)%COLORS.length],fontWeight:700}}>{s}: {v>0?'+':''}{v.toFixed(0)}</span>;})}</div>}
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
  const [filter,setFilter]=useState('VALID');
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
  useEffect(()=>{
    load();
    const tick=()=>{ if(typeof document!=='undefined' && document.visibilityState==='hidden') return; load(); };
    const t=setInterval(tick,60000);
    return()=>clearInterval(t);
  },[load]);
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

// ===== PLATFORM BUTTONS =====
const CTRADER_BASE='https://ct.icmarkets.com/copy/ctrader-open/?cmd=chart&symbol=';
const PLATFORMS=[
  {label:'cTrader',short:'CT',color:'#00b4ff',getUrl:sym=>CTRADER_BASE+encodeURIComponent(sym)},
  {label:'MetaTrader 4',short:'MT4',color:'#f48024',getUrl:null},
  {label:'MetaTrader 5',short:'MT5',color:'#8b5cf6',getUrl:null},
];
function PlatformButtons({symbol}){
  const [copied,setCopied]=useState(null);
  const handleClick=(e,p)=>{
    e.stopPropagation();e.preventDefault();
    const sym=symbol||'';
    if(p.getUrl){window.open(p.getUrl(sym),'_blank');return;}
    navigator.clipboard.writeText(sym).then(()=>{setCopied(p.short);setTimeout(()=>setCopied(null),1800);}).catch(()=>{});
  };
  return(
    <div style={{display:'flex',alignItems:'center',gap:4,paddingTop:2}}>
      <span style={{fontFamily:mono,fontSize:7,color:copied?'#00ff9f':'var(--text-muted)',letterSpacing:1,flexShrink:0,transition:'color 0.2s'}}>{copied?'✓ COPIED':'OPEN IN'}</span>
      {PLATFORMS.map(p=>(
        <button key={p.short}
          title={p.getUrl?`Open ${symbol} in ${p.label}`:`Copy ${symbol} for ${p.label}`}
          onClick={e=>handleClick(e,p)}
          onMouseEnter={e=>{e.currentTarget.style.background=p.color+'28';e.currentTarget.style.borderColor=p.color+'99';}}
          onMouseLeave={e=>{e.currentTarget.style.background=copied===p.short?p.color+'38':p.color+'14';e.currentTarget.style.borderColor=copied===p.short?p.color+'99':p.color+'44';}}
          style={{fontFamily:mono,fontSize:8,color:p.color,background:copied===p.short?p.color+'38':p.color+'14',border:`1px solid ${copied===p.short?p.color+'99':p.color+'44'}`,borderRadius:4,padding:'2px 8px',cursor:'pointer',letterSpacing:0.5,fontWeight:700,transition:'background 0.15s, border-color 0.15s'}}>
          {copied===p.short?'✓':p.short}
        </button>
      ))}
    </div>
  );
}

// ===== PAIR CARD =====
// ===== EXTREME-TIMEFRAME BADGE =====
// Lists every timeframe whose Panda score is extreme (|value| 4/5/6), with its
// signed value. Non-extreme values (1/2/3) are ignored. A side with no extreme
// timeframe (e.g. CAD) is omitted. Reads base_score_tf / quote_score_tf written
// by the engine (derive_score_tf), format "D1+4 H4+5".
function ScoreTfBadge({ row, showLabel = true, mt = 2, showEmpty = false }) {
  const mono = "'Share Tech Mono',monospace";
  const b = row?.base_score_tf || '';
  const q = row?.quote_score_tf || '';
  const bc = row?.base_currency || row?.symbol?.slice(0, 3) || 'BASE';
  const qc = row?.quote_currency || row?.symbol?.slice(3, 6) || 'QUOTE';
  const side = (cur, str, keyp) => {
    if (!str) return null;
    // Only accept new-format tokens like "D1+4" / "H1-6"; ignore legacy values.
    const toks = str.split(/\s+/).filter(t => /^(D1|H4|H1)[+-]\d+$/.test(t));
    if (!toks.length) return null;
    return (
      <span key={keyp} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: mono, fontSize: 8, color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: 0.5 }}>{cur}</span>
        {toks.map((t, i) => {
          const tf = t.slice(0, 2);
          const val = t.slice(2);
          const pos = !val.startsWith('-');
          const col = pos ? '#00ff9f' : '#ff4d6d';
          return <span key={i} title={`${cur} ${tf} score ${val} (extreme)`} style={{ fontFamily: mono, fontSize: 8, color: col, background: col + '14', border: `1px solid ${col}33`, borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap', fontWeight: 600, cursor: 'help' }}>{tf} {val}</span>;
        })}
      </span>
    );
  };
  const bEl = side(bc, b, 'b');
  const qEl = side(qc, q, 'q');
  if (!bEl && !qEl) {
    if (!showEmpty) return null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: mt, flexWrap: 'wrap' }}>
        {showLabel && <span style={{ fontFamily: mono, fontSize: 8, color: 'var(--text-secondary)', letterSpacing: 1, fontWeight: 600 }}>EXTREME TF</span>}
        <span title="No timeframe on either currency has an extreme score (±4/5/6) right now — gap is built from moderate scores." style={{ fontFamily: mono, fontSize: 8, color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', cursor: 'help' }}>NONE</span>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: mt, flexWrap: 'wrap' }}>
      {showLabel && <span style={{ fontFamily: mono, fontSize: 8, color: 'var(--text-secondary)', letterSpacing: 1, fontWeight: 600 }}>EXTREME TF</span>}
      {bEl}
      {qEl}
    </div>
  );
}

function PairCard({ row, trend, cotBias, confidence, memoryIndex, pdr, newsAlert }) {
  const gap=row.gap??0,valid=isValid(gap)&&!row.hard_invalid&&!isNeutralMatchup(row),bias=biasFromGap(gap),sig=signalLabel(row.signal,row.strength),strVal=row.strength??0,sc=stateColor(row.state),t=trend||{};
  const sparkColor=t.trend1h==='STRONGER'?'#00ff9f':t.trend1h==='WEAKER'?'#ff4d6d':'var(--text-muted)';
  const momIcons={BUILDING:'🚀',EMERGING:'📈',FADING:'📉',COOLING:'🌡️',REVERSAL:'⚠️',NEUTRAL:'▬',SPARK:'⚡',STRONG:'🔥',STABLE:'▬',CONSOLIDATING:'🔵',REVERSING:'⚠️'};
  const gapTrend=(row.delta_short??0)>0.5?'STRONGER':(row.delta_short??0)<-0.5?'WEAKER':'STABLE';
  if(!valid) return (
    <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px',display:'flex',flexDirection:'column',gap:7,height:'100%',boxSizing:'border-box',flex:1}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><span style={{fontFamily:orb,fontSize:12,fontWeight:700,letterSpacing:2,color:'var(--text-secondary)'}}>{row.symbol}</span><span style={{fontFamily:mono,fontSize:9,color:'var(--bg-card)',background:'var(--text-muted)',border:'1px solid var(--border)',borderRadius:4,padding:'2px 7px'}}>WAIT</span></div>
      <div style={{display:'flex',alignItems:'baseline',gap:4}}><span style={{fontFamily:orb,fontSize:22,fontWeight:900,color:'var(--text-muted)',lineHeight:1}}>{gap>0?'+':''}{Number(gap).toFixed(1)}</span><span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>GAP</span></div>
    </div>
  );
  return (
    <div style={{background:'linear-gradient(160deg,var(--bg-card),var(--bg-card))',border:`1px solid ${t.closeAlert?'#ff4d6d':bias.border}`,borderRadius:10,padding:'12px 14px',display:'flex',flexDirection:'column',gap:8,position:'relative',overflow:'hidden',boxShadow:t.closeAlert?'0 0 16px rgba(255,77,109,0.2)':`0 0 12px ${bias.color}0d`,transition:'transform 0.12s'}} onMouseEnter={e=>e.currentTarget.style.transform='translateY(-2px)'} onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}>
      <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${t.closeAlert?'#ff4d6d':bias.color}88,transparent)`}}/>
      {t.closeAlert&&<div style={{background:'rgba(255,77,109,0.1)',border:'1px solid rgba(255,77,109,0.4)',borderRadius:5,padding:'4px 8px',display:'flex',alignItems:'center',gap:5}}><span>⚠️</span><span style={{fontFamily:mono,fontSize:9,color:'#ff4d6d',letterSpacing:1}}>CONSIDER CLOSING</span></div>}
      {newsAlert&&<div style={{background:'rgba(255,209,102,0.08)',border:'1px solid rgba(255,209,102,0.35)',borderRadius:5,padding:'3px 8px',display:'flex',alignItems:'center',gap:5}}><span style={{fontSize:10}}>📰</span><span style={{fontFamily:mono,fontSize:9,color:'#ffd166',letterSpacing:1,fontWeight:700}}>HIGH IMPACT NEWS</span></div>}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><span style={{fontFamily:orb,fontSize:13,fontWeight:900,letterSpacing:2,color:'var(--text-primary)'}}>{row.symbol}</span><div style={{display:'flex',alignItems:'center',gap:5}}><span style={{fontSize:12}}>{sig.icon}</span><span style={{fontFamily:mono,fontSize:10,color:bias.color,background:bias.bg,border:`1px solid ${bias.border}`,borderRadius:4,padding:'2px 7px',fontWeight:700}}>{bias.label}</span></div></div>
      <VerdictBanner row={row} pdr={pdr} t={t}/>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontFamily:orb,fontSize:26,fontWeight:900,color:bias.color,textShadow:`0 0 14px ${bias.color}99`,lineHeight:1}}>{gap>0?'+':''}{Number(gap).toFixed(1)}</span>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:1}}><TrendArrow trend={gapTrend} size={15}/><span style={{fontFamily:mono,fontSize:7,color:gapTrend==='STRONGER'?'#00ff9f':gapTrend==='WEAKER'?'#ff4d6d':'var(--text-muted)',letterSpacing:0.5}}>{gapTrend==='STRONGER'?'STR':gapTrend==='WEAKER'?'WKN':'STB'}</span></div>
        </div>
        <Sparkline data={t.history} color={sparkColor}/>
      </div>
      <PhaseBadge row={row} pdr={pdr}/>
      {(()=>{const mu=getMatchup(row);if(!mu)return null;return(<div style={{display:'flex',alignItems:'center',gap:6,marginTop:2}}><span style={{fontFamily:mono,fontSize:8,color:'var(--text-secondary)',letterSpacing:1,fontWeight:600}}>MATCHUP</span><span style={{fontFamily:mono,fontSize:9,color:mu.color,background:mu.color+'12',border:`1px solid ${mu.color}30`,borderRadius:4,padding:'1px 7px',whiteSpace:'nowrap'}}>{mu.label}</span>{mu.note==='IDEAL'&&<span style={{fontFamily:mono,fontSize:7,color:mu.color,letterSpacing:1,opacity:0.8}}>IDEAL</span>}{mu.note==='AVOID'&&<span style={{fontFamily:mono,fontSize:7,color:'#ffaa44',letterSpacing:1,opacity:0.8}}>AVOID</span>}</div>);})()}
      <ScoreTfBadge row={row}/>
      {(()=>{const bh1=boxTrend(row.box_h1_trend),bh4=boxTrend(row.box_h4_trend);if(!bh1&&!bh4)return null;return(<div style={{display:'flex',alignItems:'center',gap:5,marginTop:2}}><span style={{fontFamily:mono,fontSize:8,color:'var(--text-secondary)',letterSpacing:1,fontWeight:600}}>BOX</span>{bh4&&<span style={{fontFamily:mono,fontSize:8,color:bh4.color,background:bh4.bg,border:`1px solid ${bh4.border}`,borderRadius:3,padding:'1px 6px'}}>H4 {bh4.label}</span>}{bh1&&<span style={{fontFamily:mono,fontSize:8,color:bh1.color,background:bh1.bg,border:`1px solid ${bh1.border}`,borderRadius:3,padding:'1px 6px'}}>H1 {bh1.label}</span>}</div>);})()}
      {(()=>{ const pl=plZoneBadge(row.pl_zone,row.bias); if(!pl)return null; const plTip=pl.valid?'Panda Lines confirmed: Panda Lines agree with gap direction. This is the price confirmation layer.':'Panda Lines not confirmed: price structure does not yet agree with gap direction. Wait for alignment or use as additional caution.'; return(<div style={{display:'flex',alignItems:'center',gap:5,marginTop:2}}><span style={{fontFamily:mono,fontSize:8,color:'var(--text-secondary)',letterSpacing:1,fontWeight:600}}>PL</span><span title={plTip} style={{fontFamily:mono,fontSize:8,color:pl.color,background:pl.bg,border:`1px solid ${pl.border}`,borderRadius:3,padding:'1px 6px',fontWeight:700,cursor:'help'}}>{pl.label}</span>{pl.valid&&<span style={{fontFamily:mono,fontSize:7,color:'#00ff9f',letterSpacing:1}}>✅</span>}{!pl.valid&&<span style={{fontFamily:mono,fontSize:7,color:'#ff7744',letterSpacing:1}}>⛔</span>}</div>);})()}{(()=>{
  const bc=boxConfirm(row.bias,row.box_h4_trend,row.box_h1_trend);
  const af=atrFill(row.atr);
  if(!bc&&!af)return null;
  return(<div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap',marginTop:2}}>
    {bc&&<span style={{fontFamily:mono,fontSize:8,color:bc.color,background:bc.bg,border:`1px solid ${bc.border}`,borderRadius:4,padding:'1px 7px',fontWeight:700}}>{bc.label}</span>}
    {af&&<span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:0.5}}>ATR {af.atrPips}p · {af.pipsPerHour}p/hr</span>}
  </div>);
})()}
{(()=>{const adv=advScore(row);if(!adv)return null;return(<div style={{display:'flex',flexDirection:'column',gap:3,marginTop:2}}>
<div style={{display:'flex',alignItems:'center',gap:5}}>
<span style={{fontFamily:mono,fontSize:8,color:adv.color,background:adv.bg,border:`1px solid ${adv.border}`,borderRadius:4,padding:'1px 7px',fontWeight:700}}>{adv.label}</span>
{adv.urgent&&adv.urgent.map((u,i)=><span key={i} style={{fontFamily:mono,fontSize:7,color:'#ff4d6d',fontWeight:700,letterSpacing:0.5}}>{u}</span>)}
</div>
<div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
{[['TMRW',adv.verdicts.h1,adv.gaps.h1],['NEXT WK',adv.verdicts.h4,adv.gaps.h4],['NEXT MTH',adv.verdicts.d1,adv.gaps.d1]].map(([tf,v,g])=><span key={tf} title={v.note} style={{fontFamily:mono,fontSize:7,color:v.c,background:v.c+'12',border:`1px solid ${v.c}28`,borderRadius:3,padding:'1px 5px',whiteSpace:'nowrap',cursor:'help'}}>{tf} {v.tag} {g>0?'+':''}{g}</span>)}
</div>
</div>);})()}{cotBias&&<div style={{display:'flex',alignItems:'center',gap:4}}><span style={{fontFamily:mono,fontSize:8,color:'var(--text-secondary)',letterSpacing:1,fontWeight:600}}>COT</span><span style={{fontFamily:mono,fontSize:9,color:cotBias.bias==='BULLISH'?'#00ff9f':'#ff4d6d',background:cotBias.bias==='BULLISH'?'rgba(0,255,159,0.08)':'rgba(255,77,109,0.08)',border:`1px solid ${cotBias.bias==='BULLISH'?'#00ff9f33':'#ff4d6d33'}`,borderRadius:3,padding:'1px 5px'}}>{cotBias.bias==='BULLISH'?'▲':'▼'} {cotBias.bias}</span></div>}
      {(()=>{if(!confidence)return null;const cs=confStyle(confidence.confidence);if(!cs)return null;const tip=confidence.reasons?confidence.reasons.join(' · '):'';return(<div style={{display:'flex',alignItems:'center',gap:5,marginTop:2}}><span style={{fontFamily:mono,fontSize:8,color:'var(--text-secondary)',letterSpacing:1,fontWeight:600}}>CONF</span><span title={tip} style={{fontFamily:mono,fontSize:9,color:cs.color,background:cs.bg,border:`1px solid ${cs.border}`,borderRadius:4,padding:'1px 7px',fontWeight:700,cursor:'help'}}>{confidence.confidence} {cs.label}</span>{confidence.conflict&&<span title="Real-time confidence is high but historical win rate for this gap level is ≤50%. Proceed with caution." style={{fontFamily:mono,fontSize:8,color:'#ff4d6d',background:'rgba(255,77,109,0.1)',border:'1px solid rgba(255,77,109,0.3)',borderRadius:4,padding:'1px 6px',fontWeight:700,cursor:'help'}}>⚠️ CONFLICT</span>}</div>);})()}
      {(()=>{const em=getEdgeMemory(row,memoryIndex);if(!em)return null;const fc=em.flag==='PROVEN_EDGE'?'#00ff9f':em.flag==='DEAD_ZONE'?'#ff4d6d':'#00b4ff';const icon=em.flag==='PROVEN_EDGE'?'✅':em.flag==='DEAD_ZONE'?'⛔':'📊';const lbl=em.flag?em.flag.replace('_',' '):(em.maturity||'').toUpperCase();const wrPct=Math.round((em.winRate||0)*100);const resPct=em.resRate!=null?Math.round(em.resRate*100):null;const edgeTip=em.flag==='PROVEN_EDGE'?`Proven edge: ${wrPct}% win rate from ${em.sample} resolved signals at this gap level. High probability setup.`:em.flag==='DEAD_ZONE'?`Dead zone: only ${wrPct}% win rate from ${em.sample} signals. Historically this gap level loses money.`:`${(em.maturity||'').toUpperCase()}: ${wrPct}% win rate from ${em.sample} signals. Needs more data to confirm edge.`;return(<div style={{display:'flex',alignItems:'center',gap:5,marginTop:2,flexWrap:'wrap'}}><span style={{fontFamily:mono,fontSize:8,color:'var(--text-secondary)',letterSpacing:1,fontWeight:600}}>EDGE</span><span title={edgeTip} style={{fontFamily:mono,fontSize:9,color:fc,background:fc+'12',border:`1px solid ${fc}33`,borderRadius:4,padding:'1px 7px',fontWeight:700,cursor:'help'}}>{icon} {lbl}</span><span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>Win:{wrPct}%{resPct!=null?` | Res:${resPct}%`:''} (n={em.sample})</span></div>);})()}
      {(pdr||row.pdr_dir!=null)&&<div style={{display:'flex',alignItems:'center',gap:5,marginTop:2,flexWrap:'wrap'}}><span style={{fontFamily:mono,fontSize:8,color:'var(--text-secondary)',letterSpacing:1,fontWeight:600}}>PDR</span>{row.pdr_dir!=null?<LivePdrBadge row={row}/>:<PdrBadge pdr={pdr}/>}<PdrVerdict row={row} pdr={pdr}/></div>}
      {(()=>{const isBuy=bias.label==='BUY',isSell=bias.label==='SELL';if(!isBuy&&!isSell)return null;const isJpy=row.symbol?.includes('JPY');const dec=isJpy?3:5;const levels=isBuy?[{l:'PDL',v:row.pdl},{l:'PWL',v:row.pwl},{l:'PML',v:row.pml},{l:'PYL',v:row.pyl}].filter(x=>x.v!=null).sort((a,b)=>b.v-a.v):[{l:'PDH',v:row.pdh},{l:'PWH',v:row.pwh},{l:'PMH',v:row.pmh},{l:'PYH',v:row.pyh}].filter(x=>x.v!=null).sort((a,b)=>a.v-b.v);const top2=levels.slice(0,2);if(!top2.length)return null;const c1=isBuy?'#00ff9f':'#ff4d6d';const c2='#00b4ff';return(<div style={{display:'flex',alignItems:'center',gap:5,marginTop:2,flexWrap:'wrap'}}><span style={{fontFamily:mono,fontSize:8,color:'var(--text-secondary)',letterSpacing:1,fontWeight:600}}>PB ENTRY</span>{top2.map((lv,i)=><span key={lv.l} style={{fontFamily:mono,fontSize:9,color:i===0?c1:c2,background:(i===0?c1:c2)+'12',border:`1px solid ${(i===0?c1:c2)}28`,borderRadius:3,padding:'1px 6px',fontWeight:600}}>{lv.l} {Number(lv.v).toFixed(dec)}</span>)}</div>);})()}
      <div style={{display:'flex',flexDirection:'column',gap:3}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontFamily:mono,fontSize:10,color:t.momentumColor||'var(--text-muted)',background:(t.momentumColor||'var(--text-muted)')+'18',border:`1px solid ${(t.momentumColor||'var(--text-muted)')}30`,borderRadius:4,padding:'2px 8px',letterSpacing:1}}>{momIcons[t.momentum]||'▬'} {t.momentum||'NEUTRAL'}</span>
          {t.velocity&&t.velocity!=='STABLE'&&<span style={{fontFamily:mono,fontSize:9,color:t.velocity==='ACCELERATING'?'#00ff9f':'#ffaa44'}}>{t.velocity==='ACCELERATING'?'⚡ ACC':'↘ DEC'}</span>}
        </div>
        {/* momentum 👉 action removed — the VERDICT banner is the single instruction; momentum stays as data */}
      </div>
      <div style={{display:'flex',background:'var(--bg-card)',borderRadius:6,padding:'6px 8px'}}><DeltaChip label="1H" delta={t.delta1h}/><div style={{width:1,background:'var(--border)',margin:'0 4px'}}/><DeltaChip label="4H" delta={t.delta4h}/><div style={{width:1,background:'var(--border)',margin:'0 4px'}}/><DeltaChip label="8H" delta={t.delta8h}/></div>
      <div style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:5,height:5,borderRadius:'50%',background:sc,flexShrink:0}}/><span style={{fontFamily:mono,fontSize:9,color:sc}}>{row.state||'NEUTRAL'}</span></div>
      <div style={{background:'var(--bg-card)',borderRadius:6,padding:'7px 10px',display:'flex',flexDirection:'column',gap:5}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontFamily:mono,fontSize:9,color:'var(--text-secondary)',letterSpacing:2,fontWeight:600}}>STRENGTH</span><span style={{fontFamily:orb,fontSize:15,fontWeight:700,color:strColor(strVal),textShadow:`0 0 8px ${strColor(strVal)}66`}}>{Number(strVal).toFixed(2)}</span></div><div style={{height:4,background:'var(--border)',borderRadius:2,overflow:'hidden'}}><div style={{width:`${Math.min(100,(Math.abs(strVal)/30)*100)}%`,height:'100%',background:strColor(strVal),borderRadius:2}}/></div></div>
      <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid var(--border)',paddingTop:5}}><span style={{fontFamily:mono,fontSize:9,color:sig.color}}>{sig.icon} {sig.text}</span><span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{formatTime(row.updated_at)}</span></div>
      <PlatformButtons symbol={row.symbol}/>
    </div>
  );
}


// ===== PAIR CARD MODAL =====
function PairCardModal({ row, trend, cotBias, onClose, isMobile, confidence, memoryIndex, pdr, newsAlert }) {
  if (!row) return null;
  const gap = row.gap ?? 0;
  const bias = biasFromGap(gap);
  const t = trend || {};
  const mu = getMatchup(row);
  const bc = boxConfirm(row.bias, row.box_h4_trend, row.box_h1_trend);
  const bh4 = boxTrend(row.box_h4_trend);
  const bh1 = boxTrend(row.box_h1_trend);
  const af = atrFill(row.atr);
  const sc = stateColor(row.state);
  const strVal = row.strength ?? 0;
  const g = getMomentumAction(t.momentum || row.momentum, row.bias, t);
  const momColor = t.momentumColor || 'var(--text-muted)';
  const momIcons = {BUILDING:'🚀',EMERGING:'📈',FADING:'📉',COOLING:'🌡️',NEUTRAL:'▬',SPARK:'⚡',STRONG:'🔥',STABLE:'▬',CONSOLIDATING:'🔵',REVERSING:'⚠️'};

  const TFRow = ({label, d1, h4, h1}) => (
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',background:'var(--bg-card)',borderRadius:6}}>
      <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2,minWidth:50}}>{label}</span>
      {[['D1',d1],['H4',h4],['H1',h1]].map(([tf,v])=>{
        const val = v ?? 0;
        const col = val >= 4 ? '#00ff9f' : val <= -4 ? '#ff4d6d' : Math.abs(val) >= 1 ? '#ffd166' : 'var(--text-muted)';
        return (
          <div key={tf} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2,flex:1}}>
            <span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)'}}>{tf}</span>
            <span style={{fontFamily:mono,fontSize:13,fontWeight:700,color:col}}>{val > 0 ? '+' : ''}{val}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',padding:isMobile?8:20,backdropFilter:'blur(4px)'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--bg-card)',border:`2px solid ${bias.border}`,borderRadius:isMobile?12:16,padding:isMobile?16:28,width:'100%',maxWidth:isMobile?'100%':560,maxHeight:'95vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:isMobile?10:14,boxShadow:`0 0 40px ${bias.color}33`,position:'relative'}}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontFamily:orb,fontSize:22,fontWeight:900,letterSpacing:3,color:'var(--text-primary)'}}>{row.symbol}</span>
            <span style={{fontFamily:mono,fontSize:11,color:bias.color,background:bias.bg,border:`1px solid ${bias.border}`,borderRadius:5,padding:'3px 10px',fontWeight:700}}>{bias.label}</span>
            {row.execution && row.execution !== 'NONE' && (
              <span style={{fontFamily:mono,fontSize:10,color:'#ffd166',background:'rgba(255,209,102,0.1)',border:'1px solid rgba(255,209,102,0.3)',borderRadius:5,padding:'3px 10px'}}>{row.execution}</span>
            )}
            {(()=>{if(!confidence)return null;const cs=confStyle(confidence.confidence);if(!cs)return null;return <span style={{fontFamily:mono,fontSize:10,color:cs.color,background:cs.bg,border:`1px solid ${cs.border}`,borderRadius:5,padding:'3px 10px',fontWeight:700}}>{confidence.confidence} {cs.label}</span>;})()}
          </div>
          <button onClick={onClose} style={{background:'transparent',border:'1px solid var(--border)',borderRadius:6,color:'var(--text-muted)',fontFamily:mono,fontSize:11,padding:'5px 12px',cursor:'pointer'}}>✕ ESC</button>
        </div>

        {/* GAP + Sparkline */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:'rgba(0,0,0,0.2)',borderRadius:10,border:`1px solid ${bias.border}`}}>
          <div>
            <div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2,marginBottom:4}}>GAP SCORE</div>
            <span style={{fontFamily:orb,fontSize:42,fontWeight:900,color:bias.color,textShadow:`0 0 20px ${bias.color}88`,lineHeight:1}}>{gap > 0 ? '+' : ''}{Number(gap).toFixed(1)}</span>
          </div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8}}>
            <Sparkline data={t.history} color={bias.color} w={120} h={40}/>
            <div style={{display:'flex',gap:6}}>
              {[['1H',t.delta1h],['4H',t.delta4h],['8H',t.delta8h]].map(([l,v])=>{
                const val = v ?? 0; const col = Math.abs(val)<0.1?'var(--text-muted)':val>0?'#00ff9f':'#ff4d6d';
                return <span key={l} style={{fontFamily:mono,fontSize:10,color:col}}>{l}: {val>0?'+':''}{val}</span>;
              })}
            </div>
          </div>
        </div>

        {/* Box Confirm + Matchup row */}
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {bc && <span style={{fontFamily:mono,fontSize:11,color:bc.color,background:bc.bg,border:`1px solid ${bc.border}`,borderRadius:6,padding:'4px 12px',fontWeight:700}}>{bc.label}</span>}
          {mu && <span style={{fontFamily:mono,fontSize:10,color:mu.color,background:mu.color+'12',border:`1px solid ${mu.color}30`,borderRadius:6,padding:'4px 12px'}}>{mu.label}</span>}
        </div>

        {/* Extreme timeframe badge */}
        <ScoreTfBadge row={row} mt={0} showEmpty/>

        {/* ADV Score Warning */}
        {(()=>{const adv=advScore(row);if(!adv)return null;return(
          <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:adv.bg,borderRadius:8,border:`1px solid ${adv.border}`}}>
            <span style={{fontFamily:mono,fontSize:13,color:adv.color,fontWeight:700}}>{adv.label}</span>
            <div style={{display:'flex',flexDirection:'column',gap:2}}>
              <span style={{fontFamily:mono,fontSize:10,color:adv.color}}>{adv.detail}</span>
              <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>
                {adv.holdExit==='HOLD'?'Advance scoring aligned — hold position':adv.holdExit==='EXIT'?'⚠️ Consider exit — advance gap weakening':'⚠️ Caution — partial misalignment'}
              </span>
            </div>
          </div>
        );})()}

        {/* BOX Trend row */}
        {(bh4 || bh1) && (
          <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'rgba(0,0,0,0.15)',borderRadius:8}}>
            <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2}}>BOX STRUCTURE</span>
            {bh4 && <span style={{fontFamily:mono,fontSize:10,color:bh4.color,background:bh4.bg,border:`1px solid ${bh4.border}`,borderRadius:4,padding:'2px 10px'}}>H4 {bh4.label}</span>}
            {bh1 && <span style={{fontFamily:mono,fontSize:10,color:bh1.color,background:bh1.bg,border:`1px solid ${bh1.border}`,borderRadius:4,padding:'2px 10px'}}>H1 {bh1.label}</span>}
          </div>
        )}

        {/* PL Zone — CONTINUATIONday validity */}
        {(()=>{ const pl = plZoneBadge(row.pl_zone, row.bias); if (!pl) return null; return (
          <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'rgba(0,0,0,0.15)',borderRadius:8}}>
            <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2}}>PL LINES</span>
            <span style={{fontFamily:mono,fontSize:10,color:pl.color,background:pl.bg,border:`1px solid ${pl.border}`,borderRadius:4,padding:'2px 10px',fontWeight:700}}>{pl.label}</span>
            {pl.valid && <span style={{fontFamily:mono,fontSize:9,color:'#00ff9f',letterSpacing:1}}>✅ VALID</span>}
            {!pl.valid && <span style={{fontFamily:mono,fontSize:9,color:'#ff7744',letterSpacing:1}}>⛔ NOT VALID</span>}
          </div>
        ); })()}

        {/* News Alert */}
        {newsAlert&&<div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'rgba(255,209,102,0.08)',borderRadius:8,border:'1px solid rgba(255,209,102,0.35)'}}>
          <span style={{fontSize:12}}>📰</span><span style={{fontFamily:mono,fontSize:10,color:'#ffd166',letterSpacing:1,fontWeight:700}}>HIGH IMPACT NEWS — CHECK CALENDAR</span>
        </div>}

        {/* Edge Memory */}
        {(()=>{const em=getEdgeMemory(row,memoryIndex);if(!em)return null;const fc=em.flag==='PROVEN_EDGE'?'#00ff9f':em.flag==='DEAD_ZONE'?'#ff4d6d':'#00b4ff';const icon=em.flag==='PROVEN_EDGE'?'✅':em.flag==='DEAD_ZONE'?'⛔':'📊';const lbl=em.flag?em.flag.replace('_',' '):(em.maturity||'').toUpperCase();const wrPct=Math.round((em.winRate||0)*100);const resPct=em.resRate!=null?Math.round(em.resRate*100):null;const edgeTip=em.flag==='PROVEN_EDGE'?`Proven edge: ${wrPct}% win rate from ${em.sample} resolved signals.`:em.flag==='DEAD_ZONE'?`Dead zone: only ${wrPct}% win rate from ${em.sample} signals.`:`${(em.maturity||'').toUpperCase()}: ${wrPct}% win rate from ${em.sample} signals.`;return(
          <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'rgba(0,0,0,0.15)',borderRadius:8}}>
            <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2}}>EDGE</span>
            <span title={edgeTip} style={{fontFamily:mono,fontSize:10,color:fc,background:fc+'12',border:`1px solid ${fc}33`,borderRadius:5,padding:'2px 10px',fontWeight:700,cursor:'help'}}>{icon} {lbl}</span>
            <span style={{fontFamily:mono,fontSize:10,color:'var(--text-muted)'}}>Win:{wrPct}%{resPct!=null?` | Res:${resPct}%`:''} (n={em.sample})</span>
          </div>);})()}

        {/* Trade Verdict */}
        <VerdictBanner row={row} pdr={pdr} t={trend}/>

        {/* Confidence Conflict */}
        {confidence&&confidence.conflict&&<div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'rgba(255,77,109,0.08)',borderRadius:8,border:'1px solid rgba(255,77,109,0.25)'}}>
          <span style={{fontFamily:mono,fontSize:10,color:'#ff4d6d',fontWeight:700}}>⚠️ CONFLICT</span>
          <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>High real-time confidence but historical win rate ≤50% at this gap level</span>
        </div>}

        {/* PDR */}
        {(pdr||row.pdr_dir!=null)&&<div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'rgba(0,0,0,0.15)',borderRadius:8,flexWrap:'wrap'}}>
          <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2}}>PDR</span>
          {row.pdr_dir!=null?<LivePdrBadge row={row}/>:<PdrBadge pdr={pdr}/>}
          <PdrVerdict row={row} pdr={pdr}/>
        </div>}

        {/* Trend Phase */}
        <div style={{padding:'8px 12px',background:'rgba(0,0,0,0.15)',borderRadius:8}}>
          <PhaseBadge row={row} pdr={pdr}/>
        </div>

        {/* Pullback Entry Zones — Nearest S/R + SL */}
        {(()=>{const isBuy=bias.label==='BUY',isSell=bias.label==='SELL';if(!isBuy&&!isSell)return null;const price=row.pl_price;if(!price)return null;const isJpy=row.symbol?.includes('JPY');const dec=isJpy?3:5;const pip=isJpy?0.01:0.0001;const fmt=v=>v!=null?Number(v).toFixed(dec):'—';const toPips=v=>Math.round(Math.abs(v)/pip);const entryColor=isBuy?'#00ff9f':'#ff4d6d';
          const allLevels=[{l:'PDL',v:row.pdl},{l:'PDH',v:row.pdh},{l:'PWL',v:row.pwl},{l:'PWH',v:row.pwh},{l:'PML',v:row.pml},{l:'PMH',v:row.pmh},{l:'PYL',v:row.pyl},{l:'PYH',v:row.pyh}].filter(x=>x.v!=null);
          let entry=null,tp=null;
          if(isBuy){
            const entryLevels=allLevels.filter(x=>x.v<price).sort((a,b)=>b.v-a.v);
            const tpLevels=allLevels.filter(x=>x.v>price).sort((a,b)=>a.v-b.v);
            for(const e of entryLevels){for(const t of tpLevels){if(toPips(t.v-e.v)>=50){entry=e;tp=t;break;}}if(entry)break;}
            if(!entry&&tpLevels.length){for(const t of tpLevels){if(toPips(t.v-price)>=50){tp=t;break;}}if(!tp)tp=tpLevels[tpLevels.length-1];}
          }else{
            const entryLevels=allLevels.filter(x=>x.v>price).sort((a,b)=>a.v-b.v);
            const tpLevels=allLevels.filter(x=>x.v<price).sort((a,b)=>b.v-a.v);
            for(const e of entryLevels){for(const t of tpLevels){if(toPips(e.v-t.v)>=50){entry=e;tp=t;break;}}if(entry)break;}
            if(!entry&&tpLevels.length){for(const t of tpLevels){if(toPips(price-t.v)>=50){tp=t;break;}}if(!tp)tp=tpLevels[tpLevels.length-1];}
          }
          if(!entry&&!tp)return null;
          const entryDist=entry?toPips(isBuy?(price-entry.v):(entry.v-price)):null;
          const tpDist=entry&&tp?toPips(isBuy?(tp.v-entry.v):(entry.v-tp.v)):null;
          const slRatio=tpDist>=300?5:tpDist>=200?4:tpDist>=100?3:2;
          const slPips=tpDist?Math.round(tpDist/slRatio):null;
          const slPrice=entry&&slPips?(isBuy?entry.v-slPips*pip:entry.v+slPips*pip):null;
          const labelMap={PDL:'PREV DAY LOW',PDH:'PREV DAY HIGH',PWL:'PREV WEEK LOW',PWH:'PREV WEEK HIGH',PML:'PREV MONTH LOW',PMH:'PREV MONTH HIGH',PYL:'PREV YEAR LOW',PYH:'PREV YEAR HIGH'};
          return(
          <div style={{padding:'10px 14px',background:'rgba(0,0,0,0.15)',borderRadius:8,display:'flex',flexDirection:'column',gap:8}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2}}>PULLBACK ENTRY</span>
              <span style={{fontFamily:mono,fontSize:8,color:entryColor,letterSpacing:1}}>{isBuy?'BUY THE DIP':'SELL THE RALLY'}</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 8px',background:'rgba(255,255,255,0.03)',borderRadius:6}}>
              <span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)'}}>PRICE</span>
              <span style={{fontFamily:orb,fontSize:13,fontWeight:700,color:'var(--text-secondary)'}}>{fmt(price)}</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
              <div style={{background:entryColor+'0a',border:`1px solid ${entryColor}25`,borderRadius:6,padding:'8px 10px'}}>
                <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:1,marginBottom:2}}>{isBuy?'▼ ENTRY':'▲ ENTRY'}</div>
                <div style={{fontFamily:mono,fontSize:7,color:entryColor+'99',marginBottom:4}}>{entry?labelMap[entry.l]||entry.l:'—'}</div>
                <div style={{fontFamily:orb,fontSize:15,fontWeight:700,color:entryColor}}>{entry?fmt(entry.v):'—'}</div>
                {entryDist!=null&&<div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',marginTop:2}}>{entryDist}p away</div>}
              </div>
              <div style={{background:'rgba(0,180,255,0.06)',border:'1px solid rgba(0,180,255,0.2)',borderRadius:6,padding:'8px 10px'}}>
                <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:1,marginBottom:2}}>{isBuy?'▲ TP':'▼ TP'}</div>
                <div style={{fontFamily:mono,fontSize:7,color:'#00b4ff99',marginBottom:4}}>{tp?labelMap[tp.l]||tp.l:'—'}</div>
                <div style={{fontFamily:orb,fontSize:15,fontWeight:700,color:'#00b4ff'}}>{tp?fmt(tp.v):'—'}</div>
                {tpDist!=null&&<div style={{fontFamily:mono,fontSize:8,color:'#00b4ff',marginTop:2}}>{tpDist}p ✓</div>}
              </div>
              <div style={{background:'rgba(255,77,109,0.06)',border:'1px solid rgba(255,77,109,0.2)',borderRadius:6,padding:'8px 10px'}}>
                <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:1,marginBottom:2}}>✕ SL</div>
                <div style={{fontFamily:mono,fontSize:7,color:'#ff4d6d99',marginBottom:4}}>TP÷{slRatio}</div>
                <div style={{fontFamily:orb,fontSize:15,fontWeight:700,color:'#ff4d6d'}}>{slPrice?fmt(slPrice):'—'}</div>
                {slPips!=null&&<div style={{fontFamily:mono,fontSize:8,color:'#ff4d6d',marginTop:2}}>{slPips}p risk</div>}
              </div>
            </div>
            {tpDist!=null&&slPips!=null&&<div style={{display:'flex',alignItems:'center',gap:8,padding:'4px 8px',background:'rgba(255,255,255,0.02)',borderRadius:6}}>
              <span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)'}}>R:R</span>
              <span style={{fontFamily:mono,fontSize:10,fontWeight:700,color:tpDist/slPips>=2?'#00ff9f':'#ffd166'}}>{(tpDist/slPips).toFixed(1)}:1</span>
              <span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)'}}>TP {tpDist}p · SL {slPips}p</span>
            </div>}
          </div>
        );})()}

        {/* Momentum */}
        <div style={{padding:'10px 14px',background:'rgba(0,0,0,0.15)',borderRadius:8,display:'flex',flexDirection:'column',gap:6}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontFamily:mono,fontSize:11,color:momColor,background:momColor+'18',border:`1px solid ${momColor}30`,borderRadius:5,padding:'3px 10px'}}>{momIcons[t.momentum||row.momentum]||'▬'} {t.momentum||row.momentum||'NEUTRAL'}</span>
            {row.state && <span style={{fontFamily:mono,fontSize:9,color:sc}}>● {row.state}</span>}
          </div>
          {g && <span style={{fontFamily:mono,fontSize:11,color:g.color,fontWeight:700}}>👉 {g.action}</span>}
        </div>

        {/* TF Scores */}
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          <div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2,marginBottom:2}}>CURRENCY SCORES</div>
          <TFRow label={row.base_currency||'BASE'} d1={row.base_d1} h4={row.base_h4} h1={row.base_h1}/>
          <TFRow label={row.quote_currency||'QUOTE'} d1={row.quote_d1} h4={row.quote_h4} h1={row.quote_h1}/>
        </div>

        {/* ADV Scores */}
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          <div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2,marginBottom:2}}>ADVANCE SCORES</div>
          <TFRow label={'ADV '+( row.base_currency||'BASE')} d1={row.adv_base_d1} h4={row.adv_base_h4} h1={row.adv_base_h1}/>
          <TFRow label={'ADV '+(row.quote_currency||'QUOTE')} d1={row.adv_quote_d1} h4={row.adv_quote_h4} h1={row.adv_quote_h1}/>
        </div>

        {/* ATR + Strength */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
          {[
            {label:'STRENGTH', value: Number(strVal).toFixed(2), color: strColor(strVal)},
            {label:'ATR (pts)',  value: row.atr ? Number(row.atr).toFixed(0) : '—', color:'#00b4ff'},
            {label:'ATR/HR',    value: af ? af.pipsPerHour+'p' : '—', color:'var(--text-secondary)'},
          ].map(s=>(
            <div key={s.label} style={{background:'rgba(0,0,0,0.2)',borderRadius:8,padding:'10px 12px'}}>
              <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:2,marginBottom:4}}>{s.label}</div>
              <div style={{fontFamily:orb,fontSize:16,fontWeight:700,color:s.color}}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* COT + Updated */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',borderTop:'1px solid var(--border)',paddingTop:10}}>
          {cotBias ? (
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2}}>COT</span>
              <span style={{fontFamily:mono,fontSize:10,color:cotBias.bias==='BULLISH'?'#00ff9f':'#ff4d6d',background:cotBias.bias==='BULLISH'?'rgba(0,255,159,0.08)':'rgba(255,77,109,0.08)',border:`1px solid ${cotBias.bias==='BULLISH'?'#00ff9f33':'#ff4d6d33'}`,borderRadius:4,padding:'2px 8px'}}>{cotBias.bias==='BULLISH'?'▲':'▼'} {cotBias.bias}</span>
            </div>
          ) : <span/>}
          <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>Updated: {formatDt(row.updated_at)}</span>
        </div>

        {/* Platform buttons */}
        <PlatformButtons symbol={row.symbol}/>

      </div>
    </div>
  );
}


// ===== VALID SETUPS TAB =====
function ValidSetupsTab({ data, trends, cotMap, confidenceMap }) {
  const mono = "'Share Tech Mono',monospace";
  const orb  = "'Orbitron',sans-serif";

  const valid = data
    .filter(r => Math.abs(r.gap ?? 0) >= 5 && !r.hard_invalid && !isNeutralMatchup(r))
    .sort((a,b) => a.symbol.localeCompare(b.symbol));

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
      {/* ONE-GLANCE ACTION BOARD */}
      {(()=>{
        const groups = { trade: [], pullback: [], watch: [], close: [] };
        valid.forEach(r=>{
          const p = computePhase(r, null);
          if (!p) return;
          const t2 = trends[r.symbol] || {};
          if (t2.closeAlert || p.label.includes('AT RISK')) { groups.close.push({r,p}); return; }
          if (p.label.includes('PULLBACK')) { groups.pullback.push({r,p}); return; }
          if (p.label.includes('START') || p.continuation) { groups.trade.push({r,p}); return; }
          if (p.label.includes('LATE') || p.label.includes('EXTENDED')) { groups.watch.push({r,p}); return; }
        });
        const box=(title,color,items,hint)=>(
          <div style={{flex:'1 1 220px',background:'var(--bg-card)',border:`1px solid ${color}30`,borderRadius:10,padding:'10px 12px',minWidth:200}}>
            <div style={{fontFamily:mono,fontSize:9,color,letterSpacing:1.5,fontWeight:700,marginBottom:6}}>{title} ({items.length})</div>
            {items.length===0?<span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>none</span>:
              <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                {items.map(({r,p})=><span key={r.symbol} title={p.tip} style={{fontFamily:mono,fontSize:9,color,background:color+'12',border:`1px solid ${color}30`,borderRadius:4,padding:'2px 7px',fontWeight:700,cursor:'help'}}>{r.symbol} {r.gap>0?'+':''}{Number(r.gap).toFixed(0)}{p.continuation?' ★':''}</span>)}
              </div>}
            <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',marginTop:6}}>{hint}</div>
          </div>
        );
        return (
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:10}}>
            {box('✅ READY TO TRADE','#00ff9f',groups.trade,'Catching the start — check the PB ENTRY level, then execute')}
            {box('🎯 ON PULLBACK','#ffd166',groups.pullback,'Continuation window — enter at the PB ENTRY level · ★ = full checklist')}
            {box('⚠️ WATCH OUT','#ffaa44',groups.watch,'Late or exhausted — no new entries, wait for reset')}
            {box('🔴 CLOSE IF OPEN','#ff4d6d',groups.close,'Trend at risk or close alert — protect open trades')}
          </div>
        );
      })()}
      {valid.map(row => {
        const gap = row.gap ?? 0;
        const bias = gap > 0 ? { label:'BUY', color:'#00ff9f', border:'#00ff9f33', bg:'rgba(0,255,159,0.08)' }
                              : { label:'SELL', color:'#ff4d6d', border:'#ff4d6d33', bg:'rgba(255,77,109,0.08)' };
        const t = trends[row.symbol] || {};
        const g = getMomentumAction(t.momentum, bias.label, t);
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
              <div style={{marginBottom:5}}><VerdictBanner row={row} pdr={null} t={t} compact/></div>
              <div style={{fontFamily:mono,fontSize:9,color:t.momentumColor||'var(--text-muted)',background:(t.momentumColor||'var(--text-muted)')+'18',border:`1px solid ${(t.momentumColor||'var(--text-muted)')}30`,borderRadius:4,padding:'2px 8px',display:'inline-block',marginBottom:4}}>{t.momentum||'NEUTRAL'}</div>
              {(()=>{const mu=getMatchup(row);if(!mu)return null;return(<div style={{fontFamily:mono,fontSize:9,color:mu.color,background:mu.color+'12',border:`1px solid ${mu.color}28`,borderRadius:4,padding:'2px 7px',display:'inline-block',marginTop:3,whiteSpace:'nowrap'}}>{mu.label}{mu.note&&<span style={{marginLeft:5,opacity:0.7,fontSize:8}}>{mu.note}</span>}</div>);})()}
              <ScoreTfBadge row={row}/>
              {(()=>{const bh4=boxTrend(row.box_h4_trend),bh1=boxTrend(row.box_h1_trend);if(!bh4&&!bh1)return null;return(<div style={{display:'flex',alignItems:'center',gap:5,marginTop:3}}><span style={{fontFamily:mono,fontSize:8,color:'var(--text-secondary)',letterSpacing:1,fontWeight:600}}>BOX</span>{bh4&&<span style={{fontFamily:mono,fontSize:8,color:bh4.color,background:bh4.bg,border:`1px solid ${bh4.border}`,borderRadius:3,padding:'1px 6px'}}>H4 {bh4.label}</span>}{bh1&&<span style={{fontFamily:mono,fontSize:8,color:bh1.color,background:bh1.bg,border:`1px solid ${bh1.border}`,borderRadius:3,padding:'1px 6px'}}>H1 {bh1.label}</span>}</div>);})()}
              {(()=>{ const pl=plZoneBadge(row.pl_zone,row.bias); if(!pl)return null; return(<div style={{display:'flex',alignItems:'center',gap:5,marginTop:3}}><span style={{fontFamily:mono,fontSize:8,color:'var(--text-secondary)',letterSpacing:1,fontWeight:600}}>PL</span><span style={{fontFamily:mono,fontSize:9,color:pl.color,background:pl.bg,border:`1px solid ${pl.border}`,borderRadius:4,padding:'1px 8px',fontWeight:700}}>{pl.label}</span>{pl.valid&&<span style={{fontFamily:mono,fontSize:8,color:'#00ff9f',fontWeight:700}}>G1 ✅</span>}{!pl.valid&&<span style={{fontFamily:mono,fontSize:8,color:'#ff7744'}}>G1 ⛔</span>}</div>);})()}
              {(()=>{
                const bc=boxConfirm(row.bias,row.box_h4_trend,row.box_h1_trend);
                const af=atrFill(row.atr);
                if(!bc&&!af)return null;
                return(<div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap',marginTop:3}}>
                  {bc&&<span style={{fontFamily:mono,fontSize:9,color:bc.color,background:bc.bg,border:`1px solid ${bc.border}`,borderRadius:4,padding:'2px 8px',fontWeight:700}}>{bc.label}</span>}
                  {af&&<span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:0.5}}>ATR {af.atrPips}p · {af.pipsPerHour}p/hr</span>}
                </div>);
              })()}
              {(()=>{const adv=advScore(row);if(!adv)return null;return(<div style={{display:'flex',alignItems:'center',gap:5,marginTop:3}}><span style={{fontFamily:mono,fontSize:9,color:adv.color,background:adv.bg,border:`1px solid ${adv.border}`,borderRadius:4,padding:'2px 8px',fontWeight:700}}>{adv.label}</span><span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)'}}>{adv.detail}</span></div>);})()}
              {(()=>{const cf=confidenceMap&&confidenceMap[row.symbol];if(!cf)return null;const cs=confStyle(cf.confidence);if(!cs)return null;return(<div style={{display:'flex',alignItems:'center',gap:5,marginTop:3}}><span style={{fontFamily:mono,fontSize:8,color:'var(--text-secondary)',letterSpacing:1,fontWeight:600}}>CONF</span><span style={{fontFamily:mono,fontSize:9,color:cs.color,background:cs.bg,border:`1px solid ${cs.border}`,borderRadius:4,padding:'2px 8px',fontWeight:700}}>{cf.confidence} {cs.label}</span></div>);})()}
              {(()=>{const isBuy=bias.label==='BUY',isSell=bias.label==='SELL';if(!isBuy&&!isSell)return null;const isJpy=row.symbol?.includes('JPY');const dec=isJpy?3:5;const levels=isBuy?[{l:'PDL',v:row.pdl},{l:'PWL',v:row.pwl},{l:'PML',v:row.pml}].filter(x=>x.v!=null).sort((a,b)=>b.v-a.v):[{l:'PDH',v:row.pdh},{l:'PWH',v:row.pwh},{l:'PMH',v:row.pmh}].filter(x=>x.v!=null).sort((a,b)=>a.v-b.v);const top2=levels.slice(0,2);if(!top2.length)return null;const c1=isBuy?'#00ff9f':'#ff4d6d';const c2='#00b4ff';return(<div style={{display:'flex',alignItems:'center',gap:5,marginTop:3}}><span style={{fontFamily:mono,fontSize:8,color:'var(--text-secondary)',letterSpacing:1,fontWeight:600}}>PB ENTRY</span>{top2.map((lv,i)=><span key={lv.l} style={{fontFamily:mono,fontSize:9,color:i===0?c1:c2,background:(i===0?c1:c2)+'12',border:`1px solid ${(i===0?c1:c2)}28`,borderRadius:3,padding:'1px 6px',fontWeight:600}}>{lv.l} {Number(lv.v).toFixed(dec)}</span>)}</div>);})()}
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
// ===== VALID PAIRS TAB — ITP + PBP classification =====
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
    if (r.hard_invalid || isNeutralMatchup(r)) return;
    const zone = (r.pl_zone || '').toUpperCase();
    const plValid = (biasDir === 'BUY' && zone === 'ABOVE') || (biasDir === 'SELL' && zone === 'BELOW');
    if (absGap >= 9 && plValid && conf >= 60) {
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
        ITP: gap ≥ 9 + Panda Lines valid + confidence ≥ 60<br/>
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
          <div><VerdictBanner row={row} pdr={null} t={t} compact/></div>
          <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
            {t.momentum&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:mc,background:mc+'18',border:`1px solid ${mc}30`,borderRadius:4,padding:'2px 8px'}}>{t.momentum}</span>}
            {(()=>{const mu=getMatchup(row);if(!mu)return null;return(<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:mu.color,background:mu.color+'12',border:`1px solid ${mu.color}28`,borderRadius:4,padding:'1px 7px',whiteSpace:'nowrap'}}>{mu.label}</span>);})()}
          </div>
          <ScoreTfBadge row={row}/>
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
          {(()=>{ const pl=plZoneBadge(row.pl_zone,row.bias); if(!pl)return null; return(
            <div style={{display:'flex',alignItems:'center',gap:5,marginTop:3}}>
              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'var(--text-muted)',letterSpacing:1}}>PL</span>
              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:pl.color,background:pl.bg,border:`1px solid ${pl.border}`,borderRadius:4,padding:'1px 8px',fontWeight:700}}>{pl.label}</span>
              {pl.valid&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'#00ff9f',letterSpacing:1,fontWeight:700}}>CONTINUATION ✅</span>}
              {!pl.valid&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'#ff7744',letterSpacing:1}}>CONTINUATION ⛔</span>}
            </div>
          );})()}
          {(()=>{const isBuy=bias.label==='BUY',isSell=bias.label==='SELL';if(!isBuy&&!isSell)return null;const isJpy=row.symbol?.includes('JPY');const dec=isJpy?3:5;const levels=isBuy?[{l:'PDL',v:row.pdl},{l:'PWL',v:row.pwl},{l:'PML',v:row.pml}].filter(x=>x.v!=null).sort((a,b)=>b.v-a.v):[{l:'PDH',v:row.pdh},{l:'PWH',v:row.pwh},{l:'PMH',v:row.pmh}].filter(x=>x.v!=null).sort((a,b)=>a.v-b.v);const top2=levels.slice(0,2);if(!top2.length)return null;const c1=isBuy?'#00ff9f':'#ff4d6d';const c2='#00b4ff';return(<div style={{display:'flex',alignItems:'center',gap:5,marginTop:3}}><span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'var(--text-muted)',letterSpacing:1}}>PB ENTRY</span>{top2.map((lv,i)=><span key={lv.l} style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:i===0?c1:c2,background:(i===0?c1:c2)+'12',border:`1px solid ${(i===0?c1:c2)}28`,borderRadius:3,padding:'1px 6px',fontWeight:600}}>{lv.l} {Number(lv.v).toFixed(dec)}</span>)}</div>);})()}
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
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:'var(--text-muted)'}}>{itp.length} pair{itp.length!==1?'s':''} · gap ≥ 9 · Panda Lines ✓ · conf ≥ 60</span>
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

// ===== OPEN TRADES PANEL (admin only) =====
function OpenTradesPanel() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/open-trades');
      if (res.ok) {
        setTrades(await res.json());
        setLastUpdate(new Date());
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const tick=()=>{ if(typeof document!=='undefined' && document.visibilityState==='hidden') return; load(); };
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, [load]);

  const totalPL = trades.reduce((s, t) => s + (parseFloat(t.profit_loss) || 0), 0);

  if (loading) return (
    <div style={{textAlign:'center',padding:60,fontFamily:mono,fontSize:11,color:'var(--text-muted)',letterSpacing:3}}>
      LOADING OPEN TRADES...
    </div>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      {/* Header row */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontFamily:orb,fontSize:13,fontWeight:700,color:'#ffd166',letterSpacing:3}}>🔴 OPEN TRADES</span>
          <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{trades.length} position{trades.length!==1?'s':''}</span>
          {lastUpdate&&<span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)'}}>· {lastUpdate.toLocaleTimeString()}</span>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{fontFamily:mono,fontSize:11,color:totalPL>=0?'#00ff9f':'#ff4d6d',fontWeight:700}}>
            Unrealized P/L: {totalPL>=0?'+':''}{totalPL.toFixed(2)}
          </div>
          <button onClick={load} style={{background:'transparent',border:'1px solid var(--border)',borderRadius:4,color:'var(--text-muted)',fontFamily:mono,fontSize:9,padding:'4px 10px',cursor:'pointer'}}>⟳ REFRESH</button>
        </div>
      </div>

      {trades.length === 0 ? (
        <div style={{textAlign:'center',padding:60,fontFamily:mono,fontSize:11,color:'var(--text-muted)',letterSpacing:3}}>
          NO OPEN POSITIONS
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {trades.map((t, i) => {
            const isBuy = t.direction === 'BUY';
            const biasColor = isBuy ? '#00ff9f' : '#ff4d6d';
            const pl = parseFloat(t.profit_loss) || 0;
            const plColor = pl > 0 ? '#00ff9f' : pl < 0 ? '#ff4d6d' : 'var(--text-muted)';
            const gapOk = t.current_gap != null && Math.abs(t.current_gap) >= 5;
            const gapAligned = isBuy ? (t.current_gap||0) >= 5 : (t.current_gap||0) <= -5;
            const bh4 = boxTrend(t.box_h4_trend);
            const bh1 = boxTrend(t.box_h1_trend);
            const momColor = t.current_momentum==='STRONG'?'#00ff9f':t.current_momentum==='BUILDING'?'#66ffcc':t.current_momentum==='SPARK'?'#ffd166':t.current_momentum==='FADING'?'#ff7744':t.current_momentum==='REVERSING'?'#ff4d6d':'var(--text-muted)';

            return (
              <div key={t.position_id||i} style={{background:'var(--bg-card)',border:`2px solid ${biasColor}22`,borderLeft:`3px solid ${biasColor}`,borderRadius:10,padding:'14px 18px',display:'grid',gridTemplateColumns:'110px 60px 70px 1fr 120px 120px 120px',alignItems:'center',gap:12,position:'relative',overflow:'hidden'}}>
                <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${biasColor}55,transparent)`}}/>

                {/* Pair + Direction */}
                <div>
                  <div style={{fontFamily:orb,fontSize:14,fontWeight:900,letterSpacing:2,color:'var(--text-primary)'}}>{t.symbol}</div>
                  <span style={{fontFamily:mono,fontSize:10,color:biasColor,background:biasColor+'15',border:`1px solid ${biasColor}33`,borderRadius:4,padding:'1px 8px',fontWeight:700}}>{t.direction}</span>
                </div>

                {/* Volume */}
                <div>
                  <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:2}}>LOTS</div>
                  <div style={{fontFamily:mono,fontSize:12,color:'var(--text-secondary)'}}>{t.volume}</div>
                </div>

                {/* Entry */}
                <div>
                  <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:2}}>ENTRY</div>
                  <div style={{fontFamily:mono,fontSize:11,color:'var(--text-secondary)'}}>{t.entry_price||'—'}</div>
                </div>

                {/* Current Engine Status */}
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                    {t.current_gap!=null && (
                      <span style={{fontFamily:mono,fontSize:11,fontWeight:700,color:gapAligned?'#00ff9f':'#ff4d6d'}}>
                        GAP {t.current_gap>0?'+':''}{t.current_gap}
                      </span>
                    )}
                    {!gapAligned && gapOk && (
                      <span style={{fontFamily:mono,fontSize:9,color:'#ff4d6d',background:'rgba(255,77,109,0.1)',border:'1px solid rgba(255,77,109,0.3)',borderRadius:3,padding:'1px 5px'}}>⚠️ GAP FLIPPED</span>
                    )}
                    {!gapOk && t.current_gap!=null && (
                      <span style={{fontFamily:mono,fontSize:9,color:'#ff4d6d',background:'rgba(255,77,109,0.1)',border:'1px solid rgba(255,77,109,0.3)',borderRadius:3,padding:'1px 5px'}}>❌ GAP INVALID</span>
                    )}
                  </div>
                  {t.current_momentum && (
                    <span style={{fontFamily:mono,fontSize:9,color:momColor}}>{t.current_momentum}</span>
                  )}
                  {(bh4||bh1) && (
                    <div style={{display:'flex',gap:4}}>
                      {bh4&&<span style={{fontFamily:mono,fontSize:8,color:bh4.color,background:bh4.bg,border:`1px solid ${bh4.border}`,borderRadius:3,padding:'1px 5px'}}>H4 {bh4.label}</span>}
                      {bh1&&<span style={{fontFamily:mono,fontSize:8,color:bh1.color,background:bh1.bg,border:`1px solid ${bh1.border}`,borderRadius:3,padding:'1px 5px'}}>H1 {bh1.label}</span>}
                    </div>
                  )}
                </div>

                {/* P/L */}
                <div style={{textAlign:'center'}}>
                  <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:2,marginBottom:2}}>P/L</div>
                  <div style={{fontFamily:orb,fontSize:15,fontWeight:700,color:plColor}}>{pl>0?'+':''}{pl.toFixed(2)}</div>
                </div>

                {/* Account */}
                <div style={{textAlign:'center'}}>
                  <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:2,marginBottom:2}}>ACCOUNT</div>
                  <div style={{fontFamily:mono,fontSize:9,color:'var(--text-secondary)'}}>{t.broker_name||t.account_id||'—'}</div>
                </div>

                {/* Entry Time */}
                <div style={{textAlign:'right'}}>
                  <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:2,marginBottom:2}}>OPENED</div>
                  <div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{t.entry_time ? new Date(t.entry_time).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})+' '+new Date(t.entry_time).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : '—'}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ===== SPIKE LOG TAB — full history =====
function SpikeLogTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [filterSym, setFilterSym] = useState('');
  const [filterMom, setFilterMom] = useState('ALL');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const ALL_SYMS = ['AUDJPY','AUDCAD','AUDNZD','AUDUSD','CADJPY','EURAUD','EURCAD','EURGBP','EURJPY','EURNZD','EURUSD','GBPAUD','GBPCAD','GBPJPY','GBPNZD','GBPUSD','NZDCAD','NZDJPY','NZDUSD','USDCAD','USDJPY'];
  const MOM_STATES = ['STRONG','BUILDING','SPARK','CONSOLIDATING','COOLING','FADING','REVERSING'];

  useEffect(() => {
    fetch('/api/spikes?limit=500')
      .then(r=>r.json())
      .then(d=>{ setLogs(Array.isArray(d)?d:[]); setLoading(false); })
      .catch(()=>setLoading(false));
  }, []);

  const filtered = logs.filter(s => {
    if (filter !== 'ALL' && s.bias !== filter) return false;
    if (filterSym && s.symbol !== filterSym) return false;
    if (filterMom !== 'ALL' && s.momentum !== filterMom) return false;
    if (filterFrom) { try { if (new Date(s.fired_at) < new Date(filterFrom)) return false; } catch {} }
    if (filterTo) { try { if (new Date(s.fired_at) > new Date(filterTo + 'T23:59:59')) return false; } catch {} }
    return true;
  });

  const sel = { fontFamily:"'Share Tech Mono',monospace", fontSize:10, padding:'5px 8px', borderRadius:5, border:'1px solid var(--border)', background:'var(--bg-secondary)', color:'var(--text-primary)', cursor:'pointer' };
  const inp = { ...sel, minWidth:120 };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:11,fontWeight:700,color:'#ffd166',letterSpacing:3}}>SPIKE LOG</span>
        <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:'var(--text-muted)'}}>{filtered.length} of {logs.length} spikes</span>
        <div style={{display:'flex',gap:5,marginLeft:'auto'}}>
          {['ALL','BUY','SELL'].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?'rgba(255,209,102,0.12)':'transparent',border:`1px solid ${filter===f?'#ffd166':'var(--border)'}`,borderRadius:4,color:filter===f?'#ffd166':'var(--text-muted)',fontFamily:"'Share Tech Mono',monospace",fontSize:9,padding:'3px 10px',cursor:'pointer'}}>{f}</button>
          ))}
        </div>
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}>
        <select value={filterSym} onChange={e=>setFilterSym(e.target.value)} style={sel}>
          <option value="">ALL PAIRS</option>
          {ALL_SYMS.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterMom} onChange={e=>setFilterMom(e.target.value)} style={sel}>
          <option value="ALL">ALL MOMENTUM</option>
          {MOM_STATES.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        <input type="date" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} style={inp} title="From date"/>
        <input type="date" value={filterTo} onChange={e=>setFilterTo(e.target.value)} style={inp} title="To date"/>
        {(filterSym||filterMom!=='ALL'||filterFrom||filterTo)&&<button onClick={()=>{setFilterSym('');setFilterMom('ALL');setFilterFrom('');setFilterTo('');setFilter('ALL');}} style={{...sel,color:'#ff4d6d',border:'1px solid rgba(255,77,109,0.4)',fontWeight:700}}>✕ CLEAR</button>}
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
              <div key={s.id||i} style={{display:'grid',gridTemplateColumns:'90px 55px 55px 100px 80px 50px 140px 1fr 80px',alignItems:'center',gap:10,padding:'9px 12px',background:i%2===0?'var(--bg-card)':'transparent',border:'1px solid var(--border)',borderLeft:`3px solid ${color}`,borderRadius:6}}>
                <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:11,fontWeight:700,color:'var(--text-primary)'}}>{s.symbol}</span>
                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:color,fontWeight:700,background:color+'15',borderRadius:3,padding:'1px 6px',textAlign:'center'}}>{s.bias||( (s.gap??0)>0?'BUY':'SELL')}</span>
                <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:12,fontWeight:700,color,textAlign:'center'}}>{(s.gap??0)>0?'+':''}{s.gap}</span>
                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:mc}}>{s.momentum}</span><span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:(()=>{if(!s.base_score&&!s.quote_score)return'var(--text-muted)';const abs=(v)=>Math.abs(v||0);const bl=abs(s.base_score)>=4?'STRONG':abs(s.base_score)>=1?'WEAK':'NEUTRAL';const ql=abs(s.quote_score)>=4?'STRONG':abs(s.quote_score)>=1?'WEAK':'NEUTRAL';return bl==='STRONG'&&ql==='WEAK'?'#00ff9f':bl==='WEAK'&&ql==='STRONG'?'#ff4d6d':'var(--text-muted)';})()}}>{(()=>{if(!s.base_score&&!s.quote_score)return'—';const abs=(v)=>Math.abs(v||0);const bl=abs(s.base_score)>=4?'STR':abs(s.base_score)>=1?'WK':'N';const ql=abs(s.quote_score)>=4?'STR':abs(s.quote_score)>=1?'WK':'N';return bl+' vs '+ql;})()}</span>
                {(()=>{const cf=computeConfidence(s,null,null);if(!cf)return <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:'var(--text-muted)',textAlign:'center'}}>—</span>;const cs=confStyle(cf.confidence);return <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:cs.color,fontWeight:700,textAlign:'center'}}>{cf.confidence}</span>;})()}
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
// ===== CHART TAB =====
function buildTVDoc(symbol, interval) {
  var cfg = JSON.stringify({autosize:true,symbol:symbol,interval:interval,timezone:'Asia/Dubai',theme:'dark',style:'1',locale:'en',toolbar_bg:'#0d1117',enable_publishing:false,hide_side_toolbar:false,allow_symbol_change:true,container_id:'tv_widget'});
  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8">',
    '<style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#0d1117;}</style>',
    '</head><body>',
    '<div class="tradingview-widget-container" style="height:100vh;width:100%">',
    '<div id="tv_widget" style="height:100%;width:100%"></div>',
    '<scr'+'ipt src="https://s3.tradingview.com/tv.js"></scr'+'ipt>',
    '<scr'+'ipt>new TradingView.widget('+cfg+');</scr'+'ipt>',
    '</div></body></html>'
  ].join('');
}

function ChartTab({ data }) {
  const mono = "'Share Tech Mono',monospace";
  const validPairs = (data||[]).filter(r => Math.abs(r.gap??0) >= 5).sort((a,b)=>Math.abs(b.gap??0)-Math.abs(a.gap??0));
  const displayPairs = validPairs.length > 0 ? validPairs.map(r=>r.symbol) : ALL_PAIRS;
  const [selected, setSelected] = useState('EURUSD');
  const [tf, setTf] = useState('60');
  const TFS = [{label:'M15',v:'15'},{label:'H1',v:'60'},{label:'H4',v:'240'},{label:'D1',v:'D'}];
  const rowData = validPairs.find(r=>r.symbol===selected);
  const bias = rowData ? biasFromGap(rowData.gap??0) : {color:'#00b4ff',border:'rgba(0,180,255,0.4)',bg:'rgba(0,180,255,0.1)',label:'—'};
  const srcdoc = buildTVDoc(selected, tf);

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      {/* Pair selector */}
      <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
        <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2,flexShrink:0}}>PAIR:</span>
        {displayPairs.map(sym => {
          const b = validPairs.find(r=>r.symbol===sym);
          const bc = b ? biasFromGap(b.gap??0) : null;
          const active = selected===sym;
          return (
            <button key={sym} onClick={()=>setSelected(sym)} style={{
              fontFamily:mono,fontSize:9,padding:'4px 10px',borderRadius:5,cursor:'pointer',
              border:`1px solid ${active?(bc?.border||'rgba(0,180,255,0.4)'):'var(--border)'}`,
              background:active?(bc?.bg||'rgba(0,180,255,0.1)'):'transparent',
              color:active?(bc?.color||'#00b4ff'):'var(--text-muted)',
              fontWeight:active?700:400,
            }}>{sym}</button>
          );
        })}
      </div>
      {/* TF selector */}
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2}}>TF:</span>
        {TFS.map(t=>(
          <button key={t.v} onClick={()=>setTf(t.v)} style={{
            fontFamily:mono,fontSize:9,padding:'4px 14px',borderRadius:5,cursor:'pointer',
            border:`1px solid ${tf===t.v?'rgba(0,180,255,0.5)':'var(--border)'}`,
            background:tf===t.v?'rgba(0,180,255,0.12)':'transparent',
            color:tf===t.v?'#00b4ff':'var(--text-muted)',fontWeight:tf===t.v?700:400,
          }}>{t.label}</button>
        ))}
        <span style={{fontFamily:mono,fontSize:9,color:bias.color,marginLeft:8,fontWeight:700}}>{selected} · {bias.label}</span>
      </div>
      {/* Chart iframe using srcdoc — bypasses X-Frame-Options */}
      <div style={{width:'100%',height:580,borderRadius:10,overflow:'hidden',border:`1px solid ${bias.border}`}}>
        <iframe
          key={selected+tf}
          srcDoc={srcdoc}
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          style={{width:'100%',height:'100%',border:'none'}}
        />
      </div>
      <div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:1,textAlign:'center',opacity:0.4}}>
        Powered by TradingView · Dubai timezone
      </div>
    </div>
  );
}

// ===== SHADOW TRACKER TAB (gap 9/10/11/12 research logger) =====
function ShadowTab() {
  const monoF = "'Share Tech Mono',monospace";
  const orbF = "'Orbitron',sans-serif";
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterTier, setFilterTier] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterTier) params.set('tier', filterTier);
      if (filterStatus !== 'ALL') params.set('status', filterStatus);
      const res = await fetch(`/api/shadow-log?${params}`);
      const d = await res.json();
      setRows(d.rows || []);
      setSummary(d.summary || null);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filterTier, filterStatus]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const fmtT = (ts) => { try { return new Date(ts).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:false }); } catch { return '—'; } };
  const selS = { fontFamily:monoF, fontSize:10, padding:'5px 8px', borderRadius:5, border:'1px solid var(--border)', background:'var(--bg-secondary)', color:'var(--text-primary)', cursor:'pointer' };
  const hd = { fontFamily:monoF, fontSize:9, color:'var(--text-secondary)', letterSpacing:1, padding:'6px 8px', textAlign:'left', whiteSpace:'nowrap' };
  const td = { fontFamily:monoF, fontSize:10, padding:'5px 8px', whiteSpace:'nowrap' };
  const statCard = (label, val, color) => (
    <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 16px',display:'flex',flexDirection:'column',gap:3}}>
      <span style={{fontFamily:monoF,fontSize:8,color:'var(--text-muted)',letterSpacing:1.5}}>{label}</span>
      <span style={{fontFamily:orbF,fontSize:16,fontWeight:700,color:color||'var(--text-primary)'}}>{val}</span>
    </div>
  );

  return (
    <div style={{maxWidth:1100,margin:'0 auto'}}>
      <div style={{fontFamily:orbF,fontSize:15,fontWeight:700,color:'#00b4ff',letterSpacing:3,marginBottom:6}}>SHADOW TRACKER</div>
      <div style={{fontFamily:monoF,fontSize:9,color:'var(--text-muted)',letterSpacing:2,marginBottom:14}}>HIGH-GAP RESEARCH LOG · TIERS 9/10/11/12 · NO REAL TRADES · VALIDATING THE 9+ EDGE</div>

      {summary && <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14}}>
        {statCard('ENTRIES', summary.total)}
        {statCard('OPEN', summary.open, '#00b4ff')}
        {statCard('CLOSED', summary.done)}
        {statCard('WINS', summary.wins, '#00ff9f')}
        {statCard('LOSSES', summary.losses, '#ff4d6d')}
        {statCard('NET PIPS', summary.net_pips, summary.net_pips >= 0 ? '#00ff9f' : '#ff4d6d')}
        {statCard('AVG/TRADE', summary.avg_pips, summary.avg_pips >= 0 ? '#00ff9f' : '#ff4d6d')}
      </div>}

      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:14,flexWrap:'wrap'}}>
        <select value={filterTier} onChange={e=>setFilterTier(e.target.value)} style={selS}>
          <option value="">ALL TIERS</option>
          {[9,10,11,12].map(t=><option key={t} value={t}>TIER {t}</option>)}
        </select>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={selS}>
          {['ALL','PENDING','DONE'].map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={fetchRows} style={{...selS,color:'#00b4ff'}}>↻ REFRESH</button>
        {loading && <span style={{fontFamily:monoF,fontSize:9,color:'var(--text-muted)'}}>loading…</span>}
      </div>

      {rows.length === 0 && !loading && <div style={{fontFamily:monoF,fontSize:11,color:'var(--text-muted)',padding:'30px 0',textAlign:'center'}}>No shadow entries yet — they appear when any pair&apos;s |gap| crosses 9, 10, 11, or 12 while the engine is running.</div>}

      {rows.length > 0 && <div style={{overflowX:'auto',background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:10}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr style={{background:'var(--bg-hover)'}}>{['OPENED','SYMBOL','TIER','DIR','ENTRY GAP','PEAK','PIPS','OUTCOME','EXIT REASON','SESSION','PL ZONE','STATUS'].map(h=><th key={h} style={hd}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(r=>{
              const dirC = r.direction==='BUY'?'#00ff9f':'#ff4d6d';
              const outC = r.outcome==='WIN'?'#00ff9f':r.outcome==='LOSS'?'#ff4d6d':'var(--text-muted)';
              return (
                <tr key={r.id} style={{borderTop:'1px solid var(--border)'}}>
                  <td style={{...td,color:'var(--text-muted)'}}>{fmtT(r.created_at)}</td>
                  <td style={{...td,fontWeight:700}}>{r.symbol}</td>
                  <td style={{...td,color:'#ffd166'}}>T{r.tier}</td>
                  <td style={{...td,color:dirC,fontWeight:700}}>{r.direction}</td>
                  <td style={td}>{r.entry_gap!=null?Number(r.entry_gap).toFixed(1):'—'}</td>
                  <td style={td}>{r.peak_gap!=null?Number(r.peak_gap).toFixed(1):'—'}</td>
                  <td style={{...td,color:outC,fontWeight:700}}>{r.pips!=null?Number(r.pips).toFixed(1):'—'}</td>
                  <td style={{...td,color:outC}}>{r.outcome||'—'}</td>
                  <td style={{...td,color:'var(--text-muted)'}}>{r.exit_reason||'—'}</td>
                  <td style={{...td,color:'var(--text-muted)'}}>{r.session||'—'}</td>
                  <td style={{...td,color:'var(--text-muted)'}}>{r.pl_zone||'—'}</td>
                  <td style={{...td,color:r.status==='PENDING'?'#00b4ff':'var(--text-muted)'}}>{r.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}
    </div>
  );
}

// ===== SIGNAL LOG TAB =====
function SignalLogTab() {
  const mono = "'Share Tech Mono',monospace";
  const orb = "'Orbitron',sans-serif";
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterSym, setFilterSym] = useState('');
  const [filterBias, setFilterBias] = useState('ALL');
  const [filterValid, setFilterValid] = useState('ALL');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const ALL_SYMS = ['AUDJPY','AUDCAD','AUDNZD','AUDUSD','CADJPY','EURAUD','EURCAD','EURGBP','EURJPY','EURNZD','EURUSD','GBPAUD','GBPCAD','GBPJPY','GBPNZD','GBPUSD','NZDCAD','NZDJPY','NZDUSD','USDCAD','USDJPY'];

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterSym) params.set('symbol', filterSym);
      if (filterBias !== 'ALL') params.set('bias', filterBias);
      if (filterValid === 'VALID') params.set('valid', 'true');
      if (filterValid === 'INVALID') params.set('valid', 'false');
      if (filterFrom) params.set('from', new Date(filterFrom).toISOString());
      if (filterTo) params.set('to', new Date(filterTo).toISOString());
      params.set('limit', '500');
      const res = await fetch(`/api/signal-log?${params}`);
      const d = await res.json();
      setLogs(Array.isArray(d) ? d : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filterSym, filterBias, filterValid, filterFrom, filterTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const biasColor = (b) => b === 'BUY' ? '#00ff9f' : b === 'SELL' ? '#ff4d6d' : 'var(--text-muted)';
  const fmtTime = (ts) => { try { const d = new Date(ts); return d.toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:false }); } catch { return '—'; } };

  const sel = { fontFamily:mono, fontSize:10, padding:'5px 8px', borderRadius:5, border:'1px solid var(--border)', background:'var(--bg-secondary)', color:'var(--text-primary)', cursor:'pointer' };
  const inp = { ...sel, minWidth:120 };

  return (
    <div style={{maxWidth:1100,margin:'0 auto'}}>
      <div style={{fontFamily:orb,fontSize:15,fontWeight:700,color:'#00b4ff',letterSpacing:3,marginBottom:6}}>SIGNAL LOG</div>
      <div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2,marginBottom:14}}>ALL PAIRS · EVERY CYCLE · VALID + INVALID</div>

      {/* Filters */}
      <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center',marginBottom:14}}>
        <select value={filterSym} onChange={e=>setFilterSym(e.target.value)} style={sel}>
          <option value="">ALL PAIRS</option>
          {ALL_SYMS.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterBias} onChange={e=>setFilterBias(e.target.value)} style={sel}>
          {['ALL','BUY','SELL','WAIT','HARD_INVALID'].map(b=><option key={b} value={b}>{b}</option>)}
        </select>
        <select value={filterValid} onChange={e=>setFilterValid(e.target.value)} style={sel}>
          {['ALL','VALID','INVALID'].map(v=><option key={v} value={v}>{v}</option>)}
        </select>
        <input type="date" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} style={inp} title="From date"/>
        <input type="date" value={filterTo} onChange={e=>setFilterTo(e.target.value)} style={inp} title="To date"/>
        <button onClick={fetchLogs} style={{...sel,color:'#00b4ff',border:'1px solid rgba(0,180,255,0.4)',fontWeight:700}}>{loading ? '↻ LOADING' : '⟳ REFRESH'}</button>
        <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',marginLeft:6}}>{logs.length} rows</span>
      </div>

      {/* Table */}
      <div style={{overflowX:'auto',borderRadius:10,border:'1px solid var(--border)'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontFamily:mono,fontSize:10}}>
          <thead>
            <tr style={{background:'var(--bg-secondary)'}}>
              {['TIME','PAIR','GAP','BIAS','CONF','EXEC','SCORE','EXTREME TF','MOMENTUM','STATE','STR','PL','VALID'].map(h=>(
                <th key={h} style={{padding:'8px 6px',color:'var(--text-muted)',fontWeight:600,fontSize:9,letterSpacing:1,textAlign:'left',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((r,i) => {
              const gap = Number(r.gap||0);
              const bc = biasColor(r.bias);
              const valid = r.is_valid;
              return (
                <tr key={r.id||i} style={{borderBottom:'1px solid var(--border)',opacity:valid?1:0.5,background:valid?'rgba(0,180,255,0.03)':'transparent'}}>
                  <td style={{padding:'6px',whiteSpace:'nowrap',color:'var(--text-muted)'}}>{fmtTime(r.timestamp)}</td>
                  <td style={{padding:'6px',fontFamily:orb,fontSize:11,fontWeight:700,color:valid?'var(--text-primary)':'var(--text-muted)'}}>{r.symbol}</td>
                  <td style={{padding:'6px',color:bc,fontWeight:700}}>{gap>0?'+':''}{gap.toFixed(1)}</td>
                  <td style={{padding:'6px'}}><span style={{color:bc,border:`1px solid ${bc}33`,borderRadius:3,padding:'1px 5px',fontSize:9}}>{r.bias||'—'}</span></td>
                  <td style={{padding:'6px',color:r.confidence==='HIGH'?'#00ff9f':r.confidence==='MEDIUM'?'#ffd166':'var(--text-muted)'}}>{r.confidence||'—'}</td>
                  <td style={{padding:'6px',color:r.execution==='MARKET'?'#00ff9f':r.execution==='PULLBACK'?'#ffd166':'var(--text-muted)'}}>{r.execution||'—'}</td>
                  <td style={{padding:'6px'}}>{(()=>{const cf=computeConfidence(r,null,null);if(!cf)return <span style={{color:'var(--text-muted)'}}>—</span>;const cs=confStyle(cf.confidence);return <span style={{fontSize:9,color:cs.color,fontWeight:700}}>{cf.confidence}</span>;})()}</td>
                  <td style={{padding:'6px',whiteSpace:'nowrap'}}>{(r.base_score_tf||r.quote_score_tf)?<ScoreTfBadge row={r} mt={0} showLabel={false}/>:<span style={{color:'var(--text-muted)'}}>—</span>}</td>
                  <td style={{padding:'6px',color:r.momentum==='STRONG'?'#00ff9f':r.momentum==='BUILDING'?'#00b4ff':'var(--text-muted)'}}>{r.momentum||'—'}</td>
                  <td style={{padding:'6px',color:'var(--text-muted)'}}>{r.state||'—'}</td>
                  <td style={{padding:'6px',fontWeight:700,color:r.strength>=2?'#00ff9f':r.strength>=1?'#ffd166':'var(--text-muted)'}}>{Number(r.strength||0).toFixed(1)}</td>
                  <td style={{padding:'6px'}}>{r.pl_zone?<span style={{fontSize:9,color:r.pl_zone==='ABOVE'?'#00ff9f':r.pl_zone==='BELOW'?'#ff4d6d':'#ffd166'}}>{r.pl_zone}</span>:'—'}</td>
                  <td style={{padding:'6px',textAlign:'center'}}>{valid?<span style={{color:'#00ff9f'}}>✅</span>:<span style={{color:'var(--text-muted)'}}>⛔</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {logs.length===0 && !loading && <div style={{textAlign:'center',padding:40,fontFamily:mono,fontSize:11,color:'var(--text-muted)'}}>No snapshots yet — data logs every engine cycle</div>}
    </div>
  );
}

// ===== RESEARCH TAB (CALENDAR + COT) =====
function ResearchTab({ pairs, cotData, cotLoading, fetchCot }) {
  const [sub,setSub]=useState('CALENDAR');
  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',gap:6}}>
        {['CALENDAR','COT'].map(s=><button key={s} onClick={()=>setSub(s)} style={{background:sub===s?'rgba(0,180,255,0.12)':'transparent',border:`1px solid ${sub===s?'#00b4ff':'var(--border)'}`,borderRadius:5,color:sub===s?'#00b4ff':'var(--text-muted)',fontFamily:mono,fontSize:10,letterSpacing:2,padding:'6px 16px',cursor:'pointer',fontWeight:sub===s?700:400}}>{s}</button>)}
      </div>
      {sub==='CALENDAR'?<EconomicCalendar pairs={pairs}/>:(
        <div style={{maxWidth:860,margin:'0 auto'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
            <div><div style={{fontFamily:orb,fontSize:15,fontWeight:700,color:'#00b4ff',letterSpacing:3}}>COT REPORT</div><div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2,marginTop:3}}>CFTC · NON-COMMERCIAL · WEEKLY</div></div>
            <button onClick={fetchCot} style={{background:'transparent',border:'1px solid #1e3060',borderRadius:5,color:'#00b4ff',fontFamily:mono,fontSize:9,padding:'5px 12px',cursor:'pointer'}}>{cotLoading?'↻ LOADING':'⟳ REFRESH'}</button>
          </div>
          {cotLoading?<div style={{textAlign:'center',padding:60,fontFamily:mono,fontSize:11,color:'var(--text-muted)'}}>FETCHING COT DATA...</div>
           :cotData.length===0?<div style={{textAlign:'center',padding:60,fontFamily:mono,fontSize:10,color:'var(--text-muted)'}}>NO DATA — Click REFRESH</div>
           :<div style={{display:'flex',flexDirection:'column',gap:8}}>{[...cotData].sort((a,b)=>b.netPos-a.netPos).map(cot=><CotRow key={cot.currency} cot={cot}/>)}</div>}
        </div>
      )}
    </div>
  );
}

// ===== PANDA AI CHAT =====
function PandaAIChat({ userId, isAdmin }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeMode, setActiveMode] = useState(null);
  const [aiSubTab, setAiSubTab] = useState('chat');
  const [agentResults, setAgentResults] = useState(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentProgress, setAgentProgress] = useState([]);
  const chatEndRef = useRef(null);
  const mono = "'Share Tech Mono',monospace", orb = "'Orbitron',sans-serif";

  const scrollToBottom = useCallback(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, []);
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const sendRequest = useCallback(async (mode, userMessage) => {
    if (loading) return;
    setLoading(true);
    setActiveMode(mode);
    const displayMsg = mode === 'chat' ? userMessage : mode === 'insights' ? '📊 Analyze market — rank best setups' : '📋 Review my trade performance';
    setMessages(prev => [...prev, { role: 'user', content: displayMsg }]);
    try {
      const body = { mode, userId };
      if (mode === 'chat') { body.message = userMessage; body.history = messages.slice(-6); }
      const r = await fetch('/api/ai-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await r.json();
      if (r.ok && data.reply) setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      else setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ ' + (data.error || 'Failed to get response.') }]);
    } catch { setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Connection error. Try again.' }]); }
    setLoading(false);
    setActiveMode(null);
  }, [loading, messages]);

  const handleSend = useCallback(() => { if (!input.trim()) return; const msg = input.trim(); setInput(''); sendRequest('chat', msg); }, [input, sendRequest]);
  const handleKeyDown = useCallback((e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }, [handleSend]);

  // ---- ALL AGENTS ----
  const runAllAgents = useCallback(async () => {
    if (agentRunning) return;
    setAgentRunning(true);
    setAgentResults(null);
    setAgentProgress([
      { name: 'Signal Agent', status: 'running' },
      { name: 'Journal Agent', status: 'running' },
      { name: 'Pattern Agent', status: 'running' },
    ]);
    try {
      const r = await fetch('/api/run-all-agents', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await r.json();
      if (r.ok && data.agents) {
        setAgentResults(data);
        setAgentProgress(data.agents.map(a => ({
          name: a.agent,
          status: a.status === 'success' ? 'done' : 'error',
          duration: a.duration_ms,
          detail: a.status === 'success'
            ? `${a.memories_written ?? a.themes_written ?? '?'} memories · ${a.total_signals_analyzed || a.total_trades_analyzed || a.signals_analyzed || '—'} analyzed`
            : a.error || 'Failed',
        })));
      } else {
        setAgentProgress(prev => prev.map(p => ({ ...p, status: 'error', detail: data.error || 'API error' })));
      }
    } catch (err) {
      setAgentProgress(prev => prev.map(p => ({ ...p, status: 'error', detail: err.message })));
    }
    setAgentRunning(false);
  }, [agentRunning]);

  const AI_SUB_TABS = [
    { key: 'chat', label: '💬 CHAT', color: '#00b4ff' },
    { key: 'agents', label: '🤖 ALL AGENTS', color: '#cc77ff' },
  ];

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12,height:'100%'}}>
      {/* Sub-tab selector */}
      <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <span style={{fontFamily:orb,fontSize:11,color:'#00b4ff',letterSpacing:4,fontWeight:700}}>🐼 PANDA AI</span>
        <div style={{display:'flex',gap:4,background:'var(--bg-secondary)',borderRadius:6,border:'1px solid var(--border)',overflow:'hidden'}}>
          {AI_SUB_TABS.map(st=>(
            <button key={st.key} onClick={()=>setAiSubTab(st.key)} style={{
              fontFamily:mono,fontSize:9,padding:'5px 14px',border:'none',cursor:'pointer',letterSpacing:2,
              background:aiSubTab===st.key?st.color+'22':'transparent',
              color:aiSubTab===st.key?st.color:'var(--text-muted)',fontWeight:aiSubTab===st.key?700:400,
              borderBottom:aiSubTab===st.key?`2px solid ${st.color}`:'2px solid transparent',
            }}>{st.label}</button>
          ))}
        </div>
      </div>

      {/* ===== CHAT SUB-TAB ===== */}
      {aiSubTab==='chat'&&(<>
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
        <button onClick={()=>sendRequest('insights')} disabled={loading} style={{fontFamily:mono,fontSize:9,padding:'5px 14px',borderRadius:4,border:'1px solid #00ff9f44',background:activeMode==='insights'?'rgba(0,255,159,0.15)':'var(--bg-card)',color:'#00ff9f',cursor:loading?'not-allowed':'pointer',letterSpacing:2}}>📊 ANALYZE MARKET</button>
        <button onClick={()=>sendRequest('review')} disabled={loading} style={{fontFamily:mono,fontSize:9,padding:'5px 14px',borderRadius:4,border:'1px solid #ffd16644',background:activeMode==='review'?'rgba(255,209,102,0.15)':'var(--bg-card)',color:'#ffd166',cursor:loading?'not-allowed':'pointer',letterSpacing:2}}>📋 REVIEW TRADES</button>
        {messages.length>0&&<button onClick={()=>setMessages([])} style={{fontFamily:mono,fontSize:8,padding:'4px 8px',borderRadius:4,border:'1px solid #ff4d6d33',background:'rgba(255,77,109,0.1)',color:'#ff4d6d',cursor:'pointer',letterSpacing:1}}>✕ CLEAR</button>}
      </div>

      <div style={{flex:1,minHeight:300,maxHeight:500,overflowY:'auto',display:'flex',flexDirection:'column',gap:8,padding:8,background:'var(--bg-secondary)',borderRadius:8,border:'1px solid var(--border)'}}>
        {messages.length===0&&!loading&&(
          <div style={{textAlign:'center',padding:30,color:'var(--text-muted)',fontFamily:mono,fontSize:10}}>
            <div style={{fontSize:28,marginBottom:8}}>🐼</div>
            <div style={{fontFamily:orb,fontSize:13,color:'#00b4ff',letterSpacing:3,fontWeight:700,marginBottom:6}}>WELCOME TO PANDA AI</div>
            <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:18,lineHeight:1.6,maxWidth:420,margin:'0 auto 18px'}}>
              Your personal dashboard assistant. Ask me anything about how to use the dashboard, what the numbers mean, or what's happening in the market.
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6,maxWidth:360,margin:'0 auto'}}>
              {[
                {icon:'🗺️',label:'How do I use this dashboard?',color:'#00b4ff'},
                {icon:'📊',label:'What do the colors and numbers mean?',color:'#00ff9f'},
                {icon:'🔍',label:'Which tabs should I check first?',color:'#ffd166'},
                {icon:'⚡',label:'What looks strong right now?',color:'#00ff9f'},
              ].map((q,i)=>(
                <button key={i} onClick={()=>sendRequest('chat',q.label)} style={{
                  fontFamily:mono,fontSize:10,padding:'8px 14px',borderRadius:6,cursor:'pointer',textAlign:'left',
                  border:`1px solid ${q.color}33`,background:`${q.color}08`,color:q.color,
                  display:'flex',alignItems:'center',gap:8,letterSpacing:0.5,
                  transition:'background 0.15s',
                }} onMouseEnter={e=>e.currentTarget.style.background=`${q.color}18`} onMouseLeave={e=>e.currentTarget.style.background=`${q.color}08`}>
                  <span style={{fontSize:14}}>{q.icon}</span>{q.label}
                </button>
              ))}
            </div>
            <div style={{marginTop:16,fontSize:9,color:'var(--text-muted)',opacity:0.6,letterSpacing:1}}>
              Or use the buttons above for market analysis & trade reviews
            </div>
          </div>
        )}
        {messages.map((m,i)=>(
          <div key={i} style={{alignSelf:m.role==='user'?'flex-end':'flex-start',maxWidth:'85%',padding:'8px 12px',borderRadius:8,background:m.role==='user'?'rgba(0,180,255,0.12)':'var(--bg-card)',border:`1px solid ${m.role==='user'?'#00b4ff33':'var(--border)'}`,fontFamily:mono,fontSize:10,color:'var(--text-primary)',lineHeight:1.6,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
            {m.content}
          </div>
        ))}
        {loading&&(
          <div style={{alignSelf:'flex-start',padding:'8px 12px',borderRadius:8,background:'var(--bg-card)',border:'1px solid var(--border)',fontFamily:mono,fontSize:10,color:'#00b4ff'}}>
            🐼 Analyzing{activeMode==='insights'?' market data':activeMode==='review'?' trade history':''}...
          </div>
        )}
        <div ref={chatEndRef}/>
      </div>

      <div style={{display:'flex',gap:8}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Ask Panda AI about any pair or setup..." disabled={loading} style={{flex:1,fontFamily:mono,fontSize:10,padding:'8px 12px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-card)',color:'var(--text-primary)',outline:'none'}}/>
        <button onClick={handleSend} disabled={loading||!input.trim()} style={{fontFamily:mono,fontSize:9,padding:'8px 16px',borderRadius:6,border:'1px solid #00b4ff44',background:input.trim()?'rgba(0,180,255,0.15)':'var(--bg-card)',color:input.trim()?'#00b4ff':'var(--text-muted)',cursor:input.trim()&&!loading?'pointer':'not-allowed',letterSpacing:2}}>SEND</button>
      </div>
      </>)}

      {/* ===== ALL AGENTS SUB-TAB ===== */}
      {aiSubTab==='agents'&&(
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <div style={{fontFamily:orb,fontSize:13,color:'#cc77ff',letterSpacing:3,fontWeight:700}}>ALL AGENTS</div>
            <button onClick={runAllAgents} disabled={agentRunning} style={{
              fontFamily:mono,fontSize:10,padding:'8px 20px',borderRadius:6,cursor:agentRunning?'not-allowed':'pointer',
              border:'1px solid #cc77ff55',background:agentRunning?'rgba(204,119,255,0.08)':'rgba(204,119,255,0.15)',
              color:'#cc77ff',letterSpacing:2,fontWeight:700,
              animation:agentRunning?'blink 1s infinite':'none',
            }}>{agentRunning?'⟳ RUNNING ALL AGENTS...':'🚀 RUN ALL AGENTS'}</button>
            {agentResults&&<span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{(agentResults.total_duration_ms/1000).toFixed(1)}s total</span>}
          </div>

          <div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:1,lineHeight:1.6}}>
            Runs Signal Agent + Journal Agent + Pattern Agent in parallel. Updates all AI memories at once.
          </div>

          {/* Agent status cards */}
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            {(agentProgress.length>0?agentProgress:[
              {name:'Signal Agent',status:'idle'},
              {name:'Journal Agent',status:'idle'},
              {name:'Pattern Agent',status:'idle'},
            ]).map(a=>{
              const icon = a.status==='done'?'✅':a.status==='running'?'⟳':a.status==='error'?'❌':'⏸️';
              const borderC = a.status==='done'?'#00ff9f':a.status==='running'?'#cc77ff':a.status==='error'?'#ff4d6d':'var(--border)';
              const bgC = a.status==='done'?'rgba(0,255,159,0.06)':a.status==='running'?'rgba(204,119,255,0.08)':a.status==='error'?'rgba(255,77,109,0.06)':'var(--bg-card)';
              return(
                <div key={a.name} style={{flex:'1 1 200px',minWidth:200,background:bgC,border:`1px solid ${borderC}`,borderRadius:10,padding:'14px 18px',display:'flex',flexDirection:'column',gap:6}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span style={{fontFamily:orb,fontSize:11,fontWeight:700,color:'var(--text-primary)',letterSpacing:1}}>{a.name}</span>
                    <span style={{fontSize:14,animation:a.status==='running'?'spin 1s linear infinite':'none',display:'inline-block'}}>{icon}</span>
                  </div>
                  {a.status==='running'&&<div style={{fontFamily:mono,fontSize:9,color:'#cc77ff',letterSpacing:1}}>Processing...</div>}
                  {a.detail&&<div style={{fontFamily:mono,fontSize:9,color:a.status==='error'?'#ff4d6d':'#00ff9f',lineHeight:1.5}}>{a.detail}</div>}
                  {a.duration!=null&&<div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)'}}>{(a.duration/1000).toFixed(1)}s</div>}
                </div>
              );
            })}
          </div>

          {/* Detailed results */}
          {agentResults&&agentResults.agents&&(
            <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:4}}>
              <div style={{fontFamily:orb,fontSize:11,color:'#00b4ff',letterSpacing:2}}>RESULTS</div>
              {agentResults.agents.map((a,i)=>(
                <div key={i} style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 16px',fontFamily:mono,fontSize:9,color:'var(--text-primary)',lineHeight:1.8}}>
                  <div style={{fontWeight:700,color:a.status==='success'?'#00ff9f':'#ff4d6d',marginBottom:4,letterSpacing:1}}>{a.agent} — {a.status==='success'?'SUCCESS':'FAILED'}</div>
                  {a.status==='success'&&(<>
                    {a.total_signals_analyzed!=null&&<div>Signals analyzed: <span style={{color:'#00b4ff'}}>{a.total_signals_analyzed}</span></div>}
                    {a.total_trades_analyzed!=null&&<div>Trades analyzed: <span style={{color:'#00b4ff'}}>{a.total_trades_analyzed}</span>{a.open_trades!=null&&<span style={{color:'var(--text-muted)'}}> (open: {a.open_trades} · closed: {a.closed_trades||0}{a.journal_trades?` · journal: ${a.journal_trades}`:''})</span>}</div>}
                    {a.signals_analyzed!=null&&<div>Signals cross-referenced: <span style={{color:'#00b4ff'}}>{a.signals_analyzed}</span></div>}
                    {a.memories_written!=null&&<div>Memories written: <span style={{color:'#00ff9f'}}>{a.memories_written}</span></div>}
                    {a.themes_written!=null&&<div>Themes written: <span style={{color:'#00ff9f'}}>{a.themes_written}</span></div>}
                    {a.bb_count!=null&&<div>BB: {a.bb_count} · INTRA: {a.intra_count}</div>}
                    {a.analysis_types&&<div style={{marginTop:4,color:'var(--text-muted)',fontSize:8}}>{a.analysis_types.length} analysis types</div>}
                  </>)}
                  {a.status!=='success'&&<div style={{color:'#ff4d6d'}}>{a.error}</div>}
                </div>
              ))}
              <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:1}}>Ran at {new Date(agentResults.ran_at).toLocaleString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',day:'2-digit',month:'short'})}</div>
            </div>
          )}

          {!agentResults&&!agentRunning&&(
            <div style={{textAlign:'center',padding:30,fontFamily:mono,fontSize:10,color:'var(--text-muted)'}}>
              <div style={{fontSize:36,marginBottom:12}}>🤖</div>
              <div style={{fontFamily:orb,fontSize:12,color:'#cc77ff',letterSpacing:3,marginBottom:8}}>AGENT COMMAND CENTER</div>
              <div style={{maxWidth:400,margin:'0 auto',lineHeight:1.7}}>
                Hit RUN ALL AGENTS to fire all 3 AI agents at once.
                They analyze your signal history, trade journal, and cross-reference patterns — all in parallel.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ===== SIGNAL TRACKER PANEL =====
function TrackerPanel() {
  const [trackers, setTrackers] = useState([]);
  const [closed, setClosed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trackerError, setTrackerError] = useState(null);
  const [showClosed, setShowClosed] = useState(false);
  const mono = "'Share Tech Mono',monospace", orb = "'Orbitron',sans-serif";

  const loadTrackers = useCallback(async () => {
    setLoading(true);
    try {
      const [openR, closedR] = await Promise.all([
        fetch('/api/signal-tracker?status=OPEN'),
        fetch('/api/signal-tracker?status=CLOSED&limit=20')
      ]);
      if (!openR.ok || !closedR.ok) { setTrackerError('API returned ' + (openR.ok ? closedR.status : openR.status)); setLoading(false); return; }
      const [openD, closedD] = await Promise.all([openR.json(), closedR.json()]);
      setTrackers(openD.trackers || []);
      setClosed(closedD.trackers || []);
      setTrackerError(null);
    } catch (e) { setTrackerError(e.message || 'Connection error'); }
    setLoading(false);
  }, []);
  useEffect(() => { loadTrackers(); }, [loadTrackers]);

  const ageStr = (opened) => {
    const h = Math.round((Date.now() - new Date(opened).getTime()) / 3600000);
    return h < 24 ? h + 'h' : Math.round(h / 24) + 'd';
  };
  const gapColor = (g) => g >= 9 ? '#00ff9f' : g >= 7 ? '#ffd166' : '#ffaa44';

  if (loading) return <div style={{textAlign:'center',padding:20,fontFamily:mono,fontSize:10,color:'var(--text-muted)'}}>LOADING TRACKERS...</div>;
  if (trackerError) return <div style={{textAlign:'center',padding:20,fontFamily:mono,fontSize:10,color:'#ff4d6d'}}>⚠️ {trackerError} — <span style={{cursor:'pointer',textDecoration:'underline'}} onClick={loadTrackers}>RETRY</span></div>;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <span style={{fontFamily:orb,fontSize:11,color:'#ffaa44',letterSpacing:4,fontWeight:700}}>🔭 SIGNAL TRACKER</span>
        <span style={{fontFamily:mono,fontSize:9,color:'#00ff9f',background:'rgba(0,255,159,0.1)',border:'1px solid rgba(0,255,159,0.3)',borderRadius:4,padding:'2px 8px'}}>{trackers.length} OPEN</span>
        <button onClick={()=>setShowClosed(!showClosed)} style={{fontFamily:mono,fontSize:8,padding:'3px 10px',borderRadius:4,border:'1px solid var(--border)',background:showClosed?'rgba(0,180,255,0.12)':'var(--bg-card)',color:showClosed?'#00b4ff':'var(--text-muted)',cursor:'pointer',letterSpacing:1}}>
          {showClosed ? 'HIDE' : 'SHOW'} CLOSED ({closed.length})
        </button>
      </div>

      {trackers.length === 0 && <div style={{fontFamily:mono,fontSize:10,color:'var(--text-muted)',padding:16,textAlign:'center'}}>No signals being tracked right now</div>}

      {trackers.length > 0 && (
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {trackers.map(t => {
            const dc = t.direction === 'BUY' ? '#00ff9f' : '#ff4d6d';
            const gaps = Array.isArray(t.hourly_gaps) ? t.hourly_gaps : [];
            const lastGap = gaps.length > 0 ? gaps[gaps.length - 1].gap : t.gap_at_open;
            const gapDelta = lastGap - t.gap_at_open;
            return (
              <div key={t.id} style={{background:'var(--bg-card)',border:`1px solid ${dc}28`,borderRadius:8,padding:'10px 14px',minWidth:170,maxWidth:220,display:'flex',flexDirection:'column',gap:4}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontFamily:orb,fontSize:12,fontWeight:700,color:'var(--text-primary)',letterSpacing:1}}>{t.symbol}</span>
                  <span style={{fontFamily:mono,fontSize:8,color:dc,background:dc+'18',border:`1px solid ${dc}33`,borderRadius:3,padding:'1px 5px'}}>{t.direction}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                  <span style={{fontFamily:orb,fontSize:22,fontWeight:900,color:gapColor(lastGap)}}>{lastGap}</span>
                  <span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)'}}>open: {t.gap_at_open}</span>
                </div>
                <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',display:'flex',justifyContent:'space-between'}}>
                  <span>peak: {t.peak_gap}</span>
                  <span style={{color:gapDelta > 0 ? '#00ff9f' : gapDelta < 0 ? '#ff4d6d' : 'var(--text-muted)'}}>{gapDelta > 0 ? '+' : ''}{gapDelta}</span>
                </div>
                <div style={{fontFamily:mono,fontSize:7,color:'var(--text-muted)',display:'flex',justifyContent:'space-between',marginTop:2}}>
                  <span>{t.strategy} · {t.momentum_at_open || '—'}</span>
                  <span>{ageStr(t.opened_at)}</span>
                </div>
                {t.h24_snapshot && <div style={{fontFamily:mono,fontSize:7,color:'#00b4ff'}}>24h: gap {t.h24_snapshot.gap}</div>}
                {t.h48_snapshot && <div style={{fontFamily:mono,fontSize:7,color:'#00b4ff'}}>48h: gap {t.h48_snapshot.gap}</div>}
              </div>
            );
          })}
        </div>
      )}

      {showClosed && closed.length > 0 && (
        <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:8}}>
          <div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2}}>RECENTLY CLOSED</div>
          <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:250,overflowY:'auto'}}>
            {closed.map(t => {
              const dc = t.direction === 'BUY' ? '#00ff9f' : '#ff4d6d';
              const dur = t.closed_at ? Math.round((new Date(t.closed_at) - new Date(t.opened_at)) / 3600000) : 0;
              return (
                <div key={t.id} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 10px',background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:6,flexWrap:'wrap'}}>
                  <span style={{fontFamily:orb,fontSize:10,fontWeight:700,color:'var(--text-primary)',minWidth:65}}>{t.symbol}</span>
                  <span style={{fontFamily:mono,fontSize:7,color:dc,background:dc+'15',borderRadius:3,padding:'1px 4px'}}>{t.direction}</span>
                  <span style={{fontFamily:mono,fontSize:7,color:'var(--text-muted)'}}>gap:{t.gap_at_open}→peak:{t.peak_gap}</span>
                  <span style={{fontFamily:mono,fontSize:7,color:'#ffaa44'}}>{t.close_reason}</span>
                  <span style={{fontFamily:mono,fontSize:7,color:'var(--text-muted)',marginLeft:'auto'}}>{dur}h</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== OVERVIEW TAB =====
// ═══════ OVERVIEW TAB — Dark Matter Design ═══════
const OV_COLORS = {
  buy:'#00ff9f',buyDim:'rgba(0,255,159,0.12)',buyGlow:'rgba(0,255,159,0.25)',
  sell:'#ff4d6d',sellDim:'rgba(255,77,109,0.12)',sellGlow:'rgba(255,77,109,0.25)',
  accent:'#00b4ff',accentDim:'rgba(0,180,255,0.12)',
  warn:'#ffd166',warnDim:'rgba(255,209,102,0.10)',
  ai:'#7C3AED',aiDim:'rgba(124,58,237,0.12)',
  proven:'#10B981',dead:'#EF4444',
  bgCard:'rgba(14,22,38,0.90)',bgCardSolid:'#0e1626',
  border:'rgba(255,255,255,0.12)',borderBright:'rgba(255,255,255,0.22)',
  textPrimary:'#ffffff',textSecondary:'#e0e8f8',textMuted:'#a0b0cc',
};
const ovGlass = { background:OV_COLORS.bgCard, backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)', border:`1px solid ${OV_COLORS.border}`, borderRadius:12 };
const ovMomColors = { STRONG:'#00ff9f',BUILDING:'#66ffcc',SPARK:'#ffd166',EMERGING:'#66ffcc',STABLE:'#6b7fa8',CONSOLIDATING:'#5a6d8a',COOLING:'#ffaa44',FADING:'#ff7744',REVERSING:'#ff4d6d',NEUTRAL:'#3a4568' };
const ovMomStates = ['STRONG','BUILDING','SPARK','EMERGING','STABLE','CONSOLIDATING','COOLING','FADING','REVERSING','NEUTRAL'];

function AnimNum({ value, delay=0 }) {
  const [d, setD] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => { let s=0; const step=value/20; const iv=setInterval(()=>{ s+=step; if(s>=value){setD(value);clearInterval(iv);}else setD(Math.round(s)); },30); return ()=>clearInterval(iv); }, delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return <span>{d}</span>;
}

function MiniSpark({ data, color, w=80, h=28 }) {
  const gid = `sp-${color.replace('#','')}`;
  return <ResponsiveContainer width={w} height={h}><AreaChart data={data} margin={{top:2,right:2,bottom:2,left:2}}>
    <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.4}/><stop offset="100%" stopColor={color} stopOpacity={0}/></linearGradient></defs>
    <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${gid})`} dot={false} isAnimationActive={false}/>
  </AreaChart></ResponsiveContainer>;
}

function OvMarketGauge({ mode, color, glow }) {
  const angle = mode==='TRENDING'?-45:mode==='CHAOTIC'?45:0;
  return <div style={{position:'relative',width:100,height:56}}>
    <svg viewBox="0 0 100 56" style={{width:'100%',height:'100%'}}>
      <defs>
        <linearGradient id="gaugeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#00ff9f"/><stop offset="50%" stopColor="#ffd166"/><stop offset="100%" stopColor="#ff4d6d"/></linearGradient>
        <filter id="gaugeGl"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="url(#gaugeG)" strokeWidth="4" strokeLinecap="round" opacity="0.6"/>
      <line x1="50" y1="50" x2={50+28*Math.cos((angle-90)*Math.PI/180)} y2={50+28*Math.sin((angle-90)*Math.PI/180)} stroke={color} strokeWidth="2.5" strokeLinecap="round" filter="url(#gaugeGl)" style={{transition:'all 0.8s ease'}}/>
      <circle cx="50" cy="50" r="3" fill={color} filter="url(#gaugeGl)"/>
    </svg>
    <div style={{position:'absolute',bottom:0,left:'50%',transform:'translateX(-50%)',fontFamily:mono,fontSize:8,color,letterSpacing:2,textAlign:'center',textShadow:`0 0 8px ${glow}`}}>{mode}</div>
  </div>;
}

function OvSessionTimeline({ sessionInfo, isMobile }) {
  const { sessions, isOn, total } = sessionInfo;
  const barW = isMobile?220:340, barH = 24;
  const toX = (min) => (min/1440)*barW;
  const nowX = toX(total);
  return <div style={{position:'relative'}}>
    <svg viewBox={`0 0 ${barW} ${barH+14}`} style={{width:barW,height:barH+14,display:'block'}}>
      <rect x="0" y="6" width={barW} height={barH} rx="4" fill="rgba(255,255,255,0.03)" stroke={OV_COLORS.border} strokeWidth="0.5"/>
      {sessions.map(s => {
        const on=isOn(s), x1=toX(s.open), x2=toX(s.close);
        if(s.open>s.close) return <g key={s.name}>
          <rect x={x1} y="8" width={barW-x1} height={barH-4} rx="2" fill={on?s.color+'30':'rgba(255,255,255,0.02)'} stroke={on?s.color+'60':'none'} strokeWidth="0.5"/>
          <rect x="0" y="8" width={x2} height={barH-4} rx="2" fill={on?s.color+'30':'rgba(255,255,255,0.02)'} stroke={on?s.color+'60':'none'} strokeWidth="0.5"/>
          <text x={(x1+barW)/2} y="22" fill={on?s.color:OV_COLORS.textMuted} fontSize="7" fontFamily={mono} textAnchor="middle" letterSpacing="1">{s.name}</text>
        </g>;
        return <g key={s.name}>
          <rect x={x1} y="8" width={x2-x1} height={barH-4} rx="2" fill={on?s.color+'30':'rgba(255,255,255,0.02)'} stroke={on?s.color+'60':'none'} strokeWidth="0.5"/>
          <text x={(x1+x2)/2} y="22" fill={on?s.color:OV_COLORS.textMuted} fontSize="7" fontFamily={mono} textAnchor="middle" letterSpacing="1">{s.name}</text>
        </g>;
      })}
      <line x1={nowX} y1="4" x2={nowX} y2={barH+8} stroke={OV_COLORS.accent} strokeWidth="1.5" strokeLinecap="round" opacity="0.9"/>
      <circle cx={nowX} cy="4" r="2.5" fill={OV_COLORS.accent}><animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite"/></circle>
      <text x={nowX} y={barH+14} fill={OV_COLORS.accent} fontSize="6" fontFamily={mono} textAnchor="middle">NOW</text>
    </svg>
  </div>;
}

function OvExposureRings({ exposure }) {
  return <div style={{display:'flex',flexDirection:'column',gap:6}}>
    {exposure.map(({currency,exposure:exp,abs:a})=>{
      const pct=Math.min(a/4,1); const c=a>=3?OV_COLORS.sell:a>=2?OV_COLORS.warn:OV_COLORS.buy;
      return <div key={currency} style={{display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontFamily:mono,fontSize:10,color:OV_COLORS.textSecondary,width:28,letterSpacing:1}}>{currency}</span>
        <div style={{flex:1,height:6,background:'rgba(255,255,255,0.04)',borderRadius:3,overflow:'hidden',position:'relative'}}>
          <div style={{width:`${pct*100}%`,height:'100%',background:`linear-gradient(90deg,${c}88,${c})`,borderRadius:3,transition:'width 0.6s ease',boxShadow:a>=3?`0 0 8px ${c}40`:'none'}}/>
        </div>
        <span style={{fontFamily:mono,fontSize:9,color:c,width:20,textAlign:'right'}}>{exp>0?'+':''}{exp}</span>
      </div>;
    })}
  </div>;
}

function OvCurrencyChart({ data }) {
  const flowColors={ACCELERATING:'#00ff9f',STRENGTHENING:'#66ffcc',NEUTRAL:'#6b7fa8',SOFTENING:'#ffaa44',WEAKENING:'#ff4d6d'};
  const flowIcons={ACCELERATING:'↑↑',STRENGTHENING:'↑',NEUTRAL:'—',SOFTENING:'↓',WEAKENING:'↓↓'};
  return <div style={{display:'flex',flexDirection:'column',gap:6}}>
    {data.map(({currency,strength,flow})=>{
      const pct=Math.min(Math.abs(strength)/6,1);const c=strength>0?OV_COLORS.buy:strength<0?OV_COLORS.sell:OV_COLORS.textMuted;
      return <div key={currency} style={{display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontFamily:mono,fontSize:10,color:OV_COLORS.textSecondary,width:28,letterSpacing:1}}>{currency}</span>
        <div style={{flex:1,height:8,background:'rgba(255,255,255,0.03)',borderRadius:4,overflow:'hidden',position:'relative'}}>
          {strength>=0?<div style={{position:'absolute',left:'50%',width:`${pct*50}%`,height:'100%',background:`linear-gradient(90deg,${c}44,${c})`,borderRadius:'0 4px 4px 0',transition:'width 0.6s ease'}}/>
          :<div style={{position:'absolute',right:'50%',width:`${pct*50}%`,height:'100%',background:`linear-gradient(270deg,${c}44,${c})`,borderRadius:'4px 0 0 4px',transition:'width 0.6s ease'}}/>}
          <div style={{position:'absolute',left:'50%',top:0,width:1,height:'100%',background:'rgba(255,255,255,0.1)'}}/>
        </div>
        <span style={{fontFamily:mono,fontSize:8,color:flowColors[flow]||'#6b7fa8',width:44,textAlign:'right',letterSpacing:0.5}}>{flowIcons[flow]||'—'} {(flow||'').slice(0,4)}</span>
      </div>;
    })}
  </div>;
}

function OvSignalCard({ pair, tier, onClick, delay }) {
  const [hov,setHov]=useState(false);
  const bc=pair.bias==='BUY'?OV_COLORS.buy:pair.bias==='SELL'?OV_COLORS.sell:OV_COLORS.textMuted;
  const isH=tier==='HIGH',isL=tier==='LOW';
  const tags=[];
  if(pair.edge==='PROVEN_EDGE') tags.push({label:'PROVEN',color:OV_COLORS.proven,bg:'rgba(16,185,129,0.15)'});
  if(pair.edge==='DEAD_ZONE') tags.push({label:'DEAD ZONE',color:OV_COLORS.dead,bg:'rgba(239,68,68,0.15)'});
  if(pair.news) tags.push({label:'NEWS',color:OV_COLORS.warn,bg:OV_COLORS.warnDim});
  if(pair.conf<40&&pair.bias!=='WAIT') tags.push({label:'LOW CONF',color:'#ff8844',bg:'rgba(255,136,68,0.12)'});
  if(pair.conflict) tags.push({label:'CONFLICT',color:OV_COLORS.sell,bg:OV_COLORS.sellDim});
  const glowColor=pair.bias==='BUY'?'rgba(0,255,159,0.35)':pair.bias==='SELL'?'rgba(255,77,109,0.35)':'none';
  const glowHover=pair.bias==='BUY'?'0 0 24px rgba(0,255,159,0.5), 0 4px 20px rgba(0,255,159,0.25)':pair.bias==='SELL'?'0 0 24px rgba(255,77,109,0.5), 0 4px 20px rgba(255,77,109,0.25)':`0 8px 24px ${bc}20`;
  const glowBase=pair.bias==='BUY'?`0 0 16px rgba(0,255,159,0.3), 0 2px 12px rgba(0,255,159,0.15)`:pair.bias==='SELL'?`0 0 16px rgba(255,77,109,0.3), 0 2px 12px rgba(255,77,109,0.15)`:`0 4px 16px ${bc}10`;
  const biasGradient=pair.bias==='BUY'?'linear-gradient(135deg,rgba(0,255,159,0.08),rgba(14,22,38,0.92))':pair.bias==='SELL'?'linear-gradient(135deg,rgba(255,77,109,0.08),rgba(14,22,38,0.92))':OV_COLORS.bgCard;
  return <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} onClick={onClick} style={{
    ...ovGlass,padding:isH?'22px 24px':isL?'12px 14px':'18px 20px',cursor:'pointer',position:'relative',overflow:'hidden',
    background:biasGradient,
    opacity:isL?0.75:1,transform:hov?'translateY(-3px) scale(1.01)':'translateY(0)',transition:'all 0.25s ease',
    boxShadow:hov?glowHover:isH?glowBase:`0 0 8px ${bc}10`,
    borderColor:hov?`${bc}60`:isH?`${bc}35`:`${bc}20`,
    borderLeft:`3px solid ${bc}`,
  }}>
    {<div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${bc},transparent)`}}/>}
    {/* Header: Symbol + Bias + Gap */}
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:isL?4:10}}>
      <div style={{display:'flex',alignItems:'center',gap:isL?6:10}}>
        <span style={{fontFamily:orb,fontSize:isH?18:isL?13:15,fontWeight:700,color:OV_COLORS.textPrimary,letterSpacing:isH?2:1}}>{pair.symbol}</span>
        <span style={{fontFamily:mono,fontSize:isL?9:11,fontWeight:900,color:bc,background:`${bc}18`,border:`1px solid ${bc}45`,borderRadius:4,padding:isL?'2px 6px':'3px 10px',letterSpacing:1,textShadow:`0 0 8px ${bc}44`}}>{pair.bias}</span>
      </div>
      <span style={{fontFamily:orb,fontSize:isH?28:isL?14:20,fontWeight:900,color:bc,textShadow:`0 0 ${isH?20:14}px ${bc}66`}}>{pair.gap>0?'+':''}{Number(pair.gap).toFixed(1)}</span>
    </div>
    {/* Metrics row */}
    {!isL&&<div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:8}}>
      <span style={{fontFamily:mono,fontSize:10,padding:'3px 8px',borderRadius:4,color:pair.conf>=70?OV_COLORS.buy:pair.conf>=50?OV_COLORS.warn:OV_COLORS.textMuted,background:pair.conf>=70?OV_COLORS.buyDim:pair.conf>=50?OV_COLORS.warnDim:'rgba(255,255,255,0.04)',border:`1px solid ${pair.conf>=70?OV_COLORS.buy+'30':pair.conf>=50?OV_COLORS.warn+'30':OV_COLORS.border}`}}>{pair.conf}%</span>
      <span style={{fontFamily:mono,fontSize:10,color:ovMomColors[pair.momentum]||'#4a5578',padding:'3px 8px',borderRadius:4,background:`${ovMomColors[pair.momentum]||'#4a5578'}12`,border:`1px solid ${ovMomColors[pair.momentum]||'#4a5578'}25`}}>{pair.momentum}</span>
      <span style={{fontFamily:mono,fontSize:9,color:OV_COLORS.textMuted,letterSpacing:1}}>{Math.abs(pair.gap)>=9&&pair.pl_zone!=='BETWEEN'?'INTRA':'BB'}</span>
      {pair.pdr_strong&&<span style={{fontFamily:mono,fontSize:9,color:OV_COLORS.buy,background:OV_COLORS.buyDim,border:`1px solid ${OV_COLORS.buy}25`,borderRadius:3,padding:'2px 6px'}}>PDR ✓</span>}
    </div>}
    <div style={{marginBottom:isL?4:8}}><ScoreTfBadge row={pair} mt={0} showLabel={!isL} showEmpty={!isL}/></div>
    {(()=>{const isBuy=pair.bias==='BUY',isSell=pair.bias==='SELL';if(!isBuy&&!isSell)return null;const isJpy=pair.symbol?.includes('JPY');const dec=isJpy?3:5;const levels=isBuy?[{l:'PDL',v:pair.pdl},{l:'PWL',v:pair.pwl},{l:'PML',v:pair.pml},{l:'PYL',v:pair.pyl}].filter(x=>x.v!=null).sort((a,b)=>b.v-a.v):[{l:'PDH',v:pair.pdh},{l:'PWH',v:pair.pwh},{l:'PMH',v:pair.pmh},{l:'PYH',v:pair.pyh}].filter(x=>x.v!=null).sort((a,b)=>a.v-b.v);const top2=levels.slice(0,2);if(!top2.length)return null;const c1=isBuy?OV_COLORS.buy:OV_COLORS.sell;const c2='#00b4ff';return(<div style={{display:'flex',alignItems:'center',gap:isL?4:6,marginBottom:isL?4:8}}>
      <span style={{fontFamily:mono,fontSize:isL?7:8,color:OV_COLORS.textMuted,letterSpacing:2,fontWeight:600}}>PB ENTRY</span>
      {top2.map((lv,i)=><span key={lv.l} style={{fontFamily:mono,fontSize:isH?11:isL?9:10,color:i===0?c1:c2,background:(i===0?c1:c2)+'12',border:`1px solid ${(i===0?c1:c2)}28`,borderRadius:isL?3:4,padding:isL?'1px 5px':'2px 8px',fontWeight:700,letterSpacing:0.5}}>{lv.l} {Number(lv.v).toFixed(dec)}</span>)}
    </div>);})()}
    {tags.length>0&&<div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
      {tags.map(t=><span key={t.label} style={{fontFamily:mono,fontSize:8,color:t.color,background:t.bg,border:`1px solid ${t.color}30`,borderRadius:3,padding:'2px 6px',letterSpacing:1}}>{t.label}</span>)}
    </div>}
    {hov&&!isL&&<div style={{marginTop:10,paddingTop:8,borderTop:`1px solid ${OV_COLORS.border}`,display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
      {(()=>{const plv=pair.pl_zone==='ABOVE'&&pair.bias==='BUY'||pair.pl_zone==='BELOW'&&pair.bias==='SELL';const plc=plv?OV_COLORS.buy:'#ff7744';return <span style={{fontFamily:mono,fontSize:8,color:plc,background:plc+'12',border:`1px solid ${plc}30`,borderRadius:3,padding:'1px 6px'}}>PL {pair.pl_zone} {plv?'✅':'⛔'}</span>;})()}
      {pair.box_h4&&pair.box_h4!=='UNKNOWN'&&(()=>{const c=pair.box_h4==='UPTREND'?OV_COLORS.buy:pair.box_h4==='DOWNTREND'?OV_COLORS.sell:OV_COLORS.warn;return <span style={{fontFamily:mono,fontSize:8,color:c,background:c+'12',border:`1px solid ${c}30`,borderRadius:3,padding:'1px 6px'}}>H4 {pair.box_h4==='UPTREND'?'▲ UP':pair.box_h4==='DOWNTREND'?'▼ DN':'↔ RNG'}</span>;})()}
      {pair.box_h1&&pair.box_h1!=='UNKNOWN'&&(()=>{const c=pair.box_h1==='UPTREND'?OV_COLORS.buy:pair.box_h1==='DOWNTREND'?OV_COLORS.sell:OV_COLORS.warn;return <span style={{fontFamily:mono,fontSize:8,color:c,background:c+'12',border:`1px solid ${c}30`,borderRadius:3,padding:'1px 6px'}}>H1 {pair.box_h1==='UPTREND'?'▲ UP':pair.box_h1==='DOWNTREND'?'▼ DN':'↔ RNG'}</span>;})()}
      <span style={{fontFamily:mono,fontSize:8,color:OV_COLORS.textMuted,background:'rgba(255,255,255,0.04)',borderRadius:3,padding:'1px 6px'}}>PDR {Number(pair.pdr_strength||0).toFixed(2)} {pair.pdr_strong?'✓':''}</span>
      {pair.edge==='PROVEN_EDGE'&&<span style={{fontFamily:mono,fontSize:8,color:OV_COLORS.proven,background:'rgba(16,185,129,0.12)',border:`1px solid ${OV_COLORS.proven}30`,borderRadius:3,padding:'1px 6px'}}>✅ PROVEN</span>}
      {pair.edge==='DEAD_ZONE'&&<span style={{fontFamily:mono,fontSize:8,color:OV_COLORS.dead,background:'rgba(239,68,68,0.12)',border:`1px solid ${OV_COLORS.dead}30`,borderRadius:3,padding:'1px 6px'}}>⛔ DEAD</span>}
    </div>}
  </div>;
}

function OvStatCard({ label, value, icon:Icon, color, delay, subtitle, displayValue }) {
  return <div style={{...ovGlass,padding:'18px 20px',flex:1,minWidth:150,position:'relative',overflow:'hidden',animation:`fadeSlideUp 0.4s ease ${delay}ms both`,boxShadow:`0 0 20px ${color}08`}}>
    <div style={{position:'absolute',top:10,right:12,opacity:0.06}}><Icon size={40} color={color}/></div>
    <div style={{fontFamily:mono,fontSize:9,color:OV_COLORS.textMuted,letterSpacing:2,marginBottom:6}}>{label}</div>
    <div style={{fontFamily:orb,fontSize:32,fontWeight:900,color,lineHeight:1,marginBottom:6,textShadow:`0 0 20px ${color}30`}}>{displayValue!==undefined?displayValue:<AnimNum value={value} delay={delay+200}/>}</div>
    {subtitle&&<div style={{fontFamily:mono,fontSize:10,color:OV_COLORS.textSecondary}}>{subtitle}</div>}
  </div>;
}

function OvMomentumBar({ pairs }) {
  const counts={}; ovMomStates.forEach(s=>counts[s]=pairs.filter(p=>p.momentum===s).length);
  const [hovS,setHovS]=useState(null);
  return <div style={{...ovGlass,padding:'14px 16px'}}>
    <div style={{fontFamily:mono,fontSize:8,color:OV_COLORS.textMuted,letterSpacing:2,marginBottom:10}}>MOMENTUM DISTRIBUTION</div>
    <div style={{display:'flex',height:20,borderRadius:4,overflow:'hidden',gap:1}}>
      {ovMomStates.filter(s=>counts[s]>0).map(s=><div key={s} onMouseEnter={()=>setHovS(s)} onMouseLeave={()=>setHovS(null)} style={{
        flex:counts[s],background:hovS===s?ovMomColors[s]:`${ovMomColors[s]}80`,transition:'all 0.2s ease',position:'relative',cursor:'pointer',minWidth:4
      }}>{hovS===s&&<div style={{position:'absolute',bottom:'calc(100% + 6px)',left:'50%',transform:'translateX(-50%)',background:OV_COLORS.bgCardSolid,border:`1px solid ${ovMomColors[s]}40`,borderRadius:6,padding:'4px 8px',whiteSpace:'nowrap',zIndex:10,fontFamily:mono,fontSize:8,color:ovMomColors[s],letterSpacing:1,boxShadow:'0 4px 12px rgba(0,0,0,0.4)'}}>{s}: {counts[s]}</div>}</div>)}
    </div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>
      {ovMomStates.filter(s=>counts[s]>0).map(s=><div key={s} style={{display:'flex',alignItems:'center',gap:3}}>
        <div style={{width:6,height:6,borderRadius:1,background:ovMomColors[s]}}/><span style={{fontFamily:mono,fontSize:7,color:OV_COLORS.textMuted}}>{s} {counts[s]}</span>
      </div>)}
    </div>
  </div>;
}

function OvAIPanel() {
  const [reply,setReply]=useState(null);const [loading,setLoading]=useState(false);const [error,setError]=useState(null);const [expanded,setExpanded]=useState(false);
  async function fetchInsight(){setLoading(true);setError(null);try{const r=await fetch('/api/ai-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'insights'})});const d=await r.json();if(r.ok&&d.reply){setReply(d.reply);}else setError(d.error||'Failed');}catch{setError('Connection error');}setLoading(false);}
  function parseBullets(text){if(!text)return[];const clean=text.replace(/\*\*/g,'').replace(/^[\*\-\•#]+\s*/gm,'');const sentences=clean.split(/(?<=[.!?])\s+/).filter(s=>s.trim().length>10);return sentences.slice(0,4).map(s=>s.length>120?s.slice(0,117)+'...':s);}
  const bullets=parseBullets(reply);
  return <div style={{...ovGlass,padding:'12px 14px',borderColor:`${OV_COLORS.ai}25`,background:`linear-gradient(135deg,${OV_COLORS.aiDim},${OV_COLORS.bgCard})`}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
      <div style={{display:'flex',alignItems:'center',gap:6}}><Brain size={12} color={OV_COLORS.ai}/><span style={{fontFamily:mono,fontSize:8,color:OV_COLORS.ai,letterSpacing:2,fontWeight:700}}>AI INSIGHT</span></div>
      <div style={{display:'flex',gap:6}}>
        <button onClick={fetchInsight} disabled={loading} style={{fontFamily:mono,fontSize:7,color:OV_COLORS.ai,background:'none',border:`1px solid ${OV_COLORS.ai}30`,borderRadius:4,padding:'2px 6px',cursor:loading?'not-allowed':'pointer',letterSpacing:1}}>{loading?'...':'⟳'}</button>
      </div>
    </div>
    {loading&&<div style={{padding:'8px 0',textAlign:'center'}}><span style={{fontFamily:mono,fontSize:9,color:OV_COLORS.ai}}>🐼 Analyzing...</span></div>}
    {error&&!loading&&<div style={{fontFamily:mono,fontSize:10,color:OV_COLORS.sell,padding:'4px 0'}}>⚠️ {error}</div>}
    {!reply&&!loading&&!error&&<div style={{padding:'10px 0',textAlign:'center'}}><button onClick={fetchInsight} style={{fontFamily:mono,fontSize:9,color:OV_COLORS.ai,background:`${OV_COLORS.ai}10`,border:`1px solid ${OV_COLORS.ai}30`,borderRadius:6,padding:'8px 20px',cursor:'pointer',letterSpacing:2}}>🐼 ANALYZE MARKET</button></div>}
    {bullets.length>0&&!loading&&<div style={{display:'flex',flexDirection:'column',gap:6}}>
      {(expanded?bullets:bullets.slice(0,2)).map((b,i)=><div key={i} style={{display:'flex',gap:6,alignItems:'flex-start'}}>
        <span style={{fontFamily:mono,fontSize:10,color:OV_COLORS.ai,marginTop:2,flexShrink:0}}>{i===0?'📊':i===1?'🎯':'⚠️'}</span>
        <span style={{fontFamily:raj,fontSize:13,color:OV_COLORS.textSecondary,lineHeight:1.35}}>{b}</span>
      </div>)}
      {bullets.length>2&&<button onClick={()=>setExpanded(!expanded)} style={{fontFamily:mono,fontSize:8,color:OV_COLORS.ai,background:'none',border:'none',cursor:'pointer',textAlign:'left',padding:0,letterSpacing:1}}>{expanded?'▲ LESS':'▼ MORE ('+bullets.length+')'}</button>}
    </div>}
  </div>;
}

function ovNewsCountdown(eventAtUtc, fallbackMins) {
  const target = eventAtUtc ? new Date(eventAtUtc).getTime() : NaN;
  const mins = Number.isFinite(target) ? Math.round((target - Date.now()) / 60000) : Number(fallbackMins || 0);
  if (mins <= 0) return { mins, label: 'NOW' };
  if (mins < 60) return { mins, label: `${mins}m` };
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return { mins, label: m ? `${h}h ${m}m` : `${h}h` };
}

function OvNewsBanner({ upcomingNews, isMobile }) {
  const events = upcomingNews?.events || [];
  if (!events.length) return null;
  const next = events[0];
  const nextCount = ovNewsCountdown(next.event_at_utc, next.mins_away);
  const watchPairs = next.affected_pairs || upcomingNews?.affected_pairs || [];
  const urgent = nextCount.mins <= 15;
  const soon = nextCount.mins <= 60;
  const color = urgent ? OV_COLORS.sell : soon ? OV_COLORS.warn : OV_COLORS.accent;

  return <div style={{...ovGlass,padding:isMobile?'14px 14px':'16px 18px',border:`1px solid ${color}55`,background:urgent?'rgba(255,77,109,0.08)':soon?'rgba(255,209,102,0.07)':'rgba(0,180,255,0.06)',animation:'fadeSlideUp 0.4s ease 80ms both'}}>
    <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'minmax(0,1fr) auto',gap:14,alignItems:'center'}}>
      <div style={{display:'flex',flexDirection:'column',gap:8,minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <AlertTriangle size={15} color={color}/>
          <span style={{fontFamily:mono,fontSize:9,color,letterSpacing:2,fontWeight:900}}>HIGH IMPACT NEWS</span>
          <span style={{fontFamily:mono,fontSize:8,color:OV_COLORS.textMuted,letterSpacing:1}}>NEXT: {next.event_at_dubai || next.time || 'TIME TBA'} DUBAI</span>
        </div>
        <div style={{fontFamily:orb,fontSize:isMobile?15:18,fontWeight:900,color:OV_COLORS.textPrimary,letterSpacing:1,whiteSpace:'normal',overflowWrap:'anywhere'}}>
          {next.currency} - {next.title || 'High impact event'}
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          {watchPairs.slice(0,8).map(pair=><span key={pair} style={{fontFamily:mono,fontSize:8,color:OV_COLORS.textSecondary,background:'rgba(255,255,255,0.04)',border:`1px solid ${color}35`,borderRadius:4,padding:'3px 7px'}}>{pair}</span>)}
          {watchPairs.length>8&&<span style={{fontFamily:mono,fontSize:8,color:OV_COLORS.textMuted}}>+{watchPairs.length-8} more</span>}
        </div>
      </div>
      <div style={{display:'flex',flexDirection:isMobile?'row':'column',alignItems:isMobile?'center':'flex-end',justifyContent:'space-between',gap:8}}>
        <div style={{fontFamily:orb,fontSize:isMobile?24:30,fontWeight:900,color,textShadow:`0 0 18px ${color}55`,lineHeight:1}}>{nextCount.label}</div>
        <div style={{fontFamily:mono,fontSize:8,color:OV_COLORS.textMuted,letterSpacing:1,textAlign:isMobile?'left':'right'}}>WATCH PAIRS TODAY</div>
      </div>
    </div>
    {events.length>1&&<div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:12,paddingTop:10,borderTop:`1px solid ${OV_COLORS.border}`}}>
      {events.slice(1,4).map((ev,i)=>{
        const c=ovNewsCountdown(ev.event_at_utc, ev.mins_away);
        return <span key={`${ev.currency}-${ev.title}-${i}`} style={{fontFamily:mono,fontSize:8,color:OV_COLORS.textMuted,background:'rgba(255,255,255,0.025)',border:`1px solid ${OV_COLORS.border}`,borderRadius:4,padding:'4px 7px'}}>
          {ev.currency} {c.label} - {ev.title}
        </span>;
      })}
    </div>}
  </div>;
}

function OvNewsPanel({ upcomingNews }) {
  const events = upcomingNews?.events || [];
  if(events.length===0) return null;
  return <div style={{...ovGlass,padding:'14px 16px'}}>
    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
      <AlertTriangle size={12} color={OV_COLORS.warn}/>
      <span style={{fontFamily:mono,fontSize:8,color:OV_COLORS.warn,letterSpacing:2,fontWeight:700}}>UPCOMING NEWS</span>
      <span style={{fontFamily:mono,fontSize:8,color:OV_COLORS.textMuted}}>({events.length})</span>
    </div>
    {events.slice(0,4).map((ev,i)=>{
      const count=ovNewsCountdown(ev.event_at_utc, ev.mins_away);const mins=count.mins;const urgent=mins<30;const critical=mins<10;
      const c=critical?OV_COLORS.sell:urgent?OV_COLORS.warn:OV_COLORS.textSecondary;
      return <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 10px',borderRadius:6,marginBottom:4,
        background:critical?'rgba(255,77,109,0.08)':urgent?'rgba(255,209,102,0.06)':'rgba(255,255,255,0.02)',
        border:`1px solid ${critical?OV_COLORS.sell+'30':urgent?OV_COLORS.warn+'20':OV_COLORS.border}`}}>
        <div style={{display:'flex',flexDirection:'column',gap:2}}>
          <span style={{fontFamily:mono,fontSize:9,color:c,fontWeight:700}}>{ev.currency||'—'} — {ev.title||ev.event||'Event'}</span>
          {ev.affected_pairs&&<span style={{fontFamily:mono,fontSize:7,color:OV_COLORS.textMuted}}>Affects: {ev.affected_pairs.join(', ')}</span>}
        </div>
        <div style={{fontFamily:orb,fontSize:13,fontWeight:700,color:c,padding:'4px 10px',borderRadius:4,background:`${c}15`,
          animation:critical?'pulse 1s ease-in-out infinite':'none'}}>{count.label}</div>
      </div>;
    })}
  </div>;
}

function OvTrackerSummary({ trackers, closed }) {
  const avgGap=trackers.length?(trackers.reduce((s,t)=>s+(t.gap_at_open||0),0)/trackers.length).toFixed(1):'—';
  const oldest=trackers.length?(()=>{const h=Math.round((Date.now()-new Date(trackers[trackers.length-1].opened_at).getTime())/3600000);return h<24?h+'h':Math.round(h/24)+'d';})():'—';
  const reasonCounts={};closed.forEach(c=>{reasonCounts[c.close_reason]=(reasonCounts[c.close_reason]||0)+1;});
  return <div style={{...ovGlass,padding:'14px 18px',animation:'fadeSlideUp 0.4s ease 600ms both'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}><Crosshair size={12} color={OV_COLORS.accent}/><span style={{fontFamily:mono,fontSize:8,color:OV_COLORS.textMuted,letterSpacing:2}}>SIGNAL TRACKER</span></div>
      <div style={{display:'flex',gap:12}}>
        {[{v:trackers.length,l:'ACTIVE',c:OV_COLORS.accent},{v:avgGap,l:'AVG GAP',c:OV_COLORS.textSecondary},{v:oldest,l:'OLDEST',c:OV_COLORS.textSecondary}].map(s=>
          <div key={s.l} style={{textAlign:'center'}}><div style={{fontFamily:orb,fontSize:18,fontWeight:900,color:s.c}}>{s.v}</div><div style={{fontFamily:mono,fontSize:7,color:OV_COLORS.textMuted,letterSpacing:1}}>{s.l}</div></div>
        )}
      </div>
    </div>
    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
      {trackers.map(t=>{const dc=t.direction==='BUY'?OV_COLORS.buy:OV_COLORS.sell;return <div key={t.symbol} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:6,background:`${dc}08`,border:`1px solid ${dc}20`}}>
        <span style={{fontFamily:orb,fontSize:10,fontWeight:700,color:OV_COLORS.textPrimary}}>{t.symbol}</span>
        <span style={{fontFamily:mono,fontSize:8,color:dc}}>{t.direction}</span>
        <span style={{fontFamily:mono,fontSize:8,color:OV_COLORS.textMuted}}>{Number(t.gap_at_open||0).toFixed(1)}→{Number(t.peak_gap||0).toFixed(1)}</span>
      </div>;})}
    </div>
    {closed.length>0&&<><div style={{fontFamily:mono,fontSize:7,color:OV_COLORS.textMuted,letterSpacing:2,marginBottom:6}}>RECENTLY CLOSED</div>
    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
      {closed.slice(0,3).map((t,i)=>{const dur=t.closed_at&&t.opened_at?Math.round((new Date(t.closed_at)-new Date(t.opened_at))/3600000):0;
        return <div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'3px 8px',borderRadius:4,background:'rgba(255,255,255,0.02)',border:`1px solid ${OV_COLORS.border}`}}>
          <span style={{fontFamily:mono,fontSize:9,color:OV_COLORS.textSecondary}}>{t.symbol}</span><span style={{fontFamily:mono,fontSize:7,color:'#ffaa44'}}>{t.close_reason}</span><span style={{fontFamily:mono,fontSize:7,color:OV_COLORS.textMuted}}>{dur}h</span></div>;})}
    </div></>}
    {Object.keys(reasonCounts).length>0&&<div style={{display:'flex',gap:6,marginTop:8}}>
      {Object.entries(reasonCounts).map(([r,c])=><span key={r} style={{fontFamily:mono,fontSize:7,color:OV_COLORS.textMuted,background:'rgba(255,255,255,0.03)',borderRadius:3,padding:'2px 6px'}}>{r}: {c}</span>)}
    </div>}
  </div>;
}

function OverviewTab({ data, trends, pdrData, upcomingNews, spikes, confidenceMap, memoryIndex, onSelectPair, isMobile, lastUpdate }) {
  const [trackers,setTrackers]=useState([]);
  const [closedTrackers,setClosedTrackers]=useState([]);
  const [time,setTime]=useState(new Date());
  useEffect(()=>{const t=setInterval(()=>setTime(new Date()),10000);return()=>clearInterval(t);},[]);
  useEffect(()=>{(async()=>{try{const[oR,cR]=await Promise.all([fetch('/api/signal-tracker?status=OPEN').then(r=>r.json()),fetch('/api/signal-tracker?status=CLOSED&limit=5').then(r=>r.json())]);setTrackers(oR.trackers||[]);setClosedTrackers(cR.trackers||[]);}catch{}})();},[]);

  // Normalize pairs from dashboard data into enriched objects
  const pairs = useMemo(()=> data.map(row => ({
    symbol:row.symbol, gap:row.gap??0, bias:row.bias||'WAIT',
    momentum:trends[row.symbol]?.momentum||'NEUTRAL', closeAlert:trends[row.symbol]?.closeAlert||false,
    pl_zone:row.pl_zone||'BETWEEN', box_h4:row.box_h4_trend||'RANGING', box_h1:row.box_h1_trend||'RANGING',
    pdr_strong:(row.pdr_dir!=null?!!row.pdr_strong_live:(pdrData[row.symbol]?.strong||false)), pdr_strength:(row.pdr_dir!=null?(row.pdr_ratio||0):(pdrData[row.symbol]?.strength||0)),
    pdr_direction:(row.pdr_dir!=null?row.pdr_dir:(pdrData[row.symbol]?.direction||'NEUTRAL')),
    edge:confidenceMap[row.symbol]?.historical?.flag||null, conf:confidenceMap[row.symbol]?.confidence||0,
    conflict:confidenceMap[row.symbol]?.conflict||false,
    news:upcomingNews?.affected_pairs?.includes(row.symbol)||false, hard_invalid:row.hard_invalid||false,
    pdl:row.pdl, pdh:row.pdh, pwl:row.pwl, pwh:row.pwh, pml:row.pml, pmh:row.pmh, pyl:row.pyl, pyh:row.pyh,
    base_score_tf:row.base_score_tf||'', quote_score_tf:row.quote_score_tf||'', base_currency:row.base_currency, quote_currency:row.quote_currency,
  })).sort((a,b)=>b.conf-a.conf), [data,trends,pdrData,confidenceMap,upcomingNews]);

  // Session + market mode
  const now=new Date();const h=now.getUTCHours(),m=now.getUTCMinutes(),totalMin=h*60+m;
  const ovSessions=[{name:'SYDNEY',color:'#00b4ff',open:21*60,close:6*60},{name:'TOKYO',color:'#ffd166',open:23*60,close:8*60},{name:'LONDON',color:'#cc77ff',open:7*60,close:16*60},{name:'NEW YORK',color:'#00ff9f',open:12*60,close:21*60}];
  const isOn=(s)=>s.open>s.close?(totalMin>=s.open||totalMin<s.close):(totalMin>=s.open&&totalMin<s.close);
  const activeS=ovSessions.filter(isOn);let nextClose=null;
  if(activeS.length>0){const s=activeS[0];let cl=s.close;if(s.open>s.close&&totalMin>=s.open)cl+=1440;let diff=cl-totalMin;if(diff<0)diff+=1440;nextClose={hours:Math.floor(diff/60),minutes:diff%60};}
  const sessionInfo={sessions:ovSessions,active:activeS,isOn,nextClose,total:totalMin};

  const valid=pairs.filter(p=>Math.abs(p.gap)>=5&&!p.hard_invalid);
  const strongMom=pairs.filter(p=>['STRONG','BUILDING'].includes(p.momentum)).length;
  const chaotic=pairs.filter(p=>['REVERSING','FADING'].includes(p.momentum)).length;
  const marketMode=valid.length>=6&&strongMom>=4?{mode:'TRENDING',color:OV_COLORS.buy,glow:OV_COLORS.buyGlow}:chaotic>=4?{mode:'CHAOTIC',color:OV_COLORS.sell,glow:OV_COLORS.sellGlow}:{mode:'RANGING',color:OV_COLORS.warn,glow:'rgba(255,209,102,0.2)'};

  // Currency strength + exposure
  const str={USD:0,EUR:0,GBP:0,JPY:0,AUD:0,CAD:0,NZD:0},cnt={...str};
  pairs.forEach(p=>{const b=p.symbol.slice(0,3),q=p.symbol.slice(3,6);str[b]=(str[b]||0)+p.gap;cnt[b]=(cnt[b]||0)+1;str[q]=(str[q]||0)-p.gap;cnt[q]=(cnt[q]||0)+1;});
  const currStr=Object.entries(str).map(([c,v])=>{const avg=cnt[c]?v/cnt[c]:0;let flow='NEUTRAL';if(avg>2)flow='ACCELERATING';else if(avg>0.5)flow='STRENGTHENING';else if(avg<-2)flow='WEAKENING';else if(avg<-0.5)flow='SOFTENING';return{currency:c,strength:avg,flow};}).sort((a,b)=>b.strength-a.strength);
  const exp={};['USD','EUR','GBP','JPY','AUD','CAD','NZD'].forEach(c=>exp[c]=0);
  pairs.filter(p=>p.bias==='BUY'||p.bias==='SELL').forEach(p=>{const b=p.symbol.slice(0,3),q=p.symbol.slice(3,6);if(p.bias==='BUY'){exp[b]++;exp[q]--;}else{exp[b]--;exp[q]++;}});
  const exposure=Object.entries(exp).map(([c,v])=>({currency:c,exposure:v,abs:Math.abs(v)})).sort((a,b)=>b.abs-a.abs);

  // Tier classification
  function ovGetTier(p){if(p.hard_invalid||Math.abs(p.gap)<5)return'INVALID';if(p.conf>=70&&p.edge!=='DEAD_ZONE'&&['STRONG','BUILDING','SPARK'].includes(p.momentum))return'HIGH';if(p.conf>=50&&p.edge!=='DEAD_ZONE')return'MID';return'LOW';}
  const highTier=pairs.filter(p=>ovGetTier(p)==='HIGH');const midTier=pairs.filter(p=>ovGetTier(p)==='MID');const lowTier=pairs.filter(p=>ovGetTier(p)==='LOW');const invalidTier=pairs.filter(p=>ovGetTier(p)==='INVALID');

  // Stats
  const buyC=valid.filter(p=>p.gap>=5).length,sellC=valid.filter(p=>p.gap<=-5).length;
  const spikeC=spikes?.length||0;const momBuild=strongMom;const closeAlerts=pairs.filter(p=>['FADING','REVERSING'].includes(p.momentum)&&Math.abs(p.gap)>=5).length;
  const strongest=pairs[0];

  // Find original data row for PairCardModal
  const findRow = (sym) => data.find(r=>r.symbol===sym);

  return (
    <div style={{color:OV_COLORS.textPrimary,fontFamily:raj,position:'relative'}}>
      {/* Background grid */}
      <div style={{position:'fixed',inset:0,zIndex:0,pointerEvents:'none',backgroundImage:'linear-gradient(rgba(0,180,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,255,0.02) 1px,transparent 1px)',backgroundSize:'40px 40px'}}/>
      <div style={{position:'relative',zIndex:1,display:'flex',flexDirection:'column',gap:20}}>

      {/* DISCLAIMER + TRADING RULES BANNER */}
      <div style={{background:'linear-gradient(135deg,rgba(255,209,102,0.06),rgba(255,77,109,0.04))',border:'1px solid rgba(255,209,102,0.2)',borderRadius:12,padding:isMobile?'14px 16px':'16px 24px',animation:'fadeSlideUp 0.3s ease both'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
          <span style={{fontSize:14}}>⚠️</span>
          <span style={{fontFamily:'Orbitron,sans-serif',fontSize:10,color:'#ffd166',letterSpacing:3,fontWeight:700}}>DISCLAIMER</span>
        </div>
        <div style={{fontFamily:'Share Tech Mono,monospace',fontSize:isMobile?9:10,color:'rgba(255,255,255,0.55)',lineHeight:1.6,marginBottom:14,letterSpacing:0.5}}>
          Panda Engine provides analysis tools only — not financial advice. All trading carries risk. Past performance does not guarantee future results. Always use proper risk management.
        </div>
        <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?10:16}}>
          <div style={{background:'rgba(0,180,255,0.05)',border:'1px solid rgba(0,180,255,0.15)',borderRadius:8,padding:'12px 16px'}}>
            <div style={{fontFamily:'Orbitron,sans-serif',fontSize:9,color:'#00b4ff',letterSpacing:2,fontWeight:700,marginBottom:8}}>📐 LOT SIZING RULES</div>
            <div style={{fontFamily:'Share Tech Mono,monospace',fontSize:isMobile?9:10,color:'rgba(255,255,255,0.7)',lineHeight:1.8}}>
              <div><span style={{color:'#00ff9f'}}>$1,000</span> → 0.01 lot</div>
              <div><span style={{color:'#00ff9f'}}>$2,000</span> → 0.02 lot</div>
              <div><span style={{color:'#00ff9f'}}>$3,000+</span> → add 0.01 per $1,000</div>
            </div>
          </div>
          <div style={{background:'rgba(255,77,109,0.05)',border:'1px solid rgba(255,77,109,0.15)',borderRadius:8,padding:'12px 16px'}}>
            <div style={{fontFamily:'Orbitron,sans-serif',fontSize:9,color:'#ff4d6d',letterSpacing:2,fontWeight:700,marginBottom:8}}>🎯 RISK / REWARD RULES</div>
            <div style={{fontFamily:'Share Tech Mono,monospace',fontSize:isMobile?9:10,color:'rgba(255,255,255,0.7)',lineHeight:1.8}}>
              <div>TP {'<'} 100 pips → SL = TP / 2</div>
              <div>TP {'<'} 200 pips → SL = TP / 3</div>
              <div>TP {'<'} 300 pips → SL = TP / 4</div>
              <div>TP {'<'} 400 pips → SL = TP / 5</div>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 1 — MARKET PULSE BAR */}
      <div style={{...ovGlass,padding:isMobile?'10px 14px':'12px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:16,animation:'fadeSlideUp 0.4s ease both'}}>
        <div style={{display:'flex',alignItems:'center',gap:isMobile?10:16}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:isMarketOpen()?OV_COLORS.buy:OV_COLORS.sell,boxShadow:`0 0 12px ${isMarketOpen()?OV_COLORS.buy:OV_COLORS.sell}`,animation:'pulse 2s ease-in-out infinite'}}/>
            <span style={{fontFamily:mono,fontSize:10,color:isMarketOpen()?OV_COLORS.buy:OV_COLORS.sell,letterSpacing:2,fontWeight:700}}>{isMarketOpen()?'LIVE':'CLOSED'}</span>
          </div>
          {!isMobile&&<OvSessionTimeline sessionInfo={sessionInfo} isMobile={isMobile}/>}
          {nextClose&&<div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
            <span style={{fontFamily:mono,fontSize:7,color:OV_COLORS.textMuted,letterSpacing:1}}>NEXT CLOSE</span>
            <span style={{fontFamily:orb,fontSize:14,fontWeight:700,color:OV_COLORS.accent}}>{nextClose.hours}h {nextClose.minutes}m</span>
          </div>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:isMobile?10:20}}>
          <OvMarketGauge {...marketMode}/>
          {upcomingNews?.events?.length>0&&<div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:6,background:OV_COLORS.warnDim,border:`1px solid ${OV_COLORS.warn}30`}}>
            <AlertTriangle size={12} color={OV_COLORS.warn}/><span style={{fontFamily:mono,fontSize:9,color:OV_COLORS.warn,fontWeight:700}}>{upcomingNews.events.length} NEWS</span>
          </div>}
          <span style={{fontFamily:mono,fontSize:10,color:OV_COLORS.textMuted}}>{time.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})} UTC+4</span>
        </div>
      </div>

      {/* ROW 2 — STAT CARDS */}
      <OvNewsBanner upcomingNews={upcomingNews} isMobile={isMobile}/>

      <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
        <OvStatCard label="VALID SIGNALS" value={valid.length} icon={Activity} color={OV_COLORS.accent} delay={100} subtitle={`${buyC} BUY · ${sellC} SELL`}/>
        <OvStatCard label="STRONGEST" icon={TrendingUp} color={(strongest?.gap??0)>=0?OV_COLORS.buy:OV_COLORS.sell} delay={200} displayValue={`${(strongest?.gap??0)>0?'+':''}${Number(strongest?.gap??0).toFixed(1)}`} subtitle={`${strongest?.symbol||'—'} · ${strongest?.bias||'—'}`}/>
        <OvStatCard label="SPIKES ≥7" value={spikeC} icon={Zap} color={OV_COLORS.warn} delay={300}/>
        <OvStatCard label="MOMENTUM" value={momBuild} icon={Gauge} color="#66ffcc" delay={400} subtitle="BUILDING + STRONG"/>
        <OvStatCard label="CLOSE ALERTS" value={closeAlerts} icon={AlertTriangle} color={closeAlerts>0?OV_COLORS.sell:OV_COLORS.textMuted} delay={500}/>
      </div>

      {/* ROW 3 — MAIN GRID: Signals Left + Panels Right */}
      <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 380px',gap:20}}>
        {/* LEFT — Signal Board */}
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {/* BUY SIGNALS */}
          {(()=>{const buyHigh=highTier.filter(p=>p.bias==='BUY');const buyMid=midTier.filter(p=>p.bias==='BUY');const buyLow=lowTier.filter(p=>p.bias==='BUY');const buyAll=[...buyHigh,...buyMid,...buyLow];if(!buyAll.length)return null;return(<div style={{borderLeft:'3px solid #00ff9f',paddingLeft:14,marginBottom:8}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
              <Shield size={14} color='#00ff9f'/><span style={{fontFamily:orb,fontSize:12,color:'#00ff9f',letterSpacing:3,fontWeight:900,textShadow:'0 0 10px rgba(0,255,159,0.4)'}}>BUY SIGNALS</span><span style={{fontFamily:mono,fontSize:9,color:'#ffffff',background:'rgba(0,255,159,0.15)',border:'1px solid rgba(0,255,159,0.3)',borderRadius:4,padding:'2px 8px'}}>{buyAll.length}</span>
            </div>
            {buyHigh.length>0&&<><div style={{fontFamily:mono,fontSize:8,color:'#00ff9f',letterSpacing:2,marginBottom:6,fontWeight:700}}>HIGH QUALITY · {buyHigh.length}</div>
            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(auto-fill,minmax(320px,1fr))',gap:14,marginBottom:14}}>
              {buyHigh.map((p,i)=><OvSignalCard key={p.symbol} pair={p} tier="HIGH" onClick={()=>{const r=findRow(p.symbol);if(r)onSelectPair(r);}} delay={i*80}/>)}
            </div></>}
            {buyMid.length>0&&<><div style={{fontFamily:mono,fontSize:8,color:'#c8d8f0',letterSpacing:2,marginBottom:6}}>MID QUALITY · {buyMid.length}</div>
            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(auto-fill,minmax(280px,1fr))',gap:12,marginBottom:14}}>
              {buyMid.map((p,i)=><OvSignalCard key={p.symbol} pair={p} tier="MID" onClick={()=>{const r=findRow(p.symbol);if(r)onSelectPair(r);}} delay={i*60+200}/>)}
            </div></>}
            {buyLow.length>0&&<><div style={{fontFamily:mono,fontSize:8,color:'#7b8faa',letterSpacing:2,marginBottom:6}}>LOW · {buyLow.length}</div>
            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(auto-fill,minmax(170px,1fr))',gap:6}}>
              {buyLow.map((p,i)=><OvSignalCard key={p.symbol} pair={p} tier="LOW" onClick={()=>{const r=findRow(p.symbol);if(r)onSelectPair(r);}} delay={i*40+400}/>)}
            </div></>}
          </div>);})()}

          {/* SELL SIGNALS */}
          {(()=>{const sellHigh=highTier.filter(p=>p.bias==='SELL');const sellMid=midTier.filter(p=>p.bias==='SELL');const sellLow=lowTier.filter(p=>p.bias==='SELL');const sellAll=[...sellHigh,...sellMid,...sellLow];if(!sellAll.length)return null;return(<div style={{borderLeft:'3px solid #ff4d6d',paddingLeft:14,marginBottom:8}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
              <Shield size={14} color='#ff4d6d'/><span style={{fontFamily:orb,fontSize:12,color:'#ff4d6d',letterSpacing:3,fontWeight:900,textShadow:'0 0 10px rgba(255,77,109,0.4)'}}>SELL SIGNALS</span><span style={{fontFamily:mono,fontSize:9,color:'#ffffff',background:'rgba(255,77,109,0.15)',border:'1px solid rgba(255,77,109,0.3)',borderRadius:4,padding:'2px 8px'}}>{sellAll.length}</span>
            </div>
            {sellHigh.length>0&&<><div style={{fontFamily:mono,fontSize:8,color:'#ff4d6d',letterSpacing:2,marginBottom:6,fontWeight:700}}>HIGH QUALITY · {sellHigh.length}</div>
            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(auto-fill,minmax(320px,1fr))',gap:14,marginBottom:14}}>
              {sellHigh.map((p,i)=><OvSignalCard key={p.symbol} pair={p} tier="HIGH" onClick={()=>{const r=findRow(p.symbol);if(r)onSelectPair(r);}} delay={i*80}/>)}
            </div></>}
            {sellMid.length>0&&<><div style={{fontFamily:mono,fontSize:8,color:'#c8d8f0',letterSpacing:2,marginBottom:6}}>MID QUALITY · {sellMid.length}</div>
            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(auto-fill,minmax(280px,1fr))',gap:12,marginBottom:14}}>
              {sellMid.map((p,i)=><OvSignalCard key={p.symbol} pair={p} tier="MID" onClick={()=>{const r=findRow(p.symbol);if(r)onSelectPair(r);}} delay={i*60+200}/>)}
            </div></>}
            {sellLow.length>0&&<><div style={{fontFamily:mono,fontSize:8,color:'#7b8faa',letterSpacing:2,marginBottom:6}}>LOW · {sellLow.length}</div>
            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(auto-fill,minmax(170px,1fr))',gap:6}}>
              {sellLow.map((p,i)=><OvSignalCard key={p.symbol} pair={p} tier="LOW" onClick={()=>{const r=findRow(p.symbol);if(r)onSelectPair(r);}} delay={i*40+400}/>)}
            </div></>}
          </div>);})()}

          {/* INVALID PAIRS */}
          {invalidTier.length>0&&<div style={{opacity:0.5,marginTop:8}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <Radio size={10} color='#ff4d6d'/><span style={{fontFamily:mono,fontSize:9,color:'#ff4d6d',letterSpacing:2,fontWeight:700}}>INVALID PAIRS</span><span style={{fontFamily:mono,fontSize:8,color:'#7b8faa'}}>{invalidTier.length}</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(auto-fill,minmax(140px,1fr))',gap:5}}>
              {invalidTier.map((p,i)=><OvSignalCard key={p.symbol} pair={p} tier="LOW" onClick={()=>{const r=findRow(p.symbol);if(r)onSelectPair(r);}} delay={i*30+700}/>)}
            </div>
          </div>}
          <OvMomentumBar pairs={pairs}/>
        </div>

        {/* RIGHT — Context Panels */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{...ovGlass,padding:'14px 16px',animation:'fadeSlideUp 0.4s ease 200ms both'}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
              <Activity size={12} color={OV_COLORS.accent}/><span style={{fontFamily:mono,fontSize:8,color:OV_COLORS.textMuted,letterSpacing:2}}>CURRENCY STRENGTH</span>
            </div>
            <OvCurrencyChart data={currStr}/>
          </div>
          <div style={{animation:'fadeSlideUp 0.4s ease 300ms both'}}><OvNewsPanel upcomingNews={upcomingNews}/></div>
          <div style={{...ovGlass,padding:'14px 16px',animation:'fadeSlideUp 0.4s ease 400ms both'}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
              <Activity size={12} color={OV_COLORS.accent}/><span style={{fontFamily:mono,fontSize:8,color:OV_COLORS.textMuted,letterSpacing:2}}>CURRENCY EXPOSURE</span>
            </div>
            <OvExposureRings exposure={exposure}/>
          </div>
          <div style={{animation:'fadeSlideUp 0.4s ease 500ms both'}}><OvAIPanel/></div>
        </div>
      </div>

      {/* ROW 4 — TRACKER SUMMARY */}
      <OvTrackerSummary trackers={trackers} closed={closedTrackers}/>

      </div>
      {/* CSS Animations */}
      <style jsx>{`
        @keyframes fadeSlideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes slideUpModal { from { opacity:0; transform:translateY(20px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>
    </div>
  );
}


const TABS = ['OVERVIEW','PANELS','SIGNALS','TABLE','GAP CHART','RESEARCH','CALCULATOR','SETUPS','VALID PAIRS','CHART','ANALYTICS','SHADOW','LOGS','PANDA AI'];
// Maps each tab to the feature_access key that controls it
const TAB_FEATURE = {
  'OVERVIEW':    'overview',
  'PANELS':      'panels',
  'SIGNALS':     'signals',
  'TABLE':       'table',
  'GAP CHART':   'gap_chart',
  'RESEARCH':    'calendar',
  'CALCULATOR':  'calculator',
  'SETUPS':      'setups',
  'VALID PAIRS': 'valid_pairs',
  'SPIKE LOG':   'spike_log',
  'ENGINE':      'engine',
  'CHART':       'chart',
  'ANALYTICS':   'analytics',
  'SHADOW':      'shadow',
  'LOGS':        'signal_log',
  'PANDA AI':    'panda_ai',
};
const FILTERS = ['VALID','ALL','BUY','SELL','STRONG','⚠️ CLOSE'];
const SORTS   = [
  {label:'SYMBOL A-Z',value:'symbol_asc'},
  {label:'STRENGTH ↓',value:'strength_desc'},
  {label:'GAP ↓',value:'gap_desc'},
  {label:'MOMENTUM',value:'momentum'},
  {label:'1H CHANGE',value:'delta1h'},
];


// ===== SIGNAL PERFORMANCE ANALYTICS V2 =====
function SignalAnalytics() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stratFilter, setStratFilter] = useState('ALL');
  const [pairFilter, setPairFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (pairFilter !== 'ALL') params.set('symbol', pairFilter);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      const qs = params.toString();
      const r = await fetch('/api/signal-analytics' + (qs ? '?' + qs : ''));
      if (r.ok) { setStats(await r.json()); setError(null); }
      else setError('API returned ' + r.status);
    } catch (e) { setError(e.message || 'Connection error'); }
    setLoading(false);
  }, [pairFilter, dateFrom, dateTo]);
  useEffect(() => { load(); }, [load]);
  if (loading) return <div style={{textAlign:'center',padding:40,fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--text-muted)'}}>LOADING ANALYTICS...</div>;
  if (error) return <div style={{textAlign:'center',padding:40,fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'#ff4d6d'}}>⚠️ {error} — <span style={{cursor:'pointer',textDecoration:'underline'}} onClick={load}>RETRY</span></div>;
  if (!stats || !stats.summary) return <div style={{textAlign:'center',padding:40,fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--text-muted)'}}>NO SIGNAL DATA YET</div>;
  const s = stats.summary || {};
  const mono = "'Share Tech Mono',monospace", orb = "'Orbitron',sans-serif";
  const wr = Number(s.winRate) || 0;
  const wrColor = wr >= 65 ? '#00ff9f' : wr >= 50 ? '#ffd166' : s.total > 0 ? '#ff4d6d' : 'var(--text-muted)';
  const filteredSignals = (stats.signals||[]).filter(sig => stratFilter === 'ALL' || sig.strategy === stratFilter);
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <span style={{fontFamily:orb,fontSize:11,color:'#00b4ff',letterSpacing:4,fontWeight:700}}>📊 SIGNAL PERFORMANCE</span>
        {s.pending>0&&<span style={{fontFamily:mono,fontSize:9,color:'#ffd166',background:'rgba(255,209,102,0.1)',border:'1px solid rgba(255,209,102,0.3)',borderRadius:4,padding:'2px 8px'}}>{s.pending} PENDING</span>}
      </div>

      {/* STRATEGY FILTER */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
        {['ALL','BB','INTRA','PANDA'].map(st=>(
          <button key={st} onClick={()=>setStratFilter(st)} style={{fontFamily:mono,fontSize:9,padding:'4px 12px',borderRadius:4,border:`1px solid ${stratFilter===st?'#00b4ff':'var(--border)'}`,background:stratFilter===st?'rgba(0,180,255,0.15)':'var(--bg-card)',color:stratFilter===st?'#00b4ff':'var(--text-muted)',cursor:'pointer',letterSpacing:2}}>{st}</button>
        ))}
        <select value={pairFilter} onChange={e=>setPairFilter(e.target.value)} style={{fontFamily:mono,fontSize:9,padding:'4px 8px',borderRadius:4,border:'1px solid var(--border)',background:'var(--bg-card)',color:'var(--text-primary)',cursor:'pointer',letterSpacing:1}}>
          <option value="ALL">ALL PAIRS</option>
          {ALL_PAIRS.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{fontFamily:mono,fontSize:9,padding:'4px 8px',borderRadius:4,border:'1px solid var(--border)',background:'var(--bg-card)',color:'var(--text-primary)'}} placeholder="From"/>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{fontFamily:mono,fontSize:9,padding:'4px 8px',borderRadius:4,border:'1px solid var(--border)',background:'var(--bg-card)',color:'var(--text-primary)'}} placeholder="To"/>
        {(pairFilter!=='ALL'||dateFrom||dateTo)&&<button onClick={()=>{setPairFilter('ALL');setDateFrom('');setDateTo('');}} style={{fontFamily:mono,fontSize:8,padding:'4px 8px',borderRadius:4,border:'1px solid #ff4d6d33',background:'rgba(255,77,109,0.1)',color:'#ff4d6d',cursor:'pointer',letterSpacing:1}}>✕ CLEAR</button>}
      </div>

      {/* SUMMARY CARDS */}
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        {[['TOTAL',s.total||0,'#00b4ff'],['WIN RATE',wr+'%',wrColor],['WINS',s.wins||0,'#00ff9f'],['LOSSES',s.losses||0,'#ff4d6d'],['FLAT',s.flat||0,'#ffd166'],['AVG PIPS',(s.avgPips||0)>0?'+'+s.avgPips:s.avgPips||0,'#00b4ff'],['AVG HOLD',Math.round(s.avgDuration||0)+'m','#00b4ff'],['AVG PEAK',(s.avgPeakGap||0).toFixed(1),'#ffaa44']].map(([l,v,c])=>(
          <div key={l} style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 16px',minWidth:80,textAlign:'center'}}>
            <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:2,marginBottom:4}}>{l}</div>
            <div style={{fontFamily:orb,fontSize:18,fontWeight:900,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* STRATEGY BREAKDOWN */}
      {stats.byStrategy && Object.keys(stats.byStrategy).length > 0 && (
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          <div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2}}>BY STRATEGY</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {Object.entries(stats.byStrategy).map(([st,d])=>{
              const w=d.total>0?Math.round(d.wins/d.total*100):0;
              const c=w>=65?'#00ff9f':w>=50?'#ffd166':d.total>0?'#ff4d6d':'var(--text-muted)';
              const avgP=d.total>0?Math.round(d.totalPips/d.total*10)/10:0;
              return(<div key={st} style={{background:'var(--bg-card)',border:`1px solid ${c}28`,borderRadius:8,padding:'10px 14px',minWidth:140}}>
                <div style={{fontFamily:orb,fontSize:11,fontWeight:700,color:'#00b4ff',letterSpacing:2,marginBottom:6}}>{st}</div>
                <div style={{fontFamily:orb,fontSize:20,fontWeight:900,color:c}}>{w}%</div>
                <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',marginTop:4}}>{d.wins}W {d.losses}L {d.flat}F · {d.total} sig</div>
                <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)'}}>avg {avgP>0?'+':''}{ avgP}p · {d.avgDuration}m hold</div>
              </div>);
            })}
          </div>
        </div>
      )}

      {/* PER-PAIR WIN RATE */}
      {stats.byPair && Object.keys(stats.byPair).length > 0 && (
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          <div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2}}>PER-PAIR BREAKDOWN</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {Object.entries(stats.byPair).sort((a,b)=>{const wr=(x)=>x.total>0?x.wins/x.total:0;return wr(b[1])-wr(a[1]);}).map(([sym,p])=>{
              const wr=p.total>0?Math.round(p.wins/p.total*100):0;
              const c=wr>=65?'#00ff9f':wr>=50?'#ffd166':'#ff4d6d';
              return(<div key={sym} style={{background:'var(--bg-card)',border:`1px solid ${c}28`,borderRadius:6,padding:'6px 10px',minWidth:90,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                <span style={{fontFamily:orb,fontSize:10,fontWeight:700,color:'var(--text-primary)',letterSpacing:1}}>{sym}</span>
                <span style={{fontFamily:orb,fontSize:14,fontWeight:900,color:c}}>{wr}%</span>
                <span style={{fontFamily:mono,fontSize:7,color:'var(--text-muted)'}}>{p.wins}W {p.losses}L · {Math.round(p.totalPips||0)}p</span>
              </div>);
            })}
          </div>
        </div>
      )}

      {/* EXIT REASON BREAKDOWN */}
      {stats.byExitReason && Object.keys(stats.byExitReason).length > 0 && (
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          <div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2}}>BY EXIT REASON</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {Object.entries(stats.byExitReason).map(([reason,d])=>{
              const w=d.count>0?Math.round(d.wins/d.count*100):0;
              const c=w>=65?'#00ff9f':w>=50?'#ffd166':d.count>0?'#ff4d6d':'var(--text-muted)';
              const avgP=d.count>0?Math.round(d.totalPips/d.count*10)/10:0;
              return(<div key={reason} style={{background:'var(--bg-card)',border:`1px solid ${c}28`,borderRadius:6,padding:'6px 10px',minWidth:120,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                <span style={{fontFamily:mono,fontSize:8,fontWeight:700,color:'var(--text-primary)',letterSpacing:1}}>{reason}</span>
                <span style={{fontFamily:orb,fontSize:14,fontWeight:900,color:c}}>{w}%</span>
                <span style={{fontFamily:mono,fontSize:7,color:'var(--text-muted)'}}>{d.count} exits · avg {avgP>0?'+':''}{avgP}p</span>
              </div>);
            })}
          </div>
        </div>
      )}

      {/* RECENT SIGNALS */}
      {filteredSignals.length > 0 && (
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          <div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2}}>RECENT SIGNALS</div>
          <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:350,overflowY:'auto'}}>
            {filteredSignals.slice(0,30).map((sig,i)=>{
              const dc=sig.direction==='BUY'?'#00ff9f':'#ff4d6d';
              const isPending=sig.status==='PENDING';
              const oc=isPending?'#ffd166':sig.outcome==='WIN'?'#00ff9f':sig.outcome==='LOSS'?'#ff4d6d':'#ffaa44';
              const fmt=v=>v!=null?(v>0?'+':'')+v:'—';
              const stC=sig.strategy==='INTRA'?'#00b4ff':'#ffaa44';
              return(<div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 12px',background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:6,flexWrap:'wrap'}}>
                <span style={{fontFamily:mono,fontSize:7,color:stC,background:stC+'15',border:`1px solid ${stC}33`,borderRadius:3,padding:'1px 4px'}}>{sig.strategy||'BB'}</span>
                <span style={{fontFamily:orb,fontSize:10,fontWeight:700,color:'var(--text-primary)',minWidth:65,letterSpacing:1}}>{sig.symbol}</span>
                <span style={{fontFamily:mono,fontSize:9,color:dc,background:dc+'15',border:`1px solid ${dc}33`,borderRadius:3,padding:'1px 6px',minWidth:30,textAlign:'center'}}>{sig.direction}</span>
                <span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)'}}>gap {fmt(sig.entryGap)}</span>
                <span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)'}}>peak {fmt(sig.peakGap)}</span>
                {sig.entryPrice&&<span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)'}}>@{sig.entryPrice}</span>}
                {sig.pips!=null&&sig.status==='DONE'&&<span style={{fontFamily:mono,fontSize:8,color:sig.pips>0?'#00ff9f':'#ff4d6d',fontWeight:700}}>{fmt(sig.pips)}p</span>}
                {sig.durationMin&&<span style={{fontFamily:mono,fontSize:7,color:'var(--text-muted)'}}>{Math.round(sig.durationMin)}m</span>}
                {sig.exitReason&&<span style={{fontFamily:mono,fontSize:7,color:'var(--text-muted)'}}>{sig.exitReason}</span>}
                <span style={{fontFamily:mono,fontSize:8,color:oc,fontWeight:700,background:oc+'15',border:`1px solid ${oc}33`,borderRadius:3,padding:'1px 6px',marginLeft:'auto'}}>{isPending?'⏳ PENDING':sig.outcome||'—'}</span>
                <span style={{fontFamily:mono,fontSize:7,color:'var(--text-muted)'}}>{sig.timestamp?new Date(sig.timestamp).toLocaleDateString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):''}</span>
              </div>);
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SignalFlashcard({ data, trends }) {
  const mono = "'Share Tech Mono',monospace";
  const orb  = "'Orbitron',sans-serif";
  const allSigs = (data||[]).filter(r=>r.bias==='BUY'||r.bias==='SELL').sort((a,b)=>Math.abs(b.gap||0)-Math.abs(a.gap||0));
  const [cardIdx, setCardIdx] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);

  function goTo(idx) {
    if (flipping || allSigs.length === 0) return;
    setFlipping(true);
    setTimeout(() => { setCardIdx((idx + allSigs.length) % allSigs.length); setFlipping(false); }, 240);
  }
  function next() { goTo(cardIdx + 1); }
  function prev() { goTo(cardIdx - 1); }

  useEffect(() => {
    if (paused || allSigs.length === 0) return;
    timerRef.current = setInterval(next, 3500);
    return () => clearInterval(timerRef.current);
  }, [cardIdx, paused, allSigs.length]);

  if (allSigs.length === 0) return (
    <div style={{textAlign:'center',padding:40,fontFamily:mono,fontSize:11,letterSpacing:3,color:'var(--text-muted)'}}>NO ACTIVE SIGNALS</div>
  );

  const row = allSigs[cardIdx];
  const isBuy = row.bias === 'BUY';
  const bc = isBuy ? '#00ff9f' : '#ff4d6d';
  const bgc = isBuy ? 'rgba(0,255,159,0.08)' : 'rgba(255,77,109,0.08)';
  const t = trends[row.symbol] || {};
  const momColor = t.momentum==='STRONG'?'#00ff9f':t.momentum==='BUILDING'?'#66ffcc':t.momentum==='SPARK'?'#ffd166':'#ffd166';

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {/* Header row */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span style={{fontFamily:orb,fontSize:10,color:'#00b4ff',letterSpacing:4,fontWeight:700}}>{'⚡ SIGNAL FLASHCARD'}</span>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{cardIdx+1} / {allSigs.length}</span>
          <button onClick={()=>setPaused(p=>!p)} style={{background:paused?'rgba(255,209,102,0.12)':'rgba(0,180,255,0.08)',border:`1px solid ${paused?'#ffd166':'rgba(0,180,255,0.4)'}`,borderRadius:4,color:paused?'#ffd166':'#00b4ff',fontFamily:mono,fontSize:8,padding:'3px 10px',cursor:'pointer',letterSpacing:1}}>
            {paused ? '▶ PLAY' : '⏸ PAUSE'}
          </button>
        </div>
      </div>

      {/* Main card */}
      <div style={{position:'relative',height:200,cursor:'pointer'}} onClick={next}>
        <div style={{
          position:'absolute',inset:0,
          background:bgc,
          border:`2px solid ${bc}77`,
          borderRadius:18,
          padding:'28px 36px',
          display:'flex',flexDirection:'column',justifyContent:'space-between',
          overflow:'hidden',
          opacity:flipping?0:1,
          transform:flipping?'scale(0.96) translateY(4px)':'scale(1) translateY(0)',
          transition:'opacity 0.22s ease, transform 0.22s ease',
          boxShadow:`0 0 40px ${bc}18, inset 0 0 60px ${bc}05`,
        }}>
          {/* Decorative big bg text */}
          <div style={{position:'absolute',bottom:-8,right:12,fontFamily:orb,fontSize:80,fontWeight:900,color:bc+'07',pointerEvents:'none',lineHeight:1,userSelect:'none'}}>{row.bias}</div>
          {/* Top section — centered pair + bias */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:16,flex:1}}>
            <span style={{fontFamily:orb,fontSize:44,fontWeight:900,letterSpacing:6,color:'var(--text-primary)',lineHeight:1}}>{row.symbol}</span>
            <span style={{fontFamily:orb,fontSize:32,fontWeight:900,color:bc,letterSpacing:4,textShadow:`0 0 20px ${bc}44`}}>{row.bias}</span>
          </div>
          <div style={{display:'flex',justifyContent:'center'}}>
            {t.momentum && <span style={{fontFamily:mono,fontSize:11,color:momColor,background:momColor+'12',border:`1px solid ${momColor}30`,borderRadius:5,padding:'3px 10px'}}>{t.momentum}</span>}
          </div>
          {/* Pulse bar */}
          <div style={{height:3,borderRadius:2,background:`linear-gradient(90deg,transparent,${bc},transparent)`,opacity:0.55,animation:'pulse 2s ease-in-out infinite'}}/>
        </div>
      </div>

      {/* Prev / dots / next */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
        <button onClick={(e)=>{e.stopPropagation();prev();}} style={{background:'transparent',border:'1px solid var(--border)',borderRadius:'50%',width:28,height:28,color:'var(--text-muted)',fontFamily:mono,fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}>‹</button>
        <div style={{display:'flex',gap:5,flexWrap:'wrap',justifyContent:'center',maxWidth:420}}>
          {allSigs.map((_,i) => (
            <div key={i} onClick={()=>goTo(i)} style={{width:i===cardIdx?20:6,height:6,borderRadius:3,background:i===cardIdx?bc:'var(--border)',cursor:'pointer',transition:'all 0.3s',flexShrink:0}}/>
          ))}
        </div>
        <button onClick={(e)=>{e.stopPropagation();next();}} style={{background:'transparent',border:'1px solid var(--border)',borderRadius:'50%',width:28,height:28,color:'var(--text-muted)',fontFamily:mono,fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}>›</button>
      </div>

      {/* Mini ticker strip */}
      <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:4,scrollbarWidth:'thin'}}>
        {allSigs.map((r,i) => {
          const b = r.bias==='BUY'; const c = b?'#00ff9f':'#ff4d6d';
          return (
            <div key={r.symbol} onClick={()=>goTo(i)} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2,padding:'5px 10px',borderRadius:6,background:i===cardIdx?(b?'rgba(0,255,159,0.12)':'rgba(255,77,109,0.12)'):'transparent',border:`1px solid ${i===cardIdx?c:'var(--border)'}`,cursor:'pointer',flexShrink:0,transition:'all 0.2s',minWidth:58}}>
              <span style={{fontFamily:orb,fontSize:10,fontWeight:700,color:i===cardIdx?'var(--text-primary)':'var(--text-muted)',letterSpacing:1}}>{r.symbol}</span>
              <span style={{fontFamily:mono,fontSize:8,color:c,fontWeight:700}}>{r.bias}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ALL_TABS_SET = new Set([...TABS, 'ENGINE']);

export default function Dashboard() {
  const router = useRouter();
  const [data,       setData]       = useState([]);
  const [trends,     setTrends]     = useState({});
  const [cotData,    setCotData]    = useState([]);
  const [spikes,     setSpikes]     = useState([]);
  const [prefs,      setPrefs]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [cotLoading, setCotLoading] = useState(false);
  const [selectedPair, setSelectedPair] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [filter,     setFilter]     = useState('ALL');
  const [sort,       setSort]       = useState('symbol_asc');
  const [search,     setSearch]     = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pdrData, setPdrData] = useState({});
  const [aiMemories, setAiMemories] = useState([]);
  const [upcomingNews, setUpcomingNews] = useState({ events: [], affected_pairs: [] });
  const memoryLoaded = aiMemories.length > 0;
  const memoryIndex = useMemo(() => {
    const idx = { gap_pl: {}, gap_only: {}, pl_only: {}, general: {} };
    aiMemories.forEach(m => {
      const meta = m.metadata || {};
      const s = m.strategy || 'unknown';
      if (m.factor === 'gap_plus_pl' && meta.gap_level && meta.pl_status) {
        idx.gap_pl[`${s}_${meta.gap_level}_${meta.pl_status}`] = m;
      } else if (m.factor === 'gap_level' && meta.gap_level) {
        idx.gap_only[`${s}_${meta.gap_level}`] = m;
      } else if (m.factor === 'pl_confirmation' && meta.pl_status) {
        idx.pl_only[`${s}_${meta.pl_status}`] = m;
      } else if (m.factor === 'strategy_overall' && s !== 'unknown') {
        idx.general[`${s}_strategy_overall`] = m;
      } else if (m.factor === 'pair_performance' && m.pair) {
        idx.general[`${s}_pair_${m.pair}`] = m;
      }
    });
    return idx;
  }, [aiMemories]);
  // URL-synced tab state
  const urlTab = typeof router.query.tab === 'string' ? router.query.tab.toUpperCase().replace(/-/g,' ') : null;
  const [tab, setTabRaw] = useState(urlTab && ALL_TABS_SET.has(urlTab) ? urlTab : 'OVERVIEW');
  const setTab = useCallback((t) => {
    setTabRaw(t);
    const slug = t.toLowerCase().replace(/\s+/g, '-');
    router.replace({ pathname: '/dashboard', query: { tab: slug } }, undefined, { shallow: true });
  }, [router]);
  // Sync tab if user navigates back/forward
  useEffect(() => {
    if (urlTab && ALL_TABS_SET.has(urlTab) && urlTab !== tab) setTabRaw(urlTab);
  }, [urlTab]);
  const [logSub,     setLogSub]     = useState('Signal Log');
  const [user,       setUser]       = useState(null);
  const isAdmin = user?.role === 'admin';
  const [showAlertSettings, setShowAlertSettings] = useState(false);
  const [popup,      setPopup]      = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [pageVis, setPageVis] = useState(null);
  const [showPageVis, setShowPageVis] = useState(false);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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
      if(dr.status===401){window.location.href='/login';return;}
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
  useEffect(()=>{
    fetch('/api/ai-memory?limit=500').then(r=>r.json()).then(d=>{if(Array.isArray(d))setAiMemories(d);}).catch(()=>{});
    fetch('/api/pdr').then(r=>r.json()).then(d=>{if(d.pdr)setPdrData(d.pdr);}).catch(()=>{});
  },[]);
  // News alert fetch — refreshes every 5 minutes
  useEffect(()=>{
    const fetchNews = () => fetch('/api/upcoming-news').then(r=>r.json()).then(d=>setUpcomingNews(d||{events:[],affected_pairs:[]})).catch(()=>{});
    fetchNews();
    const t = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(t);
  },[]);
  // Polling — paused when tab hidden to save Vercel Fluid CPU
  useEffect(()=>{
    const tick=()=>{ if(typeof document!=='undefined' && document.visibilityState==='hidden') return; fetchData(true); };
    const t=setInterval(tick,30000);
    return()=>clearInterval(t);
  },[fetchData]);
  useEffect(()=>{
    const tick=()=>{ if(typeof document!=='undefined' && document.visibilityState==='hidden') return; fetchSpikes(); };
    const t=setInterval(tick,30000);
    fetchSpikes();
    return()=>clearInterval(t);
  },[fetchSpikes]);
  useEffect(()=>{if(tab==='RESEARCH'&&cotData.length===0) fetchCot();},[tab,cotData.length,fetchCot]);
  useEffect(()=>{fetchCot();},[fetchCot]);
  useEffect(()=>{
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { setUser(d && d.role ? d : null); if(d && d.username) setShowWelcome(true); })
      .catch(() => setUser(null));
  },[]);
  useEffect(()=>{ if(showWelcome){ const t=setTimeout(()=>setShowWelcome(false),4500); return()=>clearTimeout(t); } },[showWelcome]);
  useEffect(()=>{fetch('/api/page-visibility').then(r=>r.json()).then(d=>setPageVis(d)).catch(()=>{});},[]);

  // Maintenance mode check
  useEffect(()=>{
    fetch('/api/maintenance').then(r=>r.json()).then(d=>{
      setMaintenance(d.maintenance===true);
    }).catch(()=>{});
  },[]);

  async function toggleMaintenance() {
    const next = !maintenance;
    const res = await fetch('/api/maintenance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:next})});
    if(res.ok) setMaintenance(next);
  }

  // Heartbeat — ping every 2 min so admin can see who's online (skips when tab hidden)
  useEffect(()=>{
    fetch('/api/heartbeat',{method:'POST'}).catch(()=>{});
    const hb=setInterval(()=>{
      if(typeof document!=='undefined' && document.visibilityState==='hidden') return;
      fetch('/api/heartbeat',{method:'POST'}).catch(()=>{});
    },120000);
    return()=>clearInterval(hb);
  },[]);

  async function handleLogout(){await fetch('/api/logout',{method:'POST'});window.location.href='/login';}

  function toggleHeatmap() { setPrefs(p=>({...p,heatmap_visible:!p?.heatmap_visible})); }
  function toggleSpikeBanner() { setPrefs(p=>({...p,spike_banner_visible:!p?.spike_banner_visible})); }

  const validPairs=data.filter(r=>isValid(r.gap??0)&&!r.hard_invalid&&!isNeutralMatchup(r));
  let displayed=(filter==='ALL')?[...data].sort((a,b)=>(a.symbol||'').localeCompare(b.symbol||'')):[...validPairs].sort((a,b)=>(a.symbol||'').localeCompare(b.symbol||''));
  if(search) displayed=displayed.filter(r=>r.symbol?.toLowerCase().includes(search.toLowerCase()));
  if(filter==='BUY') displayed=displayed.filter(r=>(r.gap??0)>=5);
  if(filter==='SELL') displayed=displayed.filter(r=>(r.gap??0)<=-5);
  if(filter==='STRONG') displayed=displayed.filter(r=>r.signal==='STRONG'||r.strength>=2);
  if(filter==='⚠️ CLOSE') displayed=displayed.filter(r=>trends[r.symbol]?.closeAlert);

  if(sort==='symbol_asc'||filter==='VALID'||filter==='ALL') displayed.sort((a,b)=>(a.symbol||'').localeCompare(b.symbol||''));
  else if(sort==='strength_desc') displayed.sort((a,b)=>(b.strength||0)-(a.strength||0));
  else if(sort==='gap_desc') displayed.sort((a,b)=>Math.abs(b.gap||0)-Math.abs(a.gap||0));
  else if(sort==='delta1h') displayed.sort((a,b)=>(trends[b.symbol]?.delta1h||0)-(trends[a.symbol]?.delta1h||0));
  else if(sort==='momentum'){const ord={BUILDING:0,SPARK:0,STRONG:0,EMERGING:1,STABLE:2,NEUTRAL:3,CONSOLIDATING:3,COOLING:4,FADING:5,REVERSING:6};displayed.sort((a,b)=>(ord[trends[a.symbol]?.momentum]??3)-(ord[trends[b.symbol]?.momentum]??3));}

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

  // Confidence scoring — computed once, used everywhere
  const confidenceMap = {};
  data.forEach(row => {
    const conf = computeConfidence(row, trends[row.symbol], getPairCotBias(row.symbol), memoryIndex);
    if (conf) confidenceMap[row.symbol] = conf;
  });

  return (
    <>
      <Head>
        <title>PANDA ENGINE — {isMarketOpen()?'LIVE':'CLOSED'}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <style>{`@media print{body{visibility:hidden!important;}} *{-webkit-touch-callout:none;} @media(max-width:767px){*::-webkit-scrollbar{height:3px!important;width:3px!important;} button{min-height:32px;} select,input[type=date]{min-height:32px;} table{font-size:9px!important;}} @keyframes fadeIn{from{opacity:0}to{opacity:1}} @keyframes scaleIn{from{opacity:0;transform:scale(0.85)}to{opacity:1;transform:scale(1)}}`}</style>
      </Head>

      {/* WELCOME POPUP */}
      {showWelcome&&user&&(
        <div onClick={()=>setShowWelcome(false)} style={{position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)',backdropFilter:'blur(6px)',animation:'fadeIn 0.3s ease'}}>
          <div style={{background:'linear-gradient(135deg,rgba(10,14,20,0.97),rgba(0,30,60,0.95))',border:'1px solid rgba(0,180,255,0.3)',borderRadius:20,padding:isMobile?'40px 30px':'52px 64px',textAlign:'center',maxWidth:520,width:'90vw',boxShadow:'0 0 80px rgba(0,180,255,0.2), 0 0 120px rgba(0,180,255,0.08)',animation:'scaleIn 0.3s ease'}}>
            <div style={{fontSize:isMobile?42:56,marginBottom:16}}>🐼</div>
            <div style={{fontFamily:'Orbitron,sans-serif',fontSize:isMobile?11:13,color:'#00b4ff',letterSpacing:4,fontWeight:700,marginBottom:10,opacity:0.8}}>WELCOME BACK</div>
            <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:isMobile?28:36,color:'#ffffff',fontWeight:700,marginBottom:16}}>{user.username?.toUpperCase()}</div>
            <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:isMobile?16:20,color:'#00ff9f',fontWeight:600,marginBottom:8}}>Good to See You Again!</div>
            <div style={{fontFamily:'Share Tech Mono,monospace',fontSize:isMobile?10:11,color:'rgba(255,255,255,0.5)',letterSpacing:1,lineHeight:1.6}}>Your account is active and the latest<br/>market insights are ready for review.</div>
          </div>
        </div>
      )}

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
        <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:isMobile?'8px 12px':'10px 20px',background:'var(--bg-secondary)',borderBottom:'1px solid var(--border)',position:'sticky',top:0,zIndex:100,flexWrap:isMobile?'wrap':'nowrap',gap:isMobile?8:0}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:isMobile?18:22}}>🐼</span>
            <div><div style={{fontFamily:orb,fontWeight:900,fontSize:isMobile?11:13,letterSpacing:isMobile?2:4,color:'#00ff9f'}}>PANDA ENGINE</div>{!isMobile&&<div style={{fontFamily:mono,fontSize:8,letterSpacing:3,color:'var(--text-muted)'}}>FOREX INTELLIGENCE · {isMarketOpen()?'LIVE':'MARKET CLOSED'}</div>}</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,flex:isMobile?'none':1,justifyContent:'center',order:isMobile?3:0,width:isMobile?'100%':'auto'}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:isMarketOpen()?'#00ff9f':'#ff4d6d',boxShadow:`0 0 8px ${isMarketOpen()?'#00ff9f':'#ff4d6d'}`,animation:'blink 2s infinite'}}/>
            <span style={{fontFamily:mono,fontSize:10,letterSpacing:2,color:isMarketOpen()?'#00ff9f':'#ff4d6d'}}>{isMarketOpen()?'LIVE':'CLOSED'}</span>
            <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{lastUpdate?formatTime(lastUpdate):'...'}</span>
            {refreshing&&<span style={{color:'#00b4ff',animation:'spin 1s linear infinite',display:'inline-block',fontSize:14}}>↻</span>}
            {spikes.length>0&&<div style={{display:'flex',alignItems:'center',gap:4,background:'rgba(255,209,102,0.1)',border:'1px solid rgba(255,209,102,0.3)',borderRadius:4,padding:'2px 8px'}}><span style={{width:6,height:6,borderRadius:'50%',background:'#ffd166',animation:'blink 1s infinite',display:'inline-block'}}/><span style={{fontFamily:mono,fontSize:8,color:'#ffd166',letterSpacing:1}}>{spikes.length} SPIKE{spikes.length>1?'S':''}</span></div>}
          </div>
          <div style={{display:'flex',gap:isMobile?5:7,flexWrap:'wrap'}}>
            {/* Alert settings button */}
            <button onClick={()=>setShowAlertSettings(true)} style={{background:'rgba(255,209,102,0.06)',border:'1px solid #ffd16633',borderRadius:5,color:'#ffd166',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>🔔 ALERTS</button>
            <button onClick={()=>fetchData(true)} style={{background:'transparent',border:'1px solid #1e3060',borderRadius:5,color:'#00b4ff',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>⟳</button>
            {(isAdmin||user?.role==='vip'||user?.feature_access?.includes('journal'))&&<button onClick={()=>window.location.href='/journal'} style={{background:'rgba(255,209,102,0.06)',border:'1px solid #ffd16633',borderRadius:5,color:'#ffd166',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>📓 JOURNAL</button>}
            <button onClick={()=>window.location.href='/strength'} style={{background:'rgba(78,154,241,0.06)',border:'1px solid #4e9af133',borderRadius:5,color:'#4e9af1',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>STRENGTH</button>
            {isAdmin&&<button onClick={()=>window.location.href='/admin'} style={{background:'rgba(255,209,102,0.08)',border:'1px solid #ffd16644',borderRadius:5,color:'#ffd166',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>🛡️ ADMIN</button>}
            {isAdmin&&<button onClick={()=>window.location.href='/guardian'} style={{background:'rgba(255,77,109,0.08)',border:'1px solid #ff4d6d44',borderRadius:5,color:'#ff4d6d',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>GUARDIAN</button>}
            {isAdmin&&<button onClick={()=>setShowPageVis(!showPageVis)} style={{background:showPageVis?'rgba(204,119,255,0.15)':'rgba(204,119,255,0.06)',border:'1px solid #cc77ff44',borderRadius:5,color:'#cc77ff',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>👁️ PAGES</button>}
            {isAdmin&&<button onClick={toggleMaintenance} style={{background:maintenance?'rgba(255,77,109,0.12)':'rgba(0,255,159,0.06)',border:`1px solid ${maintenance?'#ff4d6d33':'#00ff9f33'}`,borderRadius:5,color:maintenance?'#ff4d6d':'#00ff9f',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>{maintenance?'🔴 SITE OFF':'🟢 SITE ON'}</button>}
            <button onClick={handleLogout} style={{background:'transparent',border:'1px solid #2a1525',borderRadius:5,color:'#ff4d6d',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>LOGOUT</button>
          </div>
        </header>

        {/* PAGE VISIBILITY TOGGLE — ADMIN ONLY */}
        {isAdmin&&showPageVis&&pageVis&&(()=>{
          const PAGES = [
            { key:'landing',   label:'🏠 LANDING',   route:'/' },
            { key:'funnel',    label:'🔄 GET STARTED', route:'/get-started' },
            { key:'pricing',   label:'💰 PRICING',   route:'/pricing' },
            { key:'portfolio', label:'📁 PORTFOLIO', route:'/portfolio' },
            { key:'login',     label:'🔐 LOGIN',     route:'/login' },
            { key:'guardian',  label:'🛡️ GUARDIAN',  route:'/guardian' },
            { key:'stream',    label:'📡 STREAM',    route:'/stream' },
          ];
          const togglePage = async (pgKey) => {
            const next = { ...pageVis, [pgKey]: !pageVis[pgKey] };
            setPageVis(next);
            await fetch('/api/page-visibility',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});
          };
          const toggleBypass = async () => {
            const next = { ...pageVis, bypass_enabled: !pageVis.bypass_enabled };
            setPageVis(next);
            await fetch('/api/page-visibility',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});
          };
          return(
          <div style={{background:'rgba(204,119,255,0.06)',borderBottom:'1px solid rgba(204,119,255,0.25)',padding:'12px 20px',zIndex:99}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10,flexWrap:'wrap'}}>
              <span style={{fontFamily:orb,fontSize:11,color:'#cc77ff',letterSpacing:3,fontWeight:700}}>👁️ PAGE VISIBILITY</span>
              <span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',letterSpacing:1}}>Toggle site pages on/off for visitors</span>
              {/* BYPASS TOGGLE */}
              <div style={{display:'flex',alignItems:'center',gap:6,marginLeft:'auto',background:pageVis.bypass_enabled?'rgba(0,255,159,0.08)':'rgba(255,77,109,0.1)',border:`1px solid ${pageVis.bypass_enabled?'#00ff9f33':'#ff4d6d33'}`,borderRadius:6,padding:'4px 12px',cursor:'pointer'}} onClick={toggleBypass}>
                <div style={{width:32,height:16,borderRadius:8,background:pageVis.bypass_enabled?'#00ff9f':'#ff4d6d',position:'relative',transition:'background 0.2s'}}>
                  <div style={{width:12,height:12,borderRadius:6,background:'white',position:'absolute',top:2,transition:'left 0.2s',left:pageVis.bypass_enabled?18:2}}/>
                </div>
                <span style={{fontFamily:mono,fontSize:9,color:pageVis.bypass_enabled?'#00ff9f':'#ff4d6d',letterSpacing:1,fontWeight:700}}>BYPASS {pageVis.bypass_enabled?'ON':'OFF'}</span>
              </div>
            </div>
            {pageVis.bypass_enabled&&<div style={{fontFamily:mono,fontSize:9,color:'#00ff9f',marginBottom:8,letterSpacing:1}}>✅ BYPASS ON — All controlled pages are open. Individual switches are saved but take effect only when bypass is OFF.</div>}
            {!pageVis.bypass_enabled&&<div style={{fontFamily:mono,fontSize:9,color:'#ff4d6d',marginBottom:8,letterSpacing:1}}>🔒 BYPASS OFF — Only toggled-ON pages are visible. Disabled pages show "Coming Soon".</div>}
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              {PAGES.map(pg=>{
                const isOn = pageVis[pg.key]!==false;
                return(
                  <div key={pg.key} style={{display:'flex',alignItems:'center',gap:8,background:isOn?'rgba(0,255,159,0.06)':'rgba(255,77,109,0.06)',border:`1px solid ${isOn?'#00ff9f44':'#ff4d6d44'}`,borderRadius:8,padding:'8px 16px',cursor:'pointer',minWidth:140,transition:'all 0.2s'}} onClick={()=>togglePage(pg.key)}>
                    <div style={{width:34,height:18,borderRadius:9,background:isOn?'#00ff9f':'#ff4d6d55',position:'relative',transition:'background 0.2s',flexShrink:0}}>
                      <div style={{width:14,height:14,borderRadius:7,background:isOn?'white':'#ff4d6d',position:'absolute',top:2,transition:'left 0.2s',left:isOn?18:2,boxShadow:'0 1px 3px rgba(0,0,0,0.3)'}}/>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:1}}>
                      <span style={{fontFamily:mono,fontSize:10,color:isOn?'#00ff9f':'#ff4d6d',letterSpacing:1,fontWeight:700}}>{pg.label}</span>
                      <span style={{fontFamily:mono,fontSize:7,color:'var(--text-muted)',letterSpacing:0.5}}>{pg.route}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>);
        })()}

        {/* NEWS ALERT BANNER */}
        {false && upcomingNews.events && upcomingNews.events.length > 0 && (
          <div style={{background:'rgba(255,61,94,0.08)',borderBottom:'1px solid rgba(255,61,94,0.3)',padding:'6px 20px',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',zIndex:99}}>
            <span style={{fontFamily:mono,fontSize:9,color:'#ff4d6d',fontWeight:700,letterSpacing:1,flexShrink:0}}>📰 HIGH IMPACT NEWS</span>
            {upcomingNews.events.slice(0,3).map((ev,i)=>(
              <span key={i} style={{fontFamily:mono,fontSize:9,color:'#ffd166',background:'rgba(255,209,102,0.08)',border:'1px solid rgba(255,209,102,0.2)',borderRadius:4,padding:'2px 8px',whiteSpace:'nowrap'}}>
                {ev.currency} — {ev.title} {ev.mins_away<=0?'NOW':ev.mins_away+'min'}
              </span>
            ))}
            <span style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',marginLeft:'auto'}}>Affected: {upcomingNews.affected_pairs?.slice(0,6).join(', ')}</span>
          </div>
        )}

        {/* CLOSE ALERTS BANNER */}
        {closeAlerts>0&&(
          <div style={{background:'rgba(255,77,109,0.07)',borderBottom:'1px solid rgba(255,77,109,0.25)',padding:'7px 20px',display:'flex',alignItems:'center',gap:10,zIndex:1}}>
            <span>⚠️</span><span style={{fontFamily:mono,fontSize:10,color:'#ff4d6d',letterSpacing:2}}>{closeAlerts} POSITION{closeAlerts>1?'S':''} SHOWING REVERSAL SIGNAL</span>
            <button onClick={()=>{setFilter('⚠️ CLOSE');setTab('PANELS');}} style={{background:'rgba(255,77,109,0.12)',border:'1px solid rgba(255,77,109,0.35)',borderRadius:4,color:'#ff4d6d',fontFamily:mono,fontSize:9,padding:'2px 10px',cursor:'pointer',marginLeft:'auto'}}>VIEW →</button>
          </div>
        )}

        {/* STATS */}
        <div style={{display:'flex',gap:isMobile?5:7,padding:isMobile?'8px 12px':'10px 20px',overflowX:'auto',zIndex:1}}>
          <StatCard label="PAIRS"       value={data.length}     color="#00b4ff"/>
          <StatCard label="📈 BUY"      value={buyCount}        color="#00ff9f"/>
          <StatCard label="📉 SELL"     value={sellCount}       color="#ff4d6d"/>
          <StatCard label="🔥 STRONG"   value={strongCount}     color="#ffd166"/>
          <StatCard label="🚀 BUILDING" value={buildingCount}   color="#00ff9f" sub="momentum"/>
          <StatCard label="⚡ SPIKES"   value={spikes.length}   color={spikes.length>0?'#ffd166':'var(--text-muted)'} sub="last 20min"/>
          <StatCard label="⚠️ ALERTS"   value={closeAlerts}     color={closeAlerts>0?'#ff4d6d':'var(--text-muted)'}/>
        </div>

        {/* SPIKE BANNER */}
        {(isAdmin||(user?.feature_access||[]).includes('spike_banner'))&&<SpikeBanner spikes={spikes} prefs={prefs} onToggle={toggleSpikeBanner}/>}

        {/* HEATMAP — always visible on panels/table */}
        {['PANELS','TABLE'].includes(tab) && (isAdmin||(user?.feature_access||[]).includes('heatmap')) && (
          <MomentumHeatmap data={data} visible={prefs?.heatmap_visible!==false} onToggle={toggleHeatmap}/>
        )}

        {/* TABS */}
        <div style={{display:'flex',alignItems:'center',gap:7,padding:isMobile?'0 12px 10px':'0 20px 10px',flexWrap:'nowrap',overflowX:'auto',WebkitOverflowScrolling:'touch',scrollbarWidth:'none',msOverflowStyle:'none',zIndex:1}}>
          <div style={{display:'flex',background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:7,overflow:'visible',flexShrink:0}}>
            {TABS.filter(t=>{ const feat=TAB_FEATURE[t]; if(!feat) return true; if(isAdmin) return true; const fa=user?.feature_access||[]; if(t==='SHADOW') return fa.includes('shadow'); return fa.includes(feat)||fa.includes('dashboard');}).map((t,i,arr)=><a key={t} href={`/dashboard?tab=${t.toLowerCase().replace(/\s+/g,'-')}`} onClick={(e)=>{e.preventDefault();setTab(t);}} style={{background:tab===t?'rgba(0,180,255,0.15)':'rgba(255,255,255,0.03)',border:'none',borderRight:i<TABS.length-1?'1px solid var(--border)':'none',color:tab===t?'#00b4ff':'#c8ddf0',fontFamily:mono,fontSize:9,fontWeight:tab===t?700:500,letterSpacing:2,padding:'7px 12px',cursor:'pointer',whiteSpace:'nowrap',textDecoration:'none',display:'inline-block'}}>{t}</a>)}
            {isAdmin&&<a href="/dashboard?tab=engine" onClick={(e)=>{e.preventDefault();setTab('ENGINE');}} style={{background:tab==='ENGINE'?'rgba(255,209,102,0.15)':'rgba(255,255,255,0.03)',border:'none',borderLeft:'1px solid var(--border)',color:tab==='ENGINE'?'#ffd166':'#c8ddf0',fontFamily:mono,fontSize:9,fontWeight:tab==='ENGINE'?700:500,letterSpacing:2,padding:'7px 12px',cursor:'pointer',textDecoration:'none',display:'inline-block'}}>🏥 ENGINE</a>}
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
        <div style={{flex:1,padding:isMobile?'0 10px 16px':'0 20px 20px',zIndex:1}}>
          {loading?(
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,padding:80}}>
              <div style={{width:10,height:10,borderRadius:'50%',background:'#00ff9f',animation:'dotpulse 1s ease-in-out infinite'}}/>
              <span style={{fontFamily:mono,fontSize:12,letterSpacing:3,color:'var(--text-muted)'}}>LOADING...</span>
            </div>
):tab==='OVERVIEW'?(
<><OverviewTab data={data} trends={trends} pdrData={pdrData} upcomingNews={upcomingNews} spikes={spikes} confidenceMap={confidenceMap} memoryIndex={memoryIndex} onSelectPair={setSelectedPair} isMobile={isMobile} lastUpdate={lastUpdate}/><PhaseLegend isMobile={isMobile}/></>
          ):tab==='PANELS'?(
            displayed.length===0
              ?<div style={{textAlign:'center',padding:60,fontFamily:mono,fontSize:11,letterSpacing:3,color:'var(--text-muted)'}}>NO PAIRS MATCH</div>
              :<><div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',letterSpacing:2,marginBottom:10}}>{filter==='ALL'?`${displayed.length} ALL PAIRS · ${buyCount} BUY · ${sellCount} SELL`:filter==='VALID'?`${displayed.length} VALID PAIRS · ${buyCount} BUY · ${sellCount} SELL`:`${displayed.length} PAIRS`}</div>
              <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(auto-fit,minmax(160px,1fr))':'repeat(auto-fit,minmax(190px,1fr))',gap:isMobile?8:10,alignItems:'stretch'}}>
                {displayed.map(row=><div key={row.symbol} onClick={()=>setSelectedPair(row)} style={{cursor:'pointer',height:'100%',display:'flex',flexDirection:'column'}}><PairCard row={row} trend={trends[row.symbol]} cotBias={getPairCotBias(row.symbol)} confidence={confidenceMap[row.symbol]} memoryIndex={memoryIndex} pdr={pdrData[row.symbol]} newsAlert={upcomingNews.affected_pairs?.includes(row.symbol)}/></div>)}
              </div></>
          ):tab==='SETUPS'?(<ValidSetupsTab data={data} trends={trends} cotMap={cotMap} confidenceMap={confidenceMap}/>
):tab==='VALID PAIRS'?(<ValidPairsTab data={data} trends={trends} cotMap={cotMap} confidenceMap={confidenceMap}/>
):tab==='SHADOW'&&(isAdmin||(user?.feature_access||[]).includes('shadow'))?(
<ShadowTab/>
          ):tab==='SPIKE LOG'||tab==='LOGS'?(
<div>
  <div style={{display:'flex',gap:8,marginBottom:12}}>
    {['Signal Log','Spike Log'].map(st=>(
      <button key={st} onClick={()=>setLogSub(st)} style={{fontFamily:mono,fontSize:10,letterSpacing:2,padding:'5px 14px',borderRadius:6,border:'1px solid',borderColor:logSub===st?'#00b4ff':'var(--border)',background:logSub===st?'#00b4ff15':'transparent',color:logSub===st?'#00b4ff':'var(--text-muted)',cursor:'pointer'}}>{st}</button>
    ))}
  </div>
  {logSub==='Signal Log'?<SignalLogTab/>:<SpikeLogTab/>}
</div>
):tab==='CHART'?(<ChartTab data={data}/>
):tab==='SIGNALS'?(
<div style={{display:'flex',flexDirection:'column',gap:24}}>

  {/* FLASHCARD */}
  <SignalFlashcard data={data} trends={trends}/>

  {/* LIVE BANNER + MARKET SESSION */}
  <div style={{display:'flex',flexDirection:'column',gap:8}}>
    <div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 18px',background:'rgba(0,255,159,0.07)',border:'1px solid rgba(0,255,159,0.35)',borderRadius:10}}>
      <div style={{width:8,height:8,borderRadius:'50%',background:'#00ff9f',boxShadow:'0 0 10px #00ff9f',animation:'blink 1s infinite',flexShrink:0}}/>
      <span style={{fontFamily:mono,fontSize:12,color:'#00ff9f',letterSpacing:2,fontWeight:700}}>{'🟢 LIVE | Auto Signals Active | Updates in Real-Time'}</span>
    </div>
    {(()=>{
      const now=new Date();
      const utcH=now.getUTCHours(),utcM=now.getUTCMinutes();
      const utcTotal=utcH*60+utcM;
      const sessions=[
        {name:'SYDNEY',   flag:'AU', color:'#00b4ff', open:21*60, close:6*60},
        {name:'TOKYO',    flag:'JP', color:'#ffd166', open:23*60, close:8*60},
        {name:'LONDON',   flag:'GB', color:'#cc77ff', open:7*60,  close:16*60},
        {name:'NEW YORK', flag:'US', color:'#00ff9f', open:12*60, close:21*60},
      ];
      const isOpen=(s)=>{if(s.open>s.close) return utcTotal>=s.open||utcTotal<s.close; return utcTotal>=s.open&&utcTotal<s.close;};
      const active=sessions.filter(isOpen);
      return(
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 18px',background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:10,flexWrap:'wrap'}}>
          <span style={{fontFamily:mono,fontSize:10,color:'var(--text-muted)',letterSpacing:2,marginRight:6,flexShrink:0}}>SESSION:</span>
          {sessions.map(s=>{const on=isOpen(s);return(
            <div key={s.name} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 16px',borderRadius:7,background:on?s.color+'18':'rgba(255,255,255,0.02)',border:`1px solid ${on?s.color:'rgba(255,255,255,0.07)'}`,transition:'all 0.3s'}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:on?s.color:'rgba(255,255,255,0.15)',boxShadow:on?`0 0 8px ${s.color}`:'none',flexShrink:0,transition:'all 0.3s'}}/>
              <span style={{fontFamily:mono,fontSize:11,fontWeight:on?700:400,color:on?s.color:'rgba(255,255,255,0.3)',letterSpacing:1,whiteSpace:'nowrap'}}>{s.name}</span>
            </div>
          );})}
          {active.length===0&&<span style={{fontFamily:mono,fontSize:11,color:'#ff4d6d',fontWeight:700,padding:'7px 14px',background:'rgba(255,77,109,0.08)',border:'1px solid rgba(255,77,109,0.3)',borderRadius:7}}>CLOSED</span>}
          {active.length>1&&<span style={{fontFamily:mono,fontSize:11,color:'#ffd166',fontWeight:700,padding:'7px 14px',background:'rgba(255,209,102,0.08)',border:'1px solid rgba(255,209,102,0.3)',borderRadius:7}}>OVERLAP</span>}
        </div>
      );
    })()}
  </div>

  {/* TOP 3 */}
  {(()=>{
    const top3=data.filter(r=>(r.bias==='BUY'||r.bias==='SELL')&&Math.abs(r.gap||0)>=8).sort((a,b)=>Math.abs(b.gap)-Math.abs(a.gap)).slice(0,3);
    if(top3.length===0) return null;
    const medals=['\uD83E\uDD47 #1','\uD83E\uDD48 #2','\uD83E\uDD49 #3'];
    return(
      <div>
        <div style={{fontFamily:orb,fontSize:11,color:'#ffd166',letterSpacing:4,marginBottom:12,fontWeight:700}}>{'🏆 TOP SIGNALS — STRONGEST'}</div>
        <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
          {top3.map((row,i)=>{
            const isBuy=row.bias==='BUY';const bc=isBuy?'#00ff9f':'#ff4d6d';
            const t3=trends[row.symbol]||{};
            const mc=t3.momentum==='STRONG'?'#00ff9f':t3.momentum==='BUILDING'?'#66ffcc':'#ffd166';
            return(
              <div key={row.symbol} style={{display:'flex',flexDirection:'column',gap:10,padding:'22px 28px',borderRadius:14,background:isBuy?'rgba(0,255,159,0.08)':'rgba(255,77,109,0.08)',border:`2px solid ${bc}66`,minWidth:200,flex:1,maxWidth:300,position:'relative',overflow:'hidden'}}>
                <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,transparent,${bc},transparent)`}}/>
                <div style={{position:'absolute',bottom:-14,right:6,fontFamily:orb,fontSize:56,fontWeight:900,color:bc+'07',pointerEvents:'none'}}>{row.bias}</div>
                <div style={{fontFamily:mono,fontSize:10,color:'#ffd166',fontWeight:700}}>{medals[i]}</div>
                <div style={{fontFamily:orb,fontSize:26,fontWeight:900,letterSpacing:3,color:'var(--text-primary)'}}>{row.symbol}</div>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <span style={{fontFamily:mono,fontSize:13,fontWeight:700,color:bc,background:bc+'18',border:`1px solid ${bc}55`,borderRadius:6,padding:'4px 12px',letterSpacing:2}}>{row.bias}</span>
                  {t3.momentum&&<span style={{fontFamily:mono,fontSize:10,color:mc,background:mc+'12',border:`1px solid ${mc}25`,borderRadius:5,padding:'3px 8px'}}>{t3.momentum}</span>}
                  {(()=>{const cf=confidenceMap[row.symbol];if(!cf)return null;const cs=confStyle(cf.confidence);return <span style={{fontFamily:mono,fontSize:10,color:cs.color,background:cs.bg,border:`1px solid ${cs.border}`,borderRadius:5,padding:'3px 8px',fontWeight:700}}>{cf.confidence} {cs.label}</span>;})()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  })()}

  {/* ALL SIGNALS GRID */}
  <div>
    <div style={{fontFamily:orb,fontSize:11,color:'var(--text-secondary)',letterSpacing:3,marginBottom:12}}>
      ALL SIGNALS  <span style={{color:'#00ff9f'}}>{data.filter(r=>r.bias==='BUY').length} BUY</span><span style={{color:'var(--text-muted)'}}> / </span><span style={{color:'#ff4d6d'}}>{data.filter(r=>r.bias==='SELL').length} SELL</span>
    </div>
    {data.filter(r=>r.bias==='BUY'||r.bias==='SELL').length===0
      ?<div style={{textAlign:'center',padding:40,fontFamily:mono,fontSize:11,letterSpacing:3,color:'var(--text-muted)'}}>NO ACTIVE SIGNALS</div>
      :<div style={{display:'flex',flexWrap:'wrap',gap:12}}>
        {data.filter(r=>r.bias==='BUY'||r.bias==='SELL').sort((a,b)=>Math.abs(b.gap)-Math.abs(a.gap)).map(row=>{
          const isBuy=row.bias==='BUY';const bc=isBuy?'#00ff9f':'#ff4d6d';
          const t4=trends[row.symbol]||{};
          return(
            <div key={row.symbol} style={{display:'flex',flexDirection:'column',gap:8,padding:'18px 22px',borderRadius:12,background:isBuy?'rgba(0,255,159,0.07)':'rgba(255,77,109,0.07)',border:`1px solid ${isBuy?'rgba(0,255,159,0.3)':'rgba(255,77,109,0.3)'}`,minWidth:175,position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${bc}88,transparent)`}}/>
              <span style={{fontFamily:orb,fontSize:20,fontWeight:900,letterSpacing:2,color:'var(--text-primary)'}}>{row.symbol}</span>
              <span style={{fontFamily:mono,fontSize:13,fontWeight:700,color:bc,background:bc+'15',border:`1px solid ${bc}44`,borderRadius:5,padding:'4px 12px',letterSpacing:2,alignSelf:'flex-start'}}>{row.bias}</span>
              {t4.momentum&&<span style={{fontFamily:mono,fontSize:10,color:'var(--text-muted)'}}>{t4.momentum}</span>}
              {(()=>{const cf=confidenceMap[row.symbol];if(!cf)return null;const cs=confStyle(cf.confidence);return <span style={{fontFamily:mono,fontSize:9,color:cs.color,background:cs.bg,border:`1px solid ${cs.border}`,borderRadius:4,padding:'2px 8px',fontWeight:700,alignSelf:'flex-start'}}>{cf.confidence} {cs.label}</span>;})()}
            </div>
          );
        })}
      </div>
    }
  </div>

  {/* DISCLAIMER */}
  <div style={{padding:'14px 20px',background:'rgba(255,209,102,0.08)',border:'1px solid rgba(255,209,102,0.35)',borderRadius:10,display:'flex',alignItems:'center',gap:12}}>
    <span style={{fontSize:20,flexShrink:0}}>{'⚠️'}</span>
    <span style={{fontFamily:raj,fontSize:16,color:'rgba(255,209,102,0.9)',letterSpacing:1,fontWeight:600}}>For educational purposes only — not financial advice.  Watch. Analyze. Decide.</span>
  </div>

</div>
):tab==='ANALYTICS'?(
<div style={{display:'flex',flexDirection:'column',gap:24}}>
<TrackerPanel/>
<SignalAnalytics/>
</div>
):tab==='PANDA AI'?(
<PandaAIChat userId={user?.id} isAdmin={isAdmin}/>
):tab==='TABLE'?(

            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
                <thead><tr style={{background:'var(--bg-hover)'}}>{['#','SYMBOL','GAP','▲▼','BIAS','CONF','MOMENTUM','MATCHUP','PDR','1H','4H','8H','CHART','STATE','STR','SIG','COT','PL','PB ENTRY','⚠️'].map(h=><th key={h} style={hdr}>{h}</th>)}</tr></thead>
                <tbody>
                  {displayed.length===0?<tr><td colSpan={15} style={{textAlign:'center',padding:40,fontFamily:mono,fontSize:10,color:'var(--text-muted)'}}>NO DATA</td></tr>
                  :displayed.map((row,idx)=>{
                    const gap=row.gap??0,valid=isValid(gap)&&!row.hard_invalid&&!isNeutralMatchup(row),bias=biasFromGap(gap),t=trends[row.symbol]||{},sv=row.strength??0;
                    const sc2=t.trend1h==='STRONGER'?'#00ff9f':t.trend1h==='WEAKER'?'#ff4d6d':'var(--text-muted)';
                    const gapTrend=(row.delta_short??0)>0.5?'STRONGER':(row.delta_short??0)<-0.5?'WEAKER':'STABLE';
                    const cotB=getPairCotBias(row.symbol);
                    return(
                      <tr key={row.symbol} style={{borderBottom:'1px solid var(--border)'}}>
                        <td style={{...tdc,fontFamily:mono,fontSize:9,color:'var(--text-muted)',textAlign:'center'}}>{idx+1}</td>
                        <td style={{...tdc,fontFamily:orb,fontSize:11,fontWeight:700,color:valid?'var(--text-primary)':'var(--text-muted)'}}>{row.symbol}</td>
                        <td style={{...tdc,fontFamily:mono,fontSize:12,color:bias.color,fontWeight:700}}>{gap>0?'+':''}{Number(gap).toFixed(1)}</td>
                        <td style={tdc}><TrendArrow trend={gapTrend} size={14}/></td>
                        <td style={tdc}><span style={{border:`1px solid ${bias.border}`,borderRadius:3,padding:'1px 6px',fontFamily:mono,fontSize:9,color:bias.color,background:bias.bg}}>{bias.label}</span></td>
                        <td style={tdc}>{(()=>{const cf=confidenceMap[row.symbol];if(!cf)return <span style={{color:'var(--text-muted)'}}>—</span>;const cs=confStyle(cf.confidence);return <span style={{fontFamily:mono,fontSize:9,color:cs.color,background:cs.bg,border:`1px solid ${cs.border}`,borderRadius:3,padding:'1px 6px',whiteSpace:'nowrap'}}>{cf.confidence}</span>;})()}</td>
                        <td style={{...tdc,fontFamily:mono,fontSize:9,color:t.momentumColor||'var(--text-muted)'}}>{t.momentum||'—'}</td><td style={{...tdc}}>{(()=>{const mu=getMatchup(row);if(!mu)return <span style={{color:'var(--text-muted)'}}>—</span>;return <span style={{fontFamily:mono,fontSize:9,color:mu.color,background:mu.color+'12',border:`1px solid ${mu.color}28`,borderRadius:4,padding:'1px 6px',whiteSpace:'nowrap'}}>{mu.label}</span>;})()}</td><td style={tdc}>{(()=>{const p=pdrData[row.symbol];return p?<PdrBadge pdr={p}/>:<span style={{color:'var(--text-muted)'}}>—</span>;})()}</td>
                        {['delta1h','delta4h','delta8h'].map(k=><td key={k} style={{...tdc,fontFamily:mono,fontSize:10,color:(t[k]||0)>0?'#00ff9f':(t[k]||0)<0?'#ff4d6d':'var(--text-muted)'}}>{t[k]!==undefined?(t[k]>0?'+':'')+t[k]:'—'}</td>)}
                        <td style={tdc}><Sparkline data={t.history||[]} color={sc2} w={55} h={18}/></td>
                        <td style={{...tdc,fontFamily:mono,fontSize:9,color:stateColor(row.state)}}>{row.state||'—'}</td>
                        <td style={tdc}><div style={{display:'flex',alignItems:'center',gap:5}}><div style={{flex:1,height:4,background:'var(--border)',borderRadius:2,overflow:'hidden',minWidth:40}}><div style={{width:`${Math.min(100,(Math.abs(sv)/30)*100)}%`,height:'100%',background:strColor(sv),borderRadius:2}}/></div><span style={{fontFamily:orb,fontSize:10,color:strColor(sv),fontWeight:700,minWidth:28}}>{Number(sv).toFixed(1)}</span></div></td>
                        <td style={tdc}>{(()=>{const s=signalLabel(row.signal,sv);return<span style={{fontFamily:mono,fontSize:9,color:s.color}}>{s.icon}</span>;})()}</td>
                        <td style={tdc}>{cotB?<span style={{fontFamily:mono,fontSize:9,color:cotB.bias==='BULLISH'?'#00ff9f':'#ff4d6d'}}>{cotB.bias==='BULLISH'?'▲':'▼'}</span>:<span style={{color:'var(--text-muted)'}}>—</span>}</td>
                        <td style={tdc}>{(()=>{const pl=plZoneBadge(row.pl_zone,row.bias);if(!pl)return <span style={{color:'var(--text-muted)'}}>—</span>;return <span style={{fontFamily:mono,fontSize:9,color:pl.color,background:pl.bg,border:`1px solid ${pl.border}`,borderRadius:3,padding:'1px 6px',whiteSpace:'nowrap'}}>{pl.valid?'✅':'⛔'} {pl.label}</span>;})()}</td>
                        <td style={tdc}>{(()=>{const isBuy=bias.label==='BUY',isSell=bias.label==='SELL';if(!isBuy&&!isSell)return <span style={{color:'var(--text-muted)'}}>—</span>;const isJpy=row.symbol?.includes('JPY');const dec=isJpy?3:5;const levels=isBuy?[{l:'PDL',v:row.pdl},{l:'PWL',v:row.pwl}].filter(x=>x.v!=null).sort((a,b)=>b.v-a.v):[{l:'PDH',v:row.pdh},{l:'PWH',v:row.pwh}].filter(x=>x.v!=null).sort((a,b)=>a.v-b.v);if(!levels.length)return <span style={{color:'var(--text-muted)'}}>—</span>;const c1=isBuy?'#00ff9f':'#ff4d6d';return <div style={{display:'flex',gap:4}}>{levels.map((lv,i)=><span key={lv.l} style={{fontFamily:mono,fontSize:8,color:i===0?c1:'#00b4ff',whiteSpace:'nowrap'}}>{lv.l} {Number(lv.v).toFixed(dec)}</span>)}</div>;})()}</td>
                        <td style={tdc}>{t.closeAlert?<span style={{fontFamily:mono,fontSize:9,color:'#ff4d6d'}}>⚠️</span>:<span style={{color:'var(--text-muted)'}}>—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ):tab==='GAP CHART'?<GapChart/>
           :tab==='RESEARCH'?<ResearchTab pairs={validPairs} cotData={cotData} cotLoading={cotLoading} fetchCot={fetchCot}/>
           :tab==='CALCULATOR'?<PositionCalculator/>
           :tab==='ENGINE'?<EngineHealth/>
           :tab==='OPEN TRADES'?null
          :null}
        </div>

        <div style={{fontFamily:mono,fontSize:9,letterSpacing:2,color:'var(--text-muted)',textAlign:'center',padding:'8px 20px',borderTop:'1px solid var(--border)',zIndex:1}}>
          PANDA ENGINE · 15s REFRESH · {displayed.length} PAIRS{closeAlerts>0?` · ⚠️ ${closeAlerts} ALERT${closeAlerts>1?'S':''}`:''}
        </div>
      </div>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes blink{0%,100%{opacity:1;}50%{opacity:0.3;}}
        @keyframes dotpulse{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.5);opacity:0.5;}}
        @keyframes pulse{0%,100%{opacity:0.5;}50%{opacity:1;}}
        @keyframes slideUp{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        @keyframes slideIn{from{transform:translateX(100px);opacity:0;}to{transform:translateX(0);opacity:1;}}
        button:hover{opacity:0.8;}
        select option{background:var(--bg-secondary);}
        input:focus,select:focus{outline:none;border-color:#00b4ff!important;}
        tr:hover td{background:rgba(0,180,255,0.02)!important;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-track{background:var(--bg-primary);}
        ::-webkit-scrollbar-thumb{background:var(--border-bright);border-radius:2px;}
      `}</style>
    {selectedPair && (
      <PairCardModal
        row={selectedPair}
        trend={trends[selectedPair.symbol]}
        cotBias={getPairCotBias(selectedPair.symbol)}
        onClose={()=>setSelectedPair(null)}
        isMobile={isMobile}
        confidence={confidenceMap[selectedPair.symbol]}
        memoryIndex={memoryIndex}
        pdr={pdrData[selectedPair.symbol]}
        newsAlert={upcomingNews.affected_pairs?.includes(selectedPair.symbol)}
      />
    )}
    </>
  );
}
