import { supabase } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/auth';
import { getIndicatorProduct } from '../../../lib/indicatorProducts.mjs';
import { normalizeMt4AccountId, normalizeProductCode } from '../../../lib/indicatorLicense.mjs';

const STATUSES = new Set(['PENDING', 'APPROVED', 'DISABLED', 'EXPIRED']);

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Admin only' });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('indicator_licenses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(250);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ licenses: data || [] });
  }

  if (req.method === 'PATCH') {
    const { id, action } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });

    const updates = { updated_at: new Date().toISOString() };
    if (action === 'approve') {
      updates.status = 'APPROVED';
      updates.paid_confirmed = true;
      updates.last_denied_reason = null;
    }
    if (action === 'disable') updates.status = 'DISABLED';
    if (action === 'enable') updates.status = 'APPROVED';
    if (action === 'pending') updates.status = 'PENDING';
    if (req.body.status !== undefined) {
      if (!STATUSES.has(req.body.status)) return res.status(400).json({ error: 'invalid status' });
      updates.status = req.body.status;
    }
    if (req.body.paid_confirmed !== undefined) updates.paid_confirmed = !!req.body.paid_confirmed;
    if (req.body.expires_at !== undefined) updates.expires_at = req.body.expires_at || null;
    if (req.body.notes !== undefined) updates.notes = String(req.body.notes || '').trim() || null;
    if (req.body.customer_name !== undefined) updates.customer_name = String(req.body.customer_name || '').trim();
    if (req.body.contact !== undefined) updates.contact = String(req.body.contact || '').trim();
    if (req.body.price_override !== undefined) updates.price_override = req.body.price_override ? String(req.body.price_override).trim() : null;
    if (req.body.mt4_account_id !== undefined) updates.mt4_account_id = normalizeMt4AccountId(req.body.mt4_account_id);
    if (req.body.product_code !== undefined) {
      const productCode = normalizeProductCode(req.body.product_code);
      if (!getIndicatorProduct(productCode)) return res.status(400).json({ error: 'invalid product' });
      updates.product_code = productCode;
    }

    const { error } = await supabase.from('indicator_licenses').update(updates).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'POST') {
    const { customer_name, contact, telegram_username, mt4_account_id, product_code, paid_confirmed, price_override, notes } = req.body || {};
    if (!customer_name || !mt4_account_id || !product_code) return res.status(400).json({ error: 'name, account_id, product required' });
    const productCode = normalizeProductCode(product_code);
    if (!getIndicatorProduct(productCode)) return res.status(400).json({ error: 'invalid product' });
    const row = {
      customer_name: String(customer_name).trim(),
      contact: String(contact || '').trim() || null,
      telegram_username: String(telegram_username || '').trim().replace(/^@/, '') || null,
      mt4_account_id: normalizeMt4AccountId(mt4_account_id),
      product_code: productCode,
      paid_confirmed: !!paid_confirmed,
      price_override: price_override ? String(price_override).trim() : null,
      notes: notes ? String(notes).trim() : null,
      status: 'PENDING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('indicator_licenses').insert(row);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await supabase.from('indicator_licenses').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
