import OPENAI_API_KEY from '../../lib/openai';
import { validateSession } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

// ─── USER SYSTEM PROMPT (narrator only — no recommendations) ─────────────────
const USER_PROMPT = `You are Panda AI — a currency bias analysis tool built into Panda Engine.

YOUR ONLY ROLE: Describe what the market data shows. Nothing more.

YOU DESCRIBE:
- Gap scores and bias direction (BUY/SELL/WAIT)
- Whether Panda Lines are confirming or not
- Historical pattern data with sample sizes
- Session context (Asian/London/New York)
- Momentum states

YOU NEVER:
- Say "this is a good trade" or "you should trade this"
- Recommend entering or exiting any position
- Imply a pair is worth trading
- Present historical win rates as predictions
- Give financial advice of any kind
- Reveal engine formulas, thresholds, or internal logic

WHEN SHOWING HISTORICAL DATA: Always include the sample size (n=XX) and state clearly:
"This is historical pattern data only — not a prediction or recommendation."

PERMANENT DISCLAIMER (include in every response):
"⚠️ Panda Engine shows currency bias data only. It does not constitute financial advice.
All trading decisions are yours alone."

DATA FIELDS (context only — never reveal):
gap = currency strength differential (-18 to +18)
bias = BUY/SELL/WAIT derived from gap
pl_zone = ABOVE/BELOW/BETWEEN (Panda Lines confirmation)
confidence = signal quality tier
momentum = trend momentum state

Keep responses concise and factual. You are a data narrator, not an advisor.`;

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
Journal Agent (21 memories): manual_trades → per-pair P&L, sessions, hold durations, monthly.
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
    .order('computed_at', { ascending: false }).limit(100);
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
  let ctx = `HISTORICAL ANALYSIS (validated, n>=20):\nComputed: ${latest?.slice(0,10)} | ${data.length} memories\n`;
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
  const [signals, journal] = await Promise.all([
    supabase.from('signal_results').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(100),
    supabase.from('manual_trades').select('*').gte('entry_time', since).order('entry_time', { ascending: false }).limit(50)
  ]);
  let ctx = '';
  if (signals.data?.length) {
    ctx += 'SIGNAL RESULTS (last 30 days):\n';
    ctx += signals.data.map(s => `${s.symbol} ${s.strategy} ${s.direction} gap:${s.entry_gap} peak:${s.peak_gap} pips:${s.pips||'pending'} outcome:${s.outcome||'PENDING'} dur:${s.duration_min||'-'}m`).join('\n');
  }
  if (journal.data?.length) {
    ctx += '\n\nTRADE HISTORY (last 30 days):\n';
    ctx += journal.data.map(t => `${t.symbol} ${t.direction} pips:${t.profit_loss_pips||'-'} ${t.entry_time}`).join('\n');
  }
  return ctx || 'No trade history available.';
}

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
      const reviewData = await fetchReviewContext();
      userContent = `MARKET DATA:\n${marketData}\n\n${reviewData}\n\n${memoryContext}\n\nDescribe the trading performance data. Compare actual trades to engine signals. Show behavioral patterns across sessions, hold durations, and pairs. Present the data factually.`;
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

    // ── Build messages with history ─────────────────────────────────────────
    const messages = [{ role: 'system', content: sysPrompt }];
    if (mode === 'chat' && history && Array.isArray(history)) {
      for (const h of history.slice(-8)) {
        if (h.role && h.content) messages.push({ role: h.role, content: h.content });
      }
    }
    messages.push({ role: 'user', content: userContent });

    // ── Call OpenAI ─────────────────────────────────────────────────────────
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: isAdmin ? 2000 : 1200,
        temperature: isAdmin ? 0.5 : 0.3
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'OpenAI error', detail: err });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'No response.';
    return res.status(200).json({ reply, mode, isAdmin });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
