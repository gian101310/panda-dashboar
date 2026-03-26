import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

const ALL_PAIRS = ['AUDJPY','AUDCAD','AUDNZD','AUDUSD','CADJPY','EURAUD','EURCAD','EURGBP','EURJPY','EURNZD','EURUSD','GBPAUD','GBPCAD','GBPJPY','GBPNZD','GBPUSD','NZDCAD','NZDJPY','NZDUSD','USDCAD','USDJPY'];

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const userId = session.user_id;
  const username = session.username;

  if (req.method === 'GET') {
    const { data } = await supabase
      .from('user_alert_prefs')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!data) {
      // Return defaults
      return res.status(200).json({
        sound_enabled: true,
        browser_notif_enabled: false,
        telegram_enabled: false,
        heatmap_visible: true,
        spike_banner_visible: true,
        subscribed_pairs: ALL_PAIRS,
        telegram_chat_id: '',
      });
    }

    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { sound_enabled, browser_notif_enabled, telegram_enabled,
            heatmap_visible, spike_banner_visible, subscribed_pairs, telegram_chat_id } = req.body;

    const updates = {
      user_id: userId, username,
      updated_at: new Date().toISOString(),
    };

    if (sound_enabled !== undefined)          updates.sound_enabled = sound_enabled;
    if (browser_notif_enabled !== undefined)  updates.browser_notif_enabled = browser_notif_enabled;
    if (telegram_enabled !== undefined)       updates.telegram_enabled = telegram_enabled;
    if (heatmap_visible !== undefined)        updates.heatmap_visible = heatmap_visible;
    if (spike_banner_visible !== undefined)   updates.spike_banner_visible = spike_banner_visible;
    if (subscribed_pairs !== undefined)       updates.subscribed_pairs = subscribed_pairs;

    // Handle telegram subscriptions
    if (telegram_chat_id !== undefined && telegram_chat_id) {
      // Store chat ID in subscriptions table
      const pairs = subscribed_pairs || ALL_PAIRS;
      for (const symbol of pairs) {
        await supabase.from('telegram_subscriptions').upsert({
          user_id: userId, username, telegram_chat_id, symbol, is_active: true
        }, { onConflict: 'user_id,symbol' });
      }
    }

    const { error } = await supabase
      .from('user_alert_prefs')
      .upsert(updates, { onConflict: 'user_id' });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
