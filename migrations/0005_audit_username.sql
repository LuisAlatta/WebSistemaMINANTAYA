PRAGMA foreign_keys = OFF;

DROP TRIGGER IF EXISTS audit_logs_no_update;
DROP TRIGGER IF EXISTS audit_logs_no_delete;

ALTER TABLE audit_logs RENAME TO audit_logs_legacy_username;

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_username TEXT NOT NULL,
  actor_source TEXT NOT NULL CHECK (actor_source IN ('access', 'local', 'session', 'system')),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO audit_logs (
  id, actor_username, actor_source, action, entity_type, entity_id,
  before_json, after_json, reason, created_at
)
SELECT
  id, actor_email, actor_source, action, entity_type, entity_id,
  before_json, after_json, reason, created_at
FROM audit_logs_legacy_username;

DROP TABLE audit_logs_legacy_username;

CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

CREATE TRIGGER audit_logs_no_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs are immutable');
END;

CREATE TRIGGER audit_logs_no_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs are immutable');
END;

PRAGMA foreign_keys = ON;
