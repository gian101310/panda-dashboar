export const PAGE_VISIBILITY_KEY = 'page_visibility';

export const DEFAULT_PAGE_VISIBILITY = Object.freeze({
  landing: true,
  funnel: true,
  pricing: true,
  portfolio: true,
  login: true,
  bypass_enabled: true,
});

const ALLOWED_KEYS = Object.keys(DEFAULT_PAGE_VISIBILITY);

export function normalizePageVisibility(value) {
  const normalized = { ...DEFAULT_PAGE_VISIBILITY };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return normalized;

  for (const key of ALLOWED_KEYS) {
    if (typeof value[key] === 'boolean') normalized[key] = value[key];
  }

  return normalized;
}
