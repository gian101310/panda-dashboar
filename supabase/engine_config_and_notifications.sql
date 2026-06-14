-- Engine Config table (key-value store for execution mode, thresholds)
CREATE TABLE IF NOT EXISTS engine_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default execution mode
INSERT INTO engine_config (key, value) VALUES ('execution_mode', 'MANUAL')
ON CONFLICT (key) DO NOTHING;

-- Engine Notifications table (valid setups waiting for approval)
CREATE TABLE IF NOT EXISTS engine_notifications (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  strategy TEXT,
  entry_price NUMERIC,
  sl_price NUMERIC,
  tp_price NUMERIC,
  risk_reward NUMERIC,
  guardian_state TEXT,
  status TEXT DEFAULT 'PENDING',  -- PENDING, EXECUTING, EXECUTED, EXPIRED
  executed_at TIMESTAMPTZ
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_engine_notifications_status ON engine_notifications(status);
CREATE INDEX IF NOT EXISTS idx_engine_notifications_symbol ON engine_notifications(symbol, status);

-- RLS
ALTER TABLE engine_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine_notifications ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "service_role_engine_config" ON engine_config
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_engine_notifications" ON engine_notifications
  FOR ALL USING (auth.role() = 'service_role');

-- Allow anon read for dashboard
CREATE POLICY "anon_read_engine_config" ON engine_config
  FOR SELECT USING (true);
CREATE POLICY "anon_read_engine_notifications" ON engine_notifications
  FOR SELECT USING (true);
