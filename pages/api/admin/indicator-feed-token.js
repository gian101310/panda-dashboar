import { supabase } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/auth';
import { createIndicatorFeedAdminHandler } from '../../../lib/indicatorFeedAdminHandler.mjs';

const handler = createIndicatorFeedAdminHandler({
  requireAdmin,
  getSetting: async () => {
    const { data, error } = await supabase
      .from('indicator_feed_settings')
      .select('token_hash,rotated_at')
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
});

export default async function indicatorFeedTokenRoute(req, res) {
  try {
    return await handler(req, res);
  } catch (error) {
    console.error('Indicator feed token admin error:', error?.message || 'unknown');
    return res.status(500).json({ error: 'Token update failed' });
  }
}
