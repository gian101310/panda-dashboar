function sanitizeTotals(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    product_code: String(row?.product_code || ''),
    platform: String(row?.platform || ''),
    count: Number.isFinite(Number(row?.count)) ? Number(row.count) : 0,
  }));
}

function sanitizeRecent(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    product_code: String(row?.product_code || ''),
    platform: String(row?.platform || ''),
    downloaded_at: row?.downloaded_at || null,
  }));
}

export function createIndicatorDownloadAdminHandler({ requireAdmin, getStats }) {
  return async function indicatorDownloadAdminHandler(req, res) {
    const admin = await requireAdmin(req);
    if (!admin) return res.status(403).json({ error: 'Admin only' });
    if (req.method !== 'GET') return res.status(405).end();

    const stats = await getStats();
    return res.status(200).json({
      totals: sanitizeTotals(stats?.totals),
      recent: sanitizeRecent(stats?.recent),
    });
  };
}
