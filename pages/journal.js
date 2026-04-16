import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import ThemeToggle from '../components/ThemeToggle';

const mono = "'Share Tech Mono',monospace";
const orb  = "'Orbitron',sans-serif";
const raj  = "'Rajdhani',sans-serif";
const ALL_PAIRS = ['AUDJPY','AUDCAD','AUDNZD','AUDUSD','CADJPY','EURAUD','EURCAD','EURGBP','EURJPY','EURNZD','EURUSD','GBPAUD','GBPCAD','GBPJPY','GBPNZD','GBPUSD','NZDCAD','NZDJPY','NZDUSD','USDCAD','USDJPY'];
const STRATEGY_COLORS = ['#00ff9f','#00b4ff','#ffd166','#ff4d6d','#ff9944','#cc77ff','#00ffcc','#66ffcc','#ffaa44','#ff7744'];

function formatDt(dt) {
  if (!dt) return '-';
  try { return new Date(dt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'})+' '+new Date(dt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}); }
  catch { return '-'; }
}
function pipsColor(v) { return v > 0 ? '#00ff9f' : v < 0 ? '#ff4d6d' : 'var(--text-muted)'; }
function plColor(v) { return v > 0 ? '#00ff9f' : v < 0 ? '#ff4d6d' : 'var(--text-muted)'; }

function AddTradeModal({ strategies, onClose, onAdded }) {
  const [form, setForm] = useState({ symbol:'EURUSD', direction:'BUY', volume:'0.01', entry_price:'', exit_price:'', sl:'', tp:'', profit_loss:'', profit_loss_pips:'', entry_time:'', exit_time:'', status:'CLOSED', notes:'', strategy_name:'' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inp = {background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:5,padding:'7px 10px',color:'var(--text-primary)',fontFamily:raj,fontSize:14,width:'100%',boxSizing:'border-box'};
  const lbl = {fontFamily:mono,fontSize:9,letterSpacing:2,color:'var(--text-muted)',display:'block',marginBottom:4};
  async function submit(e) {
    e.preventDefault(); setLoading(true); setError('');
    const res = await fetch('/api/journal', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) });
    const d = await res.json();
    if (!res.ok) { setError(d.error); setLoading(false); return; }
    onAdded();
  }
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'var(--bg-card)',border:'1px solid var(--border-bright)',borderRadius:12,padding:28,width:500,maxHeight:'90vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:14}}>
        <div style={{fontFamily:orb,fontSize:14,fontWeight:700,color:'#00ff9f',letterSpacing:3}}>+ LOG TRADE</div>
        <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div><label style={lbl}>PAIR</label><select style={inp} value={form.symbol} onChange={e=>setForm(f=>({...f,symbol:e.target.value}))}>{ALL_PAIRS.map(p=><option key={p}>{p}</option>)}</select></div>
            <div><label style={lbl}>DIRECTION</label><select style={inp} value={form.direction} onChange={e=>setForm(f=>({...f,direction:e.target.value}))}><option value="BUY">BUY</option><option value="SELL">SELL</option></select></div>
            <div><label style={lbl}>VOLUME (LOTS)</label><input style={inp} type="number" step="0.01" value={form.volume} onChange={e=>setForm(f=>({...f,volume:e.target.value}))} placeholder="0.01"/></div>
            <div><label style={lbl}>STATUS</label><select style={inp} value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="OPEN">OPEN</option><option value="CLOSED">CLOSED</option></select></div>
            <div><label style={lbl}>ENTRY PRICE</label><input style={inp} type="number" step="0.00001" value={form.entry_price} onChange={e=>setForm(f=>({...f,entry_price:e.target.value}))} placeholder="1.08500"/></div>
            <div><label style={lbl}>EXIT PRICE</label><input style={inp} type="number" step="0.00001" value={form.exit_price} onChange={e=>setForm(f=>({...f,exit_price:e.target.value}))} placeholder="1.09000"/></div>
            <div><label style={lbl}>STOP LOSS</label><input style={inp} type="number" step="0.00001" value={form.sl} onChange={e=>setForm(f=>({...f,sl:e.target.value}))} placeholder="1.08000"/></div>
            <div><label style={lbl}>TAKE PROFIT</label><input style={inp} type="number" step="0.00001" value={form.tp} onChange={e=>setForm(f=>({...f,tp:e.target.value}))} placeholder="1.09500"/></div>
            <div><label style={lbl}>P/L ($)</label><input style={inp} type="number" step="0.01" value={form.profit_loss} onChange={e=>setForm(f=>({...f,profit_loss:e.target.value}))} placeholder="50.00"/></div>
            <div><label style={lbl}>P/L (PIPS)</label><input style={inp} type="number" step="0.1" value={form.profit_loss_pips} onChange={e=>setForm(f=>({...f,profit_loss_pips:e.target.value}))} placeholder="25"/></div>
            <div><label style={lbl}>ENTRY TIME</label><input style={{...inp,colorScheme:'dark'}} type="datetime-local" value={form.entry_time} onChange={e=>setForm(f=>({...f,entry_time:e.target.value}))}/></div>
            <div><label style={lbl}>EXIT TIME</label><input style={{...inp,colorScheme:'dark'}} type="datetime-local" value={form.exit_time} onChange={e=>setForm(f=>({...f,exit_time:e.target.value}))}/></div>
          </div>
          <div><label style={lbl}>STRATEGY</label>
            <select style={inp} value={form.strategy_name} onChange={e=>setForm(f=>({...f,strategy_name:e.target.value}))}>
              <option value="">No strategy</option>
              {(strategies||[]).map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          <div><label style={lbl}>NOTES</label><input style={inp} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Optional trade notes"/></div>
          {error&&<div style={{fontFamily:mono,fontSize:10,color:'#ff4d6d',background:'rgba(255,77,109,0.08)',border:'1px solid rgba(255,77,109,0.3)',borderRadius:5,padding:'8px 10px'}}>! {error}</div>}
          <div style={{display:'flex',gap:8}}>
            <button type="button" onClick={onClose} style={{flex:1,background:'transparent',border:'1px solid var(--border)',borderRadius:5,color:'var(--text-muted)',fontFamily:mono,fontSize:10,padding:'8px',cursor:'pointer'}}>CANCEL</button>
            <button type="submit" disabled={loading} style={{flex:2,background:'rgba(0,255,159,0.1)',border:'1px solid #00ff9f',borderRadius:5,color:'#00ff9f',fontFamily:mono,fontSize:10,letterSpacing:2,padding:'8px',cursor:'pointer'}}>{loading?'SAVING...':'SAVE TRADE'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FileUpload({ onUploaded }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('');
  const fileRef = useRef(null);
  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true); setResult(null); setStatus('Reading file...');
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      let rows = [];
      if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') {
        setStatus('Loading Excel parser...');
        await new Promise((resolve, reject) => {
          if (window.XLSX) { resolve(); return; }
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
        setStatus('Parsing Excel file...');
        const buffer = await file.arrayBuffer();
        const wb = window.XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
        rows = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      } else if (ext === 'html' || ext === 'htm') {
        setStatus('Parsing HTML file...');
        const text = await file.text();
        const doc = new DOMParser().parseFromString(text, 'text/html');
        const table = doc.querySelector('table');
        if (!table) throw new Error('No table found in HTML file');
        const headers = [...table.querySelectorAll('tr:first-child th, tr:first-child td')].map(c => c.textContent.trim());
        rows = [...table.querySelectorAll('tr')].slice(1).map(tr => {
          const cells = [...tr.querySelectorAll('td')].map(c => c.textContent.trim());
          const obj = {}; headers.forEach((h, i) => { obj[h] = cells[i] || ''; }); return obj;
        }).filter(r => Object.values(r).some(v => v));
      } else if (ext === 'csv') {
        setStatus('Parsing CSV file...');
        const lines = (await file.text()).split('\n').filter(l => l.trim());
        if (lines.length < 2) throw new Error('CSV file is empty');
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        rows = lines.slice(1).map(line => { const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, '')); const obj = {}; headers.forEach((h, i) => { obj[h] = vals[i] || ''; }); return obj; });
      } else throw new Error('Unsupported file type. Use XLSX, HTML, or CSV.');
      if (rows.length === 0) throw new Error('No data rows found in file');
      setStatus(`Found ${rows.length} rows, uploading...`);
      const CHUNK_SIZE = 100; let totalImported = 0; let lastError = null;
      for (let chunk = 0; chunk < rows.length; chunk += CHUNK_SIZE) {
        const batch = rows.slice(chunk, chunk + CHUNK_SIZE);
        setStatus(`Uploading chunk ${Math.floor(chunk/CHUNK_SIZE)+1}/${Math.ceil(rows.length/CHUNK_SIZE)}...`);
        const res = await fetch('/api/journal-upload', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ rows: batch, filename: file.name }) });
        const d = await res.json();
        if (d.imported) totalImported += d.imported;
        if (!d.ok && d.errors?.length) lastError = d.errors[0];
      }
      const d = { ok: totalImported > 0, imported: totalImported, error: lastError };
      setResult(d); setStatus('');
      if (d.ok) setTimeout(onUploaded, 1500);
    } catch (err) { setResult({ ok: false, error: err.message }); setStatus(''); }
    setLoading(false);
  }
  return (
    <div style={{background:'rgba(0,180,255,0.05)',border:'1px solid rgba(0,180,255,0.2)',borderRadius:8,padding:'14px 16px',display:'flex',flexDirection:'column',gap:8}}>
      <div style={{fontFamily:orb,fontSize:10,fontWeight:700,color:'#00b4ff',letterSpacing:3}}>IMPORT FROM CTRADER</div>
      <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
        <div><div style={{fontFamily:mono,fontSize:9,color:'#00ff9f',marginBottom:3}}>XLSX (Recommended)</div><div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)'}}>History: right-click Export - Excel format</div></div>
        <div><div style={{fontFamily:mono,fontSize:9,color:'#ffd166',marginBottom:3}}>HTML</div><div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)'}}>History: right-click Export - HTML format</div></div>
      </div>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.html,.htm,.csv" onChange={handleFile} style={{display:'none'}}/>
        <button onClick={()=>fileRef.current?.click()} disabled={loading} style={{background:'rgba(0,180,255,0.1)',border:'1px solid #00b4ff',borderRadius:5,color:'#00b4ff',fontFamily:mono,fontSize:9,letterSpacing:2,padding:'7px 16px',cursor:'pointer'}}>{loading?'IMPORTING...':'CHOOSE FILE (XLSX / HTML)'}</button>
        {status && <span style={{fontFamily:mono,fontSize:9,color:'#ffd166'}}>{status}</span>}
        {result && <span style={{fontFamily:mono,fontSize:9,color:result.ok?'#00ff9f':'#ff4d6d'}}>{result.ok?`OK ${result.imported} trades imported!`:`x ${result.error}`}</span>}
      </div>
    </div>
  );
}

function StrategyManager({ strategies, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name:'', description:'', rules:'', color:'#00ff9f' });
  const [loading, setLoading] = useState(false);
  async function save() {
    setLoading(true);
    if (editId) await fetch('/api/strategies', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id:editId, ...form }) });
    else await fetch('/api/strategies', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) });
    setLoading(false); setShowAdd(false); setEditId(null); setForm({name:'',description:'',rules:'',color:'#00ff9f'}); onRefresh();
  }
  async function del(id) {
    if (!confirm('Delete this strategy?')) return;
    await fetch('/api/strategies', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
    onRefresh();
  }
  const inp = {background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:5,padding:'7px 10px',color:'var(--text-primary)',fontFamily:raj,fontSize:14,width:'100%',boxSizing:'border-box'};
  const lbl = {fontFamily:mono,fontSize:9,letterSpacing:2,color:'var(--text-muted)',display:'block',marginBottom:4};
  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{fontFamily:orb,fontSize:11,fontWeight:700,color:'#ffd166',letterSpacing:3}}>MY STRATEGIES ({strategies.length}/10)</div>
        {strategies.length < 10 && <button onClick={()=>{setShowAdd(true);setEditId(null);setForm({name:'',description:'',rules:'',color:'#00ff9f'});}} style={{background:'rgba(255,209,102,0.1)',border:'1px solid #ffd166',borderRadius:5,color:'#ffd166',fontFamily:mono,fontSize:9,letterSpacing:2,padding:'5px 12px',cursor:'pointer'}}>+ NEW STRATEGY</button>}
      </div>
      {(showAdd || editId) && (
        <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,padding:'14px 16px',display:'flex',flexDirection:'column',gap:10}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div><label style={lbl}>STRATEGY NAME</label><input style={inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Trend Follow v1"/></div>
            <div><label style={lbl}>COLOR</label><div style={{display:'flex',gap:5}}>{STRATEGY_COLORS.map(c=><div key={c} onClick={()=>setForm(f=>({...f,color:c}))} style={{width:22,height:22,borderRadius:'50%',background:c,cursor:'pointer',border:form.color===c?'2px solid #fff':'2px solid transparent'}}/>)}</div></div>
          </div>
          <div><label style={lbl}>DESCRIPTION</label><input style={inp} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Short description"/></div>
          <div><label style={lbl}>RULES / CRITERIA</label><textarea style={{...inp,minHeight:80,resize:'vertical',fontFamily:mono,fontSize:11}} value={form.rules} onChange={e=>setForm(f=>({...f,rules:e.target.value}))} placeholder="e.g.&#10;- Gap >= 7&#10;- Momentum = BUILDING"/></div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>{setShowAdd(false);setEditId(null);}} style={{flex:1,background:'transparent',border:'1px solid var(--border)',borderRadius:5,color:'var(--text-muted)',fontFamily:mono,fontSize:10,padding:'7px',cursor:'pointer'}}>CANCEL</button>
            <button onClick={save} disabled={loading||!form.name} style={{flex:2,background:'rgba(255,209,102,0.1)',border:'1px solid #ffd166',borderRadius:5,color:'#ffd166',fontFamily:mono,fontSize:10,letterSpacing:2,padding:'7px',cursor:'pointer'}}>{loading?'SAVING...':'SAVE STRATEGY'}</button>
          </div>
        </div>
      )}
      {strategies.length === 0 && !showAdd && <div style={{textAlign:'center',padding:30,fontFamily:mono,fontSize:10,color:'var(--text-muted)',letterSpacing:2}}>NO STRATEGIES YET - Click + NEW STRATEGY</div>}
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {strategies.map(s=>(
          <div key={s.id} style={{background:'var(--bg-card)',border:`1px solid ${s.color}33`,borderRadius:8,padding:'10px 14px',display:'flex',alignItems:'flex-start',gap:12}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:s.color,flexShrink:0,marginTop:3}}/>
            <div style={{flex:1}}>
              <div style={{fontFamily:orb,fontSize:12,fontWeight:700,color:s.color,letterSpacing:2}}>{s.name}</div>
              {s.description&&<div style={{fontFamily:raj,fontSize:13,color:'var(--text-secondary)',marginTop:2}}>{s.description}</div>}
              {s.rules&&<pre style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)',marginTop:6,whiteSpace:'pre-wrap'}}>{s.rules}</pre>}
            </div>
            <div style={{display:'flex',gap:6,flexShrink:0}}>
              <button onClick={()=>{setEditId(s.id);setShowAdd(false);setForm({name:s.name,description:s.description,rules:s.rules,color:s.color});}} style={{background:'rgba(0,180,255,0.08)',border:'1px solid var(--border-bright)',borderRadius:4,color:'#00b4ff',fontFamily:mono,fontSize:8,padding:'4px 8px',cursor:'pointer'}}>EDIT</button>
              <button onClick={()=>del(s.id)} style={{background:'rgba(255,77,109,0.08)',border:'1px solid #ff4d6d44',borderRadius:4,color:'#ff4d6d',fontFamily:mono,fontSize:8,padding:'4px 8px',cursor:'pointer'}}>DEL</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function JournalStats({ trades }) {
  const closed = trades.filter(t => t.status === 'CLOSED');
  if (closed.length === 0) return null;
  const winners = closed.filter(t => (t.profit_loss || 0) > 0);
  const losers  = closed.filter(t => (t.profit_loss || 0) < 0);
  const winRate = closed.length > 0 ? ((winners.length / closed.length) * 100).toFixed(1) : 0;
  const totalPL = closed.reduce((s, t) => s + (t.profit_loss || 0), 0);
  const totalPips = closed.reduce((s, t) => s + (t.profit_loss_pips || 0), 0);
  const avgPips = closed.length > 0 ? (totalPips / closed.length).toFixed(1) : 0;
  const bestTrade = closed.reduce((b, t) => (t.profit_loss || 0) > (b.profit_loss || 0) ? t : b, closed[0]);
  const worstTrade = closed.reduce((w, t) => (t.profit_loss || 0) < (w.profit_loss || 0) ? t : w, closed[0]);
  const pairStats = {};
  closed.forEach(t => { if (!pairStats[t.symbol]) pairStats[t.symbol] = { pl:0, pips:0, count:0, wins:0 }; pairStats[t.symbol].pl += t.profit_loss || 0; pairStats[t.symbol].pips += t.profit_loss_pips || 0; pairStats[t.symbol].count++; if ((t.profit_loss || 0) > 0) pairStats[t.symbol].wins++; });
  const pairList = Object.entries(pairStats).sort((a,b) => b[1].pl - a[1].pl);
  const momStats = {};
  closed.filter(t => t.momentum_at_entry).forEach(t => { const m = t.momentum_at_entry; if (!momStats[m]) momStats[m] = { count:0, wins:0 }; momStats[m].count++; if ((t.profit_loss || 0) > 0) momStats[m].wins++; });
  const card = (label, value, color, sub) => (
    <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 14px',flex:1,minWidth:110}}>
      <div style={{fontFamily:mono,fontSize:8,letterSpacing:2,color:'var(--text-muted)',marginBottom:4}}>{label}</div>
      <div style={{fontFamily:orb,fontSize:18,fontWeight:700,color,textShadow:`0 0 10px ${color}66`}}>{value}</div>
      {sub&&<div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)',marginTop:2}}>{sub}</div>}
    </div>
  );
  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {card('WIN RATE',`${winRate}%`,parseFloat(winRate)>=55?'#00ff9f':parseFloat(winRate)>=45?'#ffd166':'#ff4d6d')}
        {card('TOTAL P/L',`$${totalPL.toFixed(2)}`,plColor(totalPL),`${closed.length} trades`)}
        {card('TOTAL PIPS',`${totalPips>0?'+':''}${totalPips.toFixed(1)}`,pipsColor(totalPips))}
        {card('AVG PIPS',`${avgPips>0?'+':''}${avgPips}`,pipsColor(parseFloat(avgPips)),'per trade')}
        {card('WINNERS',winners.length,'#00ff9f',`${losers.length} losers`)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 14px'}}>
          <div style={{fontFamily:orb,fontSize:10,fontWeight:700,color:'#ffd166',letterSpacing:3,marginBottom:8}}>BEST / WORST TRADES</div>
          {bestTrade&&<div style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border)'}}><span style={{fontFamily:mono,fontSize:9,color:'#00ff9f'}}>* {bestTrade.symbol} {bestTrade.direction}</span><span style={{fontFamily:mono,fontSize:9,color:'#00ff9f'}}>+${(bestTrade.profit_loss||0).toFixed(2)}</span></div>}
          {worstTrade&&<div style={{display:'flex',justifyContent:'space-between',padding:'5px 0'}}><span style={{fontFamily:mono,fontSize:9,color:'#ff4d6d'}}>x {worstTrade.symbol} {worstTrade.direction}</span><span style={{fontFamily:mono,fontSize:9,color:'#ff4d6d'}}>${(worstTrade.profit_loss||0).toFixed(2)}</span></div>}
        </div>
        <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 14px'}}>
          <div style={{fontFamily:orb,fontSize:10,fontWeight:700,color:'#00b4ff',letterSpacing:3,marginBottom:8}}>TOP PAIRS BY P/L</div>
          <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:120,overflowY:'auto'}}>
            {pairList.slice(0,6).map(([sym,s])=>(
              <div key={sym} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontFamily:mono,fontSize:9,color:'var(--text-secondary)'}}>{sym}</span>
                <div style={{display:'flex',gap:8}}>
                  <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{s.count}T</span>
                  <span style={{fontFamily:mono,fontSize:9,color:pipsColor(s.pips)}}>{s.pips>0?'+':''}{s.pips.toFixed(0)}p</span>
                  <span style={{fontFamily:mono,fontSize:9,color:plColor(s.pl)}}>${s.pl.toFixed(0)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {Object.keys(momStats).length > 0 && (
        <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 14px'}}>
          <div style={{fontFamily:orb,fontSize:10,fontWeight:700,color:'#00ff9f',letterSpacing:3,marginBottom:8}}>SIGNAL ACCURACY BY MOMENTUM</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {Object.entries(momStats).map(([m,s])=>{ const wr=((s.wins/s.count)*100).toFixed(0); return (
              <div key={m} style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:6,padding:'7px 12px',minWidth:100}}>
                <div style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{m}</div>
                <div style={{fontFamily:orb,fontSize:16,fontWeight:700,color:parseInt(wr)>=55?'#00ff9f':parseInt(wr)>=45?'#ffd166':'#ff4d6d'}}>{wr}%</div>
                <div style={{fontFamily:mono,fontSize:8,color:'var(--text-muted)'}}>{s.count} trades</div>
              </div>
            );})}
          </div>
        </div>
      )}
    </div>
  );
}

export default function JournalPage() {
  const [tab, setTab] = useState('JOURNAL');
  const [trades, setTrades] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [user, setUser] = useState(null);
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterDir, setFilterDir] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortKey, setSortKey] = useState('entry_time');
  const [sortDir, setSortDir] = useState('desc');
  const [hiddenCols, setHiddenCols] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const ALL_COLS = ['#','PAIR','DIR','VOLUME','ENTRY','EXIT','SL','TP','P/L $','P/L PIPS','ENTRY TIME','EXIT TIME','DURATION','GAP@ENTRY','MOMENTUM','STRATEGY','SOURCE','NOTES','ACTION'];

  const loadTrades = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/journal?limit=500';
      if (filterSymbol) url += `&symbol=${filterSymbol}`;
      if (filterDir) url += `&direction=${filterDir}`;
      if (filterStatus) url += `&status=${filterStatus}`;
      const res = await fetch(url);
      if (res.status === 401) { window.location.href='/login'; return; }
      if (res.status === 403) { window.location.href='/dashboard'; return; }
      setTrades(await res.json());
    } catch {}
    setLoading(false);
  }, [filterSymbol, filterDir, filterStatus]);

  const loadStrategies = useCallback(async () => {
    try { const res = await fetch('/api/strategies'); if(res.ok) setStrategies(await res.json()); } catch {}
  }, []);

  useEffect(() => {
    fetch('/api/me').then(r=>r.json()).then(d => {
      setUser(d); if (d.role === 'admin') setIsAdmin(true);
      if (!d.feature_access?.includes('journal') && d.role !== 'admin' && d.role !== 'vip') window.location.href = '/dashboard';
    }).catch(() => { window.location.href = '/login'; });
    loadTrades(); loadStrategies();
  }, [loadTrades, loadStrategies]);

  let sorted = [...trades];
  sorted.sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (sortKey === 'entry_time' || sortKey === 'exit_time') { av = av ? new Date(av) : 0; bv = bv ? new Date(bv) : 0; }
    if (sortKey === 'profit_loss' || sortKey === 'profit_loss_pips') { av = parseFloat(av)||0; bv = parseFloat(bv)||0; }
    return sortDir === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
  });

  function toggleSort(key) { if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSortKey(key); setSortDir('desc'); } }
  function toggleCol(col) { setHiddenCols(h => h.includes(col) ? h.filter(c=>c!==col) : [...h, col]); }
  async function deleteTrade(id) { if (!confirm('Delete this trade?')) return; await fetch('/api/journal', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) }); loadTrades(); }
  async function clearAllTrades() { if (!confirm('Delete ALL your trades? This cannot be undone.')) return; const res = await fetch('/api/journal', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ clearAll: true }) }); const d = await res.json(); if (d.ok) { alert('All trades deleted!'); loadTrades(); } else alert('Error: ' + d.error); }
  function downloadCSV() {
    const visibleCols = ALL_COLS.filter(c => !hiddenCols.includes(c) && c !== '#' && c !== 'ACTION');
    const colMap = {'PAIR':'symbol','DIR':'direction','VOLUME':'volume','ENTRY':'entry_price','EXIT':'exit_price','SL':'sl','TP':'tp','P/L $':'profit_loss','P/L PIPS':'profit_loss_pips','ENTRY TIME':'entry_time','EXIT TIME':'exit_time','GAP@ENTRY':'gap_at_entry','MOMENTUM':'momentum_at_entry','STRATEGY':'strategy_name','SOURCE':'source','NOTES':'notes'};
    const rows = [visibleCols.join(',')];
    sorted.forEach(t => { const vals = visibleCols.map(c => { const key = colMap[c]; if (!key) return ''; const v = t[key]; if (c==='ENTRY TIME'||c==='EXIT TIME') return v ? new Date(v).toLocaleString() : ''; if (c==='DURATION') { if (!t.entry_time||!t.exit_time) return ''; return `${Math.round((new Date(t.exit_time)-new Date(t.entry_time))/60000)}m`; } return v !== null && v !== undefined ? `"${v}"` : ''; }); rows.push(vals.join(',')); });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' })); a.download = `panda_journal_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  }

  const hdr = {padding:'8px 10px',fontFamily:mono,fontSize:9,letterSpacing:2,color:'var(--text-muted)',textAlign:'left',borderBottom:'1px solid var(--border)',fontWeight:400,cursor:'pointer',whiteSpace:'nowrap'};
  const tdc = {padding:'8px 10px',fontFamily:raj,fontSize:13,color:'var(--text-secondary)',verticalAlign:'middle',whiteSpace:'nowrap'};

  return (
    <>
      <Head><title>PANDA - TRADE JOURNAL</title><meta charSet="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></Head>
      {showAdd && <AddTradeModal strategies={strategies} onClose={()=>setShowAdd(false)} onAdded={()=>{setShowAdd(false);loadTrades();}}/>}
      <div style={{minHeight:'100vh',background:'var(--bg-primary)',display:'flex',flexDirection:'column'}}>
        <div style={{position:'fixed',inset:0,backgroundImage:'linear-gradient(var(--grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--grid-line) 1px,transparent 1px)',backgroundSize:'40px 40px',pointerEvents:'none',zIndex:0}}/>

        <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 20px',background:'var(--bg-secondary)',borderBottom:'1px solid var(--border)',position:'sticky',top:0,zIndex:100}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:22}}>🐼</span>
            <div><div style={{fontFamily:orb,fontWeight:900,fontSize:13,letterSpacing:4,color:'#ffd166'}}>TRADE JOURNAL</div><div style={{fontFamily:mono,fontSize:8,letterSpacing:3,color:'var(--text-muted)'}}>{user?.username} · {user?.role?.toUpperCase()}</div></div>
          </div>
          <div style={{display:'flex',gap:7,alignItems:'center'}}>
            <ThemeToggle />
            <button onClick={()=>window.location.href='/dashboard'} style={{background:'rgba(0,255,159,0.08)',border:'1px solid #00ff9f44',borderRadius:5,color:'#00ff9f',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>DASHBOARD</button>
            {isAdmin&&<button onClick={()=>window.location.href='/admin'} style={{background:'rgba(255,209,102,0.08)',border:'1px solid #ffd16644',borderRadius:5,color:'#ffd166',fontFamily:mono,fontSize:9,padding:'5px 10px',cursor:'pointer'}}>ADMIN</button>}
          </div>
        </header>

        <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 20px',zIndex:1}}>
          <div style={{display:'flex',background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:7,overflow:'hidden'}}>
            {['JOURNAL','STATS','GAMEPLAY'].map((t,i)=>(
              <button key={t} onClick={()=>setTab(t)} style={{background:tab===t?'rgba(255,209,102,0.15)':'transparent',border:'none',borderRight:i<2?'1px solid var(--border)':'none',color:tab===t?'#ffd166':'var(--text-muted)',fontFamily:mono,fontSize:9,letterSpacing:2,padding:'7px 16px',cursor:'pointer'}}>{t}</button>
            ))}
          </div>
          {tab==='JOURNAL'&&<>
            <button onClick={()=>setShowAdd(true)} style={{background:'rgba(0,255,159,0.1)',border:'1px solid #00ff9f',borderRadius:5,color:'#00ff9f',fontFamily:mono,fontSize:9,letterSpacing:2,padding:'6px 14px',cursor:'pointer'}}>+ LOG TRADE</button>
            <button onClick={downloadCSV} style={{background:'rgba(0,180,255,0.08)',border:'1px solid #00b4ff44',borderRadius:5,color:'#00b4ff',fontFamily:mono,fontSize:9,letterSpacing:2,padding:'6px 14px',cursor:'pointer'}}>DOWNLOAD CSV</button>
            <button onClick={clearAllTrades} style={{background:'rgba(255,77,109,0.08)',border:'1px solid #ff4d6d44',borderRadius:5,color:'#ff4d6d',fontFamily:mono,fontSize:9,letterSpacing:2,padding:'6px 14px',cursor:'pointer'}}>CLEAR ALL TRADES</button>
          </>}
        </div>

        <div style={{flex:1,padding:'0 20px 20px',zIndex:1,display:'flex',flexDirection:'column',gap:12}}>
          {tab==='JOURNAL'&&<>
            <FileUpload onUploaded={loadTrades}/>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
              <select style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:5,padding:'6px 10px',color:'var(--text-secondary)',fontFamily:mono,fontSize:9,cursor:'pointer'}} value={filterSymbol} onChange={e=>setFilterSymbol(e.target.value)}><option value="">ALL PAIRS</option>{ALL_PAIRS.map(p=><option key={p} value={p}>{p}</option>)}</select>
              <select style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:5,padding:'6px 10px',color:'var(--text-secondary)',fontFamily:mono,fontSize:9,cursor:'pointer'}} value={filterDir} onChange={e=>setFilterDir(e.target.value)}><option value="">ALL DIRECTIONS</option><option value="BUY">BUY</option><option value="SELL">SELL</option></select>
              <select style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:5,padding:'6px 10px',color:'var(--text-secondary)',fontFamily:mono,fontSize:9,cursor:'pointer'}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}><option value="">ALL STATUS</option><option value="OPEN">OPEN</option><option value="CLOSED">CLOSED</option></select>
              <span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{sorted.length} trades</span>
              <div style={{marginLeft:'auto',display:'flex',gap:4,flexWrap:'wrap'}}>
                {['SL','TP','COMMISSION','SWAP','SOURCE'].map(col=>(
                  <button key={col} onClick={()=>toggleCol(col)} style={{background:hiddenCols.includes(col)?'transparent':'rgba(0,180,255,0.08)',border:`1px solid ${hiddenCols.includes(col)?'var(--border)':'#00b4ff44'}`,borderRadius:4,color:hiddenCols.includes(col)?'var(--text-muted)':'#00b4ff',fontFamily:mono,fontSize:7,padding:'3px 7px',cursor:'pointer'}}>{col}</button>
                ))}
              </div>
            </div>
            {loading ? <div style={{textAlign:'center',padding:60,fontFamily:mono,fontSize:11,color:'var(--text-muted)',letterSpacing:3}}>LOADING...</div> : (
              <div style={{overflowX:'auto',borderRadius:10,border:'1px solid var(--border)'}}>
                <table style={{width:'100%',borderCollapse:'collapse',background:'var(--bg-secondary)'}}>
                  <thead><tr style={{background:'var(--bg-hover)'}}>
                    {ALL_COLS.filter(c=>!hiddenCols.includes(c)).map(c=>(
                      <th key={c} style={hdr} onClick={()=>c!=='#'&&c!=='ACTION'&&toggleSort({'PAIR':'symbol','DIR':'direction','P/L $':'profit_loss','P/L PIPS':'profit_loss_pips','ENTRY TIME':'entry_time'}[c]||c.toLowerCase())}>
                        {c}{sortKey===({'PAIR':'symbol','DIR':'direction','P/L $':'profit_loss','P/L PIPS':'profit_loss_pips','ENTRY TIME':'entry_time'}[c]||c.toLowerCase())?sortDir==='desc'?' v':' ^':''}
                      </th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {sorted.length===0
                      ?<tr><td colSpan={ALL_COLS.length} style={{textAlign:'center',padding:40,fontFamily:mono,fontSize:10,color:'var(--text-muted)'}}>NO TRADES YET - Log a trade or import CSV</td></tr>
                      :sorted.map((t,idx)=>{
                        const dur = t.entry_time&&t.exit_time ? Math.round((new Date(t.exit_time)-new Date(t.entry_time))/60000) : null;
                        const stratColor = strategies.find(s=>s.name===t.strategy_name)?.color || 'var(--text-muted)';
                        const colData = {
                          '#':<span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{idx+1}</span>,
                          'PAIR':<span style={{fontFamily:orb,fontSize:11,fontWeight:700,color:'var(--text-primary)'}}>{t.symbol}</span>,
                          'DIR':<span style={{fontFamily:mono,fontSize:10,color:t.direction==='BUY'?'#00ff9f':'#ff4d6d',fontWeight:700}}>{t.direction}</span>,
                          'VOLUME':<span style={{fontFamily:mono,fontSize:10,color:'var(--text-secondary)'}}>{t.volume}</span>,
                          'ENTRY':<span style={{fontFamily:mono,fontSize:10,color:'var(--text-secondary)'}}>{t.entry_price||'-'}</span>,
                          'EXIT':<span style={{fontFamily:mono,fontSize:10,color:'var(--text-secondary)'}}>{t.exit_price||'-'}</span>,
                          'SL':<span style={{fontFamily:mono,fontSize:10,color:'#ff4d6d'}}>{t.sl!=null&&t.sl!==0?t.sl:'-'}</span>,
                          'TP':<span style={{fontFamily:mono,fontSize:10,color:'#00ff9f'}}>{t.tp!=null&&t.tp!==0?t.tp:'-'}</span>,
                          'P/L $':<span style={{fontFamily:orb,fontSize:12,fontWeight:700,color:plColor(t.profit_loss)}}>{t.profit_loss>0?'+':''}{(t.profit_loss||0).toFixed(2)}</span>,
                          'P/L PIPS':<span style={{fontFamily:mono,fontSize:11,color:pipsColor(t.profit_loss_pips)}}>{t.profit_loss_pips>0?'+':''}{(t.profit_loss_pips||0).toFixed(1)}</span>,
                          'ENTRY TIME':<span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{formatDt(t.entry_time)}</span>,
                          'EXIT TIME':<span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{formatDt(t.exit_time)}</span>,
                          'DURATION':<span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{dur?`${dur}m`:'-'}</span>,
                          'GAP@ENTRY':<span style={{fontFamily:mono,fontSize:10,color:t.gap_at_entry>=5?'#00ff9f':t.gap_at_entry<=-5?'#ff4d6d':'var(--text-muted)'}}>{t.gap_at_entry!==null?`${t.gap_at_entry>0?'+':''}${t.gap_at_entry}`:'-'}</span>,
                          'MOMENTUM':<span style={{fontFamily:mono,fontSize:9,color:'var(--text-muted)'}}>{t.momentum_at_entry||'-'}</span>,
                          'STRATEGY':t.strategy_name?<span style={{fontFamily:mono,fontSize:9,color:stratColor,background:stratColor+'18',border:`1px solid ${stratColor}33`,borderRadius:3,padding:'1px 5px'}}>{t.strategy_name}</span>:<span style={{color:'var(--text-muted)'}}>-</span>,
                          'SOURCE':<span style={{fontFamily:mono,fontSize:8,color:t.source==='ctrader'?'#00b4ff':'var(--text-muted)'}}>{t.source==='ctrader'?'cTrader':'manual'}</span>,
                          'NOTES':<span style={{fontFamily:raj,fontSize:12,color:'var(--text-muted)',maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',display:'block'}}>{t.notes||'-'}</span>,
                          'ACTION':t.source==='manual'?<button onClick={()=>deleteTrade(t.id)} style={{background:'rgba(255,77,109,0.08)',border:'1px solid #ff4d6d44',borderRadius:4,color:'#ff4d6d',fontFamily:mono,fontSize:8,padding:'3px 7px',cursor:'pointer'}}>DEL</button>:<span style={{color:'var(--text-muted)',fontFamily:mono,fontSize:8}}>sync</span>,
                        };
                        return (
                          <tr key={t.id||idx} style={{borderBottom:'1px solid var(--border)',background:(t.profit_loss||0)>0?'rgba(0,255,159,0.01)':'rgba(255,77,109,0.01)'}}>
                            {ALL_COLS.filter(c=>!hiddenCols.includes(c)).map(c=><td key={c} style={tdc}>{colData[c]}</td>)}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </>}
          {tab==='STATS'&&(loading?<div style={{textAlign:'center',padding:60,fontFamily:mono,fontSize:11,color:'var(--text-muted)'}}>LOADING...</div>:<JournalStats trades={trades}/>)}
          {tab==='GAMEPLAY'&&<StrategyManager strategies={strategies} onRefresh={loadStrategies}/>}
        </div>
      </div>
      <style>{`
        button:hover{opacity:0.8;}
        select option{background:var(--bg-secondary);}
        input:focus,select:focus,textarea:focus{outline:none;border-color:#00b4ff!important;}
        tr:hover td{background:rgba(0,180,255,0.02)!important;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-track{background:var(--bg-primary);}
        ::-webkit-scrollbar-thumb{background:var(--border-bright);border-radius:2px;}
      `}</style>
    </>
  );
}