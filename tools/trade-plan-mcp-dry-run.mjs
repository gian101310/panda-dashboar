const mcpUrl = process.env.CTRADER_MCP_URL || 'http://127.0.0.1:9876/mcp/';
const symbol = process.argv.find(argument => argument.startsWith('--symbol='))?.slice(9)?.toUpperCase();
const accountLogin = Number(process.argv.find(argument => argument.startsWith('--account='))?.slice(10));

if (!symbol || !Number.isInteger(accountLogin)) {
  console.error('Usage: node tools/trade-plan-mcp-dry-run.mjs --symbol=EURGBP --account=2243677');
  process.exit(2);
}

let sessionId;
let requestId = 0;

async function request(method, params) {
  const response = await fetch(mcpUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`MCP ${response.status}: ${await response.text()}`);
  sessionId ||= response.headers.get('mcp-session-id');
  const result = await response.json();
  if (result.error) throw new Error(`${method}: ${result.error.message}`);
  return result.result;
}

async function call(name, args = {}) {
  const result = await request('tools/call', { name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${result.content?.[0]?.text || 'tool failed'}`);
  const content = result.content?.find(item => item.type === 'text')?.text;
  if (!content) throw new Error(`${name}: empty response`);
  return JSON.parse(content);
}

async function output(indicatorId, outputIndex) {
  const result = await call('getIndicatorValues', { indicatorId, outputIndex, count: 1 });
  const value = result.values?.[0];
  return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
}

async function main() {
  await request('initialize', {
    protocolVersion: '2025-11-25', capabilities: {},
    clientInfo: { name: 'panda-trade-plan-dry-run', version: '1.0.0' },
  });

  const charts = await call('list_charts');
  const chart = charts.charts?.find(item => item.isActive && item.symbolName === symbol);
  if (!chart) throw new Error(`Active chart is not ${symbol}; no chart was changed`);
  const indicators = await call('listChartIndicators');
  const plans = indicators.indicators?.filter(item => item.title === 'Panda Trade Plan' && item.isRunning) || [];
  if (plans.length !== 1) throw new Error(`Expected one running Panda Trade Plan on ${symbol}; found ${plans.length}`);
  const indicator = plans[0];
  if (indicator.lineOutputCount < 7) throw new Error('Indicator has no readiness output; rebuild/reload the dry-run version');

  const entry = await output(indicator.id, 0);
  const stop = await output(indicator.id, 1);
  const target = await output(indicator.id, 2);
  const ready = await output(indicator.id, 5);
  const volume = ready === 1 ? await output(indicator.id, 6) : null;
  const [prices, details, orders, positions, accounts] = await Promise.all([
    call('get_spot_prices', { symbolName: symbol }),
    call('get_symbol_details', { symbolName: symbol }),
    call('get_pending_orders'), call('get_positions'), call('get_accounts_list'),
  ]);
  const readyAgain = await output(indicator.id, 5);
  const reasons = [];
  if (ready !== 1 || readyAgain !== 1) reasons.push('INDICATOR_NOT_READY');
  if (![entry, stop, target].every(Number.isFinite) || (ready === 1 && !Number.isFinite(volume))) reasons.push('MISSING_PLAN_VALUES');
  const side = [entry, stop, target].every(Number.isFinite)
    ? stop > entry && target < entry ? 'sell' : stop < entry && target > entry ? 'buy' : null
    : null;
  if (!side) reasons.push('INVALID_GEOMETRY');
  const quote = side === 'buy' ? Number(prices.ask) : Number(prices.bid);
  if (!Number.isFinite(quote) || (side === 'buy' ? entry >= quote : entry <= quote)) reasons.push('LIMIT_PRICE_CROSSED');
  const pipSize = Number(details.pipSize);
  if (!Number.isFinite(pipSize) || pipSize <= 0 || Math.abs(entry - target) / pipSize < 50) reasons.push('TP_BELOW_50_PIPS');
  const minimum = Number(details.minVolume);
  const maximum = Number(details.maxVolume);
  const step = Number(details.volumeStep);
  if (ready === 1 && (!Number.isFinite(volume) || volume < minimum || volume > maximum || !Number.isFinite(step) || step <= 0 ||
      Math.abs(volume / step - Math.round(volume / step)) > 0.000001)) reasons.push('INVALID_VOLUME');
  const account = accounts.accounts?.find(item => Number(item.login) === accountLogin && item.isLive);
  if (!account) reasons.push('LIVE_ACCOUNT_NOT_FOUND');
  else if (!account.isOnline) reasons.push('LIVE_ACCOUNT_OFFLINE');
  const pending = orders.orders || orders.pendingOrders || [];
  const open = positions.positions || [];
  if (pending.some(item => item.symbolName === symbol)) reasons.push('EXISTING_PENDING_ORDER');
  if (open.some(item => item.symbolName === symbol)) reasons.push('EXISTING_POSITION');

  console.log(JSON.stringify({
    mode: 'DRY_RUN_ONLY', status: reasons.length ? 'BLOCKED' : 'CANDIDATE_ONLY', reasons,
    symbol, accountLogin, indicatorReady: ready === 1 && readyAgain === 1,
    side, entry, stopLoss: stop, takeProfit: target, volumeUnits: volume,
    quote, pendingOrdersOnSymbol: pending.filter(item => item.symbolName === symbol).length,
    openPositionsOnSymbol: open.filter(item => item.symbolName === symbol).length,
    accountSelectionVerified: false, orderPlaced: false,
  }, null, 2));
}

main().catch(error => {
  console.error(`DRY_RUN_FAILED | ${error.message}`);
  process.exitCode = 1;
});
