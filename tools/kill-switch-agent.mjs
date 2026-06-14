/**
 * Emergency Kill Switch
 * Closes ALL open positions and cancels ALL pending orders.
 * Use in panic situations — daily loss breach, news event, etc.
 *
 * Usage:
 *   npm run killswitch              # dry-run — shows what would be closed
 *   npm run killswitch -- --confirm # ACTUALLY closes everything
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
const cliArgs = new Set(process.argv.slice(2));
const confirmed = cliArgs.has('--confirm');
const pandaOnly = cliArgs.has('--panda-only');

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
      clientInfo: { name: 'panda-kill-switch', version: '1.0.0' },
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

function isPanda(item) {
  return String(item.label || '').startsWith('PANDA-') || String(item.comment || '').includes('Panda Engine');
}

async function main() {
  console.log('=== KILL SWITCH ===');
  if (pandaOnly) console.log('MODE: PANDA-only (manual trades untouched)');
  else console.log('MODE: ALL positions and orders');
  console.log('');

  const client = await createMcpClient();

  const [positionsResult, ordersResult, balanceResult] = await Promise.all([
    client.call('get_positions'),
    client.call('get_pending_orders'),
    client.call('get_balance'),
  ]);

  let positions = positionsResult?.positions || [];
  let orders = ordersResult?.orders || ordersResult?.pendingOrders || [];
  const balance = Number(balanceResult?.balance || 0);
  const equity = Number(balanceResult?.equity || 0);

  if (pandaOnly) {
    positions = positions.filter(isPanda);
    orders = orders.filter(isPanda);
  }

  console.log(`ACCOUNT | balance=$${balance.toFixed(2)} | equity=$${equity.toFixed(2)}`);
  console.log(`TARGETS | positions=${positions.length} | orders=${orders.length}`);
  console.log('');

  // Show positions
  if (positions.length) {
    console.log('POSITIONS TO CLOSE:');
    let totalPnl = 0;
    for (const p of positions) {
      const pnl = Number(p.netProfit ?? p.profit ?? 0);
      totalPnl += pnl;
      const lotSize = Number(p.lotSize || 100000);
      const lotsDisplay = (Number(p.volume || 0) / lotSize).toFixed(2);
      console.log(`  ${p.symbolName} ${p.tradeSide} ${lotsDisplay}L | PnL=$${pnl.toFixed(2)} | id=${p.id}`);
    }
    console.log(`  TOTAL floating PnL: $${totalPnl.toFixed(2)}`);
    console.log('');
  }

  // Show orders
  if (orders.length) {
    console.log('ORDERS TO CANCEL:');
    for (const o of orders) {
      const lotSize = Number(o.lotSize || 100000);
      const lotsDisplay = (Number(o.volume || 0) / lotSize).toFixed(2);
      console.log(`  ${o.symbolName} ${o.tradeSide} ${lotsDisplay}L @ ${o.targetPrice || o.price} | id=${o.id}`);
    }
    console.log('');
  }

  if (!positions.length && !orders.length) {
    console.log('NOTHING_TO_KILL | No open positions or pending orders');
    return;
  }

  if (!confirmed) {
    console.log('DRY_RUN | Use --confirm to execute kill switch');
    return;
  }

  // Execute: close positions first, then cancel orders
  console.log('EXECUTING...');

  let closedCount = 0;
  for (const p of positions) {
    try {
      await client.call('close_position', { positionId: p.id });
      console.log(`  CLOSED | ${p.symbolName} ${p.tradeSide} id=${p.id}`);
      closedCount++;
    } catch (e) {
      console.error(`  FAILED | close ${p.id}: ${e.message}`);
    }
  }

  let cancelledCount = 0;
  for (const o of orders) {
    try {
      await client.call('cancel_order', { orderId: o.id });
      console.log(`  CANCELLED | ${o.symbolName} ${o.tradeSide} id=${o.id}`);
      cancelledCount++;
    } catch (e) {
      console.error(`  FAILED | cancel ${o.id}: ${e.message}`);
    }
  }

  console.log(`\nDONE | closed=${closedCount}/${positions.length} | cancelled=${cancelledCount}/${orders.length}`);
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
