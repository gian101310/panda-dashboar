import { supabase } from '../../../lib/supabase';
import { validateSession } from '../../../lib/auth';

async function requireAdmin(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  const { data: user } = await supabase.from('panda_users').select('role').eq('id', session.user_id).single();
  if (!user || user.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return null; }
  return true;
}

const TIER_FIELDS = ['name','currency','price_monthly','was_monthly','price_lifetime','sub_text','tag','color','cta','features','pay_link_monthly','pay_link_lifetime','sort','active'];
const PRODUCT_FIELDS = ['code','name','description','currency','price','pay_link','category','sort','active'];

function pick(body, fields) {
  const out = {};
  for (const f of fields) if (body[f] !== undefined) out[f] = body[f];
  return out;
}

export default async function handler(req, res) {
  const ok = await requireAdmin(req, res);
  if (!ok) return;

  try {
    if (req.method === 'GET') {
      const [{ data: tiers }, { data: products }] = await Promise.all([
        supabase.from('pricing_tiers').select('*').order('sort'),
        supabase.from('store_products').select('*').order('sort'),
      ]);
      return res.status(200).json({ tiers: tiers || [], products: products || [] });
    }

    if (req.method !== 'POST') return res.status(405).end();
    const { action, id } = req.body || {};

    if (action === 'update_tier') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const updates = pick(req.body, TIER_FIELDS);
      updates.updated_at = new Date().toISOString();
      const { error } = await supabase.from('pricing_tiers').update(updates).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === 'create_product') {
      const row = pick(req.body, PRODUCT_FIELDS);
      if (!row.name || row.price === undefined) return res.status(400).json({ error: 'name and price required' });
      if (!row.code) row.code = row.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
      const { error } = await supabase.from('store_products').insert(row);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === 'update_product') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const updates = pick(req.body, PRODUCT_FIELDS);
      updates.updated_at = new Date().toISOString();
      const { error } = await supabase.from('store_products').update(updates).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === 'delete_product') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase.from('store_products').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    console.error('admin_pricing_err', err);
    return res.status(500).json({ error: err.message || 'server error' });
  }
}
