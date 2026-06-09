export function computeRunHealth({ now = new Date(), logLastRun = null, heartbeatRow = null } = {}) {
  const heartbeatLastRun = heartbeatRow?.created_at || null;
  const lastRun = heartbeatLastRun || logLastRun || null;
  const lastRunDate = lastRun ? new Date(lastRun) : null;
  const minutesAgo = lastRunDate ? Math.max(0, Math.floor((now - lastRunDate) / 60000)) : 999;
  const isAlive = minutesAgo <= 20;

  let heartbeat = null;
  if (heartbeatRow) {
    const hbAge = Math.max(0, Math.floor((now - new Date(heartbeatRow.created_at)) / 60000));
    heartbeat = {
      last_beat: heartbeatRow.created_at,
      age_minutes: hbAge,
      pairs_processed: heartbeatRow.pairs_processed,
      signals_pushed: heartbeatRow.signals_pushed,
      cycle_errors: heartbeatRow.errors,
      status: hbAge <= 10 ? 'HEALTHY' : hbAge <= 20 ? 'WARNING' : 'CRITICAL',
    };
  }

  return { lastRun, minutesAgo, isAlive, heartbeat };
}
