import { decideIndicatorLicense, normalizeTradingAccountNumber, parseIndicatorLicenseBody } from './indicatorLicense.mjs';

function reply(res, status, body) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(status).send(body);
}

export function createPandaBoxLinesLicenseHandler({ getLicense, touchLicense = async () => {}, allowRequest = () => true, now = () => new Date() }) {
  return async function pandaBoxLinesLicenseHandler(req, res) {
    if (req.method !== 'POST') return reply(res, 405, 'DENY|METHOD_NOT_ALLOWED');
    const account = normalizeTradingAccountNumber(parseIndicatorLicenseBody(req.body).account_number);
    if (!account) return reply(res, 400, 'DENY|NO_ACCOUNT');
    const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    if (!allowRequest(ip)) return reply(res, 429, 'DENY|RATE_LIMIT');
    const license = await getLicense(account);
    const decision = decideIndicatorLicense(license, now());
    if (decision.ok) await touchLicense(license.id);
    return reply(res, decision.ok ? 200 : 403, decision.ok ? 'OK|APPROVED' : decision.body);
  };
}
