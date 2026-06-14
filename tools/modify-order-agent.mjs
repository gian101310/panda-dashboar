/**
 * Pending Order Modifier
 * Edit SL, TP, entry price, or volume on existing pending orders.
 *
 * Usage:
 *   npm run modify:order -- --id=123456 --sl=1.0800 --tp=1.1000 --approve
 *   npm run modify:order -- --id=123456 --price=1.0850 --approve
 *   npm run modify:order -- --id=123456 --volume=200000 --approve
 *   npm run modify:order -- --list   # show all pending orders
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
const listMode = cliArgs.has('--list');

const orderId = stringArg('id', null);
const newSl = numberArg('sl', null);
const newTp = numberArg('tp', null);
const newPrice = numberArg('price', null);
const newVolume = numberArg('volume', null);
const newLots = numberArg('lots', null);

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
      clientInfo: { name: 'panda-modify-order', version: '1.0.0' },
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

  // List mode — show all pending orders
  if (listMode || !orderId) {
    const ordersResult = await client.call('get_pending_orders');
    const orders = ordersResult?.orders || ordersResult?.pendingOrders || [];

    if (!orders.length) {
      console.log('NO_PENDING_ORDERS');
      return;
    }

    console.log(`PENDING ORDERS (${orders.length}):`);
    for (const o of orders) {
      const lotSize = Number(o.lotSize || 100000);
      const lotsDisplay = (Number(o.volume || 0) / lotSize).toFixed(2);
      console.log([
        `  id=${o.id}`,
        `${o.symbolName}`,
        `${o.tradeSide}`,
        `${lotsDisplay}L`,
        `@ ${o.targetPrice || o.price || '?'}`,
        o.stopLoss ? `SL=${o.stopLoss}` : '',
        o.takeProfit ? `TP=${o.takeProfit}` : '',
        o.label ? `[${o.label}]` : '',
      ].filter(Boolean).join(' | '));
    }

    if (!orderId) {
      console.log('\nUse --id=<orderId> to modify a specific order');
    }
    return;
  }

  // Modify mode
  const modifyArgs = { orderId };
  const changes = [];

  if (newSl !== null) { modifyArgs.stopLoss = newSl; changes.push(`SL→${newSl}`); }
  if (newTp !== null) { modifyArgs.takeProfit = newTp; changes.push(`TP→${newTp}`); }
  if (newPrice !== null) { modifyArgs.targetPrice = newPrice; changes.push(`Price→${newPrice}`); }

  if (newVolume !== null) {
    modifyArgs.volume = newVolume;
    changes.push(`Volume→${newVolume}`);
  } else if (newLots !== null) {
    // Need symbol details to convert lots → volume
    const ordersResult = await client.call('get_pending_orders');
    const orders = ordersResult?.orders || ordersResult?.pendingOrders || [];
    const order = orders.find(o => String(o.id) === String(orderId));
    if (order) {
      const lotSize = Number(order.lotSize || 100000);
      modifyArgs.volume = Math.round(newLots * lotSize);
      changes.push(`Lots→${newLots} (${modifyArgs.volume} units)`);
    }
  }

  if (!changes.length) {
    console.error('No changes specified. Use --sl, --tp, --price, --volume, or --lots');
    process.exitCode = 1;
    return;
  }

  console.log(`MODIFY order ${orderId}: ${changes.join(', ')}`);

  if (!shouldApprove) {
    console.log('\nDRY_RUN | Use --approve to apply changes');
    return;
  }

  const result = await client.call('modify_pending_order', modifyArgs);
  console.log('APPLIED |', JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
