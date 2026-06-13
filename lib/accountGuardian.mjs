const DEFAULT_STARTING_BALANCE = 50000;
const DAILY_YELLOW_BUFFER = 1500;
const MAX_LOSS_YELLOW_BUFFER = 2000;
const DAILY_RED_BUFFER = 1000;
const MAX_LOSS_RED_BUFFER = 1500;
const MAX_OPEN_RISK = 500;

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function pct(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function isIntraWindow(now = new Date()) {
  const hour = now.getUTCHours();
  return hour === 22 || hour === 23;
}

export function computeChallengeRisk(input = {}) {
  const startingBalance = Number(input.startingBalance || DEFAULT_STARTING_BALANCE);
  const balance = money(input.balance);
  const equity = money(input.equity);
  const dailyLossLimit = money(input.dailyLossLimit);
  const dailyLossUsed = money(input.dailyLossUsed);
  const maxLossLimit = money(input.maxLossLimit);
  const maxLossUsed = money(input.maxLossUsed);
  const profitTarget = money(input.profitTarget);

  return {
    startingBalance: money(startingBalance),
    balance,
    equity,
    dailyLossLimit,
    dailyLossUsed,
    dailyRemaining: money(dailyLossLimit - dailyLossUsed),
    maxLossLimit,
    maxLossUsed,
    maxLossRemaining: money(maxLossLimit - maxLossUsed),
    profitTarget,
    toProfitTarget: profitTarget,
    equityDrawdownPct: pct(((startingBalance - equity) / startingBalance) * 100),
  };
}

export function summarizeOpenRisk(positions = []) {
  const missingSlPositionIds = [];
  let floatingNet = 0;

  for (const position of positions || []) {
    floatingNet += Number(position.netProfit || 0);
    if (position.stopLoss == null) missingSlPositionIds.push(position.id);
  }

  return {
    openPositions: (positions || []).length,
    positionsWithoutSl: missingSlPositionIds.length,
    missingSlPositionIds,
    floatingNet: money(floatingNet),
  };
}

export function classifyGuardianStatus({ risk = {}, positions = [], pendingOrders = [] } = {}) {
  const openRisk = summarizeOpenRisk(positions);
  const blockers = [];
  const warnings = [];

  if (openRisk.positionsWithoutSl > 0) blockers.push('OPEN_POSITION_WITHOUT_SL');
  if (Number(risk.dailyRemaining || 0) < DAILY_RED_BUFFER) blockers.push('DAILY_BUFFER_UNDER_1000');
  if (Number(risk.maxLossRemaining || 0) < MAX_LOSS_RED_BUFFER) blockers.push('MAX_LOSS_BUFFER_UNDER_1500');

  if (Number(risk.dailyRemaining || 0) < DAILY_YELLOW_BUFFER) warnings.push('DAILY_BUFFER_UNDER_1500');
  if (Number(risk.maxLossRemaining || 0) < MAX_LOSS_YELLOW_BUFFER) warnings.push('MAX_LOSS_BUFFER_UNDER_2000');
  if (openRisk.floatingNet < 0) warnings.push('FLOATING_LOSS_ACTIVE');

  const state = blockers.length ? 'RED' : warnings.length ? 'YELLOW' : 'GREEN';
  const mode = state === 'RED' ? 'LOCKED' : state === 'YELLOW' ? 'RECOVERY' : 'NORMAL';

  return {
    state,
    mode,
    blockers,
    warnings,
    openPositions: openRisk.openPositions,
    positionsWithoutSl: openRisk.positionsWithoutSl,
    missingSlPositionIds: openRisk.missingSlPositionIds,
    floatingNet: openRisk.floatingNet,
    pendingOrders: (pendingOrders || []).length,
  };
}

export function canAutomateExecution({ guardian, setup, totalOpenRisk = 0, now = new Date() } = {}) {
  const reasons = [];

  if (!guardian || guardian.state !== 'GREEN') reasons.push('GUARDIAN_NOT_GREEN');
  if (Number(totalOpenRisk || 0) > MAX_OPEN_RISK) reasons.push('OPEN_RISK_OVER_500');
  if (!setup || !['BB', 'INTRA', 'PLPB'].includes(setup.strategy)) reasons.push('UNKNOWN_STRATEGY');

  if (setup?.strategy === 'INTRA') {
    if (Math.abs(Number(setup.gap || 0)) < 9) reasons.push('INTRA_GAP_UNDER_9');
    if (!isIntraWindow(now)) reasons.push('OUTSIDE_INTRA_WINDOW');
  }

  if (setup?.strategy === 'BB' && Math.abs(Number(setup.gap || 0)) < 5) {
    reasons.push('BB_GAP_UNDER_5');
  }

  if (setup?.strategy === 'PLPB' && Math.abs(Number(setup.gap || 0)) < 5) {
    reasons.push('PLPB_GAP_UNDER_5');
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}
