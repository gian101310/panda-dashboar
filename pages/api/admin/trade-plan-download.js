import { requireAdmin } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { createTradePlanAdminDownloadHandler } from '../../../lib/tradePlanAdminDownload.mjs';

export default createTradePlanAdminDownloadHandler({
  requireAdmin,
  readArtifact: async () => {
    const { data, error } = await supabase.storage.from('private-indicators').download('panda-trade-plan-v1.3.algo');
    if (error) throw error;
    return Buffer.from(await data.arrayBuffer());
  },
});
