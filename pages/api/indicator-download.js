import { supabase } from '../../lib/supabase';
import { createIndicatorDownloadHandler } from '../../lib/indicatorDownload.mjs';

const handler = createIndicatorDownloadHandler({
  recordDownload: async (event) => {
    const { error } = await supabase.from('indicator_download_events').insert(event);
    if (error) throw error;
  },
});

export default handler;
