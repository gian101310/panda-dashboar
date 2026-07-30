const STALE_AFTER_MINUTES = 15;

export function evaluateEngineMonitor({ heartbeatAt, previousStatus = 'HEALTHY', now = new Date() }) {
  const heartbeatTime = heartbeatAt ? new Date(heartbeatAt) : null;
  const validHeartbeat = heartbeatTime && !Number.isNaN(heartbeatTime.getTime());
  const ageMinutes = validHeartbeat
    ? Math.max(0, Math.floor((now.getTime() - heartbeatTime.getTime()) / 60000))
    : null;
  const status = ageMinutes != null && ageMinutes < STALE_AFTER_MINUTES ? 'HEALTHY' : 'STALE';

  let action = 'NONE';
  if (status === 'STALE' && previousStatus !== 'STALE') action = 'STALE_ALERT';
  if (status === 'HEALTHY' && previousStatus === 'STALE') action = 'RECOVERY_ALERT';

  return {
    status,
    action,
    ageMinutes,
    heartbeatAt: validHeartbeat ? heartbeatTime.toISOString() : null,
    checkedAt: now.toISOString(),
  };
}

export function buildEngineMonitorAlert(decision) {
  if (decision.action === 'RECOVERY_ALERT') {
    return [
      '✅ <b>PANDA ENGINE RECOVERED</b>',
      '',
      `Heartbeat age: <b>${decision.ageMinutes} minute${decision.ageMinutes === 1 ? '' : 's'}</b>`,
      `Latest heartbeat: ${decision.heartbeatAt}`,
    ].join('\n');
  }
  const age = decision.ageMinutes == null ? 'No heartbeat found' : `${decision.ageMinutes} minutes old`;
  return [
    '🚨 <b>PANDA ENGINE STALLED</b>',
    '',
    `Heartbeat: <b>${age}</b>`,
    'Check the Windows PC and START_PANDA.bat. The monitor did not restart or modify the engine.',
  ].join('\n');
}

export function createEngineStallMonitor({
  getLatestHeartbeat,
  getState,
  sendAlert,
  saveState,
  now = () => new Date(),
}) {
  return async function runEngineStallMonitor() {
    const [heartbeat, previous] = await Promise.all([getLatestHeartbeat(), getState()]);
    const checkedAt = now();
    const decision = evaluateEngineMonitor({
      heartbeatAt: heartbeat?.created_at || null,
      previousStatus: previous?.status || 'HEALTHY',
      now: checkedAt,
    });

    let alerted = false;
    if (decision.action !== 'NONE') {
      alerted = Boolean(await sendAlert(decision));
      if (!alerted) throw new Error('Telegram alert was not delivered');
    }

    const state = {
      monitor_key: 'engine',
      status: decision.status,
      last_heartbeat_at: decision.heartbeatAt,
      last_alert_at: decision.action === 'STALE_ALERT'
        ? decision.checkedAt
        : previous?.last_alert_at || null,
      last_recovery_at: decision.action === 'RECOVERY_ALERT'
        ? decision.checkedAt
        : previous?.last_recovery_at || null,
      updated_at: decision.checkedAt,
    };
    await saveState(state);

    return { ...decision, alerted };
  };
}
