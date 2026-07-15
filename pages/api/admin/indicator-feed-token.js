import { supabase } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/auth';
import { createIndicatorFeedAdminHandler } from '../../../lib/indicatorFeedAdminHandler.mjs';
import { decryptIndicatorToken, encryptIndicatorToken } from '../../../lib/indicatorTokenVault.mjs';

const handler = createIndicatorFeedAdminHandler({
  requireAdmin,
  getSetting: async () => {
    const { data, error } = await supabase
      .from('indicator_feed_settings')
      .select('token_hash,token_ciphertext,token_iv,token_auth_tag,rotated_at')
      .eq('setting_key', 'ctrader_operator_token')
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  saveSetting: async (setting) => {
    const { error } = await supabase
      .from('indicator_feed_settings')
      .upsert(setting, { onConflict: 'setting_key' });
    if (error) throw error;
  },
  getRotations: async () => {
    const { data, error } = await supabase
      .from('indicator_feed_token_rotations')
      .select('rotated_at,rotated_by,token_fingerprint')
      .order('rotated_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return data || [];
  },
  encryptToken: (token) => encryptIndicatorToken(
    token,
    process.env.INDICATOR_TOKEN_ENCRYPTION_KEY,
  ),
  decryptToken: (setting) => decryptIndicatorToken(
    setting,
    process.env.INDICATOR_TOKEN_ENCRYPTION_KEY,
  ),
});

export default async function indicatorFeedTokenRoute(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    return await handler(req, res);
  } catch {
    console.error('Indicator feed token admin operation failed');
    return res.status(500).json({ error: 'Token operation failed' });
  }
}
