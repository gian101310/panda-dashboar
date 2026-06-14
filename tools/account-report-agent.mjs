/**
 * Full Account Reporter
 * Comprehensive account state dump: balance, equity, margin, positions,
 * pending orders, and deal history summary.
 *
 * Usage:
 *   npm run account:report
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
      clientInfo: { name: 'panda-account-report', version: '1.0.0' },
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

function fmt(n, decimals = 2) {
  return Number.isFinite(Number(n)) ? Number(n).toFixed(decimals) : String(n ?? 'N/A');
}

async function main() {
  const client = await createMcpClient();

  // Fetch everything in parallel
  const [balanceResult, positionsResult, ordersResult, dealsResult] = await Promise.all([
    client.call('get_balance'),
    client.call('get_positions'),
    client.call('get_pending_orders'),
    client.call('get_deals', { count: 20 }).catch(() => null),
  ]);

  // === ACCOUNT SUMMARY ===
  console.log('=== ACCOUNT REPORT ===');
  console.log(`Time: ${new Date().toISOString()}\n`);

  const b = balanceResult || {};
  console.log('--- BALANCE ---');
  console.log(`  Balance:       $${fmt(b.balance)}`);
  console.log(`  Equity:        $${fmt(b.equity)}`);
  console.log(`  Free Margin:   $${fmt(b.freeMargin)}`);
  console.log(`  Used Margin:   $${fmt(b.usedMargin || b.margin)}`);
  console.log(`  Margin Level:  ${fmt(b.marginLevel)}%`);
  console.log(`  Unrealized PnL: $${fmt(b.unrealizedPnl || b.netProfit)}`);

  // === OPEN POSITIONS ===
  const positions = positionsResult?.positions || [];
  console.log(`\n--- OPEN POSITIONS (${positions.length}) ---`);

  if (positions.length) {
    let totalPnl = 0;
    let totalVolume = 0;
    for (const p of positions) {
      const pnl = Number(p.netProfit ?? p.profit ?? 0);
      totalPnl += pnl;
      const lotSize = Number(p.lotSize || 100000);
      const vol = Number(p.volume || 0);
      totalVolume += vol;
      const lotsDisplay = (vol / lotSize).toFixed(2);
      const pips = Number(p.pips || 0);
      const isPanda = String(p.label || '').startsWith('PANDA-');

      console.log(`  ${p.symbolName} ${p.tradeSide} ${lotsDisplay}L | entry=${p.entryPrice} | pips=${pips.toFixed(1)} | PnL=$${pnl.toFixed(2)} | SL=${p.stopLoss || 'NONE'} | TP=${p.takeProfit || 'NONE'}${isPanda ? ' [PANDA]' : ''}`);
    }
    console.log(`  TOTAL: ${positions.length} positions | PnL=$${totalPnl.toFixed(2)}`);
  }

  // === PENDING ORDERS ===
  const orders = ordersResult?.orders || ordersResult?.pendingOrders || [];
  console.log(`\n--- PENDING ORDERS (${orders.length}) ---`);

  if (orders.length) {
    for (const o of orders) {
      const lotSize = Number(o.lotSize || 100000);
      const lotsDisplay = (Number(o.volume || 0) / lotSize).toFixed(2);
      console.log(`  ${o.symbolName} ${o.tradeSide} ${lotsDisplay}L @ ${o.targetPrice || o.price} | SL=${o.stopLoss || 'NONE'} | TP=${o.takeProfit || 'NONE'} | ${o.label || ''}`);
    }
  }

  // === RECENT DEALS ===
  const deals = dealsResult?.deals || [];
  console.log(`\n--- RECENT DEALS (last ${deals.length}) ---`);

  if (deals.length) {
    let totalProfit = 0;
    let wins = 0;
    let losses = 0;
    for (const d of deals.slice(0, 10)) {
      const pnl = Number(d.netProfit ?? d.profit ?? 0);
      totalProfit += pnl;
      if (pnl >= 0) wins++; else losses++;
      console.log(`  ${d.symbolName} ${d.tradeSide} | PnL=$${pnl.toFixed(2)} | ${d.closeTime || d.executionTime || ''}`);
    }
    if (deals.length > 10) console.log(`  ... and ${deals.length - 10} more`);
    console.log(`  SUMMARY: W=${wins} L=${losses} | Total=$${totalProfit.toFixed(2)}`);
  }

  console.log('\n=== END REPORT ===');
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
