import { supabase } from '../../lib/supabase';
import { ACTIVE_LICENSE_STATUSES, validateIndicatorRequest } from '../../lib/indicatorLicense.mjs';
import { getIndicatorRequestAlertConfig, sendIndicatorRequestAlert } from '../../lib/indicatorRequestAlert.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const parsed = validateIndicatorRequest(req.body || {});
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const row = parsed.value;
  const { data: existing, error: lookupErr } = await supabase
    .from('indicator_licenses')
    .select('id,status')
    .eq('mt4_account_id', row.mt4_account_id)
    .eq('product_code', row.product_code)
    .in('status', ACTIVE_LICENSE_STATUSES)
    .maybeSingle();

  if (lookupErr) return res.status(500).json({ error: lookupErr.message });
  if (existing) {
    return res.status(409).json({
      error: existing.status === 'APPROVED' ? 'This account is already approved for this indicator' : 'This account already has a pending request',
      id: existing.id,
      status: existing.status,
    });
  }

  const { data, error } = await supabase
    .from('indicator_licenses')
    .insert(row)
    .select('id,status')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  try {
    const alertConfig = getIndicatorRequestAlertConfig();
    const alertResult = await sendIndicatorRequestAlert({ request: { ...row, ...data }, ...alertConfig });
    if (!alertResult.ok) {
      console.error('Indicator request alert rejected:', alertResult.status, alertResult.body);
    }
  } catch (alertErr) {
    console.error('Indicator request alert error:', alertErr);
  }

  return res.status(200).json({ ok: true, id: data.id, status: data.status });
}
