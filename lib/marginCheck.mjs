/**
 * Margin Pre-flight Check
 * Uses cTrader MCP calculate_margin to verify sufficient margin
 * before placing orders. Blocks if margin would be insufficient.
 */

/**
 * Evaluate whether an order can be placed without margin rejection.
 *
 * @param {object} params
 * @param {object} params.marginResult - from cTrader calculate_margin
 * @param {number} params.freeMargin - current free margin from get_balance
 * @param {number} [params.safetyBuffer=0.2] - require 20% buffer over required margin
 * @returns {{ allowed, requiredMargin, availableMargin, usagePercent, reason }}
 */
export function evaluateMargin({ marginResult = {}, freeMargin = 0, safetyBuffer = 0.2 } = {}) {
  const requiredMargin = Number(marginResult?.margin || marginResult?.requiredMargin || 0);
  const available = Number(freeMargin);

  if (!requiredMargin) {
    return {
      allowed: false,
      requiredMargin: 0,
      availableMargin: available,
      usagePercent: 0,
      reason: 'MARGIN_CALC_FAILED',
    };
  }

  const marginWithBuffer = requiredMargin * (1 + safetyBuffer);
  const usagePercent = available > 0 ? (requiredMargin / available) * 100 : 100;

  if (available < marginWithBuffer) {
    return {
      allowed: false,
      requiredMargin: Math.round(requiredMargin * 100) / 100,
      availableMargin: Math.round(available * 100) / 100,
      usagePercent: Math.round(usagePercent * 10) / 10,
      reason: available < requiredMargin
        ? 'INSUFFICIENT_MARGIN'
        : 'MARGIN_BUFFER_EXCEEDED',
    };
  }

  return {
    allowed: true,
    requiredMargin: Math.round(requiredMargin * 100) / 100,
    availableMargin: Math.round(available * 100) / 100,
    usagePercent: Math.round(usagePercent * 10) / 10,
    reason: null,
  };
}

/**
 * Full pre-flight margin check via cTrader MCP.
 * Call this before place_limit_order or place_market_order.
 *
 * @param {object} client - MCP client
 * @param {object} order - { symbol, tradeSide, volume }
 * @param {object} options - { safetyBuffer }
 * @returns {{ allowed, requiredMargin, availableMargin, usagePercent, reason }}
 */
export async function preflightMarginCheck(client, order = {}, options = {}) {
  const { symbol, tradeSide, volume } = order;

  if (!symbol || !tradeSide || !volume) {
    return { allowed: false, reason: 'MISSING_ORDER_PARAMS' };
  }

  // Fetch margin requirement and free margin in parallel
  const [marginResult, balanceResult] = await Promise.all([
    client.call('calculate_margin', { symbol, tradeSide, volume }),
    client.call('get_balance'),
  ]);

  const freeMargin = Number(balanceResult?.freeMargin || 0);

  return evaluateMargin({
    marginResult,
    freeMargin,
    safetyBuffer: options.safetyBuffer ?? 0.2,
  });
}
