import { canAutomateExecution } from './accountGuardian.mjs';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
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

export function evaluatePendingOrderExecution({
  guardian,
  setup,
  plan,
  approval = false,
  pendingOrders = [],
  totalOpenRisk = 0,
  now = new Date(),
} = {}) {
  const reasons = [];
  if (!approval) reasons.push('APPROVAL_REQUIRED');
  if (setup?.strategy !== 'INTRA' || plan?.strategy !== 'INTRA') reasons.push('INTRA_ONLY');
  if (!plan?.entry?.price) reasons.push('PB_ENTRY_REQUIRED');
  if (!plan?.stopLoss?.pips || !plan?.takeProfit?.pips) reasons.push('SL_TP_REQUIRED');
  if ((pendingOrders || []).some(order => order.symbolName === setup?.symbol && order.label === 'PANDA-INTRA-PB')) {
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

  return {
    symbolName: setup.symbol,
    side,
    volume,
    limitPrice: plan.entry.price,
    stopLossPips: plan.stopLoss.pips,
    takeProfitPips: plan.takeProfit.pips,
    expiresAt: iso(expiresAt),
    label: 'PANDA-INTRA-PB',
    comment: `Panda Engine INTRA PB ${plan.entry.label} RR ${plan.riskReward}:1`,
  };
}
