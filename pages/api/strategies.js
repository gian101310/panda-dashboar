import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const userId = session.user_id;

  if (req.method === 'GET') {
    const { data } = await supabase.from('user_strategies').select('*').eq('user_id', userId).order('created_at');
    return res.status(200).json(data || []);
  }

  if (req.method === 'POST') {
    const { name, description, rules, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const { data: existing } = await supabase.from('user_strategies').select('id').eq('user_id', userId);
    if ((existing || []).length >= 10) return res.status(400).json({ error: 'Max 10 strategies' });
    const { error } = await supabase.from('user_strategies').insert({ user_id: userId, username: session.username, name, description: description || '', rules: rules || '', color: color || '#00ff9f' });
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'PATCH') {
    const { id, name, description, rules, color } = req.body;
    if (!id) return res.status(400).json({ error: 'ID required' });
    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (rules !== undefined) updates.rules = rules;
    if (color !== undefined) updates.color = color;
    const { error } = await supabase.from('user_strategies').update(updates).eq('id', id).eq('user_id', userId);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID required' });
    const { error } = await supabase.from('user_strategies').delete().eq('id', id).eq('user_id', userId);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
