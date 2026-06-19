/**
 * Autonomous Trading Loop Agent
 * Runs on schedule: scans setups → checks guardian → executes or notifies.
 *
 * Modes (stored in Supabase `engine_config` table):
 *   AUTO   — execute valid trades hands-free if Guardian GREEN
 *   MANUAL — notify via Telegram + browser, wait for user approval
 *
 * Usage:
 *   npm run auto:loop                  # single pass (for Task Scheduler / cron)
 *   npm run auto:loop -- --daemon      # keep running every 5 min
 *   npm run auto:loop -- --mode=AUTO   # override mode for this run
 *   npm run auto:loop -- --mode=MANUAL # override mode for this run
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  classifyGuardianStatus,
  computeChallengeRisk,
  canAutomateExecution,
} from '../lib/accountGuardian.mjs';
import { evaluatePerformance, mergeStatsIntoGuardian } from '../lib/accountStats.mjs';
import { preflightMarginCheck } from '../lib/marginCheck.mjs';
import {
  buildPullbackPlan,
  classifyEngineSetup,
  classifyPandaLinesPbSetup,
  buildEngineChartObjects,
} from '../lib/engineSetups.mjs';
import {
  buildPendingOrderRequest,
  computeRiskSizedVolume,
  deriveUsdPipValuePerUnit,
  evaluatePendingOrderExecution,
} from '../lib/tradeExecutor.mjs';
import {
  computeChallengeBudget,
  computeLotSize,
  formatTradeNotification,
} from '../lib/challengeRisk.mjs';

function loadDotEnv(path = '.env') {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

const MCP_URL = process.env.CTRADER_MCP_URL || 'http://127.0.0.1:9876/mcp/';
const SUPABASE_URL = 'https://jxkelchxitwuilpbrwxk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const args = new Set(process.argv.slice(2));
const isDaemon = args.has('--daemon');
const modeOverride = (process.argv.find(a => a.startsWith('--mode='))?.split('=')[1] || '').toUpperCase();
const LOOP_INTERVAL_MS = 5 * 60 * 1000; // 5 min

// Challenge params — same as execute-engine-pb
const challenge = {
  startingBalance: 50000,
  dailyLossLimit: 2500,
  maxLossLimit: 5000,
  dailyLossUsed: 0,
  maxLossUsed: 0,
  profitTarget: 4000,
};

function parseMcpText(result) {
  const text = result?.content?.find(part => part.type === 'text')?.text;
  return text ? JSON.parse(text) : null;
}

async function mcpRequest(body, sessionId = null) {
  const headers = { 'content-type': 'application/json' };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const res = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`cTrader MCP ${res.status}: ${await res.text()}`);
  return { headers: res.headers, json: await res.json() };
}

async function createMcpClient() {
  const init = await mcpRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'panda-autonomous-loop', version: '1.0.0' },
    },
  });
  const sessionId = init.headers.get('mcp-session-id');
  if (!sessionId) throw new Error('cTrader MCP did not return Mcp-Session-Id');

  let id = 2;
  return {
    async call(name, callArgs = {}) {
      const response = await mcpRequest({
        jsonrpc: '2.0',
        id: id++,
        method: 'tools/call',
        params: { name, arguments: callArgs },
      }, sessionId);
      if (response.json.error) throw new Error(`${name}: ${response.json.error.message || JSON.stringify(response.json.error)}`);
      return parseMcpText(response.json.result);
    },
  };
}

// --- MODE MANAGEMENT ---
async function getExecutionMode() {
  if (modeOverride) return modeOverride;
  if (!SUPABASE_KEY) return 'MANUAL';
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data } = await supabase
    .from('engine_config')
    .select('value')
    .eq('key', 'execution_mode')
    .single();
  return String(data?.value || 'MANUAL').toUpperCase();
}

// --- NOTIFICATION ---
async function sendTelegramNotification(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('NOTIFY_SKIP | No Telegram credentials configured');
    return false;
  }
  // Check global kill switch
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data } = await supabase.from('engine_config').select('value').eq('key', 'telegram_notifications_enabled').single();
    if (data?.value === 'false') { console.log('NOTIFY_SKIP | Global Telegram alerts disabled'); return false; }
  } catch {}

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
      }),
    });
    return res.ok;
  } catch (e) {
    console.log(`TELEGRAM_ERROR | ${e.message}`);
    return false;
  }
}

async function logSetupNotification(supabase, setup, plan, guardian) {
  // Store pending notification for browser push pickup
  try {
    await supabase.from('engine_notifications').insert({
      symbol: setup.symbol,
      direction: setup.direction,
      strategy: setup.strategy,
      entry_price: plan.entry.price,
      sl_price: plan.stopLoss.price,
      tp_price: plan.takeProfit.price,
      risk_reward: plan.riskReward,
      guardian_state: guardian.state,
      status: 'PENDING',
    });
  } catch { /* non-critical */ }
}

// --- CHART ANNOTATION ---
async function annotateChart(client, setup, plan) {
  const timeframe = setup.strategy === 'INTRA' ? 'm15' : 'h1';
  const nowIso = new Date().toISOString();

  // Open or focus chart
  const chartsResult = await client.call('list_charts');
  const existing = (chartsResult?.charts || []).find(c =>
    c.symbolName === setup.symbol && String(c.timeframe || '').toLowerCase() === timeframe
  );
  let chartId = existing?.chartId;
  if (chartId) {
    await client.call('focus_chart', { chartId });
  } else {
    const opened = await client.call('open_chart', { symbolName: setup.symbol, timeframe });
    chartId = opened?.chartId;
    if (chartId) await client.call('focus_chart', { chartId });
  }

  // Draw entry/SL/TP + R:R tool
  const objects = buildEngineChartObjects(setup, plan, nowIso);
  for (const obj of objects) {
    await client.call('add_chart_object', obj);
  }
  return chartId;
}

// --- MAIN LOOP PASS ---
async function runPass() {
  const timestamp = new Date().toISOString();
  console.log(`\n${'='.repeat(60)}\nLOOP_PASS | ${timestamp}\n${'='.repeat(60)}`);

  let client;
  try {
    client = await createMcpClient();
  } catch (e) {
    console.log(`MCP_OFFLINE | ${e.message} — skipping pass`);
    return;
  }

  const mode = await getExecutionMode();
  console.log(`MODE | ${mode}`);

  // Fetch account state
  const [balance, positionsResult, ordersResult] = await Promise.all([
    client.call('get_balance'),
    client.call('get_positions'),
    client.call('get_pending_orders'),
  ]);

  const positions = positionsResult?.positions || [];
  const pendingOrders = ordersResult?.orders || [];

  // Compute Guardian state
  const risk = computeChallengeRisk({
    ...challenge,
    balance: balance?.balance,
    equity: balance?.equity,
    dailyLossUsed: balance?.dailyLossUsed || challenge.dailyLossUsed,
    maxLossUsed: balance?.maxLossUsed || challenge.maxLossUsed,
  });
  let guardian = classifyGuardianStatus({ risk, positions, pendingOrders });

  // Stats gate
  try {
    const stats = await client.call('get_account_statistics');
    const statsGate = evaluatePerformance(stats);
    guardian = mergeStatsIntoGuardian(guardian, statsGate);
  } catch { /* stats unavailable — proceed */ }

  console.log(`GUARDIAN | state=${guardian.state} | mode=${guardian.mode} | blockers=${guardian.blockers?.join(',') || 'none'}`);

  if (guardian.state === 'RED') {
    console.log('GUARDIAN_RED | No execution allowed — exiting pass');
    return;
  }

  // Load setups from dashboard
  if (!SUPABASE_KEY) throw new Error('SUPABASE_KEY required');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: rows } = await supabase.from('dashboard').select('*');
  if (!rows?.length) { console.log('NO_DASHBOARD_ROWS'); return; }

  const now = new Date();
  const validSetups = [];

  for (const row of rows) {
    const setup = classifyEngineSetup(row, now) || classifyPandaLinesPbSetup(row);
    if (!setup) continue;

    // Get live quote
    const quote = await client.call('get_spot_prices', { symbolName: setup.symbol });
    const bid = Number(quote?.bid), ask = Number(quote?.ask);
    const currentPrice = setup.direction === 'BUY' ? (Number.isFinite(ask) ? ask : bid) : (Number.isFinite(bid) ? bid : ask);
    if (!Number.isFinite(currentPrice)) continue;

    const plan = buildPullbackPlan(row, currentPrice, now, { mode: setup.strategy });
    if (!plan) continue;

    // Check if already have a pending order for this symbol+direction
    const alreadyPending = pendingOrders.some(o =>
      o.symbolName === setup.symbol && o.tradeSide === setup.direction
    );
    if (alreadyPending) continue;

    validSetups.push({ setup, plan, row });
  }

  if (!validSetups.length) {
    console.log('NO_VALID_SETUPS | Guardian is fine but no PB setups qualify');
    return;
  }

  // Sort by gap strength
  validSetups.sort((a, b) => Math.abs(b.setup.gap) - Math.abs(a.setup.gap));
  const best = validSetups[0];
  const { setup, plan, row } = best;

  console.log(`BEST_SETUP | ${setup.strategy} ${setup.symbol} ${setup.direction} | gap=${setup.gap} | RR=${plan.riskReward}:1`);

  // Annotate chart regardless of mode
  try {
    const chartId = await annotateChart(client, setup, plan);
    console.log(`CHART_ANNOTATED | ${setup.symbol} | chart=${chartId || 'active'}`);
  } catch (e) {
    console.log(`CHART_SKIP | ${e.message}`);
  }

  // --- CHALLENGE-AWARE RISK BUDGET ---
  // Count PANDA positions and risk
  const pandaPositions = positions.filter(p =>
    String(p.label || '').startsWith('PANDA') || String(p.comment || '').includes('Panda')
  );
  const sameDirectionCount = pandaPositions.filter(p =>
    String(p.tradeSide || '').toUpperCase() === setup.direction
  ).length;
  const openRiskUsd = pandaPositions.reduce((sum, p) => {
    const sl = Number(p.stopLoss);
    const entry = Number(p.entryPrice || p.currentPrice);
    if (!sl || !entry) return sum + 100; // assume $100 risk if no SL
    return sum + Math.abs(entry - sl) * Number(p.volume || 0) * 0.0001; // rough estimate
  }, 0);

  const budget = computeChallengeBudget({
    dailyRemaining: risk.dailyRemaining,
    maxLossRemaining: risk.maxLossRemaining,
    openPositionCount: pandaPositions.length,
    openDirectionCount: sameDirectionCount,
    openRiskUsd,
  });

  if (!budget.allowed) {
    console.log(`CHALLENGE_BLOCKED | ${budget.reason} | positions=${pandaPositions.length}`);
    await sendTelegramNotification(
      `🚫 *CHALLENGE BLOCK*\n${setup.symbol} ${setup.direction}\nReason: ${budget.reason}\nPositions: ${pandaPositions.length}/3`
    );
    return;
  }

  // Get symbol details for lot calculation
  const symbolDetails = await client.call('get_symbol_details', { symbolName: setup.symbol });
  const pipUnit = deriveUsdPipValuePerUnit({ symbolDetails });
  const sizing = computeLotSize({
    maxRiskUsd: budget.maxRiskUsd,
    slPips: plan.stopLoss.pips,
    pipValuePerUnit: pipUnit,
    lotSize: Number(symbolDetails?.lotSize || 100000),
    volumeStep: Number(symbolDetails?.volumeStep || 100000),
    minVolume: Number(symbolDetails?.minVolume || 100000),
  });

  if (!sizing.volume) {
    console.log(`SIZING_FAILED | ${sizing.reason} | budget=$${budget.maxRiskUsd} | SL=${plan.stopLoss.pips}p`);
    return;
  }

  console.log(`SIZING | lots=${sizing.lots} | risk=$${sizing.estimatedRiskUsd}/$${budget.maxRiskUsd} | slots=${budget.slotsAvailable}/3`);

  if (mode === 'AUTO') {
    // --- AUTO EXECUTION ---
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const request = buildPendingOrderRequest({ setup, plan, volume: sizing.volume, expiresAt });

    // Margin preflight
    const marginCheck = await preflightMarginCheck(client, {
      symbol: setup.symbol,
      tradeSide: setup.direction,
      volume: request.volume,
    });

    if (!marginCheck.allowed) {
      console.log(`MARGIN_BLOCKED | ${marginCheck.reason}`);
      await sendTelegramNotification(
        `⚠️ *MARGIN BLOCKED*\n${setup.symbol} ${setup.direction}\nReason: ${marginCheck.reason}`
      );
      return;
    }

    // Execute
    const result = await client.call('place_limit_order', request);
    console.log(`AUTO_EXECUTED | ${setup.symbol} ${setup.direction} | lots=${sizing.lots} | order=${JSON.stringify(result)}`);

    // Notify with full details
    await sendTelegramNotification(
      `✅ *AUTO EXECUTED*\n\n` +
      `*${setup.strategy}* | ${setup.symbol} *${setup.direction}*\n` +
      `Entry: \`${plan.entry.price}\`\n` +
      `SL: \`${plan.stopLoss.price}\` (${plan.stopLoss.pips}p)\n` +
      `TP: \`${plan.takeProfit.price}\` (${plan.takeProfit.pips}p)\n` +
      `R:R: *${plan.riskReward}:1*\n\n` +
      `📊 *Lots: ${sizing.lots}* | Risk: $${sizing.estimatedRiskUsd}\n` +
      `🛡 Daily room: $${Math.round(risk.dailyRemaining)} | Max room: $${Math.round(risk.maxLossRemaining)}\n` +
      `Open: ${pandaPositions.length + 1}/3 positions`
    );

  } else {
    // --- MANUAL MODE: Full notification ---
    const msg = formatTradeNotification({ setup, plan, sizing, budget, guardian });
    await sendTelegramNotification(msg);
    await logSetupNotification(supabase, setup, plan, guardian);
    console.log(`NOTIFIED | ${setup.symbol} ${setup.direction} | lots=${sizing.lots} | risk=$${sizing.estimatedRiskUsd} | awaiting approval`);
  }
}

// --- ENTRY POINT ---
async function main() {
  await runPass();

  if (isDaemon) {
    console.log(`\nDAEMON_MODE | Looping every ${LOOP_INTERVAL_MS / 1000}s. Press Ctrl+C to stop.`);
    setInterval(runPass, LOOP_INTERVAL_MS);
  }
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
