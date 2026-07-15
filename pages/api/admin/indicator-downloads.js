import { supabase } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/auth';
import { createIndicatorDownloadAdminHandler } from '../../../lib/indicatorDownloadAdminHandler.mjs';
import { PUBLIC_DOWNLOAD_PRODUCTS } from '../../../lib/indicatorProducts.mjs';

const handler = createIndicatorDownloadAdminHandler({
  requireAdmin,
  getStats: async () => {
    const totals = await Promise.all(PUBLIC_DOWNLOAD_PRODUCTS.map(async (product) => {
      const { count, error } = await supabase
        .from('indicator_download_events')
        .select('id', { count: 'exact', head: true })
        .eq('product_code', product.code);
      if (error) throw error;
      return { product_code: product.code, platform: product.platform, count: count || 0 };
    }));

    const { data: recent, error } = await supabase
      .from('indicator_download_events')
      .select('product_code,platform,downloaded_at')
      .order('downloaded_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return { totals, recent: recent || [] };
  },
});

export default async function indicatorDownloadsRoute(req, res) {
  try {
    return await handler(req, res);
  } catch {
    console.error('Indicator download admin telemetry failed');
    return res.status(500).json({ error: 'Download telemetry unavailable' });
  }
}
