import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../pages/dashboard.js', import.meta.url), 'utf8');
const start = source.indexOf('function nearbyPreviousLevel(');
const end = source.indexOf('function PairCard(', start);
assert.ok(start >= 0 && end > start, 'level warning helpers exist');
const { nearbyLevelWarning } = runInNewContext(`${source.slice(start, end)}; ({ nearbyLevelWarning })`);

const marketBuy = { symbol: 'EURCAD', gap: 10, pl_price: 1.5000, pdh: 1.5010 };
assert.match(nearbyLevelWarning(marketBuy, { txt: 'MARKET EXECUTE BUY' }), /MARKET EXECUTE: NEAR RESISTANCE \(PDH\)/);

const marketSell = { symbol: 'EURJPY', gap: -9, pl_price: 170.00, pdl: 169.90 };
assert.match(nearbyLevelWarning(marketSell, { txt: 'MARKET EXECUTE SELL' }), /MARKET EXECUTE: NEAR SUPPORT \(PDL\)/);

assert.match(nearbyLevelWarning({ ...marketBuy, gap: 6 }, { txt: 'PULLBACK PLAY BUY' }), /LEVEL NEARBY: NEAR RESISTANCE/);
assert.equal(nearbyLevelWarning({ ...marketBuy, pdh: 1.5031 }, { txt: 'MARKET EXECUTE BUY' }), null);
assert.equal(nearbyLevelWarning({ ...marketBuy, gap: 4 }, { txt: 'NO TRADE' }), null);
assert.equal(nearbyLevelWarning({ ...marketBuy, hard_invalid: true }, { txt: 'MARKET EXECUTE BUY' }), null);
assert.equal(nearbyLevelWarning({ ...marketBuy, pl_price: null }, { txt: 'MARKET EXECUTE BUY' }), null);

console.log('Nearby level warnings preserve all valid biases and market execution');
