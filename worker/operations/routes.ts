import { Hono } from 'hono';

import type { AppVariables } from '../http/middleware';
import { HttpError } from '../http/errors';

type Bindings = { Bindings: Env; Variables: AppVariables };

function pageValue(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, maximum);
}

function limit(context: { req: { query(name: string): string | undefined } }): number {
  return Math.max(pageValue(context.req.query('limit'), 100, 200), 1);
}

function offset(context: { req: { query(name: string): string | undefined } }): number {
  return pageValue(context.req.query('offset'), 0, 1_000_000);
}

export const operationsRoutes = new Hono<Bindings>();

operationsRoutes.get('/guides', async (context) => {
  const pageLimit = limit(context); const pageOffset = offset(context);
  const result = await context.env.DB.prepare(
    `SELECT
      guides.id,
      guides.gre_original AS gre,
      guides.issued_at AS issuedAt,
      guides.status,
      guides.transport_reference AS transportReference,
      plants.code AS plant,
      carriers.legal_name AS carrier,
      COUNT(DISTINCT guide_lots.id) AS lotCount,
      GROUP_CONCAT(DISTINCT lots.code) AS lots,
      GROUP_CONCAT(DISTINCT suppliers.legal_name) AS suppliers,
      COUNT(DISTINCT CASE WHEN guide_lots.withdrawal_requested = 1 THEN guide_lots.id END) AS lotsForWithdrawal
    FROM guides
    LEFT JOIN plants ON plants.id = guides.plant_id
    LEFT JOIN counterparties carriers ON carriers.id = guides.carrier_id
    LEFT JOIN guide_lots ON guide_lots.guide_id = guides.id
    LEFT JOIN lots ON lots.id = guide_lots.lot_id
    LEFT JOIN lot_suppliers ON lot_suppliers.guide_lot_id = guide_lots.id
    LEFT JOIN counterparties suppliers ON suppliers.id = lot_suppliers.supplier_id
    GROUP BY guides.id
    ORDER BY guides.issued_at DESC, guides.gre_normalized DESC
    LIMIT ? OFFSET ?`,
  ).bind(pageLimit, pageOffset).all();
  return context.json({ items: result.results, limit: pageLimit, offset: pageOffset });
});

operationsRoutes.get('/guides/:id', async (context) => {
  const guide = await context.env.DB.prepare(
    `SELECT guides.id, guides.gre_original AS gre, guides.issued_at AS issuedAt, guides.received_at AS receivedAt,
      guides.status, guides.transport_reference AS transportReference, guides.notes, guides.voided_at AS voidedAt,
      guides.void_reason AS voidReason, plants.code AS plant, carriers.legal_name AS carrier
     FROM guides
     LEFT JOIN plants ON plants.id = guides.plant_id
     LEFT JOIN counterparties carriers ON carriers.id = guides.carrier_id
     WHERE guides.id = ?`,
  ).bind(context.req.param('id')).first();
  if (!guide) throw new HttpError(404, 'La guía no existe.', 'GUIDE_NOT_FOUND');
  const [lots, events, alerts] = await Promise.all([
    context.env.DB.prepare(
      `SELECT guide_lots.id, lots.id AS lotId, lots.code, lots.sack_count AS sackCount, lots.status,
        guide_lots.sequence, guide_lots.withdrawal_requested AS withdrawalRequested,
        guide_lots.withdrawal_completed_at AS withdrawalCompletedAt, guide_lots.withdrawal_reason AS withdrawalReason,
        GROUP_CONCAT(suppliers.legal_name) AS suppliers
       FROM guide_lots
       JOIN lots ON lots.id = guide_lots.lot_id
       LEFT JOIN lot_suppliers ON lot_suppliers.guide_lot_id = guide_lots.id
       LEFT JOIN counterparties suppliers ON suppliers.id = lot_suppliers.supplier_id
       WHERE guide_lots.guide_id = ?
       GROUP BY guide_lots.id
       ORDER BY guide_lots.sequence`,
    ).bind(context.req.param('id')).all(),
    context.env.DB.prepare('SELECT id, event_type AS eventType, occurred_at AS occurredAt, detail_json AS detailJson FROM guide_events WHERE guide_id = ? ORDER BY occurred_at DESC').bind(context.req.param('id')).all(),
    context.env.DB.prepare('SELECT id, alert_type AS alertType, severity, status, due_at AS dueAt, detail_json AS detailJson FROM alerts WHERE guide_id = ? ORDER BY created_at DESC').bind(context.req.param('id')).all(),
  ]);
  return context.json({ guide, lots: lots.results, events: events.results, alerts: alerts.results });
});

operationsRoutes.get('/quality', async (context) => {
  const pageLimit = limit(context); const pageOffset = offset(context);
  const [reports, resamples, disputes] = await Promise.all([
    context.env.DB.prepare(
      `SELECT assay_reports.id, assay_reports.report_number AS reportNumber, assay_reports.reported_at AS reportedAt,
        assay_reports.received_at AS receivedAt, assay_reports.status, assay_reports.source,
        guides.id AS guideId, guides.gre_original AS gre, laboratories.legal_name AS laboratory,
        COUNT(assay_results.id) AS resultCount
       FROM assay_reports
       JOIN guides ON guides.id = assay_reports.guide_id
       LEFT JOIN counterparties laboratories ON laboratories.id = assay_reports.laboratory_id
       LEFT JOIN assay_results ON assay_results.assay_report_id = assay_reports.id
       GROUP BY assay_reports.id
       ORDER BY COALESCE(assay_reports.received_at, assay_reports.created_at) DESC
       LIMIT ? OFFSET ?`,
    ).bind(pageLimit, pageOffset).all(),
    context.env.DB.prepare(
      `SELECT resamples.id, resamples.status, resamples.reason, resamples.requested_at AS requestedAt,
        resamples.resolved_at AS resolvedAt, guides.id AS guideId, guides.gre_original AS gre,
        suppliers.legal_name AS supplier
       FROM resamples
       JOIN guides ON guides.id = resamples.guide_id
       LEFT JOIN counterparties suppliers ON suppliers.id = resamples.requested_by_supplier_id
       ORDER BY resamples.requested_at DESC LIMIT ? OFFSET ?`,
    ).bind(pageLimit, pageOffset).all(),
    context.env.DB.prepare(
      `SELECT disputes.id, disputes.stage, disputes.reason, disputes.opened_at AS openedAt, disputes.closed_at AS closedAt,
        disputes.resolution, guides.id AS guideId, guides.gre_original AS gre
       FROM disputes JOIN guides ON guides.id = disputes.guide_id
       ORDER BY disputes.opened_at DESC LIMIT ? OFFSET ?`,
    ).bind(pageLimit, pageOffset).all(),
  ]);
  return context.json({ reports: reports.results, resamples: resamples.results, disputes: disputes.results, limit: pageLimit, offset: pageOffset });
});

operationsRoutes.get('/settlements', async (context) => {
  const pageLimit = limit(context); const pageOffset = offset(context);
  const [proposals, settlements] = await Promise.all([
    context.env.DB.prepare(
      `SELECT purchase_proposals.id, purchase_proposals.proposal_number AS proposalNumber,
        purchase_proposals.issued_at AS issuedAt, purchase_proposals.status, purchase_proposals.amount_usd_cents AS amountUsdCents,
        purchase_proposals.approved_at AS approvedAt, guides.id AS guideId, guides.gre_original AS gre
       FROM purchase_proposals JOIN guides ON guides.id = purchase_proposals.guide_id
       ORDER BY purchase_proposals.issued_at DESC LIMIT ? OFFSET ?`,
    ).bind(pageLimit, pageOffset).all(),
    context.env.DB.prepare(
      `SELECT settlements.id, settlements.status, settlements.settled_at AS settledAt,
        settlements.gross_usd_cents AS grossUsdCents, settlements.deductions_usd_cents AS deductionsUsdCents,
        settlements.net_usd_cents AS netUsdCents, guides.id AS guideId, guides.gre_original AS gre,
        COUNT(settlement_lines.id) AS lineCount
       FROM settlements JOIN guides ON guides.id = settlements.guide_id
       LEFT JOIN settlement_lines ON settlement_lines.settlement_id = settlements.id
       GROUP BY settlements.id
       ORDER BY COALESCE(settlements.settled_at, settlements.created_at) DESC LIMIT ? OFFSET ?`,
    ).bind(pageLimit, pageOffset).all(),
  ]);
  return context.json({ proposals: proposals.results, settlements: settlements.results, limit: pageLimit, offset: pageOffset });
});

operationsRoutes.get('/commercial-invoices', async (context) => {
  const pageLimit = limit(context); const pageOffset = offset(context);
  const result = await context.env.DB.prepare(
    `SELECT commercial_invoices.id, commercial_invoices.invoice_number AS invoiceNumber,
      commercial_invoices.issued_at AS issuedAt, commercial_invoices.amount_usd_cents AS amountUsdCents,
      commercial_invoices.detraction_percent AS detractionPercent,
      commercial_invoices.detraction_pen_cents AS detractionPenCents, commercial_invoices.status,
      GROUP_CONCAT(DISTINCT lots.code) AS lots,
      COALESCE((SELECT SUM(payments.amount_cents) FROM payments WHERE payments.commercial_invoice_id = commercial_invoices.id AND payments.payment_type = 'COMERCIAL' AND payments.currency = 'USD' AND payments.status = 'CONFIRMADO'), 0) AS paidUsdCents
     FROM commercial_invoices
     LEFT JOIN commercial_invoice_lots ON commercial_invoice_lots.commercial_invoice_id = commercial_invoices.id
     LEFT JOIN lots ON lots.id = commercial_invoice_lots.lot_id
     GROUP BY commercial_invoices.id
     ORDER BY commercial_invoices.issued_at DESC, commercial_invoices.invoice_number DESC LIMIT ? OFFSET ?`,
  ).bind(pageLimit, pageOffset).all();
  return context.json({ items: result.results, limit: pageLimit, offset: pageOffset });
});

operationsRoutes.get('/transport-invoices', async (context) => {
  const pageLimit = limit(context); const pageOffset = offset(context);
  const result = await context.env.DB.prepare(
    `SELECT transport_invoices.id, transport_invoices.invoice_number AS invoiceNumber,
      transport_invoices.issued_at AS issuedAt, transport_invoices.amount_usd_cents AS amountUsdCents,
      transport_invoices.detraction_percent AS detractionPercent,
      transport_invoices.detraction_pen_cents AS detractionPenCents, transport_invoices.status,
      carriers.legal_name AS carrier, carriers.document_number AS ruc,
      GROUP_CONCAT(DISTINCT guides.gre_original) AS guides,
      COALESCE((SELECT SUM(payments.amount_cents) FROM payments WHERE payments.transport_invoice_id = transport_invoices.id AND payments.payment_type = 'TRANSPORTE' AND payments.currency = 'USD' AND payments.status = 'CONFIRMADO'), 0) AS paidUsdCents
     FROM transport_invoices
     JOIN counterparties carriers ON carriers.id = transport_invoices.carrier_id
     LEFT JOIN transport_invoice_guides ON transport_invoice_guides.transport_invoice_id = transport_invoices.id
     LEFT JOIN guides ON guides.id = transport_invoice_guides.guide_id
     GROUP BY transport_invoices.id
     ORDER BY transport_invoices.issued_at DESC, transport_invoices.invoice_number DESC LIMIT ? OFFSET ?`,
  ).bind(pageLimit, pageOffset).all();
  return context.json({ items: result.results, limit: pageLimit, offset: pageOffset });
});

operationsRoutes.get('/exchange-rates', async (context) => {
  const pageLimit = limit(context); const pageOffset = offset(context);
  const result = await context.env.DB.prepare('SELECT id, rate_date AS rateDate, source, usd_to_pen AS usdToPen, created_at AS createdAt FROM exchange_rates ORDER BY rate_date DESC LIMIT ? OFFSET ?').bind(pageLimit, pageOffset).all();
  return context.json({ items: result.results, limit: pageLimit, offset: pageOffset });
});

operationsRoutes.get('/discounts', async (context) => {
  const pageLimit = limit(context); const pageOffset = offset(context);
  const result = await context.env.DB.prepare(
    `SELECT discounts.id, discounts.discount_type AS discountType, discounts.amount_usd_cents AS amountUsdCents,
      discounts.reason, guides.gre_original AS gre, lots.code AS lotCode, settlements.id AS settlementId
     FROM discounts JOIN guides ON guides.id = discounts.guide_id
     LEFT JOIN lots ON lots.id = discounts.lot_id
     LEFT JOIN settlements ON settlements.id = discounts.settlement_id
     ORDER BY discounts.created_at DESC LIMIT ? OFFSET ?`,
  ).bind(pageLimit, pageOffset).all();
  return context.json({ items: result.results, limit: pageLimit, offset: pageOffset });
});

operationsRoutes.get('/audit', async (context) => {
  const pageLimit = limit(context); const pageOffset = offset(context);
  const result = await context.env.DB.prepare(
    `SELECT id, actor_username AS actorUsername, actor_source AS actorSource, action,
      entity_type AS entityType, entity_id AS entityId, reason, created_at AS createdAt
     FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  ).bind(pageLimit, pageOffset).all();
  return context.json({ items: result.results, limit: pageLimit, offset: pageOffset });
});

operationsRoutes.get('/test-data', async (context) => {
  const pageLimit = limit(context); const pageOffset = offset(context);
  const result = await context.env.DB.prepare(
    `SELECT batches.id, batches.label, batches.is_test_data AS isTestData,
      batches.source_row_count AS sourceRowCount, batches.structured_entity_count AS structuredEntityCount,
      batches.created_by AS createdBy, batches.created_at AS createdAt,
      COUNT(issues.id) AS openIssueCount
     FROM test_data_import_batches batches
     LEFT JOIN test_data_quality_issues issues ON issues.batch_id = batches.id AND issues.status = 'ABIERTA'
     GROUP BY batches.id ORDER BY batches.created_at DESC LIMIT ? OFFSET ?`,
  ).bind(pageLimit, pageOffset).all();
  return context.json({ items: result.results, limit: pageLimit, offset: pageOffset });
});

operationsRoutes.get('/test-data/:batchId/source-rows', async (context) => {
  const pageLimit = limit(context);
  const pageOffset = offset(context);
  const batch = await context.env.DB.prepare('SELECT id, label, source_row_count AS sourceRowCount FROM test_data_import_batches WHERE id = ?').bind(context.req.param('batchId')).first();
  if (!batch) throw new HttpError(404, 'El lote de prueba no existe.', 'TEST_DATA_BATCH_NOT_FOUND');
  const [rows, issues] = await Promise.all([
    context.env.DB.prepare(
      `SELECT id, source_file AS sourceFile, sheet_name AS sheetName, source_row_number AS sourceRowNumber,
        values_json AS valuesJson, formulas_json AS formulasJson
       FROM test_data_source_rows WHERE batch_id = ?
       ORDER BY source_file, sheet_name, source_row_number LIMIT ? OFFSET ?`,
    ).bind(context.req.param('batchId'), pageLimit, pageOffset).all(),
    context.env.DB.prepare(
      `SELECT id, severity, category, source_file AS sourceFile, sheet_name AS sheetName,
        source_row_number AS sourceRowNumber, description, details_json AS detailsJson, status
       FROM test_data_quality_issues WHERE batch_id = ? ORDER BY severity DESC, source_file, sheet_name, source_row_number`,
    ).bind(context.req.param('batchId')).all(),
  ]);
  return context.json({ batch, items: rows.results, issues: issues.results, offset: pageOffset, limit: pageLimit });
});
