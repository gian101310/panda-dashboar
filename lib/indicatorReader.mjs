/**
 * Indicator Values Reader
 * Uses cTrader MCP addChartIndicator + getIndicatorValues to read
 * live indicator values (SuperTrend, ATR, etc.) from open charts.
 *
 * Requires a chart to be open for the target symbol/timeframe.
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
      clientInfo: { name: 'panda-indicator-reader', version: '1.0.0' },
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
 * Add an indicator to a chart. Returns indicator reference info.
 * @param {object} client - MCP client from createMcpClient()
 * @param {object} params - { chartId, indicatorName, parameters? }
 *   indicatorName examples: "Supertrend", "Average True Range", "Moving Average"
 *   parameters: indicator-specific params (e.g. { period: 10, multiplier: 3 })
 */
export async function addIndicator(client, { chartId, indicatorName, parameters }) {
  const args = { chartId, indicatorName };
  if (parameters) args.parameters = parameters;
  return client.call('addChartIndicator', args);
}

/**
 * Get current indicator values from a chart.
 * @param {object} client - MCP client
 * @param {object} params - { chartId, indicatorName?, outputIndex?, count? }
 *   outputIndex: which output line (0 = first/main output)
 *   count: how many bars of values to return (default: 1 = current bar only)
 */
export async function getIndicatorValues(client, { chartId, indicatorName, outputIndex = 0, count = 1 }) {
  const args = { chartId };
  if (indicatorName) args.indicatorName = indicatorName;
  if (outputIndex !== undefined) args.outputIndex = outputIndex;
  if (count !== undefined) args.count = count;
  return client.call('getIndicatorValues', args);
}

/**
 * Get SuperTrend value for a chart.
 * @returns {{ value: number, direction: string }} - value is the ST line price
 */
export async function getSuperTrend(client, chartId, { period = 10, multiplier = 3 } = {}) {
  // Try to read existing indicator values first
  try {
    const values = await getIndicatorValues(client, {
      chartId,
      indicatorName: 'Supertrend',
      count: 2,
    });
    return values;
  } catch (e) {
    // If not added yet, add it first
    await addIndicator(client, {
      chartId,
      indicatorName: 'Supertrend',
      parameters: { period, multiplier },
    });
    const values = await getIndicatorValues(client, {
      chartId,
      indicatorName: 'Supertrend',
      count: 2,
    });
    return values;
  }
}

/**
 * Get ATR value for a chart.
 */
export async function getATR(client, chartId, { period = 14 } = {}) {
  try {
    const values = await getIndicatorValues(client, {
      chartId,
      indicatorName: 'Average True Range',
      count: 1,
    });
    return values;
  } catch (e) {
    await addIndicator(client, {
      chartId,
      indicatorName: 'Average True Range',
      parameters: { period },
    });
    return getIndicatorValues(client, {
      chartId,
      indicatorName: 'Average True Range',
      count: 1,
    });
  }
}

/**
 * Find chart for a symbol. Returns chartId or null.
 */
export async function findChart(client, symbolName) {
  const charts = await client.call('list_charts');
  const list = charts?.charts || [];
  const match = list.find(c =>
    String(c.symbolName || c.symbol || '').replace('/', '').toUpperCase() ===
    String(symbolName).replace('/', '').toUpperCase()
  );
  return match?.id || match?.chartId || null;
}
