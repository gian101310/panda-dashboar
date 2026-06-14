/**
 * Breakeven SL Manager
 * Moves stop loss to entry price when a PANDA-labeled position reaches +N pips.
 * Uses amend_position (absolute SL price) from cTrader MCP.
 */

const DEFAULT_TRIGGER_PIPS = 30;
const DEFAULT_BUFFER_PIPS = 2; // SL placed 2 pips above/below entry for safety

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isPandaPosition(position = {}) {
  return String(position.label || '').startsWith('PANDA-') || String(position.comment || '').includes('Panda Engine');
}

function pipSize(symbolName) {
  const name = String(symbolName || '').toUpperCase();
  return name.includes('JPY') || name.includes('XAU') ? 0.01 : 0.0001;
}

/**
 * Determine if a position qualifies for breakeven move.
 * Returns { action: 'amend_position', args, reason } or null.
 */
export function evaluateBreakeven(position, options = {}) {
  const triggerPips = num(options.triggerPips, DEFAULT_TRIGGER_PIPS);
  const bufferPips = num(options.bufferPips, DEFAULT_BUFFER_PIPS);

  if (!isPandaPosition(position)) return null;

  const pips = num(position.pips);
  const entryPrice = num(position.entryPrice);
  const currentSl = position.stopLoss != null ? num(position.stopLoss) : null;
  const side = String(position.tradeSide || '').toUpperCase();

  if (!entryPrice || !side) return null;
  if (pips < triggerPips) return null;

  const pip = pipSize(position.symbolName);
  let newSl;

  if (side === 'BUY') {
    newSl = entryPrice + (bufferPips * pip);
    // Only move if current SL is below entry (or missing)
    if (currentSl != null && currentSl >= entryPrice) return null;
  } else if (side === 'SELL') {
    newSl = entryPrice - (bufferPips * pip);
    // Only move if current SL is above entry (or missing)
    if (currentSl != null && currentSl <= entryPrice) return null;
  } else {
    return null;
  }

  // Round to appropriate precision
  const digits = pip === 0.01 ? 3 : 5;
  newSl = Number(newSl.toFixed(digits));

  return {
    action: 'amend_position',
    args: { positionId: position.id, stopLoss: newSl },
    reason: `BE_TRIGGER_${pips.toFixed(0)}p`,
    detail: {
      symbol: position.symbolName,
      side,
      pips,
      entryPrice,
      oldSl: currentSl,
      newSl,
    },
  };
}

/**
 * Scan all positions and return breakeven actions needed.
 */
export function planBreakevenActions(positions = [], options = {}) {
  const actions = [];
  for (const position of positions) {
    const result = evaluateBreakeven(position, options);
    if (result) actions.push(result);
  }
  return actions;
}
