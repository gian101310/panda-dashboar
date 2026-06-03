export default async function handler(req, res) {
  // Cache 30 minutes
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');

  try {
    // ForexFactory JSON feed - free, no API key needed
    const url = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) throw new Error('Calendar fetch failed');

    const data = await response.json();

    // Filter and format events
    const events = (data || []).map(e => ({
      title:    e.title || '',
      country:  (e.country || '').toUpperCase(),
      date:     e.date || '',
      time:     e.time || '',
      impact:   e.impact || 'Low',
      forecast: e.forecast || '',
      previous: e.previous || '',
      actual:   e.actual || '',
    })).filter(e => e.title && e.country);

    // Map country to currency
    const countryToCurrency = {
      'USD': 'USD', 'EUR': 'EUR', 'GBP': 'GBP', 'JPY': 'JPY',
      'AUD': 'AUD', 'CAD': 'CAD', 'NZD': 'NZD', 'CHF': 'CHF',
      'CNY': 'CNY', 'ALL': 'ALL',
    };

    const mapped = events.map(e => ({
      ...e,
      currency: countryToCurrency[e.country] || e.country,
    }));

    return res.status(200).json(mapped);
  } catch (err) {
    console.error('Calendar error:', err.message);
    return res.status(200).json([]);
  }
}
