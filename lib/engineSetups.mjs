function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 5) {
  const factor = 10 ** digits;
  return Math.round(num(value) * factor) / factor;
}

function directionFromGap(gap) {
  if (gap >= 5) return 'BUY';
  if (gap <= -5) return 'SELL';
  return 'WAIT';
}

function pipSize(symbol) {
  return String(symbol || '').includes('JPY') ? 0.01 : 0.0001;
}

function decimals(symbol) {
  return String(symbol || '').includes('JPY') ? 3 : 5;
}

function toPips(symbol, priceDiff) {
  return Math.round(Math.abs(num(priceDiff)) / pipSize(symbol));
}

function isIntraWindow(now = new Date()) {
  const hour = now.getUTCHours();
  return hour === 22 || hour === 23;
}

function plConfirmed(direction, zone) {
  const z = String(zone || '').toUpperCase();
  return (direction === 'BUY' && z === 'ABOVE') || (direction === 'SELL' && z === 'BELOW');
}

function levelRows(row) {
  return [
    { label: 'PDL', price: row?.pdl },
    { label: 'PDH', price: row?.pdh },
    { label: 'PWL', price: row?.pwl },
    { label: 'PWH', price: row?.pwh },
    { label: 'PML', price: row?.pml },
    { label: 'PMH', price: row?.pmh },
    { label: 'PYL', price: row?.pyl },
    { label: 'PYH', price: row?.pyh },
  ].filter(level => level.price != null && Number.isFinite(Number(level.price)))
    .map(level => ({ ...level, price: num(level.price) }));
}

export function classifyEngineSetup(row, now = new Date()) {
  if (!row || row.hard_invalid) return null;
  const gap = num(row.gap);
  const absGap = Math.abs(gap);
  if (absGap < 5) return null;
  const direction = row.bias === 'BUY' || row.bias === 'SELL' ? row.bias : directionFromGap(gap);
  if (direction === 'WAIT') return null;

  const isIntra = absGap >= 9 && plConfirmed(direction, row.pl_zone) && row.pl_g1_valid === true && isIntraWindow(now);
  return {
    symbol: row.symbol,
    direction,
    strategy: isIntra ? 'INTRA' : 'BB',
    gap,
    reason: isIntra ? 'gap >= 9 + Panda Lines confirmed + 2-4AM UAE window' : 'gap >= 5 engine bias',
  };
}

export function buildPullbackPlan(row, currentPrice, now = new Date()) {
  const setup = classifyEngineSetup(row, now);
  if (!setup || !currentPrice) return null;
  const symbol = row.symbol;
  const pip = pipSize(symbol);
  const dec = decimals(symbol);
  const price = num(currentPrice);
  const levels = levelRows(row);
  let entry = null;
  let takeProfit = null;

  if (setup.direction === 'BUY') {
    const entryLevels = levels.filter(level => level.price < price).sort((a, b) => b.price - a.price);
    const tpLevels = levels.filter(level => level.price > price).sort((a, b) => a.price - b.price);
    for (const e of entryLevels) {
      const validTargets = tpLevels.filter(t => toPips(symbol, t.price - e.price) >= 50);
      if (validTargets.length) {
        entry = e;
        takeProfit = setup.strategy === 'INTRA' ? validTargets[validTargets.length - 1] : validTargets[0];
      }
      if (entry) break;
    }
  } else {
    const entryLevels = levels.filter(level => level.price > price).sort((a, b) => a.price - b.price);
    const tpLevels = levels.filter(level => level.price < price).sort((a, b) => b.price - a.price);
    for (const e of entryLevels) {
      const validTargets = tpLevels.filter(t => toPips(symbol, e.price - t.price) >= 50);
      if (validTargets.length) {
        entry = e;
        takeProfit = setup.strategy === 'INTRA' ? validTargets[validTargets.length - 1] : validTargets[0];
      }
      if (entry) break;
    }
  }

  if (!entry || !takeProfit) return null;
  const tpPips = toPips(symbol, setup.direction === 'BUY' ? takeProfit.price - entry.price : entry.price - takeProfit.price);
  const slRatio = tpPips >= 300 ? 5 : tpPips >= 200 ? 4 : tpPips >= 100 ? 3 : 2;
  const slPips = Math.round(tpPips / slRatio);
  const slPrice = setup.direction === 'BUY'
    ? round(entry.price - slPips * pip, dec)
    : round(entry.price + slPips * pip, dec);

  return {
    symbol,
    strategy: setup.strategy,
    direction: setup.direction,
    currentPrice: round(price, dec),
    entry: { ...entry, price: round(entry.price, dec), pipsAway: toPips(symbol, setup.direction === 'BUY' ? price - entry.price : entry.price - price) },
    takeProfit: { ...takeProfit, price: round(takeProfit.price, dec), pips: tpPips },
    stopLoss: { price: slPrice, pips: slPips },
    riskReward: Number((tpPips / slPips).toFixed(1)),
    reason: setup.reason,
  };
}

export function buildEngineChartObjects(setup, plan, nowIso = new Date().toISOString()) {
  if (!setup || !plan) return [];
  const color = setup.direction === 'BUY' ? '#00ff9f' : '#ff4d6d';
  return [
    {
      object_type: 'risk_reward',
      side: setup.direction.toLowerCase(),
      price1: plan.entry.price,
      price2: plan.stopLoss.price,
      price3: plan.takeProfit.price,
      time1: nowIso,
      time2: nowIso,
      color,
    },
    {
      object_type: 'horizontal_line',
      price1: plan.entry.price,
      color: '#ffd166',
    },
    {
      object_type: 'text',
      price1: plan.entry.price,
      time1: nowIso,
      color,
      text: `${setup.strategy} ${setup.symbol} ${setup.direction} PB ${plan.entry.label} | SL ${plan.stopLoss.price} | TP ${plan.takeProfit.label} ${plan.takeProfit.price} | RR ${plan.riskReward}:1`,
    },
  ];
}
