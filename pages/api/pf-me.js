import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized', pf_approved: false });

  const { data: user } = await supabase
    .from('panda_users')
    .select('id, username, role, feature_access, pf_approved, pf_tier')
    .eq('id', session.user_id)
    .single();

  if (!user) return res.status(401).json({ error: 'User not found', pf_approved: false });

  const PF_TIER_FEATURES = {
    starter: ['signals','calendar','calculator','cot'],
    pro:     ['signals','table','gap','calendar','calculator','cot','setups','spike'],
    elite:   ['signals','table','gap','calendar','calculator','cot','setups','spike','logs','alerts','journal','charts','panels']
  };

  return res.status(200).json({
    id: user.id,
    username: user.username,
    role: user.role,
    pf_approved: user.pf_approved !== false,
    pf_tier: user.pf_tier || 'starter',
    pf_features: PF_TIER_FEATURES[user.pf_tier] || PF_TIER_FEATURES.starter,
    feature_access: user.feature_access || [],
  });
}
