const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function trueRange(high, low, previousClose) {
  return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
}

export function wilderAtr(candles, period = 10) {
  if (!Array.isArray(candles) || candles.length < period + 1) return [];
  const output = Array(candles.length).fill(null);
  let sum = 0;
  for (let i = 1; i <= period; i += 1) {
    sum += trueRange(candles[i].high, candles[i].low, candles[i - 1].close);
  }
  output[period] = sum / period;
  for (let i = period + 1; i < candles.length; i += 1) {
    const tr = trueRange(candles[i].high, candles[i].low, candles[i - 1].close);
    output[i] = ((output[i - 1] * (period - 1)) + tr) / period;
  }
  return output;
}

export function wilderAdx(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period * 2 + 1) return [];
  const output = Array(candles.length).fill(null);
  let smoothedTr = 0;
  let smoothedPlus = 0;
  let smoothedMinus = 0;
  const dx = Array(candles.length).fill(null);

  for (let i = 1; i < candles.length; i += 1) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    const plus = up > down && up > 0 ? up : 0;
    const minus = down > up && down > 0 ? down : 0;
    const tr = trueRange(candles[i].high, candles[i].low, candles[i - 1].close);

    if (i <= period) {
      smoothedTr += tr;
      smoothedPlus += plus;
      smoothedMinus += minus;
    } else {
      smoothedTr = smoothedTr - smoothedTr / period + tr;
      smoothedPlus = smoothedPlus - smoothedPlus / period + plus;
      smoothedMinus = smoothedMinus - smoothedMinus / period + minus;
    }
    if (i < period || smoothedTr === 0) continue;
    const plusDi = 100 * smoothedPlus / smoothedTr;
    const minusDi = 100 * smoothedMinus / smoothedTr;
    const denominator = plusDi + minusDi;
    dx[i] = denominator === 0 ? 0 : 100 * Math.abs(plusDi - minusDi) / denominator;
  }

  const firstAdxIndex = period * 2 - 1;
  const seed = dx.slice(period, firstAdxIndex + 1);
  output[firstAdxIndex] = seed.reduce((sum, value) => sum + value, 0) / period;
  for (let i = firstAdxIndex + 1; i < candles.length; i += 1) {
    output[i] = ((output[i - 1] * (period - 1)) + dx[i]) / period;
  }
  return output;
}

export function superTrend(candles, period = 10, multiplier = 3) {
  const atr = wilderAtr(candles, period);
  const rows = Array(candles.length).fill(null);
  let finalUpper = null;
  let finalLower = null;
  let direction = 1;
  let consecutive = 0;

  for (let i = period; i < candles.length; i += 1) {
    const candle = candles[i];
    const midpoint = (candle.high + candle.low) / 2;
    const basicUpper = midpoint + multiplier * atr[i];
    const basicLower = midpoint - multiplier * atr[i];
    const previous = candles[i - 1];

    finalUpper = finalUpper === null || basicUpper < finalUpper || previous.close > finalUpper
      ? basicUpper : finalUpper;
    finalLower = finalLower === null || basicLower > finalLower || previous.close < finalLower
      ? basicLower : finalLower;

    const nextDirection = direction < 0 && candle.close > finalUpper
      ? 1
      : direction > 0 && candle.close < finalLower
        ? -1
        : direction;
    consecutive = nextDirection === direction ? consecutive + 1 : 1;
    direction = nextDirection;
    rows[i] = {
      atr: atr[i],
      direction,
      line: direction > 0 ? finalLower : finalUpper,
      consecutive,
    };
  }
  return rows;
}

export function trendStrength(candles, index, state) {
  if (!state || !Number.isFinite(state.atr) || state.atr <= 0 || index < 10) return null;
  const current = candles[index].close;
  const old = candles[index - 10].close;
  const distanceAtr = Math.abs(current - state.line) / state.atr;
  const distance = Math.min(30, distanceAtr * 15);
  const continuity = Math.min(40, (Math.log(state.consecutive + 1) / Math.log(1.5)) * 10);
  const directionalMove = state.direction > 0 ? (current - old) / old : (old - current) / old;
  const momentum = Math.min(30, Math.max(0, directionalMove * 100 * 50));
  return {
    distance,
    continuity,
    momentum,
    total: clamp(distance + continuity + momentum, 0, 100),
  };
}

export function classifyStructure(candles, swingLength = 2) {
  const events = [];
  let lastHigh = null;
  let lastLow = null;
  let highBroken = false;
  let lowBroken = false;
  let structure = 0;

  for (let i = swingLength * 2; i < candles.length; i += 1) {
    const center = i - swingLength;
    let pivotHigh = true;
    let pivotLow = true;
    for (let j = center - swingLength; j <= center + swingLength; j += 1) {
      if (j === center) continue;
      if (candles[j].high >= candles[center].high) pivotHigh = false;
      if (candles[j].low <= candles[center].low) pivotLow = false;
    }
    if (pivotHigh) {
      lastHigh = candles[center].high;
      highBroken = false;
    }
    if (pivotLow) {
      lastLow = candles[center].low;
      lowBroken = false;
    }
    if (lastHigh !== null && !highBroken && candles[i].close > lastHigh) {
      const type = structure < 0 ? 'CHOCH_UP' : 'BOS_UP';
      events.push({ index: i, type, level: lastHigh });
      structure = 1;
      highBroken = true;
    }
    if (lastLow !== null && !lowBroken && candles[i].close < lastLow) {
      const type = structure > 0 ? 'CHOCH_DOWN' : 'BOS_DOWN';
      events.push({ index: i, type, level: lastLow });
      structure = -1;
      lowBroken = true;
    }
  }
  return { direction: structure, events };
}

export function fairValueGaps(candles) {
  const gaps = [];
  for (let i = 2; i < candles.length; i += 1) {
    if (candles[i].low > candles[i - 2].high) {
      gaps.push({ index: i, direction: 1, low: candles[i - 2].high, high: candles[i].low });
    }
    if (candles[i].high < candles[i - 2].low) {
      gaps.push({ index: i, direction: -1, low: candles[i].high, high: candles[i - 2].low });
    }
  }
  return gaps;
}

export function openFairValueGaps(candles) {
  return fairValueGaps(candles).filter((gap) => {
    for (let i = gap.index + 1; i < candles.length; i += 1) {
      if (gap.direction > 0 && candles[i].low <= gap.low) return false;
      if (gap.direction < 0 && candles[i].high >= gap.high) return false;
    }
    return true;
  });
}

export function confluenceStatus({ pandaBias = 'WAIT', aligned, strength, adx, structure }) {
  if (!['BUY', 'SELL'].includes(pandaBias)) return 'WAIT';
  const side = pandaBias === 'BUY' ? 1 : -1;
  const directional = aligned === side && structure === side;
  if (directional && strength >= 65 && adx >= 25) return 'HIGH CONFLUENCE';
  if (directional && strength >= 50 && adx >= 20) return 'READY';
  return 'WAIT';
}

export function interpretConfluence({
  feedStatus = 'LIVE',
  pandaBias = 'WAIT',
  hardInvalid = false,
  trends = [],
  structure = 0,
}) {
  if (feedStatus !== 'LIVE') return `DATA — ${feedStatus}`;
  if (hardInvalid) return 'BLOCKED — HARD INVALID';
  if (!['BUY', 'SELL'].includes(pandaBias)) return 'BLOCKED — PANDA WAIT';
  const side = pandaBias === 'BUY' ? 1 : -1;
  const context = trends.filter((trend) => ['H1', 'H4', 'D1'].includes(trend.label));
  const aligned = context.filter((trend) => trend.direction === side);
  if (aligned.length < 2) return 'CONFLICT — HTF MIXED';
  const averageStrength = aligned.reduce((sum, trend) => sum + trend.strength, 0) / aligned.length;
  const executionAdx = Math.max(...context.filter((trend) => ['H1', 'H4'].includes(trend.label)).map((trend) => trend.adx));
  if (structure !== side) return 'WATCH — STRUCTURE AGAINST';
  if (executionAdx < 20) return 'WATCH — ADX WEAK';
  if (averageStrength < 50) return 'WATCH — STRENGTH WEAK';
  if (aligned.length === 3 && averageStrength >= 65 && executionAdx >= 25) return 'HIGH CONFLUENCE';
  return 'READY';
}

export function pullbackState({ pandaBias = 'WAIT', alignedCount = 0, h1Structure = 0, m15Direction = 0, m15Event = 'NONE', eventAgeBars = 0 }) {
  if (!['BUY', 'SELL'].includes(pandaBias) || alignedCount < 2) return 'NO SETUP';
  const side = pandaBias === 'BUY' ? 1 : -1;
  if (h1Structure === -side) return 'SETUP INVALIDATED';
  const suffix = side > 0 ? 'UP' : 'DOWN';
  if (m15Direction !== side) return 'PULLBACK ACTIVE';
  if (eventAgeBars > 3) return 'CONTEXT READY';
  if (m15Event === `CHOCH_${suffix}`) return 'PULLBACK ENDING';
  if (m15Event === `BOS_${suffix}`) return 'ENTRY TRIGGER';
  return 'CONTEXT READY';
}

export function executionDecision({ pandaBias = 'WAIT', mainStatus = '', pullback = '' }) {
  if (!['BUY', 'SELL'].includes(pandaBias)) return 'BLOCKED - PANDA WAIT';
  if (pullback === 'SETUP INVALIDATED') return 'BLOCKED - SETUP INVALIDATED';
  const normalized = mainStatus.replaceAll('—', '-');
  const contextReady = normalized === 'READY' || normalized === 'HIGH CONFLUENCE';
  if (!contextReady) {
    if (normalized.startsWith('WATCH - ')) return `WAIT - ${normalized.slice(8)}`;
    if (normalized.startsWith('CONFLICT')) return 'WAIT - HTF CONFLICT';
    if (normalized.startsWith('BLOCKED')) return normalized;
    return 'WAIT - DATA OR CONTEXT';
  }
  if (pullback === 'ENTRY TRIGGER') return `${pandaBias} READY`;
  if (pullback === 'PULLBACK ACTIVE') return 'WAIT - PULLBACK ACTIVE';
  if (pullback === 'PULLBACK ENDING') return 'WAIT - PULLBACK ENDING';
  return 'WAIT - NO FRESH ENTRY TRIGGER';
}

const finiteNumber = (value) => value !== null && value !== '' && Number.isFinite(Number(value));

export function classifyGapExecution(gap) {
  if (!finiteNumber(gap)) return 'NONE';
  const magnitude = Math.abs(Number(gap));
  if (magnitude >= 9) return 'MARKET';
  if (magnitude >= 5) return 'PULLBACK';
  return 'NONE';
}

export function pandaLineConfirmation({ pandaBias = 'WAIT', price, superTrend, followLine }) {
  if (!finiteNumber(price) || !finiteNumber(superTrend) || !finiteNumber(followLine)) return 'UNAVAILABLE';
  const current = Number(price);
  const lower = Math.min(Number(superTrend), Number(followLine));
  const upper = Math.max(Number(superTrend), Number(followLine));
  if (pandaBias === 'BUY') {
    if (current > upper) return 'CONFIRMED';
    if (current >= lower) return 'BETWEEN';
    return 'WRONG SIDE';
  }
  if (pandaBias === 'SELL') {
    if (current < lower) return 'CONFIRMED';
    if (current <= upper) return 'BETWEEN';
    return 'WRONG SIDE';
  }
  return 'UNCONFIRMED';
}

const cleanLevels = (levels) => (Array.isArray(levels) ? levels : [])
  .filter((level) => level && level.label && finiteNumber(level.price) && Number(level.price) > 0)
  .map((level) => ({ label: String(level.label), price: Number(level.price) }));

export function nearestDirectionalLevel({ pandaBias = 'WAIT', price, levels = [], pipSize }) {
  if (!finiteNumber(price) || !finiteNumber(pipSize) || Number(pipSize) <= 0) return null;
  const current = Number(price);
  const pip = Number(pipSize);
  const candidates = cleanLevels(levels).filter((level) => (
    pandaBias === 'BUY' ? level.price <= current : pandaBias === 'SELL' ? level.price >= current : false
  ));
  if (!candidates.length) return null;
  candidates.sort((a, b) => Math.abs(a.price - current) - Math.abs(b.price - current));
  const level = candidates[0];
  return { ...level, distancePips: Math.round(Math.abs(current - level.price) / pip) };
}

function continuationGrade({ h1Adx, h1Structure, side, rejectionConfirmed, freshEvent }) {
  if (h1Structure !== side || !rejectionConfirmed) return 'WEAK';
  if (freshEvent === `BOS_${side > 0 ? 'UP' : 'DOWN'}` && Number(h1Adx) >= 20) return 'STRONG';
  if (freshEvent === `CHOCH_${side > 0 ? 'UP' : 'DOWN'}` || Number(h1Adx) >= 20) return 'MODERATE';
  return 'WEAK';
}

export function h1PullbackDecision(input = {}) {
  const {
    feedStatus = 'LIVE', hardInvalid = false, pandaBias = 'WAIT', gap = 0,
    price, superTrend, followLine, levels = [], pipSize, proximityPips = 10,
    touchPips = 2, h1Adx = 0, h1Ranging = false, h1Structure = 0,
    levelWasTouched = false, rejectionConfirmed = false, m15Event = 'NONE',
    m15EventAgeBars = 99, eventExpiryBars = 3, distanceFromLinesPips = 0,
    overextensionPips = 30,
  } = input;
  const execution = classifyGapExecution(gap);
  const base = {
    state: 'NO SETUP', decision: 'WAIT', continuation: 'WEAK', execution,
    lineState: 'UNCONFIRMED', levelState: 'UNAVAILABLE', level: null,
    distancePips: null, warnings: [],
  };
  if (feedStatus !== 'LIVE') return { ...base, state: `DATA — ${feedStatus}` };
  if (hardInvalid) return { ...base, state: 'SETUP INVALIDATED', decision: 'BLOCKED — HARD INVALID' };
  if (!['BUY', 'SELL'].includes(pandaBias) || execution === 'NONE') return base;

  const side = pandaBias === 'BUY' ? 1 : -1;
  const lineState = pandaLineConfirmation({ pandaBias, price, superTrend, followLine });
  if (lineState === 'UNAVAILABLE') return { ...base, lineState, state: 'LINE DATA UNAVAILABLE' };
  if (lineState !== 'CONFIRMED') return { ...base, lineState, state: 'SETUP INVALIDATED', decision: 'WAIT — PANDA LINES UNCONFIRMED' };
  if (h1Ranging || Number(h1Adx) < 15) return { ...base, lineState, state: 'RANGE — NO TRADE' };
  if (h1Structure === -side) return { ...base, lineState, state: 'SETUP INVALIDATED', decision: 'WAIT — H1 STRUCTURE AGAINST' };

  const level = nearestDirectionalLevel({ pandaBias, price, levels, pipSize });
  if (!level) return { ...base, lineState, state: 'LEVEL DATA UNAVAILABLE' };
  const distancePips = level.distancePips;
  const levelState = distancePips <= Number(touchPips) || levelWasTouched
    ? 'AT LEVEL'
    : distancePips <= Number(proximityPips) ? 'APPROACHING' : 'DISTANT';
  const freshEvent = Number(m15EventAgeBars) <= Number(eventExpiryBars) ? String(m15Event) : 'NONE';
  const continuation = continuationGrade({ h1Adx, h1Structure, side, rejectionConfirmed, freshEvent });
  const shared = { ...base, execution, lineState, levelState, level, distancePips, continuation };

  if (execution === 'MARKET') {
    const warnings = [];
    if (Number(distanceFromLinesPips) > Number(overextensionPips)) warnings.push('OVEREXTENDED FROM PANDA LINES');
    if (finiteNumber(price) && finiteNumber(pipSize)) {
      const current = Number(price);
      const opposing = cleanLevels(levels)
        .filter((item) => side > 0 ? item.price > current : item.price < current)
        .sort((a, b) => Math.abs(a.price - current) - Math.abs(b.price - current))[0];
      if (opposing && Math.abs(opposing.price - current) / Number(pipSize) <= Number(proximityPips)) {
        warnings.push(`NEARBY PANDA LEVEL ${opposing.label}`);
      }
    }
    return {
      ...shared,
      state: 'MARKET ELIGIBLE',
      decision: warnings.length ? 'WAIT — REVIEW WARNINGS' : `${pandaBias} MARKET ELIGIBLE`,
      warnings,
    };
  }

  if (levelWasTouched && rejectionConfirmed && distancePips > Number(proximityPips)) {
    return { ...shared, state: 'ENTRY MOVED — WAIT' };
  }
  if (!levelWasTouched && distancePips > Number(proximityPips)) return { ...shared, state: 'PULLBACK ACTIVE — WAIT' };
  if (!levelWasTouched) return { ...shared, state: 'APPROACHING PANDA LEVEL' };
  if (!rejectionConfirmed) return { ...shared, state: 'AT PANDA LEVEL — WAIT FOR REJECTION' };
  const suffix = side > 0 ? 'UP' : 'DOWN';
  if (freshEvent === `BOS_${suffix}`) return { ...shared, state: 'ENTRY TRIGGER', decision: `${pandaBias} READY` };
  if (freshEvent === `CHOCH_${suffix}`) return { ...shared, state: 'PULLBACK ENDING' };
  return { ...shared, state: 'CONTEXT READY — WAIT FOR M15' };
}

export function buildSwingRiskPlan({
  side, entry, swing, pipSize, bufferPips = 3, rewardRisk = 2, maxStopPips = 60,
} = {}) {
  if (!['BUY', 'SELL'].includes(side) || !finiteNumber(entry) || !finiteNumber(swing) ||
      !finiteNumber(pipSize) || Number(pipSize) <= 0) return null;
  const entryPrice = Number(entry);
  const swingPrice = Number(swing);
  const pip = Number(pipSize);
  const buffer = Math.max(0, Number(bufferPips) || 0) * pip;
  const rr = Math.max(0.1, Number(rewardRisk) || 2);
  const digits = Math.max(0, Math.round(-Math.log10(pip)) + 1);
  const roundPrice = (value) => Number(value.toFixed(digits));
  const stop = side === 'BUY' ? swingPrice - buffer : swingPrice + buffer;
  if ((side === 'BUY' && stop >= entryPrice) || (side === 'SELL' && stop <= entryPrice)) return null;
  const risk = Math.abs(entryPrice - stop);
  const stopPips = Math.round(risk / pip);
  const target = side === 'BUY' ? entryPrice + risk * rr : entryPrice - risk * rr;
  const targetPips = Math.round(Math.abs(target - entryPrice) / pip);
  return {
    side,
    entry: roundPrice(entryPrice),
    stop: roundPrice(stop),
    target: roundPrice(target),
    stopPips,
    targetPips,
    rewardRisk: rr,
    status: stopPips > Number(maxStopPips) ? 'TOO WIDE' : 'ACCEPTABLE',
    draw: true,
  };
}

export function shouldDrawRiskPlan({ mode = 'CONTEXT READY', decision = '', state = '', lineState = '', execution = 'NONE' } = {}) {
  const ready = decision === 'BUY READY' || decision === 'SELL READY';
  if (ready) return true;
  if (lineState !== 'CONFIRMED' || execution === 'NONE' ||
      state === 'NO SETUP' || state === 'SETUP INVALIDATED' || state === 'RANGE — NO TRADE' ||
      state.includes('UNAVAILABLE') || state.startsWith('DATA')) return false;
  const normalized = String(mode).toUpperCase();
  if (normalized === 'READY ONLY') return false;
  if (normalized === 'ALWAYS') return true;
  return state.startsWith('PULLBACK ACTIVE') || state.startsWith('APPROACHING') ||
    state.startsWith('AT PANDA LEVEL') || state === 'PULLBACK ENDING' ||
    state.startsWith('CONTEXT READY') || state === 'MARKET ELIGIBLE';
}
