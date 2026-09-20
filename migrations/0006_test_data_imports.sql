-- Conserva la procedencia y permite retirar una carga demostrativa sin afectar
-- las cuentas administrativas ni el historial de auditoría.
CREATE TABLE test_data_import_batches (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  is_test_data INTEGER NOT NULL DEFAULT 1 CHECK (is_test_data IN (0, 1)),
  source_manifest_json TEXT NOT NULL,
  source_row_count INTEGER NOT NULL CHECK (source_row_count >= 0),
  structured_entity_count INTEGER NOT NULL CHECK (structured_entity_count >= 0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE test_data_source_rows (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES test_data_import_batches(id),
  source_file TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  source_row_number INTEGER NOT NULL CHECK (source_row_number > 0),
  values_json TEXT NOT NULL,
  formulas_json TEXT NOT NULL,
  row_checksum TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(batch_id, source_file, sheet_name, source_row_number)
);

CREATE TABLE test_data_entity_map (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES test_data_import_batches(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  source_row_id TEXT REFERENCES test_data_source_rows(id),
  source_key TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(batch_id, entity_type, entity_id, source_row_id)
);

CREATE TABLE test_data_quality_issues (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES test_data_import_batches(id),
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'ADVERTENCIA', 'CRITICA')),
  category TEXT NOT NULL,
  source_file TEXT,
  sheet_name TEXT,
  source_row_number INTEGER,
  description TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ABIERTA' CHECK (status IN ('ABIERTA', 'RESUELTA')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_test_data_source_rows_batch ON test_data_source_rows(batch_id);
CREATE INDEX idx_test_data_entity_map_batch_entity ON test_data_entity_map(batch_id, entity_type, entity_id);
CREATE INDEX idx_test_data_quality_issues_batch_status ON test_data_quality_issues(batch_id, status);
