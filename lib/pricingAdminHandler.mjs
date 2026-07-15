import { PROTECTED_OVERLAY_CODES, validHttpsLink } from './indicatorStore.mjs';

const TIER_FIELDS = ['name', 'currency', 'price_monthly', 'was_monthly', 'price_lifetime', 'sub_text', 'tag', 'color', 'cta', 'features', 'pay_link_monthly', 'pay_link_lifetime', 'sort', 'active'];
const PRODUCT_FIELDS = ['code', 'name', 'description', 'currency', 'price', 'pay_link', 'category', 'sort', 'active'];

function pick(body, fields) {
  const result = {};
  for (const field of fields) if (body?.[field] !== undefined) result[field] = body[field];
  return result;
}

function validateProduct(product) {
  if (product.price !== undefined && (!Number.isFinite(Number(product.price)) || Number(product.price) < 0)) {
    return 'price must be zero or greater';
  }
  if (product.pay_link && !validHttpsLink(product.pay_link)) return 'payment link must use https';
  return '';
}

export function createPricingAdminHandler({
  requireAdmin,
  listTiers,
  listProducts,
  getProduct,
  updateTier,
  createProduct,
  updateProduct,
  deleteProduct,
}) {
  return async function pricingAdminHandler(req, res) {
    const admin = await requireAdmin(req);
    if (!admin) return res.status(403).json({ error: 'Admin only' });

    if (req.method === 'GET') {
      const [tiers, products] = await Promise.all([listTiers(), listProducts()]);
      return res.status(200).json({ tiers: tiers || [], products: products || [] });
    }
    if (req.method !== 'POST') return res.status(405).end();

    const { action, id } = req.body || {};
    if (action === 'update_tier') {
      if (!id) return res.status(400).json({ error: 'id required' });
      await updateTier(id, { ...pick(req.body, TIER_FIELDS), updated_at: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    }

    if (action === 'create_product') {
      const row = pick(req.body, PRODUCT_FIELDS);
      if (!row.name || row.price === undefined) return res.status(400).json({ error: 'name and price required' });
      const validation = validateProduct(row);
      if (validation) return res.status(400).json({ error: validation });
      if (!row.code) row.code = String(row.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
      row.price = Number(row.price);
      row.pay_link = validHttpsLink(row.pay_link);
      await createProduct(row);
      return res.status(200).json({ ok: true });
    }

    if (action === 'update_product') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const updates = pick(req.body, PRODUCT_FIELDS);
      const validation = validateProduct(updates);
      if (validation) return res.status(400).json({ error: validation });
      if (updates.price !== undefined) updates.price = Number(updates.price);
      if (updates.pay_link !== undefined) updates.pay_link = validHttpsLink(updates.pay_link);
      updates.updated_at = new Date().toISOString();
      await updateProduct(id, updates);
      return res.status(200).json({ ok: true });
    }

    if (action === 'delete_product') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const product = await getProduct(id);
      if (PROTECTED_OVERLAY_CODES.has(product?.code)) {
        return res.status(409).json({ error: 'System indicator products can be hidden but not deleted' });
      }
      await deleteProduct(id);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'unknown action' });
  };
}
