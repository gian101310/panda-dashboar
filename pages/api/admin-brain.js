import { validateSession } from '../../lib/auth';

// GET  — fetch all brain records
// POST — upsert a brain record { category, key, value }
// DELETE — remove by key { key }

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const isAdmin = session.panda_users?.role === 'admin';
  if (!isAdmin) return res.status(403).json({ error: 'Admin only' });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('admin_brain')
      .select('*')
      .order('category')
      .order('updated_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ brain: data });
  }

  if (req.method === 'POST') {
    const { category, key, value } = req.body;
    if (!category || !key || !value) return res.status(400).json({ error: 'category, key, value required' });
    const validCats = ['preference', 'coaching', 'pattern', 'rule', 'question'];
    if (!validCats.includes(category)) return res.status(400).json({ error: 'invalid category' });
    const { data, error } = await supabase
      .from('admin_brain')
      .upsert({ category, key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ saved: data });
  }

  if (req.method === 'DELETE') {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: 'key required' });
    const { error } = await supabase.from('admin_brain').delete().eq('key', key);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ deleted: key });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
