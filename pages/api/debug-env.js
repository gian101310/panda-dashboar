import { supabase } from '../../lib/supabase';

// Temporary diagnostic — DELETE after debugging
export default async function handler(req, res) {
  const hasUrl = !!process.env.SUPABASE_URL;
  const hasKey = !!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);
  const keySource = process.env.SUPABASE_SERVICE_KEY ? 'SERVICE_KEY' : process.env.SUPABASE_ANON_KEY ? 'ANON_KEY' : 'NONE';
  const keyPrefix = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '').slice(0, 20);

  try {
    const { data, error } = await supabase.from('panda_users').select('id, username').limit(1);
    return res.status(200).json({
      env: { hasUrl, hasKey, keySource, keyPrefix },
      query: error ? { error: error.message } : { ok: true, count: (data || []).length },
    });
  } catch (err) {
    return res.status(200).json({
      env: { hasUrl, hasKey, keySource, keyPrefix },
      query: { crash: err.message },
    });
  }
}
