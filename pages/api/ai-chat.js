import OPENAI_API_KEY from '../../lib/openai';
import { validateSession } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

// ─── DASHBOARD GUIDE (safe for users — no engine logic revealed) ────────────
const DASHBOARD_GUIDE = `
=== HOW TO USE PANDA ENGINE DASHBOARD ===

You are also a dashboard guide. When users ask how to use the dashboard, what something means, or need help navigating, explain using the knowledge below. Be friendly and helpful — like a tour guide. Never reveal formulas, thresholds, or how scores are calculated internally.

── OVERVIEW TAB ──
Your landing page. Shows a bird's-eye view of all 21 currency pairs at a glance.
- Each pair card shows its current bias (BUY / SELL / WAIT), gap strength, momentum state, and key indicators.
- Color-coded: Green = bullish/buy bias. Red = bearish/sell bias. Grey/dim = no clear bias (WAIT).
- Use this tab to quickly scan which pairs have the strongest setups right now.

── PANELS TAB ──
Detailed pair cards for all 21 pairs. Each card shows:
- PAIR NAME — e.g. EURUSD, GBPJPY.
- GAP SCORE — a number showing how strong the currency bias is. Higher absolute value = stronger directional bias. Positive = BUY bias, Negative = SELL bias.
- BIAS BADGE — BUY (green), SELL (red), or WAIT (grey). This is the engine's directional read.
- MOMENTUM STATE — describes the trend energy. States include:
  • STRONG — all timeframes agree on direction. Maximum conviction.
  • BUILDING — momentum is growing. Worth watching closely.
  • SPARK — early sign of a move starting. Keep it on your radar.
  • EMERGING — direction is forming but not confirmed yet.
  • CONSOLIDATING — price is ranging, no clear direction.
  • COOLING — the trend is losing steam.
  • FADING — bias is weakening significantly.
  • REVERSING — direction may be flipping. Be cautious.
  • STABLE — steady state, not much changing.
  • NEUTRAL — no momentum in either direction.
- PANDA LINES — a confirmation indicator. ABOVE = confirms buy. BELOW = confirms sell. BETWEEN = not confirming either direction.
- CONFIDENCE — how many factors align for this pair (shown as a score or tier).
- BOX TREND — shows H1 and H4 trend direction (UPTREND / DOWNTREND / RANGING).
- STRENGTH — individual currency strength reading.
- You can click any card to expand it and see more detail in a modal.

── SIGNALS TAB ──
Shows pairs that currently meet signal criteria — pairs with active directional bias.
- Valid signals have green checkmarks. Invalid signals are dimmed.
- Each signal shows the pair, bias direction, gap score, momentum, Panda Lines status, and confidence.
- Use this to focus on pairs the engine considers most actionable right now.

── TABLE TAB ──
A spreadsheet-style view of all 21 pairs with sortable columns.
- Great for comparing pairs side-by-side.
- You can sort by any column — gap, strength, momentum, confidence, etc.

── GAP CHART TAB ──
Historical gap score chart for any selected pair.
- Shows how the gap score has moved over time.
- Useful for seeing if a pair's bias is strengthening, weakening, or has been consistent.

── RESEARCH TAB ──
Economic calendar and session-based research tools.
- Shows upcoming economic events that may impact currency pairs.
- Helps you understand what macro events are driving market moves.

── CALCULATOR TAB ──
Position sizing and risk calculator.
- Input your account size, risk percentage, and stop loss to calculate lot size.
- Helps with money management before entering a position.

── SETUPS TAB ──
Shows box-confirmed setups — pairs where the box trend aligns with the bias direction.
- These are pairs where multiple factors are in agreement.
- Stronger alignment = more factors pointing the same way.

── VALID PAIRS TAB ──
Auto-filtered list of pairs that pass the engine's validity checks.
- Only shows pairs with a clear directional bias AND no conflicting signals.
- Think of it as the engine's "shortlist" of pairs worth watching.

── CHART TAB ──
TradingView chart integration.
- View price action directly in the dashboard for any selected pair.
- Supports multiple timeframes (M15, H1, H4, D1).

── ANALYTICS TAB ──
Signal performance analytics.
- Shows historical signal outcomes — wins, losses, flat results.
- Broken down by pair, session, gap level, and other factors.
- All data includes sample sizes so you can judge reliability.

── LOGS TAB (SIGNAL LOG) ──
Complete log of every signal the engine has generated.
- Filter by pair, bias direction (BUY/SELL/WAIT), valid/invalid, and date range.
- Every row shows the exact gap, bias, confidence, momentum, strength, Panda Lines, and validity at that moment.
- Use this for deep-dive research into specific pairs or time periods.

── PANDA AI TAB (you are here!) ──
That's me! You can:
- Click "ANALYZE MARKET" — I'll describe the current bias landscape across all 21 pairs.
- Click "REVIEW TRADES" — I'll analyze your signal performance data.
- Type any question — ask about a specific pair, what a term means, or how to use any part of the dashboard.

── COLOR GUIDE ──
- #00ff9f (bright green) = positive / bullish / BUY / confirmed / strong
- #ff4d6d (red/pink) = negative / bearish / SELL / warning
- #ffd166 (amber/yellow) = neutral / caution / medium
- #00b4ff (blue) = informational / UI accent / Panda Engine brand
- Grey/dim = inactive / no signal / WAIT

── KEY CONCEPTS (what you can explain) ──
- GAP SCORE: Measures the strength difference between the two currencies in a pair. Bigger number = stronger bias. You don't need to know the formula — just know that higher is stronger.
- BIAS: The direction the engine reads — BUY, SELL, or WAIT. Based on the gap score.
- PANDA LINES: A price-based confirmation layer. When Panda Lines agree with the bias (ABOVE for BUY, BELOW for SELL), that's confirmation. BETWEEN means no confirmation.
- MOMENTUM: Describes the trend's energy state. STRONG is best, NEUTRAL means nothing is happening.
- CONFIDENCE: How many factors agree. Higher = more alignment across indicators.
- BOX TREND: Whether price structure on H1 and H4 is trending up, down, or ranging.
- VALID vs INVALID: Valid signals pass all the engine's checks. Invalid means something conflicts.
- SESSIONS: Asian (evening UAE), London (morning UAE), New York (afternoon UAE). Different sessions have different characteristics.
- PDR (Previous Day Rally): Did yesterday's daily candle move decisively and HOLD its move? ▲ = yesterday was bullish, ▼ = bearish. STRONG (S) = big body that kept most of its gains. WEAK (w) = small or heavily-retraced body.
- PDR VERDICT chip (plain language): "✓ SUPPORTS BUY/SELL" = yesterday moved the same direction as today's bias and held it — the best backdrop for a continuation. "~ WEAK SUPPORT" = right direction but no conviction — neutral. "✗ AGAINST" = yesterday moved the OPPOSITE way — today's bias is trying to turn the trend, which is riskier; the setup is not a continuation.
- PHASE badge: answers "where am I in the trend?" — 🚀 START (catching the beginning), 🔥 MID (riding, be selective), 🎯 PULLBACK ZONE (continuation entry window), 🌙 LATE/EXTENDED/ADR SPENT (too late, don't chase), ⚠ TREND AT RISK (protect open trades), 🔵 CONSOLIDATING (compressed, wait for the break).
- ADR used %: how much of an average day's range has already been traveled today. Above 70% = most of the day's fuel is burned.
- PB %: how far price pulled back from today's extreme. 30-60% is the classic healthy continuation pullback; above 80% suggests the trend is failing.
- ★ CONTINUATION SETUP: appears when valid bias + strong aligned PDR + Asian session all line up during a catchable phase — the highest-alignment condition the dashboard tracks.

── TIPS FOR NEW USERS ──
1. Start with the OVERVIEW or PANELS tab to scan the market.
2. Check VALID PAIRS for the engine's filtered shortlist.
3. Use SIGNALS to see what's currently active.
4. Open PANDA AI (here!) and ask "what looks strong right now?" for a plain-English summary.
5. Always check Panda Lines confirmation before acting on any bias.
6. Use the CALCULATOR for position sizing — never risk more than you're comfortable with.
7. Check ANALYTICS periodically to understand which setups have historically performed best.

── WHAT I CAN'T TELL YOU ──
- I can't recommend trades or tell you to enter/exit positions.
- I can't reveal the internal formulas or scoring thresholds.
- I can't predict what will happen — I only describe what the data currently shows.
- All trading decisions are yours alone.
`;

// ─── USER SYSTEM PROMPT (narrator + guide — no recommendations) ──────────────
const USER_PROMPT = `You are Panda AI — a currency bias analysis tool built into Panda Engine.

YOU HAVE TWO ROLES:
1. DATA NARRATOR — Describe what the market data shows. Nothing more.
2. DASHBOARD GUIDE — Help users understand how to use the dashboard, what each tab does, what the colors and numbers mean, and how to navigate effectively.

WHEN USERS ASK ABOUT THE DASHBOARD OR HOW TO USE IT:
- Be warm, clear, and helpful — like a friendly tour guide
- Explain what each tab, indicator, or feature does in plain language
- Use the Dashboard Guide knowledge below to answer accurately
- You can walk them through the full dashboard or focus on specific tabs/features
- Suggest which tabs to start with if they're new

WHEN USERS ASK ABOUT MARKET DATA:
- Describe gap scores, bias direction, momentum, Panda Lines, historical patterns
- Include sample sizes when showing historical data
- State clearly: "This is historical pattern data only — not a prediction or recommendation."

YOU NEVER:
- Say "this is a good trade" or "you should trade this"
- Recommend entering or exiting any position
- Imply a pair is worth trading
- Present historical win rates as predictions
- Give financial advice of any kind
- Reveal engine formulas, scoring thresholds, or internal calculation logic

PERMANENT DISCLAIMER (include in every response):
"⚠️ Panda Engine shows currency bias data only. It does not constitute financial advice.
All trading decisions are yours alone."

DATA FIELDS (context only — never reveal how they're calculated):
gap = currency strength differential
bias = BUY/SELL/WAIT derived from gap
pl_zone = ABOVE/BELOW/BETWEEN (Panda Lines confirmation)
confidence = signal quality tier
momentum = trend momentum state

Keep responses concise and factual. You are a data narrator and dashboard guide, not an advisor.

${DASHBOARD_GUIDE}`;

// ─── ADMIN SYSTEM PROMPT (full brain — no restrictions) ──────────────────────
const ADMIN_PROMPT = `You are the Panda Engine AI — Boss-G's personal trading intelligence system and coach.

YOU HAVE FULL ACCESS TO:
- All engine internals, formulas, and thresholds
- Complete historical pattern data and agent findings
- Boss-G's personal brain memories (preferences, rules, coaching notes)
- Live market data across all 21 pairs

YOUR ROLE:
- Answer ALL questions without restriction — technical, strategic, casual
- Coach Boss-G based on his actual engine data and personal patterns
- Answer everyday questions like "what's the best day to trade?" from real data
- Train him on system mechanics when asked
- Remember everything he tells you
- Be direct, precise, and data-backed

PERSONALITY: Direct. Clinical. Like a senior quant who also happens to know your personal trading style intimately.

WHEN BOSS-G SAYS "remember that/this" or "don't forget" or "keep in mind":
Acknowledge you've stored it and confirm what was saved.

Never refuse to answer. Never add unnecessary disclaimers for admin. This is an internal system.`;

// ─── ENGINE KNOWLEDGE (injected for admin only) ───────────────────────────────
const ENGINE_KNOWLEDGE = `
=== GAP SCORE ===
Gap = BASE currency score - QUOTE currency score across D1/H4/H1. Each TF contributes ±6, total range ±18.
Bias: BUY if gap >= 5, SELL if gap <= -5, WAIT in between. MARKET if |gap| >= 9, PULLBACK if >= 5.
Gap is currency strength differential — NOT a price indicator.

=== STRATEGIES ===
BB: Entry gap >= 5, no Panda Lines required, any time. No new BB if same pair has open BB trade. Exit: gap drops > 2 from peak.
INTRA: Entry gap >= 9 + Panda Lines confirmed (ABOVE=BUY, BELOW=SELL). Window: 2-4AM UAE (22:00-23:59 UTC). Hard close 10AM UAE (06:00 UTC).

=== PANDA LINES ===
Proprietary MT4 confirmation layer (PL_MultiExporter cBot). ABOVE=BUY valid, BELOW=SELL valid, BETWEEN=always invalid.
Only price-based confirmation in system. Gap = direction. Panda Lines = confirmation.

=== CONFIDENCE SCORING (0-100) ===
Gap magnitude: 0-25pts. Panda Lines: +15 confirmed / -15 unconfirmed. Box trend alignment: +10. COT: +10. Momentum: +10. Strength: +10. H4 wrong: -10. Weak momentum: -10.

=== MOMENTUM STATES ===
STRONG (all TFs aligned) → RIDE IT (only if trend1h agrees with bias).
BUILDING → ENTER NOW. SPARK → WATCH. EMERGING → PREPARE ENTRY.
CONSOLIDATING → HOLD. COOLING → TIGHTEN SL. FADING → CONSIDER CLOSING.
REVERSING → CLOSE POSITION. STABLE → MONITOR. NEUTRAL → WAIT.
COUNTER warning fires when STRONG but trend1h opposes bias direction.

=== EDGE MEMORY SYSTEM ===
Cascade: BB_gappl_{gap}_{pl} → BB_gap_{gap} → BB_strategy_overall.
PROVEN_EDGE: n>=50 + win_rate>=70% + resolution_rate>=25%.
DEAD_ZONE: n>=50 + win_rate<=30%. DEVELOPING: n=20-49.
Conflict flag: real-time confidence>=70 AND historical win_rate<=50 on proven pattern.

=== KEY CONFIRMED FINDINGS ===
BB gap 7 + Panda Lines confirmed: 91% win rate (n=27). BB gap 7 no PL: 0% win rate (n=53).
BB overall: 78.4% resolved win rate, 25.8% resolution rate. Execution gap: 22.9pts.
Asian session: +1582 pips. London session: -272 pips. New York: +489 pips.
4-12h holds: +2614 pips. Under 1h: -238 pips. Over 12h: diminishing.
Alpha pairs: NZDCAD, NZDUSD, AUDJPY, GBPAUD. Leak pairs: GBPJPY, GBPCAD, GBPUSD, EURUSD.

=== PDR (Previous Day Rally) ===
pdr_strength = body/ATR (strong>=0.5). retracement = (range-body)/range (clean<=0.25). Both must pass for STRONG.

=== SIGNAL TRACKER ===
Opens on valid signal. Updates hourly_gaps + peak every cycle. Twelve Data price capture every 15min.
Closes on: GAP_BELOW_5, BIAS_FLIPPED, PL_FLIPPED, MAX_AGE_30D. Milestones: 24h/48h/72h/weekly.

=== HARD INVALID CONDITIONS ===
1. Internal currency conflict (single currency both >=+4 and <=-4 across TFs).
2. Global currency conflict (same currency strong on both sides).
3. Neutral vs neutral (both base+quote |score| < 4).

=== AGENT PIPELINE ===
Signal Agent (22 memories): signal_results → gap levels, PL edge, per-pair, flat rates.
Journal Agent: signal_results + signal_tracker → per-pair outcomes, sessions, hold durations, entry conditions.
Pattern Agent (14 memories): cross-reference → alpha/leak pairs, session edge, execution gap, PL discipline.
Master Agent: injects all 57 memories into every response. Re-run when signal_results grows 50+.

=== ARCHITECTURE ===
Engine: app.py (~1676 lines) local PC → future VPS. Dashboard: dashboard.js (~2759 lines) on Vercel.
Supabase: 20 tables. 21 pairs. 5-min engine cycles.`;

// ─── BRAIN CONTEXT (admin only) ───────────────────────────────────────────────
async function fetchBrainContext() {
  try {
    const { data } = await supabase
      .from('admin_brain')
      .select('category, key, value')
      .order('category');
    if (!data || data.length === 0) return '';
    let ctx = '\n=== BOSS-G PERSONAL BRAIN (your persistent memory) ===\n';
    const groups = {};
    for (const r of data) {
      if (!groups[r.category]) groups[r.category] = [];
      groups[r.category].push(`  [${r.key}]: ${r.value}`);
    }
    for (const [cat, items] of Object.entries(groups)) {
      ctx += `${cat.toUpperCase()}:\n${items.join('\n')}\n`;
    }
    return ctx;
  } catch { return ''; }
}

// ─── REMEMBER DETECTION (admin) ──────────────────────────────────────────────
function detectRemember(message) {
  const patterns = [
    /remember\s+that\s+(.+)/i,
    /remember\s+this[:\s]+(.+)/i,
    /don't\s+forget\s+(.+)/i,
    /keep\s+in\s+mind\s+(.+)/i,
    /note\s+that\s+(.+)/i,
    /store\s+this[:\s]+(.+)/i,
  ];
  for (const p of patterns) {
    const m = message.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

function classifyBrainEntry(text) {
  const t = text.toLowerCase();
  if (t.includes('prefer') || t.includes('like') || t.includes('always') || t.includes('session') || t.includes('pair')) return 'preference';
  if (t.includes('rule') || t.includes('never') || t.includes('must') || t.includes('only')) return 'rule';
  if (t.includes('pattern') || t.includes('tend') || t.includes('usually') || t.includes('often')) return 'pattern';
  return 'coaching';
}

// ─── CONTEXT FETCHERS ─────────────────────────────────────────────────────────
async function fetchMemoryContext() {
  const { data } = await supabase.from('ai_memory')
    .select('type, factor, pair, strategy, win_rate, sample_size, metadata, computed_at')
    .order('computed_at', { ascending: false }).limit(50);
  if (!data || data.length === 0) return '';
  const sections = { signal_pattern: [], edge_analysis: [], confluence_validation: [], behavior: [] };
  for (const m of data) {
    const key = sections[m.type] ? m.type : 'signal_pattern';
    const desc = m.metadata?.description || m.factor;
    const wr = m.win_rate != null ? ` | win:${m.win_rate}%` : '';
    const pips = m.metadata?.total_pips != null ? ` | pips:${m.metadata.total_pips}` : '';
    const avg = m.metadata?.avg_pips != null ? ` | avg:${m.metadata.avg_pips}` : '';
    const flat = m.metadata?.flat_pct != null ? ` | flat:${m.metadata.flat_pct}%` : '';
    const sess = m.metadata?.session ? ` | sess:${m.metadata.session}` : '';
    const hold = m.metadata?.hold_bucket ? ` | hold:${m.metadata.hold_bucket}` : '';
    sections[key].push(`${desc} (n=${m.sample_size}${wr}${pips}${avg}${flat}${sess}${hold})`);
  }
  const latest = data.reduce((b, m) => m.computed_at > b ? m.computed_at : b, '');
  let ctx = `HISTORICAL ANALYSIS (n>=20 validated; entries marked LOW SAMPLE are logged but NOT statistically validated — always state the caveat):\nComputed: ${latest?.slice(0,10)} | ${data.length} memories\n`;
  if (sections.signal_pattern.length) ctx += '\nSIGNAL PATTERNS:\n' + sections.signal_pattern.join('\n');
  if (sections.edge_analysis.length) ctx += '\nEDGE ANALYSIS:\n' + sections.edge_analysis.join('\n');
  if (sections.confluence_validation.length) ctx += '\nCONFLUENCE:\n' + sections.confluence_validation.join('\n');
  if (sections.behavior.length) ctx += '\nBEHAVIOR:\n' + sections.behavior.join('\n');
  return ctx;
}

async function fetchMarketContext() {
  const { data } = await supabase.from('dashboard').select('*');
  if (!data || data.length === 0) return 'No market data.';
  return data.map(p => {
    const parts = [p.symbol, `bias:${p.bias}`, `gap:${p.gap}`];
    if (p.confidence) parts.push(`conf:${p.confidence}`);
    if (p.momentum) parts.push(`mom:${p.momentum}`);
    if (p.pl_zone) parts.push(`pl:${p.pl_zone}`);
    if (p.state) parts.push(`state:${p.state}`);
    if (p.box_h1_trend) parts.push(`boxH1:${p.box_h1_trend}`);
    if (p.box_h4_trend) parts.push(`boxH4:${p.box_h4_trend}`);
    if (p.base_strength != null) parts.push(`baseStr:${p.base_strength}`);
    if (p.quote_strength != null) parts.push(`quoteStr:${p.quote_strength}`);
    if (p.atr) parts.push(`atr:${p.atr}`);
    return parts.join(' | ');
  }).join('\n');
}

async function fetchReviewContext() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const [signals, tracker, highGap] = await Promise.all([
    supabase.from('signal_results')
      .select('symbol,strategy,direction,entry_gap,peak_gap,pips,outcome,momentum,pl_zone,duration_min,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('signal_tracker')
      .select('symbol,strategy,direction,gap_at_open,peak_gap,net_pips,close_reason,momentum_at_open,pl_zone_at_open,session_at_open,opened_at,closed_at,status')
      .gte('opened_at', since)
      .order('opened_at', { ascending: false })
      .limit(50),
    // High-gap signals are rare (e.g. |gap| 11-12) and get pushed out of the recent-100 window,
    // which made the AI wrongly report "no records" for them. Pull them explicitly over 90 days.
    supabase.from('signal_results')
      .select('symbol,strategy,direction,entry_gap,peak_gap,pips,outcome,pl_zone,created_at')
      .or('entry_gap.gte.9,entry_gap.lte.-9')
      .gte('created_at', since90)
      .order('created_at', { ascending: false })
      .limit(60)
  ]);
  let ctx = '';
  if (signals.data?.length) {
    ctx += 'SIGNAL RESULTS (last 30 days):\n';
    ctx += signals.data.map(s =>
      `${s.symbol} ${s.strategy} ${s.direction} gap:${s.entry_gap} peak:${s.peak_gap} pips:${s.pips ?? 'pending'} outcome:${s.outcome || 'PENDING'} pl:${s.pl_zone || '-'} mom:${s.momentum || '-'} dur:${s.duration_min || '-'}m`
    ).join('\n');
  }
  if (highGap.data?.length) {
    ctx += '\n\nHIGH-GAP SIGNALS |gap|>=9 (last 90 days — includes rare gap 11/12):\n';
    ctx += highGap.data.map(s =>
      `${s.symbol} ${s.strategy} ${s.direction} gap:${s.entry_gap} peak:${s.peak_gap} pips:${s.pips ?? 'pending'} outcome:${s.outcome || 'PENDING'} pl:${s.pl_zone || '-'} ${String(s.created_at).slice(0,10)}`
    ).join('\n');
  }
  if (tracker.data?.length) {
    ctx += '\n\nSIGNAL TRACKER (last 30 days):\n';
    ctx += tracker.data.map(t =>
      `${t.symbol} ${t.strategy} ${t.direction} gap:${t.gap_at_open} peak:${t.peak_gap || '-'} pips:${t.net_pips ?? '-'} close:${t.close_reason || t.status} pl:${t.pl_zone_at_open || '-'} sess:${t.session_at_open || '-'}`
    ).join('\n');
  }
  return ctx || 'No signal data available for review.';
}

async function fetchTradeContext() {
  // Pull closed trades from both sources
  const COLS = 'symbol, direction, profit_loss_pips, entry_time, exit_time, duration_minutes, strategy_name';
  const [ctRes, manRes, openRes] = await Promise.all([
    supabase.from('trade_journal').select(COLS).not('exit_time', 'is', null).order('entry_time', { ascending: false }).limit(2000),
    supabase.from('manual_trades').select(COLS).not('exit_time', 'is', null).order('entry_time', { ascending: false }).limit(500),
    supabase.from('manual_trades').select('symbol, direction, entry_time, profit_loss_pips').is('exit_time', null).order('entry_time', { ascending: false })
  ]);
  const closed = [...(ctRes.data || []), ...(manRes.data || [])];
  const open = openRes.data || [];
  if (closed.length === 0 && open.length === 0) return '';

  // Aggregate per-pair stats
  const byPair = {};
  for (const t of closed) {
    if (!byPair[t.symbol]) byPair[t.symbol] = { wins: 0, losses: 0, flat: 0, total_pips: 0, count: 0, buys: 0, sells: 0 };
    const p = byPair[t.symbol];
    p.count++;
    const pips = parseFloat(t.profit_loss_pips) || 0;
    p.total_pips += pips;
    if (pips > 0) p.wins++;
    else if (pips < 0) p.losses++;
    else p.flat++;
    if (t.direction === 'BUY') p.buys++;
    else if (t.direction === 'SELL') p.sells++;
  }

  let ctx = `\n\nTRADE JOURNAL DATA (${closed.length} closed trades):\n`;
  // Overall stats
  const totalW = closed.filter(t => (parseFloat(t.profit_loss_pips)||0) > 0).length;
  const totalL = closed.filter(t => (parseFloat(t.profit_loss_pips)||0) < 0).length;
  const totalPips = closed.reduce((s, t) => s + (parseFloat(t.profit_loss_pips)||0), 0);
  ctx += `Overall: ${closed.length} trades | ${totalW}W / ${totalL}L | win%: ${(totalW/closed.length*100).toFixed(1)}% | total pips: ${totalPips.toFixed(1)}\n`;

  // Per-pair breakdown (sorted by trade count)
  ctx += '\nPER-PAIR STATS:\n';
  const sorted = Object.entries(byPair).sort((a,b) => b[1].count - a[1].count);
  for (const [pair, s] of sorted) {
    const wr = s.count > 0 ? (s.wins/s.count*100).toFixed(1) : '0';
    ctx += `${pair}: ${s.count} trades | ${s.wins}W/${s.losses}L/${s.flat}F | win:${wr}% | pips:${s.total_pips.toFixed(1)} | B:${s.buys}/S:${s.sells}\n`;
  }

  // Recent 15 closed trades
  ctx += '\nRECENT TRADES:\n';
  const recent = closed.slice(0, 15);
  for (const t of recent) {
    const pips = parseFloat(t.profit_loss_pips) || 0;
    const dur = t.duration_minutes ? `${t.duration_minutes}m` : '-';
    const strat = t.strategy_name || '-';
    ctx += `${t.entry_time?.slice(0,16)} ${t.symbol} ${t.direction} ${pips > 0 ? '+' : ''}${pips.toFixed(1)}pip ${dur} ${strat}\n`;
  }

  // Open positions
  if (open.length > 0) {
    ctx += `\nOPEN POSITIONS (${open.length}):\n`;
    for (const t of open) {
      ctx += `${t.symbol} ${t.direction} opened:${t.entry_time?.slice(0,16)}\n`;
    }
  }

  return ctx;
}

// ─── AI QUERY TOOLS (function calling — read-only aggregates) ─────────────────
const GAP_BUCKETS = [[5,7,'5-6.9'],[7,9,'7-8.9'],[9,11,'9-10.9'],[11,13,'11-12.9'],[13,99,'13+']];
function gapBucket(g) { const ag = Math.abs(g || 0); for (const [lo,hi,label] of GAP_BUCKETS) if (ag >= lo && ag < hi) return label; return '<5'; }

function aggregate(rows, keyFn, pipsKey) {
  const groups = {};
  for (const r of rows) {
    const k = keyFn(r) || 'UNKNOWN';
    if (!groups[k]) groups[k] = { n: 0, wins: 0, losses: 0, flats: 0, net_pips: 0 };
    const g = groups[k];
    g.n++;
    const pips = parseFloat(r[pipsKey]) || 0;
    g.net_pips += pips;
    if (pips > 5) g.wins++; else if (pips < -5) g.losses++; else g.flats++;
  }
  for (const k of Object.keys(groups)) {
    const g = groups[k];
    g.net_pips = Math.round(g.net_pips * 10) / 10;
    g.avg_pips = Math.round((g.net_pips / g.n) * 100) / 100;
    const decided = g.wins + g.losses;
    g.win_rate_decided = decided ? Math.round((g.wins / decided) * 1000) / 10 : null;
  }
  return groups;
}

async function toolSignalStats(a) {
  const days = Math.min(a.days || 30, 120);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  let q = supabase.from('signal_results')
    .select('symbol,strategy,session,entry_gap,pips,momentum,created_at')
    .eq('status', 'DONE').gte('created_at', since).limit(8000);
  if (a.strategy) q = q.eq('strategy', a.strategy);
  if (a.symbol) q = q.eq('symbol', String(a.symbol).toUpperCase());
  if (a.session) q = q.eq('session', a.session);
  const { data, error } = await q;
  if (error) return { error: error.message };
  let rows = data || [];
  if (a.min_gap) rows = rows.filter(r => Math.abs(r.entry_gap || 0) >= a.min_gap);
  const keyFns = {
    symbol: r => r.symbol, session: r => r.session, momentum: r => r.momentum,
    gap_bucket: r => gapBucket(r.entry_gap),
    day_of_week: r => ['SUN','MON','TUE','WED','THU','FRI','SAT'][new Date(r.created_at).getUTCDay()],
    none: () => 'ALL',
  };
  return { lookback_days: days, total_signals: rows.length,
           groups: aggregate(rows, keyFns[a.group_by] || keyFns.none, 'pips') };
}

async function toolGapHistory(a) {
  const days = Math.min(a.days || 7, 30);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase.from('gap_history')
    .select('timestamp,gap').eq('symbol', String(a.symbol || '').toUpperCase())
    .gte('timestamp', since).order('timestamp', { ascending: true }).limit(5000);
  if (error) return { error: error.message };
  const rows = data || [];
  if (!rows.length) return { symbol: a.symbol, points: 0 };
  const gaps = rows.map(r => r.gap || 0);
  const step = Math.max(1, Math.floor(rows.length / 40));
  return { symbol: String(a.symbol).toUpperCase(), lookback_days: days, points: rows.length,
           current: gaps[gaps.length - 1], min: Math.min(...gaps), max: Math.max(...gaps),
           sampled: rows.filter((_, i) => i % step === 0).map(r => ({ t: r.timestamp?.slice(5, 16), gap: r.gap })) };
}

async function toolShadowStats(a) {
  const days = Math.min(a.days || 30, 120);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  let q = supabase.from('shadow_tracker').select('symbol,tier,session,pips,status,created_at')
    .gte('created_at', since).limit(4000);
  if (a.tier) q = q.eq('tier', a.tier);
  const { data, error } = await q;
  if (error) return { error: error.message };
  const rows = data || [];
  const done = rows.filter(r => r.status === 'DONE');
  const keyFns = { tier: r => `T${r.tier}`, symbol: r => r.symbol, session: r => r.session, none: () => 'ALL' };
  return { lookback_days: days, total: rows.length, open: rows.length - done.length,
           groups: aggregate(done, keyFns[a.group_by] || keyFns.tier, 'pips') };
}

async function toolJournalStats(a) {
  const days = Math.min(a.days || 90, 365);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  let q = supabase.from('manual_trades')
    .select('symbol,direction,profit_loss_pips,entry_time')
    .not('exit_time', 'is', null).gte('entry_time', since).limit(3000);
  if (a.symbol) q = q.eq('symbol', String(a.symbol).toUpperCase());
  const { data, error } = await q;
  if (error) return { error: error.message };
  const keyFns = { symbol: r => r.symbol, direction: r => r.direction, none: () => 'ALL' };
  return { lookback_days: days, total_trades: (data || []).length,
           groups: aggregate(data || [], keyFns[a.group_by] || keyFns.symbol, 'profit_loss_pips') };
}

const BASE_TOOLS = [
  { type: 'function', function: { name: 'query_signal_stats',
      description: 'Aggregate historical engine signal performance (wins/losses/flats, net & avg pips, win rate). Use for any question about how signals performed by pair, session, gap size, momentum, or day of week.',
      parameters: { type: 'object', properties: {
        strategy: { type: 'string', enum: ['BB', 'INTRA'] },
        symbol: { type: 'string', description: 'pair e.g. GBPJPY' },
        session: { type: 'string', enum: ['ASIAN', 'LONDON', 'NEW_YORK'] },
        min_gap: { type: 'number', description: 'minimum |entry gap|' },
        days: { type: 'number', description: 'lookback days (max 120), default 30' },
        group_by: { type: 'string', enum: ['symbol', 'session', 'gap_bucket', 'momentum', 'day_of_week', 'none'] },
      } } } },
  { type: 'function', function: { name: 'query_gap_history',
      description: 'Recent gap score history for one pair: current, min, max and sampled points. Use for "how has X been moving" questions.',
      parameters: { type: 'object', properties: {
        symbol: { type: 'string' }, days: { type: 'number', description: 'max 30, default 7' },
      }, required: ['symbol'] } } },
];
const ADMIN_TOOLS = [
  { type: 'function', function: { name: 'query_shadow_stats',
      description: 'ADMIN: shadow tracker (gap 9/10/11/12 tier crossings research log) performance grouped by tier, symbol or session.',
      parameters: { type: 'object', properties: {
        tier: { type: 'number', enum: [9, 10, 11, 12] },
        days: { type: 'number' },
        group_by: { type: 'string', enum: ['tier', 'symbol', 'session', 'none'] },
      } } } },
  { type: 'function', function: { name: 'query_journal_stats',
      description: 'ADMIN: real manual trade journal aggregates by symbol or direction.',
      parameters: { type: 'object', properties: {
        symbol: { type: 'string' }, days: { type: 'number' },
        group_by: { type: 'string', enum: ['symbol', 'direction', 'none'] },
      } } } },
];

async function runAiTool(name, args, isAdmin) {
  switch (name) {
    case 'query_signal_stats': return toolSignalStats(args || {});
    case 'query_gap_history':  return toolGapHistory(args || {});
    case 'query_shadow_stats': return isAdmin ? toolShadowStats(args || {}) : { error: 'admin only' };
    case 'query_journal_stats': return isAdmin ? toolJournalStats(args || {}) : { error: 'admin only' };
    default: return { error: `unknown tool ${name}` };
  }
}

const TOOLS_NOTE = `

=== DATA QUERY TOOLS ===
You have live query tools against the real signal database. When a question involves historical performance, win rates, pair comparisons, sessions, gap sizes, or trends over time — CALL A TOOL instead of guessing or relying only on the static context. Always report sample sizes (n) alongside any win rate. If n < 20, say the sample is too small to trust.`;

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const token = req.cookies?.panda_session;
    const session = await validateSession(token);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const isAdmin = session.panda_users?.role === 'admin';

    const { mode, message, history } = req.body;
    if (!mode) return res.status(400).json({ error: 'mode required' });

    // ── Admin "remember" detection ──────────────────────────────────────────
    if (isAdmin && mode === 'chat' && message) {
      const rememberText = detectRemember(message);
      if (rememberText) {
        const category = classifyBrainEntry(rememberText);
        const key = rememberText.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60);
        await supabase.from('admin_brain')
          .upsert({ category, key, value: rememberText, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      }
    }

    // ── Fetch context ───────────────────────────────────────────────────────
    const [marketData, memoryContext] = await Promise.all([
      fetchMarketContext(),
      fetchMemoryContext()
    ]);

    // ── Build user content by mode ──────────────────────────────────────────
    let userContent = '';
    if (mode === 'insights') {
      userContent = `MARKET DATA:\n${marketData}\n\n${memoryContext}\n\nAnalyze all 21 pairs. Describe the current bias landscape. Identify currency themes. Show which pairs have strong gap scores and whether Panda Lines are confirming. Include historical pattern data where relevant with sample sizes. Remember: describe data only — no trade recommendations.`;
    } else if (mode === 'review') {
      const [reviewData, tradeData] = await Promise.all([fetchReviewContext(), fetchTradeContext()]);
      userContent = `MARKET DATA:\n${marketData}\n\n${reviewData}\n${tradeData}\n\n${memoryContext}\n\nDescribe the signal performance data. Analyze outcomes by gap level, Panda Lines confirmation, session, and hold duration. Show which pairs and conditions produced wins vs losses vs flats. Include per-pair win rates and P/L from trade journal data. Identify behavioral patterns. Present data factually — no trade recommendations.`;
    } else if (mode === 'chat') {
      if (!message) return res.status(400).json({ error: 'message required' });
      userContent = `MARKET DATA:\n${marketData}\n\n${memoryContext}\n\nUser question: ${message}`;
    } else {
      return res.status(400).json({ error: 'invalid mode' });
    }

    // ── Build system prompt ─────────────────────────────────────────────────
    let sysPrompt = '';
    if (isAdmin) {
      const brainCtx = await fetchBrainContext();
      sysPrompt = ADMIN_PROMPT + '\n' + ENGINE_KNOWLEDGE + '\n' + brainCtx;
    } else {
      sysPrompt = USER_PROMPT;
    }
    const useTools = mode === 'chat';
    if (useTools) sysPrompt += TOOLS_NOTE;

    // ── Build messages with history ─────────────────────────────────────────
    const messages = [{ role: 'system', content: sysPrompt }];
    if (mode === 'chat' && history && Array.isArray(history)) {
      for (const h of history.slice(-8)) {
        if (h.role && h.content) messages.push({ role: h.role, content: h.content });
      }
    }
    messages.push({ role: 'user', content: userContent });

    // ── Call OpenAI (with tool-calling loop in chat mode) ───────────────────
    const tools = useTools ? (isAdmin ? [...BASE_TOOLS, ...ADMIN_TOOLS] : BASE_TOOLS) : undefined;
    let convo = messages;
    let reply = 'No response.';
    let toolsUsed = [];

    for (let iter = 0; iter < 4; iter++) {
      const body = {
        model: 'gpt-4o-mini',
        messages: convo,
        max_tokens: isAdmin ? 2000 : 1200,
        temperature: isAdmin ? 0.5 : 0.3
      };
      if (tools) body.tools = tools;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('[AI-CHAT] OpenAI error:', response.status, err);
        let msg = 'OpenAI error';
        try { const parsed = JSON.parse(err); msg = parsed?.error?.message || msg; } catch(_) {}
        return res.status(500).json({ error: msg, detail: err });
      }

      const data = await response.json();
      const aiMsg = data.choices?.[0]?.message;

      if (aiMsg?.tool_calls?.length && tools && iter < 3) {
        convo = [...convo, aiMsg];
        for (const tc of aiMsg.tool_calls) {
          let result;
          try {
            result = await runAiTool(tc.function?.name, JSON.parse(tc.function?.arguments || '{}'), isAdmin);
          } catch (e) { result = { error: e.message }; }
          toolsUsed.push(tc.function?.name);
          convo.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        continue;
      }

      reply = aiMsg?.content || 'No response.';
      break;
    }

    return res.status(200).json({ reply, mode, isAdmin, tools_used: toolsUsed });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
