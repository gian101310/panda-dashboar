/**
 * Trendbars Fetcher
 * Uses cTrader MCP get_trendbars to pull OHLC candle data for backtesting.
 *
 * Timeframes: m1, m5, m15, m30, h1, h4, d1, w1, mn1
 */

const MCP_URL = process.env.CTRADER_MCP_URL || 'http://127.0.0.1:9876/mcp/';

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

export async function createMcpClient() {
  const init = await mcpRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'panda-trendbars', version: '1.0.0' },
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

/**
 * Fetch OHLC trendbars for a symbol.
 * @param {object} client - MCP client
 * @param {object} params
 * @param {string} params.symbol - e.g. "EURUSD"
 * @param {string} params.timeframe - e.g. "h1", "m15", "d1"
 * @param {number} [params.count] - number of bars (default varies by MCP)
 * @param {string} [params.from] - ISO date start
 * @param {string} [params.to] - ISO date end
 * @returns {Array<{open, high, low, close, volume, timestamp}>}
 */
export async function getTrendbars(client, { symbol, timeframe, count, from, to }) {
  const args = { symbol, timeframe };
  if (count) args.count = count;
  if (from) args.from = from;
  if (to) args.to = to;
  const result = await client.call('get_trendbars', args);
  return result?.bars || result?.trendbars || result || [];
}

/**
 * Fetch trendbars for multiple symbols in parallel.
 */
export async function getMultiTrendbars(client, symbols, { timeframe = 'h1', count = 100 } = {}) {
  const results = {};
  const fetches = symbols.map(async (symbol) => {
    try {
      results[symbol] = await getTrendbars(client, { symbol, timeframe, count });
    } catch (e) {
      results[symbol] = { error: e.message };
    }
  });
  await Promise.all(fetches);
  return results;
}

/**
 * Compute simple statistics on OHLC bars.
 */
export function computeBarStats(bars = []) {
  if (!bars.length) return null;
  const closes = bars.map(b => Number(b.close)).filter(Number.isFinite);
  if (!closes.length) return null;

  const last = closes[closes.length - 1];
  const high = Math.max(...bars.map(b => Number(b.high)).filter(Number.isFinite));
  const low = Math.min(...bars.map(b => Number(b.low)).filter(Number.isFinite));
  const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
  const range = high - low;

  return { last, high, low, avg, range, count: bars.length };
}
