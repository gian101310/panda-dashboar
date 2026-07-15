import { PUBLIC_DOWNLOAD_PRODUCTS } from './indicatorProducts.mjs';

export const PROTECTED_OVERLAY_CODES = new Set(PUBLIC_DOWNLOAD_PRODUCTS.map((product) => product.code));

export function validHttpsLink(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function formatIndicatorPrice(price, currency = 'USD') {
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount <= 0) return 'CONTACT FOR PRICE';
  const code = String(currency || 'USD').toUpperCase();
  const prefix = code === 'USD' ? '$' : code === 'EUR' ? '€' : code === 'AED' ? 'AED ' : `${code} `;
  return `${prefix}${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}${code === 'USD' || code === 'EUR' ? ` ${code}` : ''}`;
}

export function mergePublicOverlayProducts(rows = []) {
  const rowMap = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.code, row]));
  return PUBLIC_DOWNLOAD_PRODUCTS.flatMap((fixed) => {
    const live = rowMap.get(fixed.code);
    if (live?.active === false) return [];
    const price = Number(live?.price) || 0;
    const currency = String(live?.currency || 'USD').toUpperCase();
    return [{
      ...fixed,
      ...(live || {}),
      code: fixed.code,
      platform: fixed.platform,
      downloadPath: fixed.downloadPath,
      fileName: fixed.fileName,
      installNote: fixed.installNote,
      name: live?.name || fixed.name,
      price,
      currency,
      priceLabel: formatIndicatorPrice(price, currency),
      paymentLink: validHttpsLink(live?.pay_link),
    }];
  });
}
