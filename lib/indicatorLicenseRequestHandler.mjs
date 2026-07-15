import { validateIndicatorRequest } from './indicatorLicense.mjs';

export function createIndicatorLicenseRequestHandler({
  findExisting,
  insertRequest,
  notify,
  logger = console,
}) {
  return async function indicatorLicenseRequestHandler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const parsed = validateIndicatorRequest(req.body || {});
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });

    const row = parsed.value;
    const existing = await findExisting({
      product_code: row.product_code,
      platform: row.platform,
      trading_account_number: row.trading_account_number,
    });
    if (existing) {
      return res.status(409).json({
        error: existing.status === 'APPROVED'
          ? 'This account is already approved for this indicator'
          : 'This account already has a pending request',
        id: existing.id,
        status: existing.status,
      });
    }

    const data = await insertRequest(row);
    try {
      await notify({ ...row, ...data });
    } catch {
      logger.error('Indicator request alert failed');
    }

    return res.status(200).json({ ok: true, id: data.id, status: data.status });
  };
}
