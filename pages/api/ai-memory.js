import { supabase } from '../../lib/supabase';

const VALID_TYPES = ['signal_pattern', 'behavior', 'edge_analysis', 'market_theme', 'confluence_validation'];
const MIN_SAMPLE_SIZE = 20;

export default async function handler(req, res) {
  // GET — read memories with optional filters
  if (req.method === 'GET') {
    const { type, pair, strategy, limit = 100 } = req.query;

    let query = supabase
      .from('ai_memory')
      .select('*')
      .order('computed_at', { ascending: false })
      .limit(Math.min(parseInt(limit) || 100, 500));

    if (type) query = query.eq('type', type);
    if (pair) query = query.eq('pair', pair);
    if (strategy) query = query.eq('strategy', strategy);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data || []);
  }

  // POST — write a new memory (agent use only)
  if (req.method === 'POST') {
    const { type, factor, pair, strategy, win_rate, sample_size, metadata } = req.body;

    // Validate required fields
    if (!type || !factor) {
      return res.status(400).json({ error: 'type and factor are required' });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }

    // Enforce sample_size >= 20 rule
    if (sample_size != null && sample_size < MIN_SAMPLE_SIZE) {
      return res.status(400).json({
        error: `sample_size must be >= ${MIN_SAMPLE_SIZE}. Got ${sample_size}. Insufficient data to form a memory.`
      });
    }

    // Enforce strict JSON — no free text in metadata
    if (metadata != null && typeof metadata !== 'object') {
      return res.status(400).json({ error: 'metadata must be a JSON object, not free text' });
    }

    const row = { type, factor, pair: pair || null, strategy: strategy || null,
      win_rate: win_rate != null ? parseFloat(win_rate) : null,
      sample_size: sample_size != null ? parseInt(sample_size) : null,
      metadata: metadata || null };

    const { data, error } = await supabase.from('ai_memory').insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // DELETE — remove a memory by id (maintenance)
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const { error } = await supabase.from('ai_memory').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ deleted: id });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
