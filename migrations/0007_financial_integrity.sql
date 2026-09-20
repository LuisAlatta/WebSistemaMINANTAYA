CREATE UNIQUE INDEX idx_commercial_invoice_lots_lot_unique ON commercial_invoice_lots(lot_id);
CREATE TABLE active_transport_guide_locks (
  guide_id TEXT PRIMARY KEY REFERENCES guides(id),
  transport_invoice_id TEXT NOT NULL REFERENCES transport_invoices(id),
  created_at TEXT NOT NULL
);
INSERT OR IGNORE INTO active_transport_guide_locks (guide_id, transport_invoice_id, created_at)
SELECT guide_id, MIN(transport_invoice_id), MIN(created_at)
FROM transport_invoice_guides
GROUP BY guide_id;

ALTER TABLE commercial_invoices ADD COLUMN paid_usd_cents INTEGER NOT NULL DEFAULT 0 CHECK (paid_usd_cents >= 0);
ALTER TABLE transport_invoices ADD COLUMN paid_usd_cents INTEGER NOT NULL DEFAULT 0 CHECK (paid_usd_cents >= 0);
UPDATE commercial_invoices SET paid_usd_cents = COALESCE((SELECT SUM(amount_cents) FROM payments WHERE payments.commercial_invoice_id = commercial_invoices.id AND payment_type = 'COMERCIAL' AND currency = 'USD' AND status = 'CONFIRMADO'), 0);
UPDATE transport_invoices SET paid_usd_cents = COALESCE((SELECT SUM(amount_cents) FROM payments WHERE payments.transport_invoice_id = transport_invoices.id AND payment_type = 'TRANSPORTE' AND currency = 'USD' AND status = 'CONFIRMADO'), 0);

CREATE TABLE assay_report_supplier_approvals (
  id TEXT PRIMARY KEY,
  assay_report_id TEXT NOT NULL REFERENCES assay_reports(id),
  supplier_id TEXT NOT NULL REFERENCES counterparties(id),
  status TEXT NOT NULL CHECK (status IN ('PENDIENTE', 'APROBADO', 'OBSERVADO')),
  responded_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(assay_report_id, supplier_id)
);
CREATE INDEX idx_assay_report_supplier_approvals_report ON assay_report_supplier_approvals(assay_report_id, status);
