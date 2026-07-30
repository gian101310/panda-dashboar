import { supabase } from '../../lib/supabase';
import { MT4_OVERLAY_PRODUCT_CODE } from '../../lib/indicatorProducts.mjs';
import { createIndicatorDeviceAccess } from '../../lib/indicatorDeviceAccess.mjs';
import { createIndicatorDeviceShadowRecorder } from '../../lib/indicatorDeviceShadowRecorder.mjs';
import { createMetatraderOverlayHandler } from '../../lib/metatraderOverlayHandler.mjs';

const PLATFORM = 'MT4';
const requests = new Map();
const DEVICE_TOUCH_MS = 5 * 60 * 1000;

const recordShadowEvent = createIndicatorDeviceShadowRecorder({
  writeEvent: async (event) => {
    const { error } = await supabase.rpc('record_indicator_device_shadow_event', {
      p_license_id: event.licenseId,
      p_product_code: event.productCode,
      p_platform: event.platform,
      p_would_status: event.wouldStatus,
      p_installation_present: event.installationPresent,
      p_token_present: event.tokenPresent,
    });
    if (error) throw error;
  },
});

function allowRequest(key) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const recent = (requests.get(key) || []).filter((timestamp) => timestamp > windowStart);
  if (recent.length >= 90) return false;
  recent.push(now);
  requests.set(key, recent);
  if (requests.size > 1000) {
    for (const [storedKey, timestamps] of requests) {
      if (!timestamps.some((timestamp) => timestamp > windowStart)) requests.delete(storedKey);
    }
  }
  return true;
}

const deviceAccess = createIndicatorDeviceAccess({
  getEnforcement: async () => {
    const { data, error } = await supabase.from('indicator_device_enforcement').select('mode,enabled').eq('product_code', MT4_OVERLAY_PRODUCT_CODE).maybeSingle();
    if (error) throw error;
    return data || { mode: 'OFF', enabled: false };
  },
  getDevice: async ({ licenseId, deviceIdHash }) => {
    const { data, error } = await supabase.from('indicator_license_devices')
      .select('id,status,device_token_hash,last_seen_at')
      .eq('license_id', licenseId).eq('device_id_hash', deviceIdHash)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },
  registerDevice: async (device) => {
    const { data, error } = await supabase.rpc('register_indicator_device', {
      p_license_id: device.licenseId,
      p_product_code: MT4_OVERLAY_PRODUCT_CODE,
      p_platform: PLATFORM,
      p_device_id_hash: device.deviceIdHash,
      p_device_token_hash: device.deviceTokenHash,
      p_device_fingerprint: device.deviceFingerprint,
    });
    if (error) throw error;
    return data;
  },
  touchDevice: async (device) => {
    const lastSeen = device?.last_seen_at ? new Date(device.last_seen_at).getTime() : 0;
    if (Date.now() - lastSeen < DEVICE_TOUCH_MS) return;
    await supabase.from('indicator_license_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', device.id);
  },
  recordShadowEvent,
});

const handler = createMetatraderOverlayHandler({
  platform: PLATFORM,
  productCode: MT4_OVERLAY_PRODUCT_CODE,
  getTokenSetting: async () => {
    const { data, error } = await supabase
      .from('indicator_feed_settings')
      .select('token_hash')
      .eq('setting_key', 'ctrader_operator_token')
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  getLicense: async (account, productCode) => {
    const { data, error } = await supabase
      .from('indicator_licenses')
      .select('id,status,expires_at,paid_confirmed,device_limit')
      .eq('platform', PLATFORM)
      .eq('trading_account_number', account)
      .eq('product_code', productCode)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  getDashboardRows: async () => {
    const { data, error } = await supabase.from('dashboard').select(`
      symbol, gap, bias, hard_invalid, box_h4_trend, box_h1_trend,
      pl_zone, pl_bias, pl_g1_valid, base_currency, base_score_tf,
      quote_currency, quote_score_tf, updated_at
    `);
    if (error) throw error;
    return data || [];
  },
  touchLicense: async (id, timestamp) => {
    await supabase.from('indicator_licenses').update({ last_verified_at: timestamp }).eq('id', id);
  },
  authorizeDevice: deviceAccess.authorize,
  rateLimiter: allowRequest,
});

export default async function mt4OverlayRoute(req, res) {
  try {
    return await handler(req, res);
  } catch (error) {
    console.error('MT4 overlay feed error:', error?.message || 'unknown');
    return res.status(500).json({ error: 'Feed unavailable' });
  }
}
