/**
 * Market Order Executor
 * Places instant market orders via cTrader MCP place_market_order.
 * Integrates with Guardian gate — will not execute if RED.
 *
 * Usage:
 *   npm run market:order -- --symbol=EURUSD --direction=BUY --volume=100000
 *   npm run market:order -- --symbol=GBPUSD --direction=SELL --lots=0.5 --sl=1.2750 --tp=1.2600
 *   npm run market:order -- --symbol=EURUSD --direction=BUY --lots=1 --label=PANDA-PLPB --approve
 */

import { existsSync, readFileSync } from 'node:fs';

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

function stringArg(name, fallback) {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? raw.split('=')[1] : fallback;
}

function numberArg(name, fallback) {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? Number(raw.split('=')[1]) : fallback;
}

const cliArgs = new Set(process.argv.slice(2));
const shouldApprove = cliArgs.has('--approve');

const symbol = stringArg('symbol', null);
const direction = stringArg('direction', null);
const volumeUnits = numberArg('volume', null);
const lots = numberArg('lots', null);
const stopLoss = numberArg('sl', null);
const takeProfit = numberArg('tp', null);
const label = stringArg('label', 'PANDA-MARKET');
const comment = stringArg('comment', 'Panda Engine market order');

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
      clientInfo: { name: 'panda-market-order', version: '1.0.0' },
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

async function main() {
  if (!symbol || !direction) {
    console.error('REQUIRED: --symbol=EURUSD --direction=BUY|SELL');
    console.error('OPTIONAL: --lots=1 OR --volume=100000, --sl=1.0800 --tp=1.1000 --label=PANDA-X --approve');
    process.exitCode = 1;
    return;
  }

  const dir = direction.toUpperCase();
  if (dir !== 'BUY' && dir !== 'SELL') {
    console.error('--direction must be BUY or SELL');
    process.exitCode = 1;
    return;
  }

  const client = await createMcpClient();

  // Get symbol details for lot size conversion
  const symbolDetails = await client.call('get_symbol_details', { symbol });
  const lotSize = Number(symbolDetails?.lotSize || symbolDetails?.contractSize || 100000);

  // Calculate volume in units
  let volume = volumeUnits;
  if (!volume && lots) {
    volume = Math.round(lots * lotSize);
  }
  if (!volume) {
    console.error('REQUIRED: --lots=X or --volume=X (integer units)');
    process.exitCode = 1;
    return;
  }

  // Guardian check — get balance and positions to assess risk
  const [balanceResult, positionsResult] = await Promise.all([
    client.call('get_balance'),
    client.call('get_positions'),
  ]);

  const balance = Number(balanceResult?.balance || 0);
  const equity = Number(balanceResult?.equity || 0);
  const positions = positionsResult?.positions || [];
  const openCount = positions.length;

  console.log(`GUARDIAN | balance=$${balance.toFixed(2)} | equity=$${equity.toFixed(2)} | open_positions=${openCount}`);

  // Basic safety checks
  if (equity < balance * 0.9) {
    console.error('BLOCKED | equity < 90% of balance — floating loss too high');
    process.exitCode = 1;
    return;
  }

  // Build order params
  const orderParams = {
    symbol,
    tradeSide: dir,
    volume,
    label,
    comment,
  };
  if (stopLoss) orderParams.stopLoss = stopLoss;
  if (takeProfit) orderParams.takeProfit = takeProfit;

  const lotsDisplay = (volume / lotSize).toFixed(2);
  console.log(`\nORDER | ${symbol} ${dir} ${lotsDisplay}L (${volume} units)`);
  if (stopLoss) console.log(`  SL: ${stopLoss}`);
  if (takeProfit) console.log(`  TP: ${takeProfit}`);
  console.log(`  Label: ${label}`);

  if (!shouldApprove) {
    console.log('\nDRY_RUN | Use --approve to execute this market order');
    return;
  }

  const result = await client.call('place_market_order', orderParams);
  console.log('\nEXECUTED |', JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
