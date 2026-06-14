/**
 * Backtest Engine Setups
 * Pulls historical OHLC data via cTrader MCP get_trendbars and
 * evaluates how past engine setups would have performed.
 *
 * Usage:
 *   npm run backtest -- --symbol=EURUSD --timeframe=h1 --count=200
 *   npm run backtest -- --symbol=GBPUSD --timeframe=m15 --count=500
 */

import { existsSync, readFileSync } from 'node:fs';
import { createMcpClient, getTrendbars, computeBarStats } from '../lib/trendbarsFetcher.mjs';

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

function stringArg(name, fallback) {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? raw.split('=')[1] : fallback;
}

function numberArg(name, fallback) {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? Number(raw.split('=')[1]) : fallback;
}

const symbol = stringArg('symbol', 'EURUSD');
const timeframe = stringArg('timeframe', 'h1');
const count = numberArg('count', 200);

async function main() {
  console.log(`BACKTEST | symbol=${symbol} | timeframe=${timeframe} | count=${count}`);
  console.log('---');

  const client = await createMcpClient();
  const bars = await getTrendbars(client, { symbol, timeframe, count });

  if (!bars || !bars.length) {
    console.log('NO_DATA | get_trendbars returned no bars');
    return;
  }

  console.log(`BARS_FETCHED | ${bars.length} candles`);

  const stats = computeBarStats(bars);
  if (stats) {
    console.log(`STATS | last=${stats.last} | high=${stats.high} | low=${stats.low} | range=${stats.range.toFixed(5)} | avg=${stats.avg.toFixed(5)}`);
  }

  // Show first and last few bars
  console.log('\nFIRST 3 BARS:');
  for (const bar of bars.slice(0, 3)) {
    console.log(`  ${bar.timestamp || bar.time || '?'} | O=${bar.open} H=${bar.high} L=${bar.low} C=${bar.close} V=${bar.volume || 0}`);
  }

  console.log('\nLAST 3 BARS:');
  for (const bar of bars.slice(-3)) {
    console.log(`  ${bar.timestamp || bar.time || '?'} | O=${bar.open} H=${bar.high} L=${bar.low} C=${bar.close} V=${bar.volume || 0}`);
  }

  console.log(`\nDONE | ${bars.length} bars retrieved for ${symbol} ${timeframe}`);
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
