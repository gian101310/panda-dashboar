import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

// ===== HELPERS =====
function stateColor(state) {
  if (!state) return '#445566';
  if (state.includes('EXPAND_BULL')) return '#00ff9f';
  if (state.includes('STABLE_BULL')) return '#66ffcc';
  if (state.includes('DEEP_PULLBACK_BULL')) return '#ffd166';
  if (state.includes('PULLBACK_BULL')) return '#ffaa44';
  if (state.includes('EXPAND_BEAR')) return '#ff4d6d';
  if (state.includes('STABLE_BEAR')) return '#ff7090';
  if (state.includes('DEEP_PULLBACK_BEAR')) return '#ff9944';
  if (state.includes('PULLBACK_BEAR')) return '#ffbb66';
  return '#8892aa';
}

function stateBg(state) {
  if (!state) return 'transparent';
  if (state.includes('EXPAND_BULL')) return 'rgba(0,255,159,0.08)';
  if (state.includes('BULL')) return 'rgba(0,255,159,0.04)';
  if (state.includes('EXPAND_BEAR')) return 'rgba(255,77,109,0.08)';
  if (state.includes('BEAR')) return 'rgba(255,77,109,0.04)';
  return 'transparent';
}

function biasFromGap(gap) {
  if (gap === null || gap === undefined) return { label: '—', color: '#445566' };
  if (gap >= 5) return { label: 'BUY', color: '#00ff9f' };
  if (gap <= -5) return { label: 'SELL', color: '#ff4d6d' };
  return { label: 'WAIT', color: '#ffd166' };
}

function strengthBar(value) {
  const max = 30;
  const pct = Math.min(100, Math.round((Math.abs(value || 0) / max) * 100));
  let color = '#445566';
  if (value >= 4) color = '#00ff9f';
  else if (value >= 2) color = '#66ffcc';
  else if (value >= 1) color = '#ffd166';
  else if (value > 0) color = '#ffaa44';
  return { pct, color };
}

function signalIcon(signal) {
  if (signal === 'STRONG') return '🔥';
  if (signal === 'MODERATE') return '⚡';
  return '';
}

function formatTime(dt) {
  if (!dt) return '—';
  try {
    const d = new Date(dt);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return dt;
  }
}

// ===== FILTER OPTIONS =====
const FILTER_OPTIONS = ['ALL', 'BUY', 'SELL', 'STRONG', 'MODERATE'];
const SORT_OPTIONS = [
  { label: 'STRENGTH ↓', value: 'strength_desc' },
  { label: 'STRENGTH ↑', value: 'strength_asc' },
  { label: 'GAP ↓', value: 'gap_desc' },
  { label: 'SYMBOL A-Z', value: 'symbol_asc' },
];

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [sort, setSort] = useState('strength_desc');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/data');
      if (res.status === 401) { router.push('/'); return; }
      if (!res.ok) throw new Error('Failed');
      const d = await res.json();
      setData(d);
      setLastUpdate(new Date());
    } catch {
      // keep old data
    }
    setLoading(false);
    setRefreshing(false);
  }, [router]);

  // Initial fetch
  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(true);
      setTick(t => t + 1);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/');
  }

  // Filter + sort
  let displayed = [...data];

  if (search) {
    displayed = displayed.filter(r => r.symbol?.toLowerCase().includes(search.toLowerCase()));
  }

  if (filter === 'BUY') displayed = displayed.filter(r => r.gap >= 5);
  if (filter === 'SELL') displayed = displayed.filter(r => r.gap <= -5);
  if (filter === 'STRONG') displayed = displayed.filter(r => r.signal === 'STRONG');
  if (filter === 'MODERATE') displayed = displayed.filter(r => r.signal === 'MODERATE');

  if (sort === 'strength_desc') displayed.sort((a, b) => (b.strength || 0) - (a.strength || 0));
  if (sort === 'strength_asc') displayed.sort((a, b) => (a.strength || 0) - (b.strength || 0));
  if (sort === 'gap_desc') displayed.sort((a, b) => (b.gap || 0) - (a.gap || 0));
  if (sort === 'symbol_asc') displayed.sort((a, b) => (a.symbol || '').localeCompare(b.symbol || ''));

  // Stats
  const buyCount = data.filter(r => r.gap >= 5).length;
  const sellCount = data.filter(r => r.gap <= -5).length;
  const strongCount = data.filter(r => r.signal === 'STRONG').length;
  const topSymbol = data.length > 0 ? data[0] : null;

  return (
    <>
      <Head>
        <title>PANDA ENGINE — LIVE DASHBOARD</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={s.page}>
        <div style={s.bgGrid} />

        {/* ===== HEADER ===== */}
        <header style={s.header}>
          <div style={s.headerLeft}>
            <span style={s.headerIcon}>🐼</span>
            <div>
              <div style={s.headerTitle}>PANDA ENGINE</div>
              <div style={s.headerSub}>FOREX INTELLIGENCE · LIVE</div>
            </div>
          </div>

          <div style={s.headerCenter}>
            <div style={s.pulse} />
            <span style={s.liveText}>LIVE</span>
            <span style={s.updateText}>
              {lastUpdate ? `Updated ${formatTime(lastUpdate)}` : 'Loading...'}
            </span>
            {refreshing && <span style={s.refreshSpin}>↻</span>}
          </div>

          <div style={s.headerRight}>
            <button style={s.refreshBtn} onClick={() => fetchData(true)}>⟳ REFRESH</button>
            <button style={s.logoutBtn} onClick={handleLogout}>LOGOUT →</button>
          </div>
        </header>

        {/* ===== STATS BAR ===== */}
        <div style={s.statsBar}>
          <StatCard label="TOTAL PAIRS" value={data.length} color="#00b4ff" />
          <StatCard label="BUY SIGNALS" value={buyCount} color="#00ff9f" />
          <StatCard label="SELL SIGNALS" value={sellCount} color="#ff4d6d" />
          <StatCard label="🔥 STRONG" value={strongCount} color="#ffd166" />
          <StatCard
            label="TOP SIGNAL"
            value={topSymbol ? topSymbol.symbol : '—'}
            color={topSymbol ? stateColor(topSymbol.state) : '#445566'}
            sub={topSymbol ? `STR ${(topSymbol.strength || 0).toFixed(2)}` : ''}
          />
        </div>

        {/* ===== CONTROLS ===== */}
        <div style={s.controls}>
          <div style={s.filters}>
            {FILTER_OPTIONS.map(f => (
              <button
                key={f}
                style={{ ...s.filterBtn, ...(filter === f ? s.filterBtnActive : {}) }}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>

          <input
            style={s.search}
            placeholder="🔍 SEARCH SYMBOL..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <select
            style={s.sortSelect}
            value={sort}
            onChange={e => setSort(e.target.value)}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* ===== TABLE ===== */}
        <div style={s.tableWrap}>
          {loading ? (
            <div style={s.loadingWrap}>
              <div style={s.loadingDot} />
              <span style={s.loadingText}>LOADING MARKET DATA...</span>
            </div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr style={s.thead}>
                  <th style={{ ...s.th, width: 40 }}>#</th>
                  <th style={s.th}>SYMBOL</th>
                  <th style={s.th}>GAP</th>
                  <th style={s.th}>BIAS</th>
                  <th style={{ ...s.th, minWidth: 180 }}>STATE</th>
                  <th style={{ ...s.th, minWidth: 140 }}>STRENGTH</th>
                  <th style={s.th}>SIGNAL</th>
                  <th style={s.th}>UPDATED</th>
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={s.noData}>NO DATA MATCHES FILTER</td>
                  </tr>
                ) : (
                  displayed.map((row, idx) => {
                    const bias = biasFromGap(row.gap);
                    const str = strengthBar(row.strength);
                    return (
                      <tr key={row.symbol} style={{ ...s.row, background: stateBg(row.state) }}>
                        <td style={s.tdIdx}>{idx + 1}</td>
                        <td style={s.tdSymbol}>{row.symbol}</td>
                        <td style={{ ...s.td, fontFamily: "'Share Tech Mono', monospace", color: bias.color }}>
                          {row.gap !== null && row.gap !== undefined ? Number(row.gap).toFixed(1) : '—'}
                        </td>
                        <td style={{ ...s.td }}>
                          <span style={{ ...s.badge, color: bias.color, borderColor: bias.color + '44', background: bias.color + '11' }}>
                            {bias.label}
                          </span>
                        </td>
                        <td style={{ ...s.td, color: stateColor(row.state), fontFamily: "'Share Tech Mono', monospace", fontSize: 12, letterSpacing: 0.5 }}>
                          {row.state || 'NEUTRAL'}
                        </td>
                        <td style={s.td}>
                          <div style={s.barWrap}>
                            <div style={{ ...s.barBg }}>
                              <div style={{ ...s.barFill, width: `${str.pct}%`, background: str.color, boxShadow: `0 0 6px ${str.color}` }} />
                            </div>
                            <span style={{ ...s.barVal, color: str.color }}>
                              {row.strength !== null && row.strength !== undefined ? Number(row.strength).toFixed(2) : '—'}
                            </span>
                          </div>
                        </td>
                        <td style={s.td}>
                          <span style={s.signalIcon}>{signalIcon(row.signal)}</span>
                          {row.signal && row.signal !== 'NONE' && (
                            <span style={{ fontSize: 11, color: '#8892aa', marginLeft: 4, fontFamily: "'Share Tech Mono', monospace", letterSpacing: 1 }}>
                              {row.signal}
                            </span>
                          )}
                        </td>
                        <td style={{ ...s.td, fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#445566' }}>
                          {formatTime(row.updated_at)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        <div style={s.footer}>
          PANDA FOREX ENGINE · AUTO-REFRESH 15s · {displayed.length}/{data.length} PAIRS SHOWN
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        @keyframes dotpulse { 0%,100% { transform:scale(1); opacity:1; } 50% { transform:scale(1.5); opacity:0.5; } }
        tr:hover td { background: rgba(0,180,255,0.03) !important; }
        button:hover { opacity: 0.8; }
        select:focus, input:focus { outline: none; border-color: #00b4ff !important; }
        option { background: #0a0e1a; }
      `}</style>
    </>
  );
}

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{
      background: '#0a0e1a',
      border: '1px solid #1a2540',
      borderRadius: 8,
      padding: '12px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      minWidth: 130,
      flex: 1,
    }}>
      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, letterSpacing: 2, color: '#445566' }}>{label}</div>
      <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 22, fontWeight: 700, color, textShadow: `0 0 12px ${color}66` }}>{value}</div>
      {sub && <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#445566' }}>{sub}</div>}
    </div>
  );
}

const s = {
  page: {
    minHeight: '100vh',
    background: '#050810',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    position: 'relative',
  },
  bgGrid: {
    position: 'fixed',
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(0,180,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,180,255,0.03) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
    zIndex: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 28px',
    background: '#0a0e1a',
    borderBottom: '1px solid #1a2540',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    gap: 16,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  headerIcon: { fontSize: 28, filter: 'drop-shadow(0 0 8px rgba(0,255,159,0.5))' },
  headerTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontWeight: 900,
    fontSize: 16,
    letterSpacing: 4,
    color: '#00ff9f',
    textShadow: '0 0 12px rgba(0,255,159,0.4)',
  },
  headerSub: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    letterSpacing: 3,
    color: '#2a3550',
  },
  headerCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'center',
  },
  pulse: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#00ff9f',
    boxShadow: '0 0 8px #00ff9f',
    animation: 'blink 2s infinite',
  },
  liveText: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    letterSpacing: 3,
    color: '#00ff9f',
  },
  updateText: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: '#445566',
    letterSpacing: 1,
  },
  refreshSpin: {
    color: '#00b4ff',
    animation: 'spin 1s linear infinite',
    display: 'inline-block',
    fontSize: 16,
  },
  headerRight: { display: 'flex', gap: 10 },
  refreshBtn: {
    background: 'transparent',
    border: '1px solid #1e3060',
    borderRadius: 6,
    color: '#00b4ff',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    letterSpacing: 2,
    padding: '7px 14px',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  logoutBtn: {
    background: 'transparent',
    border: '1px solid #2a1525',
    borderRadius: 6,
    color: '#ff4d6d',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    letterSpacing: 2,
    padding: '7px 14px',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  statsBar: {
    display: 'flex',
    gap: 12,
    padding: '16px 28px',
    overflowX: 'auto',
    zIndex: 1,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 28px 16px',
    flexWrap: 'wrap',
    zIndex: 1,
  },
  filters: { display: 'flex', gap: 8 },
  filterBtn: {
    background: 'transparent',
    border: '1px solid #1a2540',
    borderRadius: 6,
    color: '#445566',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    letterSpacing: 2,
    padding: '7px 14px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  filterBtnActive: {
    border: '1px solid #00b4ff',
    color: '#00b4ff',
    background: 'rgba(0,180,255,0.08)',
  },
  search: {
    background: '#0a0e1a',
    border: '1px solid #1a2540',
    borderRadius: 6,
    padding: '8px 14px',
    color: '#e8eaf0',
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: 14,
    fontWeight: 500,
    flex: 1,
    minWidth: 180,
    transition: 'border-color 0.2s',
  },
  sortSelect: {
    background: '#0a0e1a',
    border: '1px solid #1a2540',
    borderRadius: 6,
    padding: '8px 14px',
    color: '#8892aa',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    letterSpacing: 1,
    cursor: 'pointer',
  },
  tableWrap: {
    flex: 1,
    overflowX: 'auto',
    padding: '0 28px 20px',
    zIndex: 1,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: '#0a0e1a',
    border: '1px solid #1a2540',
    borderRadius: 10,
    overflow: 'hidden',
  },
  thead: { background: '#0e1525' },
  th: {
    padding: '12px 16px',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    letterSpacing: 2,
    color: '#445566',
    textAlign: 'left',
    borderBottom: '1px solid #1a2540',
    fontWeight: 400,
  },
  row: {
    borderBottom: '1px solid #1a2540',
    transition: 'background 0.15s',
  },
  td: {
    padding: '12px 16px',
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: 15,
    fontWeight: 500,
    color: '#8892aa',
  },
  tdIdx: {
    padding: '12px 16px',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: '#2a3550',
    textAlign: 'center',
  },
  tdSymbol: {
    padding: '12px 16px',
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 1,
    color: '#e8eaf0',
  },
  badge: {
    display: 'inline-block',
    border: '1px solid',
    borderRadius: 4,
    padding: '3px 10px',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: 700,
  },
  barWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  barBg: {
    flex: 1,
    height: 6,
    background: '#1a2540',
    borderRadius: 3,
    overflow: 'hidden',
    minWidth: 80,
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.5s ease',
  },
  barVal: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    minWidth: 40,
    textAlign: 'right',
  },
  signalIcon: { fontSize: 16 },
  noData: {
    textAlign: 'center',
    padding: 40,
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    letterSpacing: 3,
    color: '#2a3550',
  },
  loadingWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 60,
  },
  loadingDot: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: '#00ff9f',
    animation: 'dotpulse 1s ease-in-out infinite',
  },
  loadingText: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    letterSpacing: 3,
    color: '#445566',
  },
  footer: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    letterSpacing: 2,
    color: '#2a3550',
    textAlign: 'center',
    padding: '12px 28px',
    borderTop: '1px solid #1a2540',
    zIndex: 1,
  },
};
