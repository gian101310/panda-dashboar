import { requireAdmin } from '../../../lib/auth';
import { createIndicatorDeviceAdminHandler } from '../../../lib/indicatorDeviceAdminHandler.mjs';
import { supabase } from '../../../lib/supabase';

const handler = createIndicatorDeviceAdminHandler({
  requireAdmin,
  listPolicies: async () => {
    const { data, error } = await supabase
      .from('indicator_device_enforcement')
      .select('product_code,mode,enabled,updated_at,updated_by')
      .order('product_code');
    if (error) throw error;
    return data || [];
  },
  listShadowStats: async () => {
    const [summaryResult, recentResult] = await Promise.all([
      supabase.rpc('get_indicator_device_shadow_summary'),
      supabase
        .from('indicator_device_shadow_events')
        .select('license_id,product_code,platform,would_status,installation_present,token_present,event_count,last_seen_at')
        .order('last_seen_at', { ascending: false })
        .limit(20),
    ]);
    if (summaryResult.error) throw summaryResult.error;
    if (recentResult.error) throw recentResult.error;
    return { summary: summaryResult.data || [], recent: recentResult.data || [] };
  },
  listDevices: async (licenseId) => {
    const { data, error } = await supabase
      .from('indicator_license_devices')
      .select('id,license_id,product_code,platform,device_fingerprint,status,activated_at,last_seen_at,revoked_at')
      .eq('license_id', licenseId)
      .order('activated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  getActiveDeviceCount: async (licenseId) => {
    const { count, error } = await supabase
      .from('indicator_license_devices')
      .select('id', { count: 'exact', head: true })
      .eq('license_id', licenseId)
      .eq('status', 'ACTIVE');
    if (error) throw error;
    return count || 0;
  },
  setLicenseLimit: async (licenseId, deviceLimit) => {
    const { error } = await supabase
      .from('indicator_licenses')
      .update({ device_limit: deviceLimit, updated_at: new Date().toISOString() })
      .eq('id', licenseId);
    if (error) throw error;
  },
  setEnforcement: async (productCode, enabled, username) => {
    const { error } = await supabase
      .from('indicator_device_enforcement')
      .upsert({ product_code: productCode, mode: enabled ? 'ENFORCED' : 'OFF', enabled, updated_by: username, updated_at: new Date().toISOString() }, { onConflict: 'product_code' });
    if (error) throw error;
  },
  setMode: async (productCode, mode, username) => {
    const { error } = await supabase
      .from('indicator_device_enforcement')
      .upsert({ product_code: productCode, mode, enabled: mode === 'ENFORCED', updated_by: username, updated_at: new Date().toISOString() }, { onConflict: 'product_code' });
    if (error) throw error;
  },
  revokeDevice: async (deviceId, timestamp) => {
    const { error } = await supabase
      .from('indicator_license_devices')
      .update({ status: 'REVOKED', revoked_at: timestamp, updated_at: timestamp })
      .eq('id', deviceId)
      .eq('status', 'ACTIVE');
    if (error) throw error;
  },
  resetDevices: async (licenseId, timestamp) => {
    const { error } = await supabase
      .from('indicator_license_devices')
      .update({ status: 'REVOKED', revoked_at: timestamp, updated_at: timestamp })
      .eq('license_id', licenseId)
      .eq('status', 'ACTIVE');
    if (error) throw error;
  },
});

export default async function indicatorLicenseDevicesRoute(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    return await handler(req, res);
  } catch {
    console.error('Indicator device admin operation failed');
    return res.status(500).json({ error: 'Device operation failed' });
  }
}
