import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

  try {
    const { data, error } = await supabase.from('panda_users').select('id, username').limit(1);
    return res.status(200).json({
      urlPrefix: url.slice(0, 40),
      urlLength: url.length,
      keyLength: key.length,
      keyPrefix: key.slice(0, 20),
      query: error ? { error: error.message, code: error.code } : { ok: true, count: (data || []).length },
    });
  } catch (err) {
    return res.status(200).json({
      urlPrefix: url.slice(0, 40),
      urlLength: url.length,
      keyLength: key.length,
      keyPrefix: key.slice(0, 20),
      query: { crash: err.message },
    });
  }
}
