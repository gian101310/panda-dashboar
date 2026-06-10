import { validateSession } from '../../lib/auth';
import { collectAffectedPairs, normalizeNewsEvents } from '../../lib/newsCalendar.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const r = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return res.status(200).json({ events: [], affected_pairs: [], count: 0 });

    const data = await r.json();
    const events = normalizeNewsEvents(data, { now: new Date() });

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({
      events,
      affected_pairs: collectAffectedPairs(events),
      count: events.length,
    });
  } catch (err) {
    return res.status(200).json({
      events: [],
      affected_pairs: [],
      count: 0,
      error: err.message,
    });
  }
}
