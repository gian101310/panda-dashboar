export const PAGE_VISIBILITY_KEY = 'page_visibility';

export const DEFAULT_PAGE_VISIBILITY = Object.freeze({
  landing: true,
  funnel: true,
  pricing: true,
  portfolio: true,
  login: true,
  stream: true,
  bypass_enabled: true,
});

// Map route pathnames to page_visibility keys
export const ROUTE_TO_PAGE_KEY = Object.freeze({
  '/': 'landing',
  '/funnel': 'funnel',
  '/pricing': 'pricing',
  '/portfolio': 'portfolio',
  '/login': 'login',
  '/stream': 'stream',
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

export function getPageAccessDecision({
  isAdmin = false,
  hasMaintenanceBypass = false,
  hasAdminLoginAccess = false,
  maintenanceEnabled = false,
  pageKey = null,
  visibility = null,
} = {}) {
  if (isAdmin || hasMaintenanceBypass) return 'allow';
  if (maintenanceEnabled && hasAdminLoginAccess && pageKey === 'login') return 'allow';
  if (maintenanceEnabled) return 'maintenance';
  if (!pageKey) return 'allow';

  const pageVisibility = normalizePageVisibility(visibility);
  if (pageVisibility.bypass_enabled || pageVisibility[pageKey] !== false) return 'allow';
  return 'coming_soon';
}
