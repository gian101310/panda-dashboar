/**
 * Challenge Risk Manager
 * Computes safe position sizing and max concurrent pairs
 * based on challenge rules to NEVER breach limits.
 *
 * Goal: Pass the challenge. Every calculation is conservative.
 *
 * Rules:
 *   - Daily loss limit: $2,500 (lose this in a day = fail)
 *   - Max total drawdown: $5,000 (lose this overall = fail)
 *   - We reserve buffers so we NEVER get close to limits
 */

// How much of remaining room we're willing to risk per trade
const RISK_PER_TRADE_PCT = 0.20;  // 20% of remaining daily room per trade
const MAX_RISK_PER_TRADE_USD = 250;  // absolute cap per trade
const MIN_RISK_PER_TRADE_USD = 50;   // below this, don't trade

// Buffer zones — stop trading before hitting limits
const DAILY_SAFETY_BUFFER = 500;    // stop $500 before daily limit
const MAX_LOSS_SAFETY_BUFFER = 1000; // stop $1000 before max loss limit

// Max concurrent open positions (PANDA-labeled)
const MAX_CONCURRENT_POSITIONS = 3;
const MAX_SAME_DIRECTION = 2;  // max 2 BUY or 2 SELL at once

/**
 * Compute challenge-aware risk budget for a single trade.
 *
 * @param {object} params
 * @param {number} params.dailyRemaining - $ left before daily limit
 * @param {number} params.maxLossRemaining - $ left before max drawdown
 * @param {number} params.openPositionCount - current PANDA open positions
 * @param {number} params.openDirectionCount - positions in same direction as proposed trade
 * @param {number} params.openRiskUsd - total USD at risk in open positions
 * @returns {{ allowed, maxRiskUsd, maxLots, reason, detail }}
 */
export function computeChallengeBudget({
  dailyRemaining = 0,
  maxLossRemaining = 0,
  openPositionCount = 0,
  openDirectionCount = 0,
  openRiskUsd = 0,
} = {}) {
  const detail = {
    dailyRemaining,
    maxLossRemaining,
    openPositions: openPositionCount,
    openDirectionCount,
    openRiskUsd,
  };

  // BLOCK: too many positions
  if (openPositionCount >= MAX_CONCURRENT_POSITIONS) {
    return {
      allowed: false,
      maxRiskUsd: 0,
      reason: `MAX_POSITIONS_${MAX_CONCURRENT_POSITIONS}`,
      detail: { ...detail, maxConcurrent: MAX_CONCURRENT_POSITIONS },
    };
  }

  // BLOCK: too many in same direction
  if (openDirectionCount >= MAX_SAME_DIRECTION) {
    return {
      allowed: false,
      maxRiskUsd: 0,
      reason: `MAX_SAME_DIRECTION_${MAX_SAME_DIRECTION}`,
      detail: { ...detail, maxSameDirection: MAX_SAME_DIRECTION },
    };
  }

  // Available room after buffers
  const dailyRoom = Math.max(0, dailyRemaining - DAILY_SAFETY_BUFFER);
  const maxLossRoom = Math.max(0, maxLossRemaining - MAX_LOSS_SAFETY_BUFFER);

  // BLOCK: no room
  if (dailyRoom <= 0) {
    return { allowed: false, maxRiskUsd: 0, reason: 'DAILY_ROOM_EXHAUSTED', detail };
  }
  if (maxLossRoom <= 0) {
    return { allowed: false, maxRiskUsd: 0, reason: 'MAX_LOSS_ROOM_EXHAUSTED', detail };
  }

  // Budget = smallest of: % of daily room, % of max loss room, absolute cap
  const dailyBudget = dailyRoom * RISK_PER_TRADE_PCT;
  const maxLossBudget = maxLossRoom * RISK_PER_TRADE_PCT;
  let maxRiskUsd = Math.min(dailyBudget, maxLossBudget, MAX_RISK_PER_TRADE_USD);

  // Account for already-open risk
  // If we have open risk, reduce budget proportionally
  const totalAllowedRisk = Math.min(dailyRoom, maxLossRoom);
  const remainingBudget = totalAllowedRisk - openRiskUsd;
  if (remainingBudget < maxRiskUsd) {
    maxRiskUsd = Math.max(0, remainingBudget * RISK_PER_TRADE_PCT);
  }

  maxRiskUsd = Math.round(maxRiskUsd * 100) / 100;

  // BLOCK: risk too small
  if (maxRiskUsd < MIN_RISK_PER_TRADE_USD) {
    return {
      allowed: false,
      maxRiskUsd,
      reason: `RISK_TOO_SMALL_$${maxRiskUsd}`,
      detail: { ...detail, dailyRoom, maxLossRoom, minRequired: MIN_RISK_PER_TRADE_USD },
    };
  }

  return {
    allowed: true,
    maxRiskUsd,
    maxPositions: MAX_CONCURRENT_POSITIONS,
    slotsAvailable: MAX_CONCURRENT_POSITIONS - openPositionCount,
    reason: null,
    detail: {
      ...detail,
      dailyRoom,
      maxLossRoom,
      dailyBudget: Math.round(dailyBudget * 100) / 100,
      maxLossBudget: Math.round(maxLossBudget * 100) / 100,
    },
  };
}

/**
 * Compute lot size from risk budget and SL distance.
 *
 * @param {object} params
 * @param {number} params.maxRiskUsd - max USD to risk on this trade
 * @param {number} params.slPips - stop loss distance in pips
 * @param {number} params.pipValuePerUnit - pip value per 1 unit volume
 * @param {number} params.lotSize - units per lot (usually 100000)
 * @param {number} params.volumeStep - minimum volume increment
 * @param {number} params.minVolume - broker minimum volume
 * @returns {{ lots, volume, estimatedRiskUsd }}
 */
export function computeLotSize({
  maxRiskUsd,
  slPips,
  pipValuePerUnit,
  lotSize = 100000,
  volumeStep = 100000,
  minVolume = 100000,
} = {}) {
  if (!maxRiskUsd || !slPips || !pipValuePerUnit) {
    return { lots: 0, volume: 0, estimatedRiskUsd: 0, reason: 'MISSING_PARAMS' };
  }

  const rawVolume = maxRiskUsd / (slPips * pipValuePerUnit);
  const stepped = Math.floor(rawVolume / volumeStep) * volumeStep;

  if (stepped < minVolume) {
    return { lots: 0, volume: 0, estimatedRiskUsd: 0, reason: 'BELOW_MIN_VOLUME' };
  }

  const lots = Math.round((stepped / lotSize) * 100) / 100;
  const estimatedRiskUsd = Math.round(stepped * slPips * pipValuePerUnit * 100) / 100;

  return { lots, volume: stepped, estimatedRiskUsd };
}

/**
 * Format a challenge-aware notification message.
 */
export function formatTradeNotification({ setup, plan, sizing, budget, guardian }) {
  const lines = [
    `🎯 *VALID SETUP — ${budget.slotsAvailable} slot${budget.slotsAvailable > 1 ? 's' : ''} left*`,
    ``,
    `*${setup.strategy}* | ${setup.symbol} *${setup.direction}*`,
    `Entry: \`${plan.entry.price}\``,
    `SL: \`${plan.stopLoss.price}\` (${plan.stopLoss.pips}p)`,
    `TP: \`${plan.takeProfit.price}\` (${plan.takeProfit.pips}p)`,
    `R:R: *${plan.riskReward}:1* | Gap: ${setup.gap}`,
    ``,
    `📊 *SIZING*`,
    `Lots: *${sizing.lots}*`,
    `Risk: $${sizing.estimatedRiskUsd} / $${budget.maxRiskUsd} max`,
    ``,
    `🛡 *CHALLENGE STATUS*`,
    `Guardian: ${guardian.state}`,
    `Daily room: $${budget.detail.dailyRoom} (limit buffer: $${DAILY_SAFETY_BUFFER})`,
    `Max loss room: $${budget.detail.maxLossRoom} (limit buffer: $${MAX_LOSS_SAFETY_BUFFER})`,
    `Open positions: ${budget.detail.openPositions}/${MAX_CONCURRENT_POSITIONS}`,
    ``,
    `👉 Open Guardian page to execute`,
  ];
  return lines.join('\n');
}

export const LIMITS = {
  MAX_CONCURRENT_POSITIONS,
  MAX_SAME_DIRECTION,
  RISK_PER_TRADE_PCT,
  MAX_RISK_PER_TRADE_USD,
  MIN_RISK_PER_TRADE_USD,
  DAILY_SAFETY_BUFFER,
  MAX_LOSS_SAFETY_BUFFER,
};
