/**
 * Journal Sync Agent
 * Pulls closed trades from cTrader MCP (get_deals + get_order_history)
 * and upserts them into trade_journal table in Supabase.
 *
 * Usage:
 *   npm run journal:sync              # dry-run
 *   npm run journal:sync -- --write   # actually write to Supabase
 *   npm run journal:sync -- --write --count=100  # fetch last 100 deals
 */

import { createClient } from '@supabase/supabase-js';
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

const SUPABASE_URL = 'https://jxkelchxitwuilpbrwxk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
const MCP_URL = process.env.CTRADER_MCP_URL || 'http://127.0.0.1:9876/mcp/';
const cliArgs = new Set(process.argv.slice(2));
const shouldWrite = cliArgs.has('--write');

function numberArg(name, fallback) {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? Number(raw.split('=')[1]) : fallback;
}

const fetchCount = numberArg('count', 50);

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
      clientInfo: { name: 'panda-journal-sync', version: '1.0.0' },
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

function calcPips(symbol, direction, entryPrice, exitPrice) {
  if (!entryPrice || !exitPrice) return 0;
  const pip = String(symbol || '').toUpperCase().includes('JPY') ? 0.01 : 0.0001;
  const raw = direction === 'BUY' ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
  return Math.round((raw / pip) * 10) / 10;
}

function mapDealToJournalRow(deal) {
  const symbol = String(deal.symbolName || '').replace('/', '').toUpperCase();
  const direction = String(deal.tradeSide || deal.direction || '').toUpperCase();
  const entryPrice = Number(deal.entryPrice) || null;
  const exitPrice = Number(deal.closePrice || deal.exitPrice || deal.executionPrice) || null;
  const profit = Number(deal.netProfit ?? deal.profit ?? deal.grossProfit ?? 0);
  const commission = Number(deal.commission ?? 0);
  const swap = Number(deal.swap ?? 0);
  const volume = Number(deal.volume || deal.filledVolume || 0);
  const lotSize = Number(deal.lotSize || 100000);
  const lots = lotSize > 0 ? volume / lotSize : volume;

  return {
    position_id: String(deal.positionId || deal.id || ''),
    symbol,
    direction: direction === 'BUY' ? 'BUY' : 'SELL',
    volume: Math.round(lots * 100) / 100,
    entry_price: entryPrice,
    exit_price: exitPrice,
    profit_loss: Math.round(profit * 100) / 100,
    profit_loss_pips: calcPips(symbol, direction, entryPrice, exitPrice),
    commission: Math.round(commission * 100) / 100,
    swap: Math.round(swap * 100) / 100,
    entry_time: deal.openTime || deal.entryTime || null,
    exit_time: deal.closeTime || deal.exitTime || deal.executionTime || null,
    status: 'CLOSED',
    label: deal.label || null,
    comment: deal.comment || null,
    source: 'ctrader_mcp_sync',
  };
}

function mapHistoryToJournalRow(trade) {
  const symbol = String(trade.symbolName || '').replace('/', '').toUpperCase();
  const direction = String(trade.tradeSide || trade.direction || '').toUpperCase();
  const entryPrice = Number(trade.entryPrice) || null;
  const exitPrice = Number(trade.closePrice || trade.exitPrice) || null;
  const profit = Number(trade.netProfit ?? trade.profit ?? 0);
  const commission = Number(trade.commission ?? 0);
  const swap = Number(trade.swap ?? 0);
  const volume = Number(trade.volume || 0);
  const lotSize = Number(trade.lotSize || 100000);
  const lots = lotSize > 0 ? volume / lotSize : volume;

  return {
    position_id: String(trade.positionId || trade.id || ''),
    symbol,
    direction: direction === 'BUY' ? 'BUY' : 'SELL',
    volume: Math.round(lots * 100) / 100,
    entry_price: entryPrice,
    exit_price: exitPrice,
    profit_loss: Math.round(profit * 100) / 100,
    profit_loss_pips: calcPips(symbol, direction, entryPrice, exitPrice),
    commission: Math.round(commission * 100) / 100,
    swap: Math.round(swap * 100) / 100,
    entry_time: trade.openTime || trade.entryTime || null,
    exit_time: trade.closeTime || trade.exitTime || null,
    status: 'CLOSED',
    label: trade.label || null,
    comment: trade.comment || null,
    source: 'ctrader_mcp_sync',
  };
}

async function main() {
  const client = await createMcpClient();

  // Pull both data sources
  const [dealsResult, historyResult] = await Promise.all([
    client.call('get_deals', { count: fetchCount }),
    client.call('get_order_history'),
  ]);

  const deals = dealsResult?.deals || [];
  const history = historyResult?.trades || historyResult?.history || [];

  console.log(`FETCHED | deals=${deals.length} | history=${history.length}`);

  // Map deals to journal rows
  const dealRows = deals.map(mapDealToJournalRow).filter(r => r.symbol && r.exit_time);
  const historyRows = history.map(mapHistoryToJournalRow).filter(r => r.symbol && r.exit_time);

  // Deduplicate by position_id (deals take priority — they're more recent)
  const seen = new Set();
  const allRows = [];
  for (const row of [...dealRows, ...historyRows]) {
    if (!row.position_id || seen.has(row.position_id)) continue;
    seen.add(row.position_id);
    allRows.push(row);
  }

  console.log(`MAPPED | unique_trades=${allRows.length} | from_deals=${dealRows.length} | from_history=${historyRows.length}`);

  if (!allRows.length) {
    console.log('NO_TRADES_TO_SYNC');
    return;
  }

  // Print summary
  for (const row of allRows.slice(0, 10)) {
    console.log(`  ${row.symbol} ${row.direction} ${row.volume}L | ${row.profit_loss_pips}p | $${row.profit_loss} | ${row.exit_time}`);
  }
  if (allRows.length > 10) console.log(`  ... and ${allRows.length - 10} more`);

  if (!shouldWrite) {
    console.log(`\nDRY_RUN | ${allRows.length} trades ready. Use --write to upsert to Supabase.`);
    return;
  }

  if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY is required for --write');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Upsert using position_id as the conflict key
  const { data, error } = await supabase
    .from('trade_journal')
    .upsert(allRows, { onConflict: 'position_id', ignoreDuplicates: false });

  if (error) throw new Error(`trade_journal upsert failed: ${error.message}`);

  console.log(`\nWROTE | ${allRows.length} trades synced to trade_journal`);
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
