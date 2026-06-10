export const CURRENCY_TO_PAIRS = {
  USD: ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDJPY'],
  EUR: ['EURUSD', 'EURJPY', 'EURGBP', 'EURAUD', 'EURCAD', 'EURNZD'],
  GBP: ['GBPUSD', 'GBPJPY', 'GBPAUD', 'GBPCAD', 'GBPNZD', 'EURGBP'],
  JPY: ['USDJPY', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY', 'NZDJPY'],
  AUD: ['AUDUSD', 'AUDJPY', 'AUDCAD', 'AUDNZD', 'EURAUD', 'GBPAUD'],
  CAD: ['USDCAD', 'CADJPY', 'EURCAD', 'GBPCAD', 'AUDCAD', 'NZDCAD'],
  NZD: ['NZDUSD', 'NZDJPY', 'NZDCAD', 'AUDNZD', 'EURNZD', 'GBPNZD'],
};

export const ALL_PAIRS = [
  'AUDJPY', 'AUDCAD', 'AUDNZD', 'AUDUSD', 'CADJPY', 'EURAUD', 'EURCAD',
  'EURGBP', 'EURJPY', 'EURNZD', 'EURUSD', 'GBPAUD', 'GBPCAD', 'GBPJPY',
  'GBPNZD', 'GBPUSD', 'NZDCAD', 'NZDJPY', 'NZDUSD', 'USDCAD', 'USDJPY',
];

const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;
const ET_TO_UTC_OFFSET_MS = 4 * 60 * 60 * 1000;

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function getDubaiDayRangeUtc(now = new Date()) {
  const dubai = new Date(now.getTime() + DUBAI_OFFSET_MS);
  const startUtcMs = Date.UTC(
    dubai.getUTCFullYear(),
    dubai.getUTCMonth(),
    dubai.getUTCDate(),
    0,
    0,
    0,
    0
  ) - DUBAI_OFFSET_MS;

  return {
    start: new Date(startUtcMs),
    end: new Date(startUtcMs + 24 * 60 * 60 * 1000),
  };
}

export function buildCountdownLabel(minsAway) {
  const mins = Math.max(0, Math.round(Number(minsAway) || 0));
  if (mins <= 0) return 'NOW';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatDubaiDateTime(date) {
  const dubai = new Date(date.getTime() + DUBAI_OFFSET_MS);
  return `${dubai.getUTCFullYear()}-${pad2(dubai.getUTCMonth() + 1)}-${pad2(dubai.getUTCDate())} ${pad2(dubai.getUTCHours())}:${pad2(dubai.getUTCMinutes())}`;
}

export function parseNewsTime(dateStr, timeStr) {
  const rawTime = String(timeStr || '').trim();
  if (!rawTime || ['all day', 'tentative', 'tbd'].includes(rawTime.toLowerCase())) return null;

  const rawDate = String(dateStr || '').trim();
  let year;
  let month;
  let day;

  const iso = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const us = rawDate.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (us) {
    year = Number(us[3]);
    month = Number(us[1]);
    day = Number(us[2]);
  } else {
    return null;
  }

  const normalized = rawTime.toLowerCase().replace(/\s+(et|est|edt)$/i, '').trim();
  const ampm = normalized.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  const plain = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  let hours;
  let minutes;

  if (ampm) {
    hours = Number(ampm[1]);
    minutes = Number(ampm[2]);
    if (ampm[3] === 'pm' && hours !== 12) hours += 12;
    if (ampm[3] === 'am' && hours === 12) hours = 0;
  } else if (plain) {
    hours = Number(plain[1]);
    minutes = Number(plain[2]);
  } else {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day, hours, minutes) + ET_TO_UTC_OFFSET_MS);
}

export function normalizeNewsEvents(rawEvents, { now = new Date(), includePastMinutes = 5 } = {}) {
  const range = getDubaiDayRangeUtc(now);
  const affectedPairsSet = new Set();

  return (Array.isArray(rawEvents) ? rawEvents : [])
    .map((ev) => {
      if (String(ev?.impact || '').trim().toLowerCase() !== 'high') return null;
      const currency = String(ev?.country || '').trim().toUpperCase();
      if (!CURRENCY_TO_PAIRS[currency]) return null;

      const eventDt = parseNewsTime(ev?.date || '', ev?.time || '');
      if (!eventDt) return null;
      if (eventDt < range.start || eventDt >= range.end) return null;

      const minsAway = Math.round((eventDt.getTime() - now.getTime()) / 60000);
      if (minsAway < -includePastMinutes) return null;

      const pairs = CURRENCY_TO_PAIRS[currency].filter((pair) => ALL_PAIRS.includes(pair));
      pairs.forEach((pair) => affectedPairsSet.add(pair));

      return {
        title: ev?.title || '',
        currency,
        time: ev?.time || '',
        date: ev?.date || '',
        event_at_utc: eventDt.toISOString(),
        event_at_dubai: formatDubaiDateTime(eventDt),
        mins_away: minsAway,
        countdown_label: buildCountdownLabel(minsAway),
        affected_pairs: pairs,
        forecast: ev?.forecast || '',
        previous: ev?.previous || '',
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.event_at_utc) - new Date(b.event_at_utc));
}

export function collectAffectedPairs(events) {
  const pairs = new Set();
  for (const ev of events || []) {
    for (const pair of ev.affected_pairs || []) pairs.add(pair);
  }
  return [...pairs];
}
