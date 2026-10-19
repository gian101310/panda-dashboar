export function createTradePlanAdminDownloadHandler({ requireAdmin, readArtifact }) {
  return async function tradePlanAdminDownloadHandler(req, res) {
    const admin = await requireAdmin(req);
    if (!admin) return res.status(403).json({ error: 'Admin only' });
    if (req.method !== 'GET') return res.status(405).end();

    let artifact;
    try {
      artifact = await readArtifact();
    } catch {
      return res.status(503).json({ error: 'Indicator download unavailable' });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="Panda Trade Plan v1.3.algo"');
    res.setHeader('Content-Length', artifact.length);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(artifact);
  };
}
