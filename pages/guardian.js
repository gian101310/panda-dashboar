import Head from 'next/head';
import { useCallback, useEffect, useState } from 'react';
import { requireAdmin } from '../lib/auth';

const mono = "'Share Tech Mono',monospace";
const orb = "'Orbitron',sans-serif";
const raj = "'Rajdhani',sans-serif";

function money(v) { return Number(v || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' }); }

function stateColor(state) {
  if (state === 'GREEN') return '#00ff9f';
  if (state === 'YELLOW') return '#ffd166';
  return '#ff4d6d';
}

function StatCard({ label, value, color = '#c8ddf0', sub }) {
  return (
    <div style={{ background: 'rgba(8,14,28,0.92)', border: '1px solid rgba(80,110,160,0.25)', borderRadius: 8, padding: '12px 14px', minWidth: 120 }}>
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: 'rgba(200,221,240,0.55)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: orb, fontSize: 16, fontWeight: 900, color }}>{value}</div>
      {sub && <div style={{ fontFamily: mono, fontSize: 9, color: 'rgba(200,221,240,0.55)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function ModeToggle({ mode, onToggle, loading }) {
  const isAuto = mode === 'AUTO';
  return (
    <button
      onClick={onToggle}
      disabled={loading}
      style={{
        background: isAuto ? 'rgba(0,255,159,0.15)' : 'rgba(255,209,102,0.15)',
        border: `2px solid ${isAuto ? '#00ff9f' : '#ffd166'}`,
        borderRadius: 8,
        padding: '12px 24px',
        cursor: 'pointer',
        color: isAuto ? '#00ff9f' : '#ffd166',
        fontFamily: orb,
        fontSize: 14,
        fontWeight: 900,
        letterSpacing: 2,
        transition: 'all 0.3s',
      }}
    >
      {loading ? '...' : isAuto ? '⚡ AUTO MODE' : '🖐 MANUAL MODE'}
    </button>
  );
}

function SetupCard({ setup, onExecute, executing }) {
  const sideColor = setup.bias === 'BUY' ? '#00ff9f' : '#ff4d6d';
  return (
    <div style={{
      background: 'rgba(8,14,28,0.92)',
      border: `1px solid ${sideColor}33`,
      borderRadius: 8,
      padding: 14,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    }}>
      <div>
        <div style={{ fontFamily: orb, fontSize: 14, fontWeight: 900, color: '#c8ddf0' }}>
          {setup.symbol} <span style={{ color: sideColor }}>{setup.bias}</span>
        </div>
        <div style={{ fontFamily: mono, fontSize: 10, color: 'rgba(200,221,240,0.6)', marginTop: 4 }}>
          Gap: {setup.gap} | Entry: {setup.pl_price || setup.pl_st || '—'}
        </div>
      </div>
      <button
        onClick={() => onExecute(setup)}
        disabled={executing}
        style={{
          background: 'rgba(0,255,159,0.12)',
          border: '1px solid #00ff9f',
          borderRadius: 6,
          padding: '8px 16px',
          color: '#00ff9f',
          fontFamily: mono,
          fontSize: 11,
          cursor: 'pointer',
          fontWeight: 700,
        }}
      >
        {executing ? 'EXECUTING...' : 'EXECUTE'}
      </button>
    </div>
  );
}

function NotificationCard({ notif }) {
  const sideColor = notif.direction === 'BUY' ? '#00ff9f' : '#ff4d6d';
  return (
    <div style={{
      background: 'rgba(255,209,102,0.05)',
      border: '1px solid rgba(255,209,102,0.3)',
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
    }}>
      <div style={{ fontFamily: orb, fontSize: 12, color: '#ffd166' }}>
        🎯 {notif.symbol} <span style={{ color: sideColor }}>{notif.direction}</span> | {notif.strategy}
      </div>
      <div style={{ fontFamily: mono, fontSize: 10, color: 'rgba(200,221,240,0.6)', marginTop: 4 }}>
        Entry: {notif.entry_price} | SL: {notif.sl_price} | TP: {notif.tp_price} | R:R {notif.risk_reward}:1
      </div>
      <div style={{ fontFamily: mono, fontSize: 9, color: 'rgba(200,221,240,0.4)', marginTop: 2 }}>
        Status: {notif.status} | {new Date(notif.created_at).toLocaleTimeString()}
      </div>
    </div>
  );
}

function CommandButton({ label, command, description, onResult }) {
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    onResult?.({ command, status: 'running' });
    try {
      const res = await fetch('/api/run-command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const data = await res.json();
      onResult?.({ command, status: data.success ? 'success' : 'error', output: data.output, error: data.error || data.error });
    } catch (e) {
      onResult?.({ command, status: 'error', error: e.message });
    }
    setRunning(false);
  };

  return (
    <button onClick={run} disabled={running} style={{
      background: running ? 'rgba(0,255,159,0.08)' : 'rgba(8,14,28,0.92)',
      border: `1px solid ${running ? '#00ff9f' : 'rgba(80,110,160,0.3)'}`,
      borderRadius: 6,
      padding: '8px 12px',
      color: running ? '#00ff9f' : '#c8ddf0',
      fontFamily: mono,
      fontSize: 10,
      cursor: running ? 'wait' : 'pointer',
      textAlign: 'left',
      width: '100%',
      transition: 'all 0.2s',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{running ? '⏳ RUNNING...' : label}</div>
      <div style={{ color: 'rgba(200,221,240,0.5)', fontSize: 9 }}>{description}</div>
    </button>
  );
}

function OutputPanel({ result }) {
  if (!result) return null;
  const color = result.status === 'success' ? '#00ff9f' : result.status === 'error' ? '#ff4d6d' : '#ffd166';
  return (
    <div style={{ background: 'rgba(8,14,28,0.95)', border: `1px solid ${color}33`, borderRadius: 8, padding: 12, marginBottom: 16 }}>
      <div style={{ fontFamily: mono, fontSize: 10, color, marginBottom: 6 }}>
        {result.status === 'running' ? '⏳' : result.status === 'success' ? '✅' : '❌'} npm run {result.command}
      </div>
      {result.output && (
        <pre style={{ fontFamily: mono, fontSize: 9, color: 'rgba(200,221,240,0.7)', margin: 0, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
          {result.output}
        </pre>
      )}
      {result.error && (
        <pre style={{ fontFamily: mono, fontSize: 9, color: '#ff4d6d', margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
          {result.error}
        </pre>
      )}
    </div>
  );
}

export default function GuardianPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [executing, setExecuting] = useState(null);
  const [cmdResult, setCmdResult] = useState(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/guardian-execute');
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, [fetchState]);

  const toggleMode = async () => {
    setToggling(true);
    try {
      const res = await fetch('/api/guardian-execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_mode' }),
      });
      if (res.ok) {
        const result = await res.json();
        setData(d => d ? { ...d, mode: result.mode } : d);
      }
    } catch {}
    setToggling(false);
  };

  const executeSetup = async (setup) => {
    setExecuting(setup.symbol);
    try {
      await fetch('/api/guardian-execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'execute', symbol: setup.symbol, direction: setup.bias }),
      });
      // Refresh state
      await fetchState();
    } catch {}
    setExecuting(null);
  };

  // Request browser notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Browser push when new notification arrives
  useEffect(() => {
    if (!data?.notifications?.length) return;
    const pending = data.notifications.filter(n => n.status === 'PENDING');
    if (pending.length && 'Notification' in window && Notification.permission === 'granted') {
      const latest = pending[0];
      new Notification(`🎯 ${latest.symbol} ${latest.direction}`, {
        body: `Entry: ${latest.entry_price} | R:R ${latest.risk_reward}:1\nClick Guardian to execute`,
        icon: '/favicon.ico',
      });
    }
  }, [data?.notifications]);

  const snapshot = data?.snapshot;
  const guardianState = snapshot?.guardian_state || 'UNKNOWN';

  return (
    <>
      <Head>
        <title>Guardian Command Center | Panda Engine</title>
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Rajdhani:wght@400;500;700&display=swap" rel="stylesheet" />
      </Head>
      <div style={{ minHeight: '100vh', background: '#060b14', color: '#c8ddf0', padding: '20px 24px', fontFamily: raj }}>
        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: orb, fontSize: 20, fontWeight: 900, margin: 0, color: stateColor(guardianState) }}>
              GUARDIAN COMMAND CENTER
            </h1>
            <div style={{ fontFamily: mono, fontSize: 10, color: 'rgba(200,221,240,0.5)', marginTop: 4 }}>
              Last updated: {data?.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : '—'}
            </div>
          </div>
          <ModeToggle mode={data?.mode || 'MANUAL'} onToggle={toggleMode} loading={toggling} />
        </div>

        {loading && <div style={{ fontFamily: mono, color: 'rgba(200,221,240,0.5)' }}>Loading...</div>}

        {!loading && (
          <>
            {/* GUARDIAN STATE CARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
              <StatCard label="GUARDIAN" value={guardianState} color={stateColor(guardianState)} sub={snapshot?.mode || ''} />
              <StatCard label="BALANCE" value={money(snapshot?.balance)} />
              <StatCard label="EQUITY" value={money(snapshot?.equity)} />
              <StatCard label="DAILY LEFT" value={money(snapshot?.daily_remaining)} color={snapshot?.daily_remaining < 1500 ? '#ffd166' : '#00ff9f'} />
              <StatCard label="MAX LEFT" value={money(snapshot?.max_loss_remaining)} color={snapshot?.max_loss_remaining < 2000 ? '#ffd166' : '#00ff9f'} />
              <StatCard label="POSITIONS" value={snapshot?.open_positions?.length || 0} />
              <StatCard label="PENDING" value={snapshot?.pending_orders?.length || 0} />
              <StatCard label="STATS GATE" value={snapshot?.stats_gate || 'N/A'} color={stateColor(snapshot?.stats_gate || 'GREEN')} sub={`mult: ${snapshot?.risk_multiplier ?? 1.0}x`} />
            </div>

            {/* BLOCKERS + WARNINGS */}
            {(snapshot?.blockers?.length > 0 || snapshot?.warnings?.length > 0) && (
              <div style={{ background: 'rgba(255,77,109,0.05)', border: '1px solid rgba(255,77,109,0.2)', borderRadius: 8, padding: 12, marginBottom: 20 }}>
                {snapshot.blockers?.map((b, i) => (
                  <div key={i} style={{ fontFamily: mono, fontSize: 10, color: '#ff4d6d' }}>🚫 {b}</div>
                ))}
                {snapshot.warnings?.map((w, i) => (
                  <div key={i} style={{ fontFamily: mono, fontSize: 10, color: '#ffd166' }}>⚠️ {w}</div>
                ))}
              </div>
            )}

            {/* PENDING NOTIFICATIONS */}
            {data?.notifications?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontFamily: orb, fontSize: 12, letterSpacing: 2, color: '#ffd166', marginBottom: 10 }}>PENDING SIGNALS</h3>
                {data.notifications.map((n, i) => <NotificationCard key={i} notif={n} />)}
              </div>
            )}

            {/* ACTIVE SETUPS - EXECUTE BUTTONS */}
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontFamily: orb, fontSize: 12, letterSpacing: 2, color: '#c8ddf0', marginBottom: 10 }}>ACTIVE SETUPS</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                {data?.activeSetups?.length ? (
                  data.activeSetups.map((s, i) => (
                    <SetupCard key={i} setup={s} onExecute={executeSetup} executing={executing === s.symbol} />
                  ))
                ) : (
                  <div style={{ fontFamily: mono, fontSize: 10, color: 'rgba(200,221,240,0.5)', padding: 20 }}>No active setups</div>
                )}
              </div>
            </div>

            {/* COMMAND OUTPUT */}
            <OutputPanel result={cmdResult} />

            {/* COMMAND PALETTE */}
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontFamily: orb, fontSize: 12, letterSpacing: 2, color: '#c8ddf0', marginBottom: 10 }}>COMMANDS</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                <CommandButton label="▶ RUN AUTO LOOP" command="auto:loop" description="Single pass: scan → guardian → execute/notify" onResult={setCmdResult} />
                <CommandButton label="▶ DAEMON MODE" command="auto:loop -- --daemon" description="Continuous loop every 5 min" onResult={setCmdResult} />
                <CommandButton label="🔄 REFRESH GUARDIAN" command="account:guardian -- --write" description="Refresh guardian state to Supabase" onResult={setCmdResult} />
                <CommandButton label="📈 SCORE ENGINE" command="plot:engine-pb" description="Score all 28 pairs → dashboard table" onResult={setCmdResult} />
                <CommandButton label="📈 CHART ANNOTATE" command="chart:annotate -- --draw" description="Draw entry/SL/TP on valid setups" onResult={setCmdResult} />
                <CommandButton label="🎯 EXECUTE PB" command="execute:engine-pb -- --approve" description="Execute best PB setup now" onResult={setCmdResult} />
                <CommandButton label="⚡ MARKET ORDER" command="market:order -- --approve" description="Instant market entry" onResult={setCmdResult} />
                <CommandButton label="🔴 KILL SWITCH" command="killswitch -- --confirm" description="Emergency close ALL positions" onResult={setCmdResult} />
                <CommandButton label="🔄 BREAKEVEN" command="breakeven -- --approve" description="Move winning SLs to breakeven" onResult={setCmdResult} />
                <CommandButton label="📋 JOURNAL SYNC" command="journal:sync -- --write" description="Sync closed trades to Supabase" onResult={setCmdResult} />
                <CommandButton label="🔔 ALERTS" command="alerts -- --apply" description="Create guardian + entry zone alerts" onResult={setCmdResult} />
                <CommandButton label="📊 ACCOUNT REPORT" command="account:report" description="Full account dump" onResult={setCmdResult} />
                <CommandButton label="🔍 SYMBOL SCAN" command="scan:symbols -- --quotes" description="Live quotes for 28 pairs" onResult={setCmdResult} />
              </div>
            </div>

            {/* MODE EXPLANATION */}
            <div style={{ background: 'rgba(8,14,28,0.92)', border: '1px solid rgba(80,110,160,0.2)', borderRadius: 8, padding: 14 }}>
              <div style={{ fontFamily: orb, fontSize: 11, color: '#c8ddf0', marginBottom: 8 }}>HOW IT WORKS</div>
              <div style={{ fontFamily: mono, fontSize: 10, color: 'rgba(200,221,240,0.6)', lineHeight: 1.6 }}>
                <strong style={{ color: '#00ff9f' }}>AUTO:</strong> Loop scans every 5 min → finds valid PB setup → checks Guardian + Margin → places order → notifies you after.<br/>
                <strong style={{ color: '#ffd166' }}>MANUAL:</strong> Loop scans → finds setup → sends Telegram + browser notification → you click EXECUTE here or reply to Hermes.<br/>
                <strong>Charts:</strong> Regardless of mode, valid setups auto-open the chart and draw entry/SL/TP lines.<br/>
                <strong>Safety:</strong> Guardian RED = no execution. Margin insufficient = blocked. Stats gate bad = risk reduced or locked.
              </div>
            </div>
          </>
        )}
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
