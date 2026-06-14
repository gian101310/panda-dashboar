import Head from 'next/head';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { requireAdmin } from '../lib/auth';

const mono = "'Share Tech Mono',monospace";
const orb = "'Orbitron',sans-serif";
const raj = "'Rajdhani',sans-serif";

function money(value) {
  const n = Number(value || 0);
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function num(value, digits = 2) {
  const n = Number(value || 0);
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function stateStyle(state) {
  if (state === 'GREEN') return { color: '#00ff9f', bg: 'rgba(0,255,159,0.08)', border: 'rgba(0,255,159,0.35)' };
  if (state === 'YELLOW') return { color: '#ffd166', bg: 'rgba(255,209,102,0.08)', border: 'rgba(255,209,102,0.35)' };
  return { color: '#ff4d6d', bg: 'rgba(255,77,109,0.08)', border: 'rgba(255,77,109,0.35)' };
}

function Card({ label, value, color = '#c8ddf0', sub }) {
  return (
    <div style={{ background: 'rgba(8,14,28,0.92)', border: '1px solid rgba(80,110,160,0.25)', borderRadius: 8, padding: '12px 14px', minHeight: 74 }}>
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: 'rgba(200,221,240,0.55)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: orb, fontSize: 18, fontWeight: 900, color }}>{value}</div>
      {sub && <div style={{ fontFamily: mono, fontSize: 9, color: 'rgba(200,221,240,0.55)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function PositionTable({ positions }) {
  if (!positions?.length) {
    return <div style={{ fontFamily: mono, color: 'rgba(200,221,240,0.55)', fontSize: 10, padding: 20 }}>NO OPEN POSITIONS</div>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>{['SYMBOL', 'SIDE', 'VOL', 'PIPS', 'NET', 'SL', 'TP', 'OPENED'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {positions.map(p => {
            const profit = Number(p.netProfit || 0);
            const side = String(p.tradeSide || '').toUpperCase();
            const sideColor = side === 'BUY' ? '#00ff9f' : '#ff4d6d';
            return (
              <tr key={p.id} style={{ borderTop: '1px solid rgba(80,110,160,0.18)' }}>
                <td style={tdStrong}>{p.symbolName}</td>
                <td style={{ ...td, color: sideColor }}>{side}</td>
                <td style={td}>{p.volume}</td>
                <td style={{ ...td, color: Number(p.pips || 0) >= 0 ? '#00ff9f' : '#ff4d6d' }}>{num(p.pips, 1)}</td>
                <td style={{ ...td, color: profit >= 0 ? '#00ff9f' : '#ff4d6d' }}>{money(profit)}</td>
                <td style={{ ...td, color: p.stopLoss == null ? '#ff4d6d' : '#c8ddf0' }}>{p.stopLoss ?? 'MISSING'}</td>
                <td style={td}>{p.takeProfit ?? '-'}</td>
                <td style={td}>{p.openTime ? new Date(p.openTime).toLocaleString() : '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OrderTable({ orders }) {
  if (!orders?.length) {
    return <div style={{ fontFamily: mono, color: 'rgba(200,221,240,0.55)', fontSize: 10, padding: 20 }}>NO PENDING ORDERS</div>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>{['SYMBOL', 'SIDE', 'TYPE', 'VOL', 'ENTRY', 'SL', 'TP'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {orders.map(o => {
            const side = String(o.tradeSide || '').toUpperCase();
            return (
              <tr key={o.id} style={{ borderTop: '1px solid rgba(80,110,160,0.18)' }}>
                <td style={tdStrong}>{o.symbolName}</td>
                <td style={{ ...td, color: side === 'BUY' ? '#00ff9f' : '#ff4d6d' }}>{side}</td>
                <td style={td}>{o.orderType}</td>
                <td style={td}>{o.volume}</td>
                <td style={td}>{o.targetPrice}</td>
                <td style={{ ...td, color: o.stopLoss == null ? '#ff4d6d' : '#c8ddf0' }}>{o.stopLoss ?? 'MISSING'}</td>
                <td style={td}>{o.takeProfit ?? '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const th = { fontFamily: mono, fontSize: 9, letterSpacing: 2, color: 'rgba(200,221,240,0.55)', textAlign: 'left', padding: '9px 10px', whiteSpace: 'nowrap' };
const td = { fontFamily: mono, fontSize: 10, color: '#c8ddf0', padding: '9px 10px', whiteSpace: 'nowrap' };
const tdStrong = { ...td, fontFamily: orb, fontWeight: 800, letterSpacing: 1 };

export default function AccountGuardianPage() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/account-guardian');
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const body = await res.json();
      setSnapshot(body.snapshot || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  const state = snapshot?.guardian_state || 'RED';
  const style = stateStyle(state);
  const positions = useMemo(() => Array.isArray(snapshot?.open_positions) ? snapshot.open_positions : [], [snapshot]);
  const orders = useMemo(() => Array.isArray(snapshot?.pending_orders) ? snapshot.pending_orders : [], [snapshot]);
  const missingSl = positions.filter(p => p.stopLoss == null).length;

  return (
    <>
      <Head>
        <title>PANDA ACCOUNT GUARDIAN</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <div style={{ minHeight: '100vh', background: '#050914', color: '#c8ddf0', fontFamily: raj }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(80,110,160,0.25)', background: '#080e1c', position: 'sticky', top: 0, zIndex: 10 }}>
          <div>
            <div style={{ fontFamily: orb, color: '#00ff9f', letterSpacing: 4, fontSize: 14, fontWeight: 900 }}>ACCOUNT GUARDIAN</div>
            <div style={{ fontFamily: mono, color: 'rgba(200,221,240,0.55)', fontSize: 9, letterSpacing: 2, marginTop: 3 }}>FUNDED CHALLENGE RISK MONITOR</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={button}>REFRESH</button>
            <button onClick={() => window.location.href = '/dashboard'} style={button}>DASHBOARD</button>
          </div>
        </header>

        <main style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading && !snapshot && <div style={{ fontFamily: mono, padding: 40, color: 'rgba(200,221,240,0.55)' }}>LOADING ACCOUNT GUARDIAN...</div>}
          {error && <div style={{ fontFamily: mono, padding: 14, color: '#ff4d6d', border: '1px solid rgba(255,77,109,0.35)', borderRadius: 8 }}>{error}</div>}
          {!loading && !snapshot && !error && (
            <div style={{ fontFamily: mono, padding: 20, color: '#ffd166', border: '1px solid rgba(255,209,102,0.35)', borderRadius: 8 }}>
              NO GUARDIAN SNAPSHOT YET. RUN npm run account:guardian -- --write AFTER APPLYING THE SUPABASE TABLE SQL.
            </div>
          )}

          {snapshot && (
            <>
              <section style={{ background: style.bg, border: `1px solid ${style.border}`, borderRadius: 8, padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: mono, color: 'rgba(200,221,240,0.65)', fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>GUARDIAN STATE</div>
                  <div style={{ fontFamily: orb, color: style.color, fontSize: 28, letterSpacing: 4, fontWeight: 900 }}>{state}</div>
                  <div style={{ fontFamily: mono, color: 'rgba(200,221,240,0.65)', fontSize: 10, marginTop: 5 }}>MODE {snapshot.mode || 'LOCKED'} | UPDATED {new Date(snapshot.created_at).toLocaleString()}</div>
                </div>
                <div style={{ fontFamily: mono, color: style.color, fontSize: 11, letterSpacing: 2 }}>
                  {state === 'GREEN' ? 'AUTOMATION ELIGIBLE' : 'AUTOMATION BLOCKED'}
                </div>
              </section>

              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
                <Card label="BALANCE" value={money(snapshot.balance)} color="#c8ddf0" />
                <Card label="EQUITY" value={money(snapshot.equity)} color={Number(snapshot.equity || 0) >= Number(snapshot.balance || 0) ? '#00ff9f' : '#ff4d6d'} />
                <Card label="OPEN NET" value={money(snapshot.net_profit)} color={Number(snapshot.net_profit || 0) >= 0 ? '#00ff9f' : '#ff4d6d'} />
                <Card label="DAILY ROOM" value={money(snapshot.daily_remaining)} color={Number(snapshot.daily_remaining || 0) >= 1500 ? '#00ff9f' : '#ffd166'} sub={`${money(snapshot.daily_loss_used)} used`} />
                <Card label="MAX LOSS ROOM" value={money(snapshot.max_loss_remaining)} color={Number(snapshot.max_loss_remaining || 0) >= 2000 ? '#00ff9f' : '#ffd166'} sub={`${money(snapshot.max_loss_used)} used`} />
                <Card label="MISSING SL" value={missingSl} color={missingSl ? '#ff4d6d' : '#00ff9f'} />
              </section>

              <section style={panel}>
                <div style={panelTitle}>BLOCKERS</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(snapshot.blockers || []).length ? snapshot.blockers.map(b => <span key={b} style={pill('#ff4d6d')}>{b}</span>) : <span style={pill('#00ff9f')}>NONE</span>}
                  {(snapshot.warnings || []).map(w => <span key={w} style={pill('#ffd166')}>{w}</span>)}
                </div>
              </section>

              <section style={panel}>
                <div style={panelTitle}>OPEN POSITIONS</div>
                <PositionTable positions={positions} />
              </section>

              <section style={panel}>
                <div style={panelTitle}>PENDING ORDERS</div>
                <OrderTable orders={orders} />
              </section>
            </>
          )}
        </main>
      </div>
    </>
  );
}

export async function getServerSideProps({ req }) {
  const session = await requireAdmin(req);
  if (!session) {
    return {
      redirect: {
        destination: '/dashboard',
        permanent: false,
      },
    };
  }

  return { props: {} };
}

const button = { background: 'rgba(0,180,255,0.08)', border: '1px solid rgba(0,180,255,0.35)', borderRadius: 5, color: '#00b4ff', fontFamily: mono, fontSize: 9, letterSpacing: 2, padding: '7px 12px', cursor: 'pointer' };
const panel = { background: 'rgba(8,14,28,0.92)', border: '1px solid rgba(80,110,160,0.25)', borderRadius: 8, padding: 14 };
const panelTitle = { fontFamily: orb, color: '#00b4ff', fontSize: 12, letterSpacing: 3, fontWeight: 900, marginBottom: 12 };
function pill(color) {
  return { fontFamily: mono, fontSize: 9, color, background: `${color}14`, border: `1px solid ${color}55`, borderRadius: 4, padding: '4px 8px', letterSpacing: 1 };
}
