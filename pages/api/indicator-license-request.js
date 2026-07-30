import { supabase } from '../../lib/supabase';
import { ACTIVE_LICENSE_STATUSES } from '../../lib/indicatorLicense.mjs';
import { createIndicatorLicenseRequestHandler } from '../../lib/indicatorLicenseRequestHandler.mjs';
import { getIndicatorRequestAlertConfig, sendIndicatorRequestAlert } from '../../lib/indicatorRequestAlert.mjs';

const requestHandler = createIndicatorLicenseRequestHandler({
  findExisting: async ({ product_code, platform, trading_account_number }) => {
    const { data, error } = await supabase
      .from('indicator_licenses')
      .select('id,status')
      .eq('product_code', product_code)
      .eq('platform', platform)
      .eq('trading_account_number', trading_account_number)
      .in('status', ACTIVE_LICENSE_STATUSES)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  insertRequest: async (row) => {
    const { data, error } = await supabase
      .from('indicator_licenses')
      .insert(row)
      .select('id,status')
      .single();
    if (error) throw error;
    return data;
  },
  notify: async (request) => {
    const result = await sendIndicatorRequestAlert({
      request,
      ...getIndicatorRequestAlertConfig(),
    });
    if (!result.ok) throw new Error('Indicator request alert rejected');
  },
});

export default async function handler(req, res) {
  try {
    return await requestHandler(req, res);
  } catch {
    console.error('Indicator license request failed');
    return res.status(500).json({ error: 'License request unavailable' });
  }
}
