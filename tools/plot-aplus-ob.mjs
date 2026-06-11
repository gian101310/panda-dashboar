import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';

import {
  buildObChartObjects,
  detectOrderBlock,
  scoreAPlusSetup,
} from '../lib/aplusSetups.mjs';

function loadDotEnv(path = '.env') {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
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
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const timeframeArg = process.argv.find(a => a.startsWith('--timeframe='));
const limit = Math.max(1, Math.min(10, Number(limitArg?.split('=')[1] || 3)));
const timeframe = timeframeArg?.split('=')[1] || 'h1';

function parseMcpText(result) {
  const text = result?.content?.find(part => part.type === 'text')?.text;
  if (!text) return null;
  return JSON.parse(text);
}

async function mcpRequest(body, sessionId = null) {
  const headers = { 'content-type': 'application/json' };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`cTrader MCP ${res.status}: ${await res.text()}`);
  }
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
      clientInfo: { name: 'panda-aplus-ob-plotter', version: '1.0.0' },
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

function gapBucket(entryGap) {
  const g = Math.floor(Math.abs(Number(entryGap) || 0));
  return g >= 12 ? '12+' : String(g);
}

function plStatus(row, direction) {
  const zone = String(row.pl_zone || '').toUpperCase();
  const confirmed = (direction === 'BUY' && zone === 'ABOVE') || (direction === 'SELL' && zone === 'BELOW');
  return confirmed ? 'confirmed' : 'unconfirmed';
}

function buildEdgeIndex(memories) {
  const index = new Map();
  for (const memory of memories || []) {
    const meta = memory.metadata || {};
    const strategy = memory.strategy || 'BB';
    if (memory.factor === 'gap_plus_pl' && meta.gap_level && meta.pl_status) {
      index.set(`${strategy}:gap_plus_pl:${meta.gap_level}:${meta.pl_status}`, memory);
    }
    if (memory.factor === 'gap_level' && meta.gap_level) {
      index.set(`${strategy}:gap_level:${meta.gap_level}`, memory);
    }
  }
  return index;
}

function pickEdge(row, index) {
  const direction = row.gap >= 0 ? 'BUY' : 'SELL';
  const bucket = gapBucket(row.gap);
  const status = plStatus(row, direction);
  return index.get(`BB:gap_plus_pl:${bucket}:${status}`) ||
    index.get(`INTRA:gap_plus_pl:${bucket}:${status}`) ||
    index.get(`BB:gap_level:${bucket}`) ||
    index.get(`INTRA:gap_level:${bucket}`) ||
    null;
}

async function loadPandaRows() {
  if (!SUPABASE_KEY) {
    throw new Error('SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY is required');
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const [{ data: dashboard, error: dashErr }, { data: memories, error: memErr }] = await Promise.all([
    supabase.from('dashboard').select('*'),
    supabase.from('ai_memory').select('factor,strategy,win_rate,sample_size,metadata').in('factor', ['gap_plus_pl', 'gap_level']),
  ]);
  if (dashErr) throw new Error(`dashboard fetch failed: ${dashErr.message}`);
  if (memErr) throw new Error(`ai_memory fetch failed: ${memErr.message}`);

  const edgeIndex = buildEdgeIndex(memories || []);
  return (dashboard || [])
    .map(row => scoreAPlusSetup(row, { edge: pickEdge(row, edgeIndex) }))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function plotSetup(client, setup) {
  const to = new Date();
  const from = new Date(to.getTime() - 72 * 60 * 60 * 1000);
  const barsResult = await client.call('get_trendbars', {
    symbolName: setup.symbol,
    timeframe,
    from: from.toISOString(),
    to: to.toISOString(),
    limit: 120,
  });
  const ob = detectOrderBlock(barsResult?.bars || [], setup.direction);
  if (!ob) return { setup, plotted: false, reason: 'no recent displacement OB found' };

  const objects = buildObChartObjects(setup, ob, to.toISOString());
  if (!dryRun) {
    await client.call('open_chart', { symbolName: setup.symbol, timeframe });
    for (const object of objects) {
      await client.call('add_chart_object', object);
    }
  }
  return { setup, ob, plotted: !dryRun, objects };
}

async function main() {
  const setups = await loadPandaRows();
  if (!setups.length) {
    console.log('No A/A+ setups found right now.');
    return;
  }

  const client = await createMcpClient();
  const results = [];
  for (const setup of setups) {
    results.push(await plotSetup(client, setup));
  }

  for (const result of results) {
    const { setup, ob } = result;
    if (!ob) {
      console.log(`${setup.symbol} ${setup.direction} ${setup.tier} score=${setup.score}: ${result.reason}`);
      continue;
    }
    console.log([
      `${result.plotted ? 'PLOTTED' : 'DRY'} ${setup.symbol}`,
      setup.direction,
      `${setup.tier} score=${setup.score}`,
      `OB ${ob.low}-${ob.high}`,
      `entry=${ob.entry}`,
      `stop=${ob.stop}`,
      setup.edge.validated ? `edge=${setup.edge.winRate}% n=${setup.edge.sampleSize}` : 'edge=not validated',
    ].join(' | '));
  }
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
