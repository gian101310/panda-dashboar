import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';

import {
  buildEngineChartObjects,
  buildPullbackPlan,
  classifyEngineSetup,
} from '../lib/engineSetups.mjs';

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
const dryRun = args.has('--dry-run');
const strategyArg = process.argv.find(a => a.startsWith('--strategy='));
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const strategyFilter = (strategyArg?.split('=')[1] || 'all').toUpperCase();
const limit = Math.max(1, Math.min(10, Number(limitArg?.split('=')[1] || 5)));

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
      clientInfo: { name: 'panda-engine-pb-plotter', version: '1.0.0' },
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

async function loadRows() {
  if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY is required');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await supabase.from('dashboard').select('*');
  if (error) throw new Error(`dashboard fetch failed: ${error.message}`);
  return data || [];
}

async function buildPlans(client) {
  const rows = await loadRows();
  const plans = [];
  for (const row of rows) {
    const setup = classifyEngineSetup(row);
    if (!setup) continue;
    if (strategyFilter !== 'ALL' && strategyFilter !== setup.strategy) continue;

    const quote = await client.call('get_spot_prices', { symbolName: setup.symbol });
    const currentPrice = currentPriceFromQuote(quote, setup.direction);
    const plan = buildPullbackPlan(row, currentPrice);
    if (!plan) continue;
    plans.push({ setup, plan, quote });
  }

  return plans
    .sort((a, b) => {
      if (a.setup.strategy !== b.setup.strategy) return a.setup.strategy === 'INTRA' ? -1 : 1;
      return Math.abs(b.setup.gap) - Math.abs(a.setup.gap);
    })
    .slice(0, limit);
}

async function main() {
  const client = await createMcpClient();
  const plans = await buildPlans(client);
  if (!plans.length) {
    console.log(`No engine PB plans found for strategy=${strategyFilter}.`);
    return;
  }

  const nowIso = new Date().toISOString();
  for (const { setup, plan } of plans) {
    const objects = buildEngineChartObjects(setup, plan, nowIso);
    if (!dryRun) {
      await client.call('open_chart', { symbolName: setup.symbol, timeframe: setup.strategy === 'INTRA' ? 'm15' : 'h1' });
      for (const object of objects) await client.call('add_chart_object', object);
    }
    console.log([
      dryRun ? 'DRY' : 'PLOTTED',
      setup.strategy,
      setup.symbol,
      setup.direction,
      `gap=${setup.gap}`,
      `entry=${plan.entry.label} ${plan.entry.price}`,
      `SL=${plan.stopLoss.price} (${plan.stopLoss.pips}p)`,
      `TP=${plan.takeProfit.label} ${plan.takeProfit.price} (${plan.takeProfit.pips}p)`,
      `RR=${plan.riskReward}:1`,
    ].join(' | '));
  }
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
