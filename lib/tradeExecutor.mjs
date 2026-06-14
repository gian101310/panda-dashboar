import { canAutomateExecution } from './accountGuardian.mjs';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function money(value) {
  return Math.round(num(value) * 100) / 100;
}

function isPandaOrder(item = {}) {
  return String(item.label || '').startsWith('PANDA-') || String(item.comment || '').includes('Panda Engine');
}

function pipValuePerUnit(symbolDetails = {}) {
  const lotSize = num(symbolDetails.lotSize);
  if (num(symbolDetails.pipValuePerUnit) > 0) return num(symbolDetails.pipValuePerUnit);
  if (num(symbolDetails.pipValuePerLot) > 0 && lotSize > 0) return num(symbolDetails.pipValuePerLot) / lotSize;
  if (num(symbolDetails.pipValue) > 0 && lotSize > 0) {
    const pipValue = num(symbolDetails.pipValue);
    return pipValue >= 1 ? pipValue / lotSize : pipValue;
  }
  return 0;
}

function symbolName(symbolDetails = {}) {
  return String(symbolDetails.name || symbolDetails.symbolName || symbolDetails.symbol || '').toUpperCase();
}

function midPrice(symbolDetails = {}) {
  const bid = num(symbolDetails.bid);
  const ask = num(symbolDetails.ask);
  if (bid > 0 && ask > 0) return (bid + ask) / 2;
  return bid > 0 ? bid : ask;
}

export function deriveUsdPipValuePerUnit({ symbolDetails = {}, conversionDetails = null, depositAsset = 'USD' } = {}) {
  const existing = pipValuePerUnit(symbolDetails);
  if (existing > 0) return existing;

  const name = symbolName(symbolDetails);
  const deposit = String(depositAsset || 'USD').toUpperCase();
  if (name.length < 6) return 0;

  const quote = name.slice(3, 6);
  const pipSize = num(symbolDetails.pipSize) || (name.includes('JPY') ? 0.01 : 0.0001);
  if (!pipSize) return 0;
  if (quote === deposit) return pipSize;

  const conversionName = symbolName(conversionDetails || {});
  const conversionMid = midPrice(conversionDetails || {});
  if (!conversionName || !conversionMid) return 0;

  if (conversionName === `${quote}${deposit}`) return pipSize * conversionMid;
  if (conversionName === `${deposit}${quote}`) return pipSize / conversionMid;
  return 0;
}

function orderLabel(strategy) {
  return String(strategy || '').toUpperCase() === 'PLPB' ? 'PANDA-PLPB' : 'PANDA-INTRA-PB';
}

export function normalizeVolumeUnits({ lots, symbolDetails } = {}) {
  const details = symbolDetails || {};
  const lotSize = num(details.lotSize);
  const minVolume = num(details.minVolume);
  const maxVolume = num(details.maxVolume, Number.MAX_SAFE_INTEGER);
  const volumeStep = num(details.volumeStep, 1);
  if (!lotSize || !volumeStep) throw new Error('INVALID_SYMBOL_VOLUME_DETAILS');

  const rawUnits = num(lots) * lotSize;
  const stepped = Math.round(rawUnits / volumeStep) * volumeStep;
  const volume = Math.max(minVolume, stepped);
  if (volume > maxVolume) throw new Error('VOLUME_ABOVE_SYMBOL_MAX');
  return Math.trunc(volume);
}

export function computeRiskSizedVolume({
  plan,
  risk = {},
  symbolDetails = {},
  riskPct = 0.25,
  maxRiskUsd = 250,
  safetyBufferUsd = 100,
} = {}) {
  const details = symbolDetails || {};
  const lotSize = num(details.lotSize);
  const minVolume = num(details.minVolume);
  const maxVolume = num(details.maxVolume, Number.MAX_SAFE_INTEGER);
  const volumeStep = num(details.volumeStep, 1);
  const slPips = num(plan?.stopLoss?.pips);
  const pipUnit = pipValuePerUnit(details);
  if (!lotSize || !volumeStep) throw new Error('INVALID_SYMBOL_VOLUME_DETAILS');
  if (!slPips) throw new Error('STOP_LOSS_PIPS_REQUIRED');
  if (!pipUnit) throw new Error('PIP_VALUE_UNAVAILABLE');

  const pctBudget = money(num(risk.equity || risk.balance) * (num(riskPct) / 100));
  const dailyBudget = money(num(risk.dailyRemaining) - num(safetyBufferUsd));
  const maxLossBudget = money(num(risk.maxLossRemaining) - num(safetyBufferUsd));
  const riskBudgetUsd = Math.min(maxRiskUsd, pctBudget, dailyBudget, maxLossBudget);
  if (!Number.isFinite(riskBudgetUsd) || riskBudgetUsd <= 0) throw new Error('RISK_BUDGET_UNAVAILABLE');

  const rawVolume = riskBudgetUsd / (slPips * pipUnit);
  const stepped = Math.floor(rawVolume / volumeStep) * volumeStep;
  if (stepped < minVolume) throw new Error('RISK_BUDGET_BELOW_SYMBOL_MIN_VOLUME');
  if (stepped > maxVolume) throw new Error('VOLUME_ABOVE_SYMBOL_MAX');

  return {
    volume: Math.trunc(stepped),
    lots: money(stepped / lotSize),
    riskBudgetUsd: money(riskBudgetUsd),
    estimatedLossUsd: money(stepped * slPips * pipUnit),
    pipValuePerUnit: pipUnit,
  };
}

export function evaluatePendingOrderExecution({
  guardian,
  setup,
  plan,
  approval = false,
  allowedStrategies = ['INTRA'],
  pendingOrders = [],
  totalOpenRisk = 0,
  now = new Date(),
} = {}) {
  const reasons = [];
  const allowed = (allowedStrategies || []).map(strategy => String(strategy).toUpperCase());
  if (!approval) reasons.push('APPROVAL_REQUIRED');
  if (!allowed.includes(setup?.strategy) || !allowed.includes(plan?.strategy)) reasons.push(`${allowed.join('_OR_') || 'NO'}_ONLY`);
  if (!plan?.entry?.price) reasons.push('PB_ENTRY_REQUIRED');
  if (!plan?.stopLoss?.pips || !plan?.takeProfit?.pips) reasons.push('SL_TP_REQUIRED');
  const label = orderLabel(setup?.strategy);
  if ((pendingOrders || []).some(order => order.symbolName === setup?.symbol && order.label === label)) {
    reasons.push('DUPLICATE_PANDA_PB_ORDER');
  }

  const automation = canAutomateExecution({ guardian, setup, totalOpenRisk, now });
  reasons.push(...automation.reasons);

  return {
    allowed: reasons.length === 0,
    reasons: [...new Set(reasons)],
  };
}

export function buildPendingOrderRequest({ setup, plan, volume, expiresAt } = {}) {
  const side = String(setup?.direction || plan?.direction || '').toLowerCase();
  if (!['buy', 'sell'].includes(side)) throw new Error('INVALID_ORDER_SIDE');
  if (!plan?.entry?.price || !plan?.stopLoss?.pips || !plan?.takeProfit?.pips) throw new Error('INVALID_PB_PLAN');

  const strategy = String(setup.strategy || plan.strategy || 'INTRA').toUpperCase();
  return {
    symbolName: setup.symbol,
    side,
    volume,
    limitPrice: plan.entry.price,
    stopLossPips: plan.stopLoss.pips,
    takeProfitPips: plan.takeProfit.pips,
    expiresAt: iso(expiresAt),
    label: orderLabel(strategy),
    comment: `Panda Engine ${strategy} PB ${plan.entry.label} RR ${plan.riskReward}:1`,
  };
}

export function planOpenPositionActions({ positions = [], activeSetups = [] } = {}) {
  const activeBySymbol = new Map((activeSetups || []).map(setup => [setup.symbol, setup]));
  const actions = [];

  for (const position of positions || []) {
    if (!isPandaOrder(position)) continue;
    const active = activeBySymbol.get(position.symbolName);
    const sameDirection = active && String(active.direction || '').toUpperCase() === String(position.tradeSide || '').toUpperCase();
    if (!sameDirection) {
      actions.push({
        tool: 'close_position',
        args: { positionId: position.id },
        reason: 'SIGNAL_DISAPPEARED',
      });
    }
  }

  return actions;
}

export function planPendingOrderActions({ pendingOrders = [], activeSetups = [] } = {}) {
  const activeBySymbol = new Map((activeSetups || []).map(setup => [setup.symbol, setup]));
  const actions = [];

  for (const order of pendingOrders || []) {
    if (!isPandaOrder(order)) continue;
    if (!activeBySymbol.has(order.symbolName)) {
      actions.push({
        tool: 'cancel_order',
        args: { orderId: order.id },
        reason: 'SIGNAL_DISAPPEARED',
      });
    }
  }

  return actions;
}
