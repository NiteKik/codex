CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  upstream_base_url TEXT NOT NULL,
  quota_path TEXT NOT NULL,
  proxy_path_prefix TEXT NOT NULL,
  login_email TEXT,
  login_password TEXT,
  managed_by_gateway INTEGER NOT NULL DEFAULT 0,
  provision_source TEXT NOT NULL DEFAULT 'manual',
  provision_state TEXT NOT NULL DEFAULT 'idle',
  last_provision_attempt_at TEXT,
  last_provisioned_at TEXT,
  last_provision_error TEXT,
  auth_json TEXT NOT NULL,
  workspace_kind TEXT NOT NULL DEFAULT 'unknown',
  workspace_id TEXT,
  workspace_name TEXT,
  workspace_headers_json TEXT,
  subscription_plan_type TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  consecutive_429 INTEGER NOT NULL DEFAULT 0,
  cooldown_until TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quota_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  weekly_total INTEGER NOT NULL,
  weekly_used INTEGER NOT NULL,
  weekly_reset_at TEXT NOT NULL,
  window_5h_total INTEGER NOT NULL,
  window_5h_used INTEGER NOT NULL,
  window_5h_reset_at TEXT NOT NULL,
  sample_time TEXT NOT NULL,
  source TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_quota_snapshots_account_sample
  ON quota_snapshots(account_id, sample_time DESC);

CREATE TABLE IF NOT EXISTS session_bindings (
  session_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  sticky_until TEXT NOT NULL,
  migration_count INTEGER NOT NULL DEFAULT 0,
  last_request_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS quota_reservations (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  units INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_quota_reservations_account_status
  ON quota_reservations(account_id, status);

CREATE TABLE IF NOT EXISTS quota_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  units INTEGER NOT NULL,
  reconciled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_quota_adjustments_account_reconciled
  ON quota_adjustments(account_id, reconciled);

CREATE TABLE IF NOT EXISTS request_logs (
  request_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  estimated_units INTEGER NOT NULL,
  upstream_status INTEGER,
  error_code TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  cached_input_tokens INTEGER,
  total_tokens INTEGER,
  token_capture_source TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS decision_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  selected_account_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  score_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (selected_account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS runtime_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,
  scope TEXT NOT NULL,
  event TEXT NOT NULL,
  message TEXT NOT NULL,
  account_id TEXT,
  request_id TEXT,
  session_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_logs_created
  ON runtime_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS runtime_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gateway_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_preview TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_gateway_tokens_status
  ON gateway_tokens(revoked_at, expires_at, created_at DESC);
