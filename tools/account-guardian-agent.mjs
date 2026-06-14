import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';

import {
  classifyGuardianStatus,
  computeChallengeRisk,
} from '../lib/accountGuardian.mjs';
import { evaluatePerformance, mergeStatsIntoGuardian } from '../lib/accountStats.mjs';

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
const shouldWrite = args.has('--write');

function numberArg(name, fallback) {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? Number(raw.split('=')[1]) : fallback;
}

const challenge = {
  startingBalance: numberArg('starting-balance', 50000),
  dailyLossLimit: numberArg('daily-limit', 2500),
  maxLossLimit: numberArg('max-loss-limit', 5000),
  dailyLossUsed: numberArg('daily-loss-used', 592.46),
  maxLossUsed: numberArg('max-loss-used', 2427.87),
  profitTarget: numberArg('profit-target', 4000),
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
      clientInfo: { name: 'panda-account-guardian', version: '1.0.0' },
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
      if (response.json.error) {
        throw new Error(`${name}: ${response.json.error.message || JSON.stringify(response.json.error)}`);
      }
      return parseMcpText(response.json.result);
    },
  };
}

function sanitizePosition(position) {
  return {
    id: position.id,
    symbolName: position.symbolName,
    tradeSide: position.tradeSide,
    volume: position.volume,
    entryPrice: position.entryPrice,
    currentPrice: position.currentPrice,
    pips: position.pips,
    netProfit: position.netProfit,
    stopLoss: position.stopLoss,
    takeProfit: position.takeProfit,
    openTime: position.openTime,
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
    currentPrice: order.currentPrice,
    stopLoss: order.stopLoss,
    takeProfit: order.takeProfit,
    expiration: order.expiration,
  };
}

async function writeSnapshot(snapshot) {
  if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY is required for --write');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { error } = await supabase.from('account_guardian_snapshots').insert(snapshot);
  if (error) throw new Error(`account_guardian_snapshots insert failed: ${error.message}`);
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
  const risk = computeChallengeRisk({
    ...challenge,
    balance: balance?.balance,
    equity: balance?.equity,
  });
  let guardian = classifyGuardianStatus({ risk, positions, pendingOrders });

  // --- STATS GATE: feed win rate + profit factor into Guardian ---
  let statsGate = null;
  try {
    const accountStats = await client.call('get_account_statistics');
    statsGate = evaluatePerformance(accountStats);
    guardian = mergeStatsIntoGuardian(guardian, statsGate);
  } catch (e) {
    console.log(`STATS_GATE_SKIP | ${e.message}`);
  }

  const snapshot = {
    balance: risk.balance,
    equity: risk.equity,
    net_profit: balance?.netProfit ?? null,
    daily_loss_limit: risk.dailyLossLimit,
    daily_loss_used: risk.dailyLossUsed,
    daily_remaining: risk.dailyRemaining,
    max_loss_limit: risk.maxLossLimit,
    max_loss_used: risk.maxLossUsed,
    max_loss_remaining: risk.maxLossRemaining,
    profit_target: risk.profitTarget,
    open_positions: positions,
    pending_orders: pendingOrders,
    guardian_state: guardian.state,
    blockers: guardian.blockers,
    warnings: guardian.warnings,
    mode: guardian.mode,
    stats_gate: guardian.statsGate || null,
    risk_multiplier: guardian.riskMultiplier ?? 1.0,
    stats_detail: guardian.statsDetail || null,
  };

  if (shouldWrite) await writeSnapshot(snapshot);

  console.log([
    shouldWrite ? 'WROTE' : 'DRY',
    `guardian_state=${guardian.state}`,
    `mode=${guardian.mode}`,
    `balance=${risk.balance}`,
    `equity=${risk.equity}`,
    `daily_remaining=${risk.dailyRemaining}`,
    `max_remaining=${risk.maxLossRemaining}`,
    `positions=${positions.length}`,
    `missing_sl=${guardian.positionsWithoutSl}`,
    `pending=${pendingOrders.length}`,
    `stats_gate=${guardian.statsGate || 'N/A'}`,
    `risk_mult=${guardian.riskMultiplier ?? 1.0}`,
    `blockers=${guardian.blockers.join(',') || 'none'}`,
  ].join(' | '));
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
