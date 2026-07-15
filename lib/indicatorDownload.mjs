import { getIndicatorProduct } from './indicatorProducts.mjs';

export function getPublicDownloadProduct(value) {
  const code = String(value || '').trim().toLowerCase();
  const product = getIndicatorProduct(code);
  return product?.publicDownload === true && product.downloadPath ? product : null;
}

export function createIndicatorDownloadHandler({ recordDownload, logger = console }) {
  return async function indicatorDownloadHandler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const product = getPublicDownloadProduct(req.query?.product);
    if (!product) return res.status(404).json({ error: 'Download not found' });

    try {
      await recordDownload({ product_code: product.code, platform: product.platform });
    } catch {
      logger.error('Indicator download telemetry failed');
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, product.downloadPath);
  };
}
