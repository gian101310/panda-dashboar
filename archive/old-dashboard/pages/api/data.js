import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase
      .from('dashboard')
      .select('symbol, gap, state, strength, signal, updated_at')
      .order('strength', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
