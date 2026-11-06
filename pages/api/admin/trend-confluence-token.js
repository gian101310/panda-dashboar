import { randomBytes } from 'node:crypto';
import { supabase } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/auth';
import { hashOverlayToken } from '../../../lib/ctraderOverlay.mjs';
import { confluencePlatform } from '../../../lib/trendConfluenceLicense.mjs';
import { decideIndicatorLicense } from '../../../lib/indicatorLicense.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Admin only' });
  if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).end();
  const licenseId = String(req.body?.license_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(licenseId)) return res.status(400).json({ error: 'Invalid license' });
  try {
    const { data: license, error: lookupError } = await supabase.from('indicator_licenses')
      .select('id,product_code,platform,trading_account_number,status,paid_confirmed,expires_at')
      .eq('id', licenseId).maybeSingle();
    if (lookupError) throw lookupError;
    if (!license || !confluencePlatform(license.product_code) || confluencePlatform(license.product_code) !== license.platform)
      return res.status(404).json({ error: 'Account token license not found' });
    if (req.method === 'DELETE') {
      const { error } = await supabase.from('indicator_confluence_tokens').delete().eq('license_id', licenseId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    const decision = decideIndicatorLicense(license);
    if (!decision.ok) return res.status(409).json({ error: `Approve and pay the license first (${decision.status})` });
    const token = randomBytes(32).toString('hex');
    const { error } = await supabase.from('indicator_confluence_tokens').upsert({
      license_id: licenseId,
      product_code: license.product_code,
      platform: license.platform,
      token_hash: hashOverlayToken(token),
      issued_at: new Date().toISOString(),
      issued_by: String(admin.username || 'admin'),
    }, { onConflict: 'license_id' });
    if (error) throw error;
    return res.status(200).json({ ok: true, token, account: license.trading_account_number, platform: license.platform });
  } catch (error) {
    console.error('Trend Confluence token operation failed:', error?.message || 'unknown');
    return res.status(500).json({ error: 'Token operation failed' });
  }
}
