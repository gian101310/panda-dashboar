import { requireAdmin } from '../../../lib/auth';
import { createPricingAdminHandler } from '../../../lib/pricingAdminHandler.mjs';
import { supabase } from '../../../lib/supabase';

async function run(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

const handler = createPricingAdminHandler({
  requireAdmin,
  listTiers: () => run(supabase.from('pricing_tiers').select('*').order('sort')),
  listProducts: () => run(supabase.from('store_products').select('*').order('sort')),
  getProduct: async (id) => {
    const data = await run(supabase.from('store_products').select('id,code').eq('id', id).maybeSingle());
    return data || null;
  },
  updateTier: async (id, updates) => { await run(supabase.from('pricing_tiers').update(updates).eq('id', id)); },
  createProduct: async (row) => { await run(supabase.from('store_products').insert(row)); },
  updateProduct: async (id, updates) => { await run(supabase.from('store_products').update(updates).eq('id', id)); },
  deleteProduct: async (id) => { await run(supabase.from('store_products').delete().eq('id', id)); },
});

export default async function pricingAdminRoute(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    return await handler(req, res);
  } catch {
    console.error('Admin pricing operation failed');
    return res.status(500).json({ error: 'Pricing operation failed' });
  }
}
