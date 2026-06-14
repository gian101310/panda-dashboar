/**
 * Account Statistics Module
 * Uses cTrader MCP get_account_statistics to feed performance metrics
 * into Guardian execution gates.
 *
 * When win rate or profit factor drops below thresholds,
 * the Guardian tightens risk — reducing position size or blocking new trades.
 */

// Thresholds — below these, Guardian tightens execution
const DEFAULT_MIN_WIN_RATE = 0.40;        // 40% — below this = YELLOW gate
const DEFAULT_CRITICAL_WIN_RATE = 0.30;   // 30% — below this = RED gate
const DEFAULT_MIN_PROFIT_FACTOR = 1.0;    // 1.0 — below this = YELLOW gate
const DEFAULT_CRITICAL_PROFIT_FACTOR = 0.7; // 0.7 — below this = RED gate
const DEFAULT_MIN_TRADES = 20;            // need at least 20 closed trades for stats to matter

/**
 * Evaluate account statistics and return risk modifiers for Guardian.
 *
 * @param {object} stats - from get_account_statistics
 * @param {object} options - threshold overrides
 * @returns {{ gate, riskMultiplier, warnings, blockers, detail }}
 *   gate: 'GREEN' | 'YELLOW' | 'RED'
 *   riskMultiplier: 0.0 - 1.0 (multiply against normal risk %)
 */
export function evaluatePerformance(stats = {}, options = {}) {
  const minWinRate = options.minWinRate ?? DEFAULT_MIN_WIN_RATE;
  const critWinRate = options.criticalWinRate ?? DEFAULT_CRITICAL_WIN_RATE;
  const minPF = options.minProfitFactor ?? DEFAULT_MIN_PROFIT_FACTOR;
  const critPF = options.criticalProfitFactor ?? DEFAULT_CRITICAL_PROFIT_FACTOR;
  const minTrades = options.minTrades ?? DEFAULT_MIN_TRADES;

  const totalTrades = Number(stats.totalTrades ?? stats.trades ?? stats.closedPositions ?? 0);
  const wins = Number(stats.wins ?? stats.wonTrades ?? 0);
  const losses = Number(stats.losses ?? stats.lostTrades ?? 0);
  const grossProfit = Number(stats.grossProfit ?? stats.totalProfit ?? 0);
  const grossLoss = Math.abs(Number(stats.grossLoss ?? stats.totalLoss ?? 0));

  const winRate = totalTrades > 0 ? wins / totalTrades : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  const warnings = [];
  const blockers = [];

  // Not enough data — don't gate
  if (totalTrades < minTrades) {
    return {
      gate: 'GREEN',
      riskMultiplier: 1.0,
      warnings: [],
      blockers: [],
      detail: {
        totalTrades, wins, losses, winRate, profitFactor,
        note: `Insufficient trades (${totalTrades}/${minTrades}) — stats gate inactive`,
      },
    };
  }

  // Win rate checks
  if (winRate < critWinRate) {
    blockers.push(`WIN_RATE_CRITICAL_${(winRate * 100).toFixed(0)}pct`);
  } else if (winRate < minWinRate) {
    warnings.push(`WIN_RATE_LOW_${(winRate * 100).toFixed(0)}pct`);
  }

  // Profit factor checks
  if (profitFactor < critPF) {
    blockers.push(`PROFIT_FACTOR_CRITICAL_${profitFactor.toFixed(2)}`);
  } else if (profitFactor < minPF) {
    warnings.push(`PROFIT_FACTOR_LOW_${profitFactor.toFixed(2)}`);
  }

  // Determine gate and risk multiplier
  let gate = 'GREEN';
  let riskMultiplier = 1.0;

  if (blockers.length) {
    gate = 'RED';
    riskMultiplier = 0.0; // block new trades entirely
  } else if (warnings.length) {
    gate = 'YELLOW';
    // Scale down: worst case 50% reduction
    const wrFactor = winRate < minWinRate ? winRate / minWinRate : 1.0;
    const pfFactor = profitFactor < minPF ? profitFactor / minPF : 1.0;
    riskMultiplier = Math.max(0.5, Math.min(wrFactor, pfFactor));
  }

  return {
    gate,
    riskMultiplier: Math.round(riskMultiplier * 100) / 100,
    warnings,
    blockers,
    detail: {
      totalTrades,
      wins,
      losses,
      winRate: Math.round(winRate * 1000) / 10,
      profitFactor: Math.round(profitFactor * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossLoss: Math.round(grossLoss * 100) / 100,
    },
  };
}

/**
 * Merge stats gate into existing Guardian state.
 * The stricter gate wins.
 */
export function mergeStatsIntoGuardian(guardianState, statsGate) {
  const severity = { GREEN: 0, YELLOW: 1, RED: 2 };
  const guardianSev = severity[guardianState.state] ?? 0;
  const statsSev = severity[statsGate.gate] ?? 0;

  // Stats gate doesn't override — it adds warnings/blockers
  const merged = { ...guardianState };

  if (statsSev > guardianSev) {
    merged.state = statsGate.gate;
    merged.mode = statsGate.gate === 'RED' ? 'LOCKED' : 'RECOVERY';
  }

  merged.warnings = [...(merged.warnings || []), ...statsGate.warnings];
  merged.blockers = [...(merged.blockers || []), ...statsGate.blockers];
  merged.statsGate = statsGate.gate;
  merged.riskMultiplier = statsGate.riskMultiplier;
  merged.statsDetail = statsGate.detail;

  return merged;
}
