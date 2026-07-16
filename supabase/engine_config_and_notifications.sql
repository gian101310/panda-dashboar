-- Engine Config table (key-value store for runtime toggles)
CREATE TABLE IF NOT EXISTS engine_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: server-side service role only.
ALTER TABLE engine_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE engine_config FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE engine_config TO service_role;
