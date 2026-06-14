/**
 * Breakeven SL Agent
 * Polls cTrader MCP for open positions and moves SL to entry when +30 pips.
 *
 * Usage:
 *   npm run breakeven           # dry-run (shows what would happen)
 *   npm run breakeven -- --apply   # actually move SLs
 *   npm run breakeven -- --trigger=25 --buffer=3  # custom pips
 */

import { existsSync, readFileSync } from 'node:fs';
import { planBreakevenActions } from '../lib/breakevenManager.mjs';

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
const args = new Set(process.argv.slice(2));
const shouldApply = args.has('--apply');

function numberArg(name, fallback) {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? Number(raw.split('=')[1]) : fallback;
}

const triggerPips = numberArg('trigger', 30);
const bufferPips = numberArg('buffer', 2);

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
      clientInfo: { name: 'panda-breakeven-agent', version: '1.0.0' },
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
  const positionsResult = await client.call('get_positions');
  const positions = positionsResult?.positions || [];

  if (!positions.length) {
    console.log('NO_OPEN_POSITIONS');
    return;
  }

  const actions = planBreakevenActions(positions, { triggerPips, bufferPips });

  if (!actions.length) {
    console.log(`NO_BE_NEEDED | positions=${positions.length} | trigger=${triggerPips}p | buffer=${bufferPips}p`);
    return;
  }

  for (const action of actions) {
    const { detail } = action;
    const label = shouldApply ? 'APPLIED' : 'DRY';
    console.log([
      label,
      detail.symbol,
      detail.side,
      `pips=${detail.pips.toFixed(1)}`,
      `entry=${detail.entryPrice}`,
      `oldSL=${detail.oldSl ?? 'NONE'}`,
      `newSL=${detail.newSl}`,
      `reason=${action.reason}`,
    ].join(' | '));

    if (shouldApply) {
      await client.call('amend_position', action.args);
    }
  }

  console.log(`\n${shouldApply ? 'EXECUTED' : 'DRY_RUN'} | total=${actions.length} | trigger=${triggerPips}p | buffer=${bufferPips}p`);
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
