import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';

import {
  buildPullbackPlan,
  classifyEngineSetup,
} from '../lib/engineSetups.mjs';
import {
  classifyGuardianStatus,
  computeChallengeRisk,
} from '../lib/accountGuardian.mjs';
import {
  buildPendingOrderRequest,
  computeRiskSizedVolume,
  evaluatePendingOrderExecution,
  planOpenPositionActions,
  planPendingOrderActions,
} from '../lib/tradeExecutor.mjs';

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

const SUPABASE_URL = 'https://jxkelchxitwuilpbrwxk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
const MCP_URL = process.env.CTRADER_MCP_URL || 'http://127.0.0.1:9876/mcp/';
const args = new Set(process.argv.slice(2));
const approval = args.has('--approve');
const manageOpen = args.has('--manage-open');

function argValue(name, fallback = '') {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? raw.split('=').slice(1).join('=') : fallback;
}

function numberArg(name, fallback) {
  const value = Number(argValue(name, fallback));
  return Number.isFinite(value) ? value : fallback;
}

const challenge = {
  startingBalance: numberArg('starting-balance', 50000),
  dailyLossLimit: numberArg('daily-limit', 2500),
  maxLossLimit: numberArg('max-loss-limit', 5000),
  dailyLossUsed: numberArg('daily-loss-used', 592.46),
  maxLossUsed: numberArg('max-loss-used', 2427.87),
  profitTarget: numberArg('profit-target', 4000),
};
const symbolFilter = String(argValue('symbol', '')).toUpperCase();
const holdHours = Math.max(4, Math.min(12, numberArg('hold-hours', 12)));
const riskPct = numberArg('risk-pct', 0.25);
const maxRiskUsd = numberArg('max-risk', 250);
const safetyBufferUsd = numberArg('safety-buffer', 100);

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
      clientInfo: { name: 'panda-engine-pb-executor', version: '1.0.0' },
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

function currentPriceFromQuote(quote, direction) {
  const bid = Number(quote?.bid);
  const ask = Number(quote?.ask);
  if (direction === 'BUY') return Number.isFinite(ask) ? ask : bid;
  return Number.isFinite(bid) ? bid : ask;
}

function sanitizePosition(position) {
  return {
    id: position.id,
    symbolName: position.symbolName,
    tradeSide: position.tradeSide,
    volume: position.volume,
    netProfit: position.netProfit,
    stopLoss: position.stopLoss,
    takeProfit: position.takeProfit,
    label: position.label,
    comment: position.comment,
  };
}

function sanitizeOrder(order) {
  return {
    id: order.id,
    symbolName: order.symbolName,
    tradeSide: order.tradeSide,
    orderType: order.orderType,
    volume: order.volume,
    targetPrice: order.targetPrice,
    stopLoss: order.stopLoss,
    takeProfit: order.takeProfit,
    label: order.label,
    comment: order.comment,
  };
}

async function loadRows() {
  if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY is required');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await supabase.from('dashboard').select('*');
  if (error) throw new Error(`dashboard fetch failed: ${error.message}`);
  return data || [];
}

function activeEngineSetups(rows, now) {
  return rows
    .map(row => classifyEngineSetup(row, now))
    .filter(setup => setup?.strategy === 'INTRA');
}

async function buildBestIntraPlan(client, rows, now) {
  const plans = [];
  for (const row of rows) {
    if (symbolFilter && String(row.symbol || '').toUpperCase() !== symbolFilter) continue;
    const setup = classifyEngineSetup(row, now);
    if (!setup || setup.strategy !== 'INTRA') continue;
    const quote = await client.call('get_spot_prices', { symbolName: setup.symbol });
    const currentPrice = currentPriceFromQuote(quote, setup.direction);
    const plan = buildPullbackPlan(row, currentPrice, now);
    if (plan?.strategy === 'INTRA') plans.push({ setup, plan, quote });
  }

  return plans.sort((a, b) => Math.abs(b.setup.gap) - Math.abs(a.setup.gap))[0] || null;
}

async function main() {
  const client = await createMcpClient();
  const [balance, positionsResult, ordersResult] = await Promise.all([
    client.call('get_balance'),
    client.call('get_positions'),
    client.call('get_pending_orders'),
  ]);

  const positions = (positionsResult?.positions || []).map(sanitizePosition);
  const pendingOrders = (ordersResult?.orders || []).map(sanitizeOrder);
  const rows = await loadRows();
  const now = new Date();
  const activeSetups = activeEngineSetups(rows, now);
  const staleActions = [
    ...planOpenPositionActions({ positions, activeSetups }),
    ...planPendingOrderActions({ pendingOrders, activeSetups }),
  ];
  const risk = computeChallengeRisk({
    ...challenge,
    balance: balance?.balance,
    equity: balance?.equity,
  });
  const guardian = classifyGuardianStatus({ risk, positions, pendingOrders });
  for (const action of staleActions) {
    console.log(`STALE_${approval && manageOpen ? 'EXEC' : 'DRY'} | ${action.tool} | ${JSON.stringify(action.args)} | reason=${action.reason}`);
    if (approval && manageOpen) await client.call(action.tool, action.args);
  }

  const candidate = await buildBestIntraPlan(client, rows, now);
  if (!candidate) {
    console.log(`NO_VALID_INTRA_PB | guardian=${guardian.state} | symbol=${symbolFilter || 'ALL'}`);
    return;
  }

  const { setup, plan } = candidate;
  const symbolDetails = await client.call('get_symbol_details', { symbolName: setup.symbol });
  const sizing = computeRiskSizedVolume({ plan, risk, symbolDetails, riskPct, maxRiskUsd, safetyBufferUsd });
  const expiresAt = new Date(Date.now() + holdHours * 60 * 60 * 1000);
  const request = buildPendingOrderRequest({ setup, plan, volume: sizing.volume, expiresAt });
  const decision = evaluatePendingOrderExecution({
    guardian,
    setup,
    plan,
    approval,
    pendingOrders,
    now: new Date(),
  });

  console.log([
    decision.allowed ? (approval ? 'APPROVED' : 'DRY') : 'BLOCKED',
    setup.strategy,
    setup.symbol,
    setup.direction,
    `gap=${setup.gap}`,
    `guardian=${guardian.state}`,
    `mode=${guardian.mode}`,
    `entry=${request.limitPrice}`,
    `SLp=${request.stopLossPips}`,
    `TPp=${request.takeProfitPips}`,
    `volume=${request.volume}`,
    `lots=${sizing.lots}`,
    `risk_usd=${sizing.estimatedLossUsd}/${sizing.riskBudgetUsd}`,
    `expires=${request.expiresAt}`,
    `reasons=${decision.reasons.join(',') || 'none'}`,
  ].join(' | '));

  if (!decision.allowed) return;

  const result = await client.call('place_limit_order', request);
  console.log(`PLACED | ${setup.symbol} | order=${JSON.stringify(result)}`);
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
