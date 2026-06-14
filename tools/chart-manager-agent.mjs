/**
 * Chart Manager
 * Utilities for managing cTrader charts — change timeframes, clean up
 * objects/indicators, open/focus charts for specific symbols.
 *
 * Usage:
 *   npm run chart:manage -- --list                    # list open charts
 *   npm run chart:manage -- --open=EURUSD             # open chart for symbol
 *   npm run chart:manage -- --focus=EURUSD            # focus existing chart
 *   npm run chart:manage -- --timeframe=h1 --chart=1  # change TF on chart
 *   npm run chart:manage -- --cleanup --chart=1       # remove all objects from chart
 *   npm run chart:manage -- --indicators --chart=1    # list indicators on chart
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

const cliArgs = new Set(process.argv.slice(2));
const listMode = cliArgs.has('--list');
const cleanupMode = cliArgs.has('--cleanup');
const indicatorsMode = cliArgs.has('--indicators');
const openSymbol = stringArg('open', null);
const focusSymbol = stringArg('focus', null);
const timeframe = stringArg('timeframe', null);
const chartId = stringArg('chart', null);

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
      clientInfo: { name: 'panda-chart-manager', version: '1.0.0' },
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

  // List charts
  if (listMode || (!openSymbol && !focusSymbol && !timeframe && !cleanupMode && !indicatorsMode)) {
    const result = await client.call('list_charts');
    const charts = result?.charts || [];
    if (!charts.length) {
      console.log('NO_CHARTS_OPEN');
      return;
    }
    console.log(`OPEN CHARTS (${charts.length}):`);
    for (const c of charts) {
      const id = c.id || c.chartId || '?';
      const sym = c.symbolName || c.symbol || '?';
      const tf = c.timeframe || c.period || '?';
      console.log(`  id=${id} | ${sym} | ${tf}`);
    }
    return;
  }

  // Open a new chart
  if (openSymbol) {
    const result = await client.call('open_chart', { symbol: openSymbol });
    console.log(`OPENED | ${openSymbol}`, result ? JSON.stringify(result) : '');
    return;
  }

  // Focus an existing chart
  if (focusSymbol) {
    const result = await client.call('focus_chart', { symbol: focusSymbol });
    console.log(`FOCUSED | ${focusSymbol}`, result ? JSON.stringify(result) : '');
    return;
  }

  // Change timeframe
  if (timeframe && chartId) {
    const result = await client.call('set_chart_timeframe', { chartId, timeframe });
    console.log(`TIMEFRAME | chart=${chartId} → ${timeframe}`, result ? JSON.stringify(result) : '');
    return;
  }

  // Cleanup chart objects
  if (cleanupMode && chartId) {
    const objects = await client.call('get_chart_objects', { chartId });
    const objs = objects?.objects || objects || [];
    if (!objs.length) {
      console.log(`NO_OBJECTS | chart ${chartId} is clean`);
      return;
    }
    console.log(`REMOVING ${objs.length} objects from chart ${chartId}...`);
    let removed = 0;
    for (const obj of objs) {
      try {
        await client.call('remove_chart_object', { chartId, objectId: obj.id || obj.objectId });
        removed++;
      } catch (e) {
        console.error(`  FAILED: ${obj.id}: ${e.message}`);
      }
    }
    console.log(`CLEANED | removed ${removed}/${objs.length} objects`);
    return;
  }

  // List indicators on chart
  if (indicatorsMode && chartId) {
    const result = await client.call('get_chart_indicator_list', { chartId });
    const indicators = result?.indicators || result || [];
    if (!indicators.length) {
      console.log(`NO_INDICATORS | chart ${chartId}`);
      return;
    }
    console.log(`INDICATORS on chart ${chartId}:`);
    for (const ind of indicators) {
      console.log(`  ${ind.name || ind.indicatorName || JSON.stringify(ind)}`);
    }
    return;
  }

  console.log('No action specified. Use --list, --open=SYM, --focus=SYM, --timeframe=h1 --chart=X, --cleanup --chart=X, or --indicators --chart=X');
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
