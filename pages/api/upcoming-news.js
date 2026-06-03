import { validateSession } from '../../lib/auth';

const CURRENCY_TO_PAIRS = {
  USD: ['EURUSD','GBPUSD','AUDUSD','NZDUSD','USDCAD','USDJPY'],
  EUR: ['EURUSD','EURJPY','EURGBP','EURAUD','EURCAD','EURNZD'],
  GBP: ['GBPUSD','GBPJPY','GBPAUD','GBPCAD','GBPNZD','EURGBP'],
  JPY: ['USDJPY','EURJPY','GBPJPY','AUDJPY','CADJPY','NZDJPY'],
  AUD: ['AUDUSD','AUDJPY','AUDCAD','AUDNZD','EURAUD','GBPAUD'],
  CAD: ['USDCAD','CADJPY','EURCAD','GBPCAD','AUDCAD','NZDCAD'],
  NZD: ['NZDUSD','NZDJPY','NZDCAD','AUDNZD','EURNZD','GBPNZD'],
};

const ALL_PAIRS = ['AUDJPY','AUDCAD','AUDNZD','AUDUSD','CADJPY','EURAUD','EURCAD',
  'EURGBP','EURJPY','EURNZD','EURUSD','GBPAUD','GBPCAD','GBPJPY',
  'GBPNZD','GBPUSD','NZDCAD','NZDJPY','NZDUSD','USDCAD','USDJPY'];

function parseNewsTime(dateStr, timeStr) {
  if (!timeStr || ['all day','tentative','tbd',''].includes(timeStr.toLowerCase().trim())) return null;
  try {
    // Date: try ISO first, then MM-DD-YYYY
    let d;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
      d = new Date(dateStr.trim() + 'T00:00:00Z');
    } else {
      const parts = dateStr.trim().split('-');
      if (parts.length === 3) {
        // MM-DD-YYYY
        d = new Date(`${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}T00:00:00Z`);
      }
    }
    if (!d || isNaN(d)) return null;

    // Time: "8:30am" or "08:30:00"
    const ts = timeStr.trim().toLowerCase().replace(/ et$| est$| edt$/,'');
    let hours, minutes;
    const ampm = ts.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
    const plain = ts.match(/^(\d{1,2}):(\d{2})/);
    if (ampm) {
      hours = parseInt(ampm[1]);
      minutes = parseInt(ampm[2]);
      if (ampm[3] === 'pm' && hours !== 12) hours += 12;
      if (ampm[3] === 'am' && hours === 12) hours = 0;
    } else if (plain) {
      hours = parseInt(plain[1]);
      minutes = parseInt(plain[2]);
    } else return null;

    // ForexFactory ET → UTC: add 4h (DST summer default)
    const utcMs = d.getTime() + (hours * 60 + minutes) * 60000 + 4 * 3600000;
    return new Date(utcMs);
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const r = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return res.status(200).json({ events: [], affected_pairs: [] });

    const data = await r.json();
    const now = new Date();
    const windowMs = 60 * 60 * 1000; // 60 min lookahead

    const upcoming = [];
    const affectedPairsSet = new Set();

    for (const ev of (data || [])) {
      if ((ev.impact || '').toLowerCase() !== 'high') continue;
      const currency = (ev.country || '').toUpperCase();
      if (!CURRENCY_TO_PAIRS[currency]) continue;

      const eventDt = parseNewsTime(ev.date || '', ev.time || '');
      if (!eventDt) continue;

      const minsAway = (eventDt - now) / 60000;
      if (minsAway < -5 || minsAway > 60) continue; // -5 to catch just-fired events

      const pairs = (CURRENCY_TO_PAIRS[currency] || []).filter(p => ALL_PAIRS.includes(p));
      pairs.forEach(p => affectedPairsSet.add(p));

      upcoming.push({
        title: ev.title || '',
        currency,
        time: ev.time || '',
        date: ev.date || '',
        mins_away: Math.round(minsAway),
        affected_pairs: pairs,
        forecast: ev.forecast || '',
        previous: ev.previous || '',
      });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({
      events: upcoming,
      affected_pairs: [...affectedPairsSet],
      count: upcoming.length
    });
  } catch (err) {
    return res.status(200).json({ events: [], affected_pairs: [], error: err.message });
  }
}
