import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  try {
    // Return ALL pairs, sorted: valid first (by strength), then invalid (by abs gap)
    const { data, error } = await supabase
      .from('dashboard')
      .select('symbol, gap, state, strength, signal, updated_at');

    if (error) return res.status(500).json({ error: error.message });

    const rows = data || [];

    // Sort: valid pairs first (gap >= 5 or <= -5), then by strength desc, then invalid by abs gap
    rows.sort((a, b) => {
      const aValid = Math.abs(a.gap || 0) >= 5;
      const bValid = Math.abs(b.gap || 0) >= 5;
      if (aValid && !bValid) return -1;
      if (!aValid && bValid) return 1;
      if (aValid && bValid) return (b.strength || 0) - (a.strength || 0);
      return Math.abs(b.gap || 0) - Math.abs(a.gap || 0);
    });

    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}