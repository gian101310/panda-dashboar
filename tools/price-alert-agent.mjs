/**
 * Price Alert Agent
 * Creates cTrader alerts based on Guardian risk state and PB entry zones.
 *
 * Usage:
 *   npm run alerts                   # dry-run — shows what alerts would fire
 *   npm run alerts -- --apply        # create alerts in cTrader
 *   npm run alerts -- --guardian     # guardian risk alerts only
 *   npm run alerts -- --entry        # PB entry zone alerts only
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { computeChallengeRisk } from '../lib/accountGuardian.mjs';
import { planGuardianAlerts, planEntryZoneAlerts } from '../lib/priceAlerts.mjs';

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
const SUPABASE_URL = 'https://jxkelchxitwuilpbrwxk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

const cliArgs = new Set(process.argv.slice(2));
const shouldApply = cliArgs.has('--apply');
const guardianOnly = cliArgs.has('--guardian');
const entryOnly = cliArgs.has('--entry');

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
      clientInfo: { name: 'panda-price-alerts', version: '1.0.0' },
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
  const allAlerts = [];

  // --- GUARDIAN ALERTS ---
  if (!entryOnly) {
    const balanceResult = await client.call('get_balance');
    const risk = computeChallengeRisk({
      balance: balanceResult?.balance,
      equity: balanceResult?.equity,
      dailyLossLimit: balanceResult?.dailyLossLimit || 2500,
      dailyLossUsed: balanceResult?.dailyLossUsed || 0,
      maxLossLimit: balanceResult?.maxLossLimit || 5000,
      maxLossUsed: balanceResult?.maxLossUsed || 0,
    });

    const guardianAlerts = planGuardianAlerts({ risk });
    console.log(`GUARDIAN | daily_room=$${risk.dailyRemaining} | max_room=$${risk.maxLossRemaining} | alerts=${guardianAlerts.length}`);

    for (const alert of guardianAlerts) {
      console.log(`  ${alert.severity} | ${alert.message} (value=$${alert.value.toFixed(2)})`);
    }
    allAlerts.push(...guardianAlerts);
  }

  // --- ENTRY ZONE ALERTS ---
  if (!guardianOnly) {
    // Fetch active engine setups from dashboard
    let setups = [];
    if (SUPABASE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data } = await supabase
        .from('dashboard')
        .select('symbol, bias, gap, pl_st, pl_fl, pl_price, hard_invalid, pl_g1_valid')
        .not('bias', 'is', null)
        .in('bias', ['BUY', 'SELL'])
        .eq('hard_invalid', false);

      setups = (data || []).map(row => ({
        symbol: row.symbol,
        bias: row.bias,
        pb_entry: row.pl_price || row.pl_st,
      })).filter(s => s.pb_entry);
    }

    if (setups.length) {
      // Get live quotes for setup symbols
      const symbols = [...new Set(setups.map(s => s.symbol))];
      const quotesResult = await client.call('get_spot_prices', { symbols });
      const prices = quotesResult?.prices || quotesResult || [];

      const quotesMap = {};
      if (Array.isArray(prices)) {
        for (const q of prices) {
          const sym = String(q.symbol || q.symbolName || '').replace('/', '').toUpperCase();
          quotesMap[sym] = q;
        }
      }

      const entryAlerts = planEntryZoneAlerts(setups, quotesMap);
      console.log(`\nENTRY ZONES | setups=${setups.length} | alerts=${entryAlerts.length}`);

      for (const alert of entryAlerts) {
        const d = alert.detail;
        console.log(`  ${d.symbol} ${d.bias} | entry=${d.pbEntry} | current=${d.currentPrice} | dist=${d.distancePips}p`);
      }
      allAlerts.push(...entryAlerts);
    } else {
      console.log('\nENTRY ZONES | no active setups with PB entry levels');
    }
  }

  // --- CREATE ALERTS ---
  if (!allAlerts.length) {
    console.log('\nNO_ALERTS_NEEDED');
    return;
  }

  if (!shouldApply) {
    console.log(`\nDRY_RUN | ${allAlerts.length} alerts ready. Use --apply to create in cTrader.`);
    return;
  }

  let created = 0;
  for (const alert of allAlerts) {
    if (alert.args) {
      try {
        await client.call('create_price_alert', alert.args);
        console.log(`  CREATED | ${alert.args.symbol} @ ${alert.args.price}`);
        created++;
      } catch (e) {
        console.error(`  FAILED | ${e.message}`);
      }
    }
  }

  console.log(`\nDONE | created ${created}/${allAlerts.length} alerts`);
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
