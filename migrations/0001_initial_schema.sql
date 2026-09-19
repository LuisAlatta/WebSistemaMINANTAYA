PRAGMA foreign_keys = ON;

CREATE TABLE plants (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  legal_name TEXT NOT NULL,
  ruc TEXT,
  address TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE counterparties (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('PROVEEDOR', 'TRANSPORTISTA', 'LABORATORIO', 'CLIENTE')),
  legal_name TEXT NOT NULL,
  document_number TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(type, document_number)
);

CREATE TABLE routes (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(origin, destination)
);

CREATE TABLE transport_rates (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id),
  carrier_id TEXT REFERENCES counterparties(id),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  rate_type TEXT NOT NULL CHECK (rate_type IN ('TARIFA', 'DESCUENTO', 'REAL')),
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE exchange_rates (
  id TEXT PRIMARY KEY,
  rate_date TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'Caja Arequipa',
  usd_to_pen REAL NOT NULL CHECK (usd_to_pen > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE guides (
  id TEXT PRIMARY KEY,
  gre_original TEXT NOT NULL,
  gre_normalized TEXT NOT NULL UNIQUE,
  plant_id TEXT REFERENCES plants(id),
  route_id TEXT REFERENCES routes(id),
  carrier_id TEXT REFERENCES counterparties(id),
  issued_at TEXT NOT NULL,
  received_at TEXT,
  status TEXT NOT NULL CHECK (status IN (
    'EMITIDA', 'EN_PLANTA', 'LEYES_PENDIENTES', 'LEYES_RECIBIDAS',
    'PROPUESTA_PENDIENTE', 'CONFORME', 'REMUESTREO', 'DIRIMENCIA',
    'LIQUIDADA', 'FACTURADA', 'ANULADA', 'RETIRO_PENDIENTE', 'RETIRADA'
  )),
  transport_reference TEXT,
  notes TEXT,
  voided_at TEXT,
  void_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((status <> 'ANULADA') OR (voided_at IS NOT NULL AND void_reason IS NOT NULL))
);

CREATE TABLE lots (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  mineral_type TEXT,
  sack_count INTEGER CHECK (sack_count IS NULL OR sack_count >= 0),
  gross_weight_kg REAL CHECK (gross_weight_kg IS NULL OR gross_weight_kg >= 0),
  net_weight_kg REAL CHECK (net_weight_kg IS NULL OR net_weight_kg >= 0),
  status TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (status IN ('ACTIVO', 'RETIRO_PENDIENTE', 'RETIRADO', 'ANULADO')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE guide_lots (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL REFERENCES guides(id),
  lot_id TEXT NOT NULL REFERENCES lots(id),
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 99),
  withdrawal_requested INTEGER NOT NULL DEFAULT 0 CHECK (withdrawal_requested IN (0, 1)),
  withdrawal_completed_at TEXT,
  withdrawal_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(guide_id, lot_id),
  UNIQUE(guide_id, sequence),
  CHECK ((withdrawal_completed_at IS NULL) OR withdrawal_requested = 1)
);

CREATE TABLE lot_suppliers (
  id TEXT PRIMARY KEY,
  guide_lot_id TEXT NOT NULL REFERENCES guide_lots(id),
  supplier_id TEXT NOT NULL REFERENCES counterparties(id),
  allocation_percent REAL CHECK (allocation_percent IS NULL OR (allocation_percent > 0 AND allocation_percent <= 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(guide_lot_id, supplier_id)
);

CREATE TABLE guide_events (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL REFERENCES guides(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('CREADA', 'ESTADO_CAMBIADO', 'BAJA', 'RETIRO_SOLICITADO', 'RETIRO_CONFIRMADO', 'OBSERVACION')),
  occurred_at TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE assay_reports (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL REFERENCES guides(id),
  laboratory_id TEXT REFERENCES counterparties(id),
  report_number TEXT,
  reported_at TEXT,
  received_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDIENTE', 'RECIBIDO', 'ENVIADO_PROVEEDOR', 'APROBADO', 'OBSERVADO')),
  source TEXT NOT NULL CHECK (source IN ('PLANTA', 'EXTERNO')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE assay_results (
  id TEXT PRIMARY KEY,
  assay_report_id TEXT NOT NULL REFERENCES assay_reports(id),
  lot_id TEXT NOT NULL REFERENCES lots(id),
  element TEXT NOT NULL,
  result_value REAL NOT NULL,
  unit TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(assay_report_id, lot_id, element)
);

CREATE TABLE resamples (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL REFERENCES guides(id),
  requested_by_supplier_id TEXT REFERENCES counterparties(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SOLICITADO', 'COORDINADO', 'ENVIADO_LABORATORIO', 'RESULTADO_RECIBIDO', 'CERRADO')),
  requested_at TEXT NOT NULL,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE disputes (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL REFERENCES guides(id),
  reason TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('INICIADA', 'MUESTRAS_ENVIADAS', 'ANALISIS_LIMA', 'RESULTADO_RECIBIDO', 'CERRADA')),
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  resolution TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((stage <> 'CERRADA') OR closed_at IS NOT NULL)
);

CREATE TABLE purchase_proposals (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL REFERENCES guides(id),
  proposal_number TEXT,
  issued_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'REEMPLAZADA')),
  amount_usd_cents INTEGER NOT NULL CHECK (amount_usd_cents >= 0),
  notes TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE settlements (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL REFERENCES guides(id),
  purchase_proposal_id TEXT REFERENCES purchase_proposals(id),
  status TEXT NOT NULL CHECK (status IN ('BORRADOR', 'EMITIDA', 'APROBADA', 'ANULADA')),
  settled_at TEXT,
  gross_usd_cents INTEGER NOT NULL CHECK (gross_usd_cents >= 0),
  deductions_usd_cents INTEGER NOT NULL DEFAULT 0 CHECK (deductions_usd_cents >= 0),
  net_usd_cents INTEGER NOT NULL CHECK (net_usd_cents >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (net_usd_cents = gross_usd_cents - deductions_usd_cents)
);

CREATE TABLE settlement_lines (
  id TEXT PRIMARY KEY,
  settlement_id TEXT NOT NULL REFERENCES settlements(id),
  line_type TEXT NOT NULL CHECK (line_type IN ('METAL', 'DESCUENTO', 'PENALIDAD', 'AJUSTE', 'OTRO')),
  description TEXT NOT NULL,
  amount_usd_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE discounts (
  id TEXT PRIMARY KEY,
  settlement_id TEXT REFERENCES settlements(id),
  guide_id TEXT NOT NULL REFERENCES guides(id),
  lot_id TEXT REFERENCES lots(id),
  discount_type TEXT NOT NULL CHECK (discount_type IN ('TRANSPORTE', 'MAQUILA', 'HUMEDAD', 'IMPUREZA', 'PENALIDAD', 'OTRO')),
  amount_usd_cents INTEGER NOT NULL CHECK (amount_usd_cents >= 0),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE commercial_invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  amount_usd_cents INTEGER NOT NULL CHECK (amount_usd_cents >= 0),
  detraction_percent REAL NOT NULL DEFAULT 0.10 CHECK (detraction_percent >= 0 AND detraction_percent <= 1),
  detraction_pen_cents INTEGER NOT NULL DEFAULT 0 CHECK (detraction_pen_cents >= 0),
  exchange_rate_id TEXT REFERENCES exchange_rates(id),
  status TEXT NOT NULL CHECK (status IN ('EMITIDA', 'PAGADA', 'ANULADA')),
  void_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status <> 'ANULADA') OR void_reason IS NOT NULL)
);

CREATE TABLE commercial_invoice_lots (
  id TEXT PRIMARY KEY,
  commercial_invoice_id TEXT NOT NULL REFERENCES commercial_invoices(id),
  lot_id TEXT NOT NULL REFERENCES lots(id),
  amount_usd_cents INTEGER NOT NULL CHECK (amount_usd_cents >= 0),
  created_at TEXT NOT NULL,
  UNIQUE(commercial_invoice_id, lot_id)
);

CREATE TABLE transport_invoices (
  id TEXT PRIMARY KEY,
  carrier_id TEXT NOT NULL REFERENCES counterparties(id),
  invoice_number TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  amount_usd_cents INTEGER NOT NULL CHECK (amount_usd_cents >= 0),
  exchange_rate_id TEXT REFERENCES exchange_rates(id),
  detraction_percent REAL NOT NULL DEFAULT 0.04 CHECK (detraction_percent >= 0 AND detraction_percent <= 1),
  detraction_pen_cents INTEGER NOT NULL DEFAULT 0 CHECK (detraction_pen_cents >= 0),
  status TEXT NOT NULL CHECK (status IN ('REGISTRADA', 'PAGADA', 'ANULADA')),
  void_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(carrier_id, invoice_number),
  CHECK ((status <> 'ANULADA') OR void_reason IS NOT NULL)
);

CREATE TABLE transport_invoice_guides (
  id TEXT PRIMARY KEY,
  transport_invoice_id TEXT NOT NULL REFERENCES transport_invoices(id),
  guide_id TEXT NOT NULL REFERENCES guides(id),
  amount_usd_cents INTEGER CHECK (amount_usd_cents IS NULL OR amount_usd_cents >= 0),
  created_at TEXT NOT NULL,
  UNIQUE(transport_invoice_id, guide_id)
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('COMERCIAL', 'TRANSPORTE', 'DETRACCION_COMERCIAL', 'DETRACCION_TRANSPORTE')),
  commercial_invoice_id TEXT REFERENCES commercial_invoices(id),
  transport_invoice_id TEXT REFERENCES transport_invoices(id),
  paid_at TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'PEN')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  reference TEXT,
  status TEXT NOT NULL CHECK (status IN ('REGISTRADO', 'CONFIRMADO', 'ANULADO')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (commercial_invoice_id IS NOT NULL AND transport_invoice_id IS NULL) OR
    (commercial_invoice_id IS NULL AND transport_invoice_id IS NOT NULL)
  )
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  guide_id TEXT REFERENCES guides(id),
  lot_id TEXT REFERENCES lots(id),
  commercial_invoice_id TEXT REFERENCES commercial_invoices(id),
  transport_invoice_id TEXT REFERENCES transport_invoices(id),
  r2_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  document_type TEXT NOT NULL CHECK (document_type IN ('GUIA', 'REPORTE_LEYES', 'PROPUESTA', 'LIQUIDACION', 'FACTURA_COMERCIAL', 'FACTURA_TRANSPORTE', 'PAGO', 'OTRO')),
  created_at TEXT NOT NULL
);

CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  guide_id TEXT REFERENCES guides(id),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('LEYES_RETRASADAS', 'PROPUESTA_PENDIENTE', 'FACTURA_COMERCIAL_PENDIENTE', 'FACTURA_TRANSPORTE_PENDIENTE', 'PAGO_TRANSPORTE_PENDIENTE', 'LOTES_SUPERADOS', 'RETIRO_PENDIENTE')),
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'ADVERTENCIA', 'CRITICA')),
  status TEXT NOT NULL CHECK (status IN ('ABIERTA', 'RESUELTA')),
  due_at TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  actor_source TEXT NOT NULL CHECK (actor_source IN ('access', 'local')),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_guides_status_issued_at ON guides(status, issued_at);
CREATE INDEX idx_guides_plant_id ON guides(plant_id);
CREATE INDEX idx_lots_status ON lots(status);
CREATE INDEX idx_guide_lots_guide_id ON guide_lots(guide_id);
CREATE INDEX idx_guide_events_guide_id_occurred_at ON guide_events(guide_id, occurred_at);
CREATE INDEX idx_assay_reports_guide_id_status ON assay_reports(guide_id, status);
CREATE INDEX idx_resamples_guide_id_status ON resamples(guide_id, status);
CREATE INDEX idx_disputes_guide_id_stage ON disputes(guide_id, stage);
CREATE INDEX idx_settlements_guide_id ON settlements(guide_id);
CREATE INDEX idx_commercial_invoice_lots_lot_id ON commercial_invoice_lots(lot_id);
CREATE INDEX idx_transport_invoice_guides_guide_id ON transport_invoice_guides(guide_id);
CREATE INDEX idx_payments_commercial_invoice_id ON payments(commercial_invoice_id);
CREATE INDEX idx_payments_transport_invoice_id ON payments(transport_invoice_id);
CREATE INDEX idx_documents_guide_id ON documents(guide_id);
CREATE INDEX idx_alerts_status_due_at ON alerts(status, due_at);
CREATE INDEX idx_audit_logs_entity_id_created_at ON audit_logs(entity_id, created_at);
