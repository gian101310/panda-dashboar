const HISTORICAL_CLAIMS = Object.freeze({
  bb_gap7_pl_confirmed: { historical_win_rate: 91, historical_sample_size: 27 },
  bb_gap7_pl_unconfirmed: { historical_win_rate: 0, historical_sample_size: 53 },
});

function round2(value) {
  return Math.round(value * 100) / 100;
}

function isPandaLinesConfirmed(row) {
  return (row.direction === 'BUY' && row.pl_zone === 'ABOVE') ||
    (row.direction === 'SELL' && row.pl_zone === 'BELOW');
}

function summarize(rows) {
  const counts = { wins: 0, losses: 0, flats: 0 };
  for (const row of rows) {
    if (row.outcome === 'WIN') counts.wins += 1;
    else if (row.outcome === 'LOSS') counts.losses += 1;
    else if (row.outcome === 'FLAT') counts.flats += 1;
  }
  const decisive = counts.wins + counts.losses;
  const total = decisive + counts.flats;
  return {
    ...counts,
    decisive,
    total,
    decisive_win_rate: decisive ? round2((counts.wins / decisive) * 100) : null,
  };
}

function evaluateClaim(current, historical) {
  const delta = current.decisive_win_rate == null
    ? null
    : round2(current.decisive_win_rate - historical.historical_win_rate);
  return {
    ...historical,
    current,
    delta_percentage_points: delta,
    status: delta == null ? 'NO_DATA' : Math.abs(delta) >= 10 ? 'STALE' : 'CURRENT',
  };
}

export function buildEdgeRevalidationReport(rows, now = new Date()) {
  const resolvedRows = (rows || []).filter((row) => ['WIN', 'LOSS', 'FLAT'].includes(row.outcome));
  const gap7 = resolvedRows.filter((row) =>
    row.strategy === 'BB' && Math.floor(Math.abs(Number(row.entry_gap))) === 7
  );
  const claims = {
    bb_gap7_pl_confirmed: evaluateClaim(
      summarize(gap7.filter(isPandaLinesConfirmed)),
      HISTORICAL_CLAIMS.bb_gap7_pl_confirmed,
    ),
    bb_gap7_pl_unconfirmed: evaluateClaim(
      summarize(gap7.filter((row) => !isPandaLinesConfirmed(row))),
      HISTORICAL_CLAIMS.bb_gap7_pl_unconfirmed,
    ),
  };

  return {
    version: 1,
    overall_status: Object.values(claims).some((claim) => claim.status === 'STALE')
      ? 'STALE_CLAIMS'
      : 'CURRENT',
    computed_at: now.toISOString(),
    total_signals: resolvedRows.length,
    strategies: {
      BB: summarize(resolvedRows.filter((row) => row.strategy === 'BB')),
      INTRA: summarize(resolvedRows.filter((row) => row.strategy === 'INTRA')),
    },
    claims,
  };
}

export function isCronAuthorized(authorization, secret) {
  return Boolean(secret) && authorization === `Bearer ${secret}`;
}

export function buildEdgeRevalidationAlert(report) {
  const confirmed = report.claims.bb_gap7_pl_confirmed.current;
  const unconfirmed = report.claims.bb_gap7_pl_unconfirmed.current;
  const rate = (value) => value == null ? 'n/a' : `${value}%`;
  return [
    '🧠 <b>PANDA EDGE REVALIDATION</b>',
    '',
    `Status: <b>${report.overall_status}</b>`,
    `BB overall: <b>${rate(report.strategies.BB.decisive_win_rate)}</b> decisive (n=${report.strategies.BB.decisive})`,
    `INTRA overall: <b>${rate(report.strategies.INTRA.decisive_win_rate)}</b> decisive (n=${report.strategies.INTRA.decisive})`,
    `BB gap 7 + PL: <b>${rate(confirmed.decisive_win_rate)}</b> decisive (n=${confirmed.decisive})`,
    `BB gap 7 without PL: <b>${rate(unconfirmed.decisive_win_rate)}</b> decisive (n=${unconfirmed.decisive})`,
    '',
    'The historical 91% / 0% claims are retired. Fresh samples now override them.',
  ].join('\n');
}

export function createEdgeRevalidationRunner({
  fetchRows,
  getPreviousReport,
  replaceReport,
  retireHistoricalClaims,
  notify,
  now = () => new Date(),
}) {
  return async function runEdgeRevalidation() {
    const [rows, previous] = await Promise.all([fetchRows(), getPreviousReport()]);
    const report = buildEdgeRevalidationReport(rows, now());

    await retireHistoricalClaims(report);

    let notified = false;
    const alertNeeded = report.overall_status === 'STALE_CLAIMS' &&
      previous?.alert_delivered !== true;
    if (alertNeeded) notified = Boolean(await notify(report));
    report.alert_delivered = report.overall_status === 'STALE_CLAIMS'
      ? notified || previous?.alert_delivered === true
      : false;

    await replaceReport(report);

    return { report, notified };
  };
}

export function createEdgeRevalidationHandler({ requireAdmin, getLatest, runRevalidation }) {
  return async function edgeRevalidationHandler(req, res) {
    const admin = await requireAdmin(req);
    if (!admin) return res.status(403).json({ error: 'Admin only' });

    try {
      if (req.method === 'GET') {
        return res.status(200).json({ report: await getLatest() });
      }
      if (req.method === 'POST') {
        return res.status(200).json(await runRevalidation());
      }
      return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
      console.error('Edge revalidation failed');
      return res.status(500).json({ error: error?.message || 'Edge revalidation failed' });
    }
  };
}
