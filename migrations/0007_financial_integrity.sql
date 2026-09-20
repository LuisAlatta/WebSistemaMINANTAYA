CREATE UNIQUE INDEX idx_commercial_invoice_lots_lot_unique ON commercial_invoice_lots(lot_id);
CREATE TRIGGER prevent_transport_invoice_duplicate
BEFORE INSERT ON transport_invoice_guides
WHEN EXISTS (
  SELECT 1
  FROM transport_invoice_guides links
  JOIN transport_invoices invoices ON invoices.id = links.transport_invoice_id
  WHERE links.guide_id = NEW.guide_id AND invoices.status <> 'ANULADA'
)
BEGIN
  SELECT RAISE(ABORT, 'GUIDE_ALREADY_HAS_TRANSPORT_INVOICE');
END;

CREATE TRIGGER prevent_commercial_payment_overrun
BEFORE INSERT ON payments
WHEN NEW.payment_type = 'COMERCIAL' AND NEW.currency = 'USD' AND NEW.status = 'CONFIRMADO'
BEGIN
  SELECT CASE WHEN COALESCE((SELECT SUM(amount_cents) FROM payments WHERE commercial_invoice_id = NEW.commercial_invoice_id AND payment_type = 'COMERCIAL' AND currency = 'USD' AND status = 'CONFIRMADO'), 0) + NEW.amount_cents > (SELECT amount_usd_cents FROM commercial_invoices WHERE id = NEW.commercial_invoice_id)
    THEN RAISE(ABORT, 'PAYMENT_EXCEEDS_BALANCE') END;
END;

CREATE TRIGGER prevent_transport_payment_overrun
BEFORE INSERT ON payments
WHEN NEW.payment_type = 'TRANSPORTE' AND NEW.currency = 'USD' AND NEW.status = 'CONFIRMADO'
BEGIN
  SELECT CASE WHEN COALESCE((SELECT SUM(amount_cents) FROM payments WHERE transport_invoice_id = NEW.transport_invoice_id AND payment_type = 'TRANSPORTE' AND currency = 'USD' AND status = 'CONFIRMADO'), 0) + NEW.amount_cents > (SELECT amount_usd_cents FROM transport_invoices WHERE id = NEW.transport_invoice_id)
    THEN RAISE(ABORT, 'PAYMENT_EXCEEDS_BALANCE') END;
END;

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
