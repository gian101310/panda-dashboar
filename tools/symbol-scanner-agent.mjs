/**
 * Symbol Scanner
 * Scans available symbols and pulls live quotes for opportunity detection.
 * Uses get_symbol_list + get_spot_prices from cTrader MCP.
 *
 * Usage:
 *   npm run scan:symbols                     # list all available symbols
 *   npm run scan:symbols -- --filter=USD     # filter by substring
 *   npm run scan:symbols -- --quotes         # get live quotes for engine pairs
 *   npm run scan:symbols -- --quotes --pairs=EURUSD,GBPUSD,USDJPY
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

// Default engine pairs
const ENGINE_PAIRS = [
  'EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY',
  'EURGBP', 'EURAUD', 'EURNZD', 'EURCAD', 'EURCHF', 'EURJPY',
  'GBPAUD', 'GBPNZD', 'GBPCAD', 'GBPCHF', 'GBPJPY',
  'AUDNZD', 'AUDCAD', 'AUDCHF', 'AUDJPY',
  'NZDCAD', 'NZDCHF', 'NZDJPY',
  'CADCHF', 'CADJPY', 'CHFJPY',
];

function stringArg(name, fallback) {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? raw.split('=')[1] : fallback;
}

const cliArgs = new Set(process.argv.slice(2));
const quotesMode = cliArgs.has('--quotes');
const filter = stringArg('filter', null);
const pairsArg = stringArg('pairs', null);

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
      clientInfo: { name: 'panda-symbol-scanner', version: '1.0.0' },
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
  const client = await createMcpClient();

  if (quotesMode) {
    // Pull live quotes for specified or engine pairs
    const pairs = pairsArg ? pairsArg.split(',') : ENGINE_PAIRS;
    console.log(`SCANNING ${pairs.length} pairs for live quotes...\n`);

    const quotes = await client.call('get_spot_prices', { symbols: pairs });
    const prices = quotes?.prices || quotes || [];

    if (Array.isArray(prices)) {
      console.log('SYMBOL     | BID        | ASK        | SPREAD');
      console.log('-'.repeat(55));
      for (const q of prices) {
        const sym = String(q.symbol || q.symbolName || '').padEnd(10);
        const bid = String(q.bid || '').padEnd(10);
        const ask = String(q.ask || '').padEnd(10);
        const spread = q.bid && q.ask ? ((Number(q.ask) - Number(q.bid)) * (String(q.symbol || '').includes('JPY') ? 100 : 10000)).toFixed(1) : '?';
        console.log(`${sym} | ${bid} | ${ask} | ${spread}p`);
      }
    } else {
      console.log(JSON.stringify(prices, null, 2));
    }
    return;
  }

  // List all available symbols
  const result = await client.call('get_symbol_list');
  let symbols = result?.symbols || result || [];

  if (filter) {
    const f = filter.toUpperCase();
    symbols = symbols.filter(s => {
      const name = String(s.name || s.symbolName || s).toUpperCase();
      return name.includes(f);
    });
  }

  console.log(`AVAILABLE SYMBOLS (${symbols.length})${filter ? ` [filter: ${filter}]` : ''}:\n`);

  for (const s of symbols) {
    if (typeof s === 'string') {
      console.log(`  ${s}`);
    } else {
      const name = s.name || s.symbolName || '?';
      const desc = s.description || '';
      console.log(`  ${name}${desc ? ` — ${desc}` : ''}`);
    }
  }
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
