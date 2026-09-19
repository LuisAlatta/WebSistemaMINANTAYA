CREATE TRIGGER users_maximum_admins
BEFORE INSERT ON users
WHEN (SELECT COUNT(*) FROM users) >= 2
BEGIN
  SELECT RAISE(ABORT, 'maximum administrator accounts reached');
END;

CREATE TABLE auth_login_attempts (
  identifier TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_auth_login_attempts_locked_until ON auth_login_attempts(locked_until);
