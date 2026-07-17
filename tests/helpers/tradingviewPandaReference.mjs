const finite = (value) => Number.isFinite(value);

export function strongestScore(scores) {
  const positive = Math.max(0, ...scores.filter((value) => value > 0));
  const negative = Math.min(0, ...scores.filter((value) => value < 0));
  if (Math.abs(positive) === Math.abs(negative)) return 0;
  return Math.abs(negative) > Math.abs(positive) ? negative : positive;
}

export function classifyPair({ baseScores, quoteScores }) {
  const conflict = (scores) => scores.some((value) => value >= 4) && scores.some((value) => value <= -4);
  const base = strongestScore(baseScores);
  const quote = strongestScore(quoteScores);
  const hardInvalid = conflict(baseScores) || conflict(quoteScores)
    || (Math.abs(base) < 4 && Math.abs(quote) < 4);
  if (hardInvalid) return { gap: 0, bias: 'HARD_INVALID', hardInvalid: true };
  const gap = base - quote;
  return {
    gap,
    bias: gap >= 5 ? 'BUY' : gap <= -5 ? 'SELL' : 'WAIT',
    hardInvalid: false,
  };
}

export function classifyBoxTrend({ formerHigh, formerLow, latterHigh, latterLow }) {
  if (![formerHigh, formerLow, latterHigh, latterLow].every(finite)) return 'UNKNOWN';
  const midpoint = (latterHigh + latterLow) / 2;
  return midpoint >= formerHigh ? 'UPTREND'
    : midpoint <= formerLow ? 'DOWNTREND' : 'RANGING';
}

export function classifyPandaLineStatus({ close, supertrend, followLine }) {
  if (![close, supertrend, followLine].every(finite)) return 'UNKNOWN';
  return close > Math.max(supertrend, followLine) ? 'ABOVE'
    : close < Math.min(supertrend, followLine) ? 'BELOW' : 'BETWEEN';
}

export function advancePandaSide({ lastSide, status, confirmed }) {
  if (!confirmed || !['ABOVE', 'BELOW'].includes(status)) return { lastSide, event: null };
  const nextSide = status === 'ABOVE' ? 1 : -1;
  const event = lastSide === -nextSide
    ? (nextSide === 1 ? 'PL_BULLISH_FLIP' : 'PL_BEARISH_FLIP')
    : null;
  return { lastSide: nextSide, event };
}

export function detectBos({ close, swingHigh, swingLow, highBroken, lowBroken, confirmed }) {
  if (!confirmed) return { event: null, highBroken, lowBroken };
  if (!highBroken && finite(swingHigh) && close > swingHigh)
    return { event: 'BOS_BULLISH', highBroken: true, lowBroken };
  if (!lowBroken && finite(swingLow) && close < swingLow)
    return { event: 'BOS_BEARISH', highBroken, lowBroken: true };
  return { event: null, highBroken, lowBroken };
}
