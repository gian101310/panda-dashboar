/**
 * Price Alert System
 * Creates in-platform cTrader alerts via create_price_alert.
 *
 * Two categories:
 * 1. Guardian alerts — daily room approaching danger zone
 * 2. PB entry zone alerts — price nearing pullback entry level
 */

/**
 * Build Guardian-driven alerts based on current risk state.
 * Returns array of { action, args, reason } for alerts to create.
 */
export function planGuardianAlerts({ risk = {}, existingAlerts = [] } = {}) {
  const alerts = [];
  const existingMessages = new Set(existingAlerts.map(a => a.message || a.comment || ''));

  const dailyRemaining = Number(risk.dailyRemaining || 0);
  const maxLossRemaining = Number(risk.maxLossRemaining || 0);

  // Alert when daily room drops to $1,500 threshold
  if (dailyRemaining > 1500 && dailyRemaining < 2000) {
    const msg = 'GUARDIAN: Daily room approaching YELLOW ($1,500)';
    if (!existingMessages.has(msg)) {
      alerts.push({
        action: 'guardian_alert',
        type: 'daily_room_warning',
        message: msg,
        severity: 'WARNING',
        value: dailyRemaining,
      });
    }
  }

  // Alert when daily room drops to $1,000 RED threshold
  if (dailyRemaining > 1000 && dailyRemaining < 1500) {
    const msg = 'GUARDIAN: Daily room approaching RED ($1,000) — LOCK IMMINENT';
    if (!existingMessages.has(msg)) {
      alerts.push({
        action: 'guardian_alert',
        type: 'daily_room_critical',
        message: msg,
        severity: 'CRITICAL',
        value: dailyRemaining,
      });
    }
  }

  // Max loss buffer alerts
  if (maxLossRemaining > 1500 && maxLossRemaining < 2000) {
    const msg = 'GUARDIAN: Max loss room approaching YELLOW ($2,000)';
    if (!existingMessages.has(msg)) {
      alerts.push({
        action: 'guardian_alert',
        type: 'max_loss_warning',
        message: msg,
        severity: 'WARNING',
        value: maxLossRemaining,
      });
    }
  }

  if (maxLossRemaining > 1000 && maxLossRemaining < 1500) {
    const msg = 'GUARDIAN: Max loss room approaching RED ($1,500) — LOCK IMMINENT';
    if (!existingMessages.has(msg)) {
      alerts.push({
        action: 'guardian_alert',
        type: 'max_loss_critical',
        message: msg,
        severity: 'CRITICAL',
        value: maxLossRemaining,
      });
    }
  }

  return alerts;
}

/**
 * Build PB entry zone price alerts.
 * When price is within alertPips of the PB entry level, create a cTrader alert.
 *
 * @param {Array} setups - engine setups with { symbol, bias, pb_entry, pl_st }
 * @param {Object} quotes - { EURUSD: { bid, ask }, ... }
 * @param {number} alertPips - proximity threshold (default 20)
 */
export function planEntryZoneAlerts(setups = [], quotes = {}, { alertPips = 20 } = {}) {
  const alerts = [];

  for (const setup of setups) {
    const symbol = String(setup.symbol || '').replace('/', '').toUpperCase();
    const bias = String(setup.bias || '').toUpperCase();
    const pbEntry = Number(setup.pb_entry || setup.entry);
    if (!symbol || !pbEntry || !bias) continue;

    const quote = quotes[symbol];
    if (!quote) continue;

    const currentPrice = bias === 'BUY' ? Number(quote.ask || quote.bid) : Number(quote.bid || quote.ask);
    if (!currentPrice) continue;

    const pipSize = symbol.includes('JPY') ? 0.01 : 0.0001;
    const distancePips = Math.abs(currentPrice - pbEntry) / pipSize;

    if (distancePips <= alertPips) {
      alerts.push({
        action: 'create_price_alert',
        args: {
          symbol,
          price: pbEntry,
          comment: `PANDA PB Entry Zone: ${symbol} ${bias} @ ${pbEntry}`,
        },
        reason: `ENTRY_ZONE_${distancePips.toFixed(0)}p_away`,
        detail: {
          symbol,
          bias,
          pbEntry,
          currentPrice,
          distancePips: Math.round(distancePips * 10) / 10,
        },
      });
    }
  }

  return alerts;
}
