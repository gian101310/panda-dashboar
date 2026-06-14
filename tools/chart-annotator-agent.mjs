/**
 * Chart Annotator Agent
 * Auto-opens chart + draws entry/SL/TP lines with R:R when valid setup detected.
 *
 * Usage:
 *   npm run chart:annotate                    # dry-run — shows what would be drawn
 *   npm run chart:annotate -- --draw          # actually draw on cTrader charts
 *   npm run chart:annotate -- --symbol=EURUSD # single pair
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  buildEngineChartObjects,
  buildPullbackPlan,
  classifyEngineSetup,
  classifyPandaLinesPbSetup,
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

const MCP_URL = process.env.CTRADER_MCP_URL || 'http://127.0.0.1:9876/mcp/';
const SUPABASE_URL = 'https://jxkelchxitwuilpbrwxk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

const cliArgs = new Set(process.argv.slice(2));
const shouldDraw = cliArgs.has('--draw');
const symbolFilter = (process.argv.find(a => a.startsWith('--symbol='))?.split('=')[1] || '').toUpperCase();

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
      clientInfo: { name: 'panda-chart-annotator', version: '1.0.0' },
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

async function focusOrOpenChart(client, symbol, timeframe = 'h1') {
  const chartsResult = await client.call('list_charts');
  const existing = (chartsResult?.charts || []).find(chart =>
    chart.symbolName === symbol && String(chart.timeframe || '').toLowerCase() === timeframe
  );
  if (existing?.chartId) {
    await client.call('focus_chart', { chartId: existing.chartId });
    return existing.chartId;
  }

  const opened = await client.call('open_chart', { symbolName: symbol, timeframe });
  if (opened?.chartId) {
    await client.call('focus_chart', { chartId: opened.chartId });
    return opened.chartId;
  }
  return null;
}

async function main() {
  const client = await createMcpClient();

  // Load dashboard rows
  if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY required');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: rows, error } = await supabase.from('dashboard').select('*');
  if (error) throw new Error(`dashboard fetch: ${error.message}`);

  const now = new Date();
  const nowIso = now.toISOString();
  let drawn = 0;

  for (const row of rows || []) {
    const symbol = String(row.symbol || '').toUpperCase();
    if (symbolFilter && symbol !== symbolFilter) continue;

    // Try both setup classifiers
    const setup = classifyEngineSetup(row, now) || classifyPandaLinesPbSetup(row);
    if (!setup) continue;

    // Get live quote for plan
    const quote = await client.call('get_spot_prices', { symbolName: setup.symbol });
    const bid = Number(quote?.bid);
    const ask = Number(quote?.ask);
    const currentPrice = setup.direction === 'BUY' ? (Number.isFinite(ask) ? ask : bid) : (Number.isFinite(bid) ? bid : ask);
    if (!Number.isFinite(currentPrice)) continue;

    const plan = buildPullbackPlan(row, currentPrice, now, { mode: setup.strategy });
    if (!plan) continue;

    // Build chart objects (entry/SL/TP lines + R:R tool + text label)
    const objects = buildEngineChartObjects(setup, plan, nowIso);

    console.log([
      shouldDraw ? 'DRAW' : 'DRY',
      setup.strategy,
      setup.symbol,
      setup.direction,
      `gap=${setup.gap}`,
      `entry=${plan.entry.price}`,
      `SL=${plan.stopLoss.price} (${plan.stopLoss.pips}p)`,
      `TP=${plan.takeProfit.price} (${plan.takeProfit.pips}p)`,
      `RR=${plan.riskReward}:1`,
    ].join(' | '));

    if (shouldDraw) {
      const timeframe = setup.strategy === 'INTRA' ? 'm15' : 'h1';
      const chartId = await focusOrOpenChart(client, setup.symbol, timeframe);
      for (const obj of objects) {
        await client.call('add_chart_object', obj);
      }
      console.log(`  CHART_OPENED | ${setup.symbol} ${timeframe} | chart=${chartId || 'active'} | objects=${objects.length}`);
      drawn++;
    }
  }

  console.log(`\n${shouldDraw ? 'DRAWN' : 'DRY_RUN'} | ${drawn} charts annotated`);
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
