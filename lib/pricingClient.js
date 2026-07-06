// Shared client-side pricing helpers — live values come from /api/pricing (edited in /admin/pricing)

export const curSym = (c) => c === 'USD' ? '$' : c === 'EUR' ? '€' : (c || '') + ' ';

export const mapDbTiers = (rows) => rows.map(r => ({
  name: r.name, price: String(r.price_monthly ?? 0),
  was: r.was_monthly != null ? String(r.was_monthly) : null,
  period: Number(r.price_monthly) > 0 ? '/mo' : '',
  sub: r.sub_text || '', color: r.color || '#445566', tag: r.tag || null,
  features: Array.isArray(r.features) ? r.features : [],
  cta: r.cta || 'SIGN UP →', tier: r.tier_key, cur: r.currency || 'USD',
}));

// Fallback if /api/pricing is unreachable
export const FALLBACK_TIERS = [
  {
    name: 'STARTER', price: '0', period: '', sub: 'FREE FOR 1 WEEK', color: '#445566', tag: null, cur: 'USD',
    features: ['Live signals tab', 'Position calculator'],
    cta: 'START FREE TRIAL', tier: 'starter',
  },
  {
    name: 'PRO', price: '13', was: '27', period: '/mo', sub: 'LAUNCH PRICE · or $136 lifetime · billed in AED', color: '#00ff9f', tag: 'MOST POPULAR', cur: 'USD',
    features: ['Everything in Starter, plus:', 'Panel tab', 'Full data table', 'Valid setups tab', 'Panda AI assistant', 'Research tab'],
    cta: 'GO PRO →', tier: 'pro',
  },
  {
    name: 'ELITE', price: '27', was: '190', period: '/mo', sub: 'LAUNCH PRICE · or $272 lifetime · billed in AED', color: '#00b4ff', tag: 'FULL ACCESS', cur: 'USD',
    features: ['Everything in Pro, plus:', 'Overview tab', 'Signal logs tab', 'Valid pairs filter', 'Telegram signal alerts', 'Spike signal alerts', 'Private trading journal', 'Chart tab', 'MT4/MT5 Panda Indicators', 'Bias detection indicators'],
    cta: 'GO ELITE →', tier: 'elite',
  },
];
