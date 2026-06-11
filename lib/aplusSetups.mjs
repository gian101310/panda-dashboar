const MIN_EDGE_SAMPLE = 20;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 5) {
  const factor = 10 ** digits;
  return Math.round(num(value) * factor) / factor;
}

function directionFromRow(row) {
  if (row?.bias === 'BUY' || row?.bias === 'SELL') return row.bias;
  const gap = num(row?.gap);
  if (gap >= 5) return 'BUY';
  if (gap <= -5) return 'SELL';
  return 'WAIT';
}

function plConfirmed(direction, zone) {
  const z = String(zone || '').toUpperCase();
  return (direction === 'BUY' && z === 'ABOVE') || (direction === 'SELL' && z === 'BELOW');
}

function trendAligned(direction, trend) {
  const t = String(trend || '').toUpperCase();
  return (direction === 'BUY' && t === 'UPTREND') || (direction === 'SELL' && t === 'DOWNTREND');
}

function edgeContext(edge) {
  if (!edge) {
    return { winRate: null, sampleSize: 0, validated: false, factor: null };
  }
  const sampleSize = num(edge.sample_size);
  const winRate = edge.win_rate_resolved ?? edge.win_rate ?? null;
  return {
    winRate: winRate == null ? null : num(winRate),
    sampleSize,
    validated: sampleSize >= MIN_EDGE_SAMPLE && winRate != null,
    factor: edge.factor || null,
  };
}

export function scoreAPlusSetup(row, options = {}) {
  if (!row || row.hard_invalid) return null;
  const gap = num(row.gap);
  const absGap = Math.abs(gap);
  const direction = directionFromRow(row);
  if (direction === 'WAIT' || absGap < 5) return null;

  let score = 0;
  const reasons = [];

  if (absGap >= 9) {
    score += 25;
    reasons.push('gap >= 9');
  } else {
    score += 14;
    reasons.push('gap >= 5');
  }

  if (plConfirmed(direction, row.pl_zone)) {
    score += row.pl_g1_valid ? 20 : 14;
    reasons.push(row.pl_g1_valid ? 'Panda Lines G1 valid' : 'Panda Lines aligned');
  }

  const h1Aligned = trendAligned(direction, row.box_h1_trend);
  const h4Aligned = trendAligned(direction, row.box_h4_trend);
  if (h1Aligned && h4Aligned) {
    score += 18;
    reasons.push('H1/H4 box aligned');
  } else if (h1Aligned || h4Aligned) {
    score += 9;
    reasons.push('one box trend aligned');
  }

  const momentum = String(row.momentum || '').toUpperCase();
  if (['STRONG', 'BUILDING', 'SPARK'].includes(momentum)) {
    score += momentum === 'STRONG' ? 14 : 9;
    reasons.push(`${momentum} momentum`);
  }

  const confidence = row.confidence;
  if (confidence === 'HIGH') {
    score += 8;
    reasons.push('HIGH engine confidence');
  } else if (num(confidence) >= 70) {
    score += 8;
    reasons.push('confidence >= 70');
  } else if (num(confidence) >= 55) {
    score += 4;
    reasons.push('confidence >= 55');
  }

  if (num(row.strength) >= 2) {
    score += 6;
    reasons.push('strength >= 2');
  }

  const edge = edgeContext(options.edge);
  if (edge.validated && edge.winRate >= 65) {
    score += 10;
    reasons.push(`historical edge ${edge.winRate}%`);
  } else if (edge.validated && edge.winRate >= 58) {
    score += 5;
    reasons.push(`historical edge ${edge.winRate}%`);
  }

  if (num(row.spread) > 2.5 && !String(row.symbol || '').includes('JPY')) {
    score -= 8;
    reasons.push('wide spread penalty');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const tier = score >= 85 ? 'A+' : score >= 74 ? 'A' : score >= 62 ? 'B' : 'WAIT';
  if (tier === 'WAIT') return null;

  return {
    symbol: row.symbol,
    direction,
    score,
    tier,
    readiness: tier === 'A+' ? 'WAIT_FOR_OB_RETEST' : 'WATCHLIST',
    gap,
    reasons,
    edge,
  };
}

function candleDirection(bar) {
  const open = num(bar?.open);
  const close = num(bar?.close);
  if (close > open) return 'BULL';
  if (close < open) return 'BEAR';
  return 'DOJI';
}

function bodySize(bar) {
  return Math.abs(num(bar?.close) - num(bar?.open));
}

function averageBody(bars, endIndex, lookback = 6) {
  const start = Math.max(0, endIndex - lookback);
  const slice = bars.slice(start, endIndex);
  if (!slice.length) return 0;
  return slice.reduce((sum, bar) => sum + bodySize(bar), 0) / slice.length;
}

export function detectOrderBlock(bars, direction) {
  if (!Array.isArray(bars) || bars.length < 3) return null;
  const dir = direction === 'SELL' ? 'SELL' : 'BUY';
  const displacementDir = dir === 'BUY' ? 'BULL' : 'BEAR';
  const obDir = dir === 'BUY' ? 'BEAR' : 'BULL';

  for (let i = bars.length - 1; i >= 1; i -= 1) {
    const displacement = bars[i];
    if (candleDirection(displacement) !== displacementDir) continue;
    const avg = averageBody(bars, i);
    if (avg > 0 && bodySize(displacement) < avg * 1.4) continue;

    for (let j = i - 1; j >= Math.max(0, i - 4); j -= 1) {
      const candidate = bars[j];
      if (candleDirection(candidate) !== obDir) continue;
      const open = num(candidate.open);
      const high = dir === 'BUY' ? Math.max(open, num(candidate.close)) : num(candidate.high);
      const low = dir === 'BUY' ? num(candidate.low) : Math.min(open, num(candidate.close));
      const entry = round((high + low) / 2);
      const buffer = round(Math.max(high - low, 0.002) * 0.25);
      return {
        direction: dir,
        startTime: candidate.timestamp,
        endTime: displacement.timestamp,
        low: round(low),
        high: round(high),
        entry,
        stop: dir === 'BUY' ? round(low - buffer) : round(high + buffer),
        source: 'last opposite candle before displacement',
      };
    }
  }

  return null;
}

export function buildObChartObjects(setup, ob, nowIso = new Date().toISOString()) {
  if (!setup || !ob) return [];
  const color = setup.direction === 'BUY' ? '#00ff9f' : '#ff4d6d';
  const labelPrice = setup.direction === 'BUY' ? ob.high : ob.low;
  return [
    {
      object_type: 'rectangle',
      price1: ob.low,
      time1: ob.startTime,
      price2: ob.high,
      time2: nowIso,
      color,
      fill: true,
    },
    {
      object_type: 'horizontal_line',
      price1: ob.entry,
      color: '#ffd166',
    },
    {
      object_type: 'text',
      price1: labelPrice,
      time1: ob.startTime,
      color,
      text: `${setup.tier} ${setup.symbol} ${setup.direction} OB entry ${ob.entry} | score ${setup.score}`,
    },
  ];
}
