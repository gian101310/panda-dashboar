import { getSecurityAlertConfig } from './securityAlert.mjs';
import { sendTelegram } from './signalTelegram.mjs';
import {
  buildEdgeRevalidationAlert,
  createEdgeRevalidationRunner,
} from './edgeRevalidation.mjs';

const FACTOR = 'weekly_edge_revalidation';
const PAGE_SIZE = 1000;

export function createEdgeRevalidationRuntime({ supabase, env = process.env, fetchImpl = fetch }) {
  const fetchRows = async () => {
    const rows = [];
    for (let page = 0; ; page += 1) {
      const { data, error } = await supabase
        .from('signal_results')
        .select('strategy,outcome,entry_gap,direction,pl_zone')
        .not('outcome', 'is', null)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < PAGE_SIZE) break;
    }
    return rows;
  };

  const getPreviousReport = async () => {
    const { data, error } = await supabase
      .from('ai_memory')
      .select('metadata')
      .eq('factor', FACTOR)
      .order('computed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.metadata?.report || null;
  };

  const replaceReport = async (report) => {
    const { error: deleteError } = await supabase.from('ai_memory').delete().eq('factor', FACTOR);
    if (deleteError) throw deleteError;
    const { error } = await supabase.from('ai_memory').insert({
      type: 'edge_analysis',
      factor: FACTOR,
      strategy: 'BB',
      win_rate: report.strategies.BB.decisive_win_rate,
      sample_size: report.total_signals,
      computed_at: report.computed_at,
      metadata: {
        description: 'Weekly edge revalidation; this report overrides retired historical claims',
        report,
      },
    });
    if (error) throw error;
  };

  const retireHistoricalClaims = async (report) => {
    const confirmed = report.claims.bb_gap7_pl_confirmed.current;
    const unconfirmed = report.claims.bb_gap7_pl_unconfirmed.current;
    const updates = [
      ['best_edge', `RETIRED HISTORICAL CLAIM. Current BB gap 7 + Panda Lines decisive win rate: ${confirmed.decisive_win_rate ?? 'n/a'}% (n=${confirmed.decisive}), recomputed ${report.computed_at}. Use weekly_edge_revalidation.`],
      ['dead_zone', `RETIRED HISTORICAL CLAIM. Current BB gap 7 without Panda Lines decisive win rate: ${unconfirmed.decisive_win_rate ?? 'n/a'}% (n=${unconfirmed.decisive}), recomputed ${report.computed_at}. Use weekly_edge_revalidation.`],
    ];
    for (const [key, value] of updates) {
      const { error } = await supabase
        .from('admin_brain')
        .update({ value, updated_at: report.computed_at })
        .eq('key', key);
      if (error) throw error;
    }
  };

  const notify = async (report) => {
    const { token, chatId } = getSecurityAlertConfig(env);
    return sendTelegram({
      token,
      chatId,
      text: buildEdgeRevalidationAlert(report),
      fetchImpl,
    });
  };

  const run = createEdgeRevalidationRunner({
    fetchRows,
    getPreviousReport,
    replaceReport,
    retireHistoricalClaims,
    notify,
  });

  return { run, getLatest: getPreviousReport };
}
