import { getSecurityAlertConfig } from './securityAlert.mjs';
import { sendTelegram } from './signalTelegram.mjs';
import {
  buildEngineMonitorAlert,
  createEngineStallMonitor,
} from './engineStallMonitor.mjs';

export function createEngineStallRuntime({ supabase, env = process.env, fetchImpl = fetch }) {
  return createEngineStallMonitor({
    getLatestHeartbeat: async () => {
      const { data, error } = await supabase
        .from('engine_heartbeat')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
    getState: async () => {
      const { data, error } = await supabase
        .from('engine_monitor_state')
        .select('monitor_key,status,last_heartbeat_at,last_alert_at,last_recovery_at,updated_at')
        .eq('monitor_key', 'engine')
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
    sendAlert: async (decision) => {
      const { token, chatId } = getSecurityAlertConfig(env);
      return sendTelegram({
        token,
        chatId,
        text: buildEngineMonitorAlert(decision),
        fetchImpl,
      });
    },
    saveState: async (state) => {
      const { error } = await supabase
        .from('engine_monitor_state')
        .upsert(state, { onConflict: 'monitor_key' });
      if (error) throw error;
    },
  });
}
