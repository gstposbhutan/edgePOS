-- Migration 009: Audit Logs
-- Compliance + fraud detection. Append-only. Never deleted.

CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id  UUID,
  operation  TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE', 'IMPERSONATE', 'AUTH')),
  old_values JSONB,
  new_values JSONB,
  actor_id   UUID,
  actor_role TEXT,
  ip_address TEXT,
  user_agent TEXT,
  timestamp  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table     ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record    ON audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor     ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
