import { Hono } from 'hono';
import { z } from 'zod';

import { prepareAuditLog } from '../audit/audit-log';
import { executeAtomically } from '../db/client';
import type { AppVariables } from '../http/middleware';
import { HttpError } from '../http/errors';

const invoiceSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(100),
  issuedAt: z.iso.datetime({ offset: true }),
  amountUsdCents: z.int().nonnegative(),
  detractionPercent: z.number().min(0).max(1).default(0.1),
  detractionPenCents: z.int().nonnegative().default(0),
  lotIds: z.array(z.string().min(1)).min(1).max(4),
}).superRefine((value, context) => {
  if (new Set(value.lotIds).size !== value.lotIds.length) context.addIssue({ code: 'custom', path: ['lotIds'], message: 'No puede repetir lotes.' });
});

const transportInvoiceSchema = z.object({
  carrierId: z.string().min(1),
  invoiceNumber: z.string().trim().min(1).max(100),
  issuedAt: z.iso.datetime({ offset: true }),
  amountUsdCents: z.int().nonnegative(),
  detractionPenCents: z.int().nonnegative(),
  guideIds: z.array(z.string().min(1)).min(1),
}).superRefine((value, context) => {
  if (new Set(value.guideIds).size !== value.guideIds.length) context.addIssue({ code: 'custom', path: ['guideIds'], message: 'No puede repetir guías.' });
});

const paymentSchema = z.object({
  paymentType: z.enum(['COMERCIAL', 'TRANSPORTE', 'DETRACCION_COMERCIAL', 'DETRACCION_TRANSPORTE']),
  commercialInvoiceId: z.string().min(1).optional(),
  transportInvoiceId: z.string().min(1).optional(),
  paidAt: z.iso.datetime({ offset: true }),
  currency: z.enum(['USD', 'PEN']),
  amountCents: z.int().positive(),
  reference: z.string().trim().max(120).optional(),
}).superRefine((value, context) => {
  if (Boolean(value.commercialInvoiceId) === Boolean(value.transportInvoiceId)) context.addIssue({ code: 'custom', message: 'Debe indicar una sola factura.' });
  if (value.paymentType.includes('TRANSPORTE') !== Boolean(value.transportInvoiceId)) context.addIssue({ code: 'custom', message: 'El tipo de pago no coincide con la factura.' });
});

const exchangeRateSchema = z.object({ rateDate: z.iso.date(), usdToPen: z.number().positive().max(20) });
const cancellationSchema = z.object({ reason: z.string().trim().min(3).max(1_000) });

export const financeRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

financeRoutes.post('/commercial-invoices', async (context) => {
  const parsed = invoiceSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  const input = parsed.data;
  const placeholders = input.lotIds.map(() => '?').join(', ');
  const lots = await context.env.DB.prepare(`SELECT id FROM lots WHERE id IN (${placeholders})`).bind(...input.lotIds).all<{ id: string }>();
  if (lots.results.length !== input.lotIds.length) throw new HttpError(400, 'Uno o más lotes no existen.', 'LOT_NOT_FOUND');
  const used = await context.env.DB.prepare(`SELECT lot_id FROM commercial_invoice_lots WHERE lot_id IN (${placeholders})`).bind(...input.lotIds).all();
  if (used.results.length) throw new HttpError(409, 'Uno o más lotes ya fueron facturados.', 'LOT_ALREADY_INVOICED');
  const id = crypto.randomUUID(); const now = new Date().toISOString(); const actor = context.get('actor');
  const after = { id, invoiceNumber: input.invoiceNumber, amountUsdCents: input.amountUsdCents, lotIds: input.lotIds };
  const statements: D1PreparedStatement[] = [
    context.env.DB.prepare('INSERT INTO commercial_invoices (id, invoice_number, issued_at, amount_usd_cents, detraction_percent, detraction_pen_cents, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, input.invoiceNumber, input.issuedAt, input.amountUsdCents, input.detractionPercent, input.detractionPenCents, 'EMITIDA', now, now),
    prepareAuditLog({ db: context.env.DB, actor, action: 'CREATED', entityType: 'commercial_invoice', entityId: id, after, occurredAt: now }),
  ];
  for (const lotId of input.lotIds) {
    const linkId = crypto.randomUUID();
    statements.push(context.env.DB.prepare('INSERT INTO commercial_invoice_lots (id, commercial_invoice_id, lot_id, amount_usd_cents, created_at) VALUES (?, ?, ?, ?, ?)').bind(linkId, id, lotId, Math.floor(input.amountUsdCents / input.lotIds.length), now), prepareAuditLog({ db: context.env.DB, actor, action: 'CREATED', entityType: 'commercial_invoice_lot', entityId: linkId, after: { invoiceId: id, lotId }, occurredAt: now }));
  }
  try { await executeAtomically(context.env.DB, statements); } catch (error) { if (error instanceof Error && error.message.includes('commercial_invoices.invoice_number')) throw new HttpError(409, 'La factura comercial ya existe.', 'INVOICE_ALREADY_EXISTS'); throw error; }
  return context.json({ ...after, status: 'EMITIDA' }, 201);
});

financeRoutes.post('/transport-invoices', async (context) => {
  const parsed = transportInvoiceSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  const input = parsed.data; const db = context.env.DB;
  const carrier = await db.prepare("SELECT id FROM counterparties WHERE id = ? AND type = 'TRANSPORTISTA' AND active = 1").bind(input.carrierId).first();
  if (!carrier) throw new HttpError(400, 'El transportista no existe o no está activo.', 'INVALID_CARRIER');
  const placeholders = input.guideIds.map(() => '?').join(', ');
  const guides = await db.prepare(`SELECT id FROM guides WHERE id IN (${placeholders}) AND status <> 'ANULADA'`).bind(...input.guideIds).all<{ id: string }>();
  if (guides.results.length !== input.guideIds.length) throw new HttpError(400, 'Una o más guías no existen o fueron anuladas.', 'INVALID_TRANSPORT_GUIDE');
  const id = crypto.randomUUID(); const now = new Date().toISOString(); const actor = context.get('actor');
  const after = { id, carrierId: input.carrierId, invoiceNumber: input.invoiceNumber, amountUsdCents: input.amountUsdCents, guideIds: input.guideIds };
  const statements: D1PreparedStatement[] = [
    db.prepare('INSERT INTO transport_invoices (id, carrier_id, invoice_number, issued_at, amount_usd_cents, detraction_percent, detraction_pen_cents, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, input.carrierId, input.invoiceNumber, input.issuedAt, input.amountUsdCents, 0.04, input.detractionPenCents, 'REGISTRADA', now, now),
    prepareAuditLog({ db, actor, action: 'CREATED', entityType: 'transport_invoice', entityId: id, after, occurredAt: now }),
  ];
  for (const guideId of input.guideIds) {
    const linkId = crypto.randomUUID();
    statements.push(db.prepare('INSERT INTO transport_invoice_guides (id, transport_invoice_id, guide_id, amount_usd_cents, created_at) VALUES (?, ?, ?, ?, ?)').bind(linkId, id, guideId, Math.floor(input.amountUsdCents / input.guideIds.length), now), prepareAuditLog({ db, actor, action: 'CREATED', entityType: 'transport_invoice_guide', entityId: linkId, after: { invoiceId: id, guideId }, occurredAt: now }));
  }
  try { await executeAtomically(db, statements); } catch (error) { if (error instanceof Error && error.message.includes('transport_invoices.carrier_id')) throw new HttpError(409, 'La factura de transporte ya existe para este transportista.', 'TRANSPORT_INVOICE_ALREADY_EXISTS'); throw error; }
  return context.json({ ...after, status: 'REGISTRADA', detractionPercent: 0.04 }, 201);
});

financeRoutes.post('/payments', async (context) => {
  const parsed = paymentSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  const input = parsed.data; const db = context.env.DB; const actor = context.get('actor'); const now = new Date().toISOString();
  const isTransport = Boolean(input.transportInvoiceId);
  const invoice = await db.prepare(isTransport ? 'SELECT id, amount_usd_cents, status FROM transport_invoices WHERE id = ?' : 'SELECT id, amount_usd_cents, status FROM commercial_invoices WHERE id = ?').bind(input.transportInvoiceId ?? input.commercialInvoiceId).first<{ id: string; amount_usd_cents: number; status: string }>();
  if (!invoice || invoice.status === 'ANULADA') throw new HttpError(400, 'La factura no existe o fue anulada.', 'INVALID_PAYMENT_INVOICE');
  const id = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db.prepare('INSERT INTO payments (id, payment_type, commercial_invoice_id, transport_invoice_id, paid_at, currency, amount_cents, reference, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, input.paymentType, input.commercialInvoiceId ?? null, input.transportInvoiceId ?? null, input.paidAt, input.currency, input.amountCents, input.reference ?? null, 'CONFIRMADO', now, now),
    prepareAuditLog({ db, actor, action: 'CREATED', entityType: 'payment', entityId: id, after: input, occurredAt: now }),
  ];
  if (input.currency === 'USD' && !input.paymentType.startsWith('DETRACCION')) {
    const total = await db.prepare(isTransport ? "SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payments WHERE transport_invoice_id = ? AND currency = 'USD' AND status = 'CONFIRMADO'" : "SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payments WHERE commercial_invoice_id = ? AND currency = 'USD' AND status = 'CONFIRMADO'").bind(invoice.id).first<{ total: number }>();
    if ((total?.total ?? 0) + input.amountCents >= invoice.amount_usd_cents) {
      statements.push(db.prepare(isTransport ? "UPDATE transport_invoices SET status = 'PAGADA', updated_at = ? WHERE id = ?" : "UPDATE commercial_invoices SET status = 'PAGADA', updated_at = ? WHERE id = ?").bind(now, invoice.id), prepareAuditLog({ db, actor, action: 'STATUS_CHANGED', entityType: isTransport ? 'transport_invoice' : 'commercial_invoice', entityId: invoice.id, before: { status: invoice.status }, after: { status: 'PAGADA' }, occurredAt: now }));
    }
  }
  await executeAtomically(db, statements);
  return context.json({ id, status: 'CONFIRMADO' }, 201);
});

financeRoutes.post('/exchange-rates', async (context) => {
  const parsed = exchangeRateSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  const input = parsed.data; const db = context.env.DB; const actor = context.get('actor'); const now = new Date().toISOString();
  const previous = await db.prepare('SELECT id, usd_to_pen FROM exchange_rates WHERE rate_date = ?').bind(input.rateDate).first<{ id: string; usd_to_pen: number }>();
  const id = previous?.id ?? crypto.randomUUID();
  const after = { id, rateDate: input.rateDate, usdToPen: input.usdToPen, source: 'Caja Arequipa' };
  await executeAtomically(db, [
    previous
      ? db.prepare('UPDATE exchange_rates SET usd_to_pen = ?, source = ?, updated_at = ? WHERE id = ?').bind(input.usdToPen, 'Caja Arequipa', now, id)
      : db.prepare('INSERT INTO exchange_rates (id, rate_date, source, usd_to_pen, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, input.rateDate, 'Caja Arequipa', input.usdToPen, now, now),
    prepareAuditLog({ db, actor, action: previous ? 'UPDATED' : 'CREATED', entityType: 'exchange_rate', entityId: id, before: previous ? { usdToPen: previous.usd_to_pen } : undefined, after, occurredAt: now }),
  ]);
  return context.json(after, previous ? 200 : 201);
});

async function cancelInvoice(
  db: D1Database,
  actor: AppVariables['actor'],
  kind: 'commercial' | 'transport',
  id: string,
  reason: string,
) {
  const table = kind === 'commercial' ? 'commercial_invoices' : 'transport_invoices';
  const paymentColumn = kind === 'commercial' ? 'commercial_invoice_id' : 'transport_invoice_id';
  const entityType = kind === 'commercial' ? 'commercial_invoice' : 'transport_invoice';
  const invoice = await db.prepare(`SELECT id, status FROM ${table} WHERE id = ?`).bind(id).first<{ id: string; status: string }>();
  if (!invoice) throw new HttpError(404, 'La factura no existe.', 'INVOICE_NOT_FOUND');
  if (invoice.status === 'ANULADA') throw new HttpError(409, 'La factura ya está anulada.', 'INVOICE_ALREADY_CANCELLED');
  const payments = await db.prepare("SELECT COUNT(*) AS total FROM payments WHERE " + paymentColumn + " = ? AND status = 'CONFIRMADO'").bind(id).first<{ total: number }>();
  if ((payments?.total ?? 0) > 0) throw new HttpError(409, 'Primero debe anular los pagos confirmados de esta factura.', 'INVOICE_HAS_CONFIRMED_PAYMENTS');
  const now = new Date().toISOString(); const before = { id, status: invoice.status }; const after = { id, status: 'ANULADA', reason };
  await executeAtomically(db, [
    db.prepare(`UPDATE ${table} SET status = 'ANULADA', void_reason = ?, updated_at = ? WHERE id = ?`).bind(reason, now, id),
    prepareAuditLog({ db, actor, action: 'CANCELLED', entityType, entityId: id, before, after, reason, occurredAt: now }),
  ]);
  return after;
}

financeRoutes.post('/commercial-invoices/:id/cancel', async (context) => {
  const parsed = cancellationSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  return context.json(await cancelInvoice(context.env.DB, context.get('actor'), 'commercial', context.req.param('id'), parsed.data.reason));
});

financeRoutes.post('/transport-invoices/:id/cancel', async (context) => {
  const parsed = cancellationSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  return context.json(await cancelInvoice(context.env.DB, context.get('actor'), 'transport', context.req.param('id'), parsed.data.reason));
});

financeRoutes.post('/payments/:id/cancel', async (context) => {
  const parsed = cancellationSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  const db = context.env.DB; const payment = await db.prepare('SELECT id, payment_type, commercial_invoice_id AS commercialInvoiceId, transport_invoice_id AS transportInvoiceId, status FROM payments WHERE id = ?').bind(context.req.param('id')).first<{ id: string; payment_type: string; commercialInvoiceId: string | null; transportInvoiceId: string | null; status: string }>();
  if (!payment) throw new HttpError(404, 'El pago no existe.', 'PAYMENT_NOT_FOUND');
  if (payment.status === 'ANULADO') throw new HttpError(409, 'El pago ya está anulado.', 'PAYMENT_ALREADY_CANCELLED');
  const now = new Date().toISOString(); const before = { id: payment.id, status: payment.status }; const after = { id: payment.id, status: 'ANULADO', reason: parsed.data.reason };
  const isTransport = Boolean(payment.transportInvoiceId); const invoiceId = payment.transportInvoiceId ?? payment.commercialInvoiceId;
  const table = isTransport ? 'transport_invoices' : 'commercial_invoices'; const paymentColumn = isTransport ? 'transport_invoice_id' : 'commercial_invoice_id';
  const statements: D1PreparedStatement[] = [
    db.prepare("UPDATE payments SET status = 'ANULADO', updated_at = ? WHERE id = ?").bind(now, payment.id),
    prepareAuditLog({ db, actor: context.get('actor'), action: 'CANCELLED', entityType: 'payment', entityId: payment.id, before, after, reason: parsed.data.reason, occurredAt: now }),
  ];
  if (invoiceId) {
    const invoice = await db.prepare(`SELECT amount_usd_cents AS amountUsdCents, status FROM ${table} WHERE id = ?`).bind(invoiceId).first<{ amountUsdCents: number; status: string }>();
    const paid = await db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payments WHERE ${paymentColumn} = ? AND payment_type IN ('COMERCIAL', 'TRANSPORTE') AND currency = 'USD' AND status = 'CONFIRMADO'`).bind(invoiceId).first<{ total: number }>();
    if (invoice?.status === 'PAGADA' && (paid?.total ?? 0) < invoice.amountUsdCents) statements.push(
      db.prepare(`UPDATE ${table} SET status = 'EMITIDA', updated_at = ? WHERE id = ?`).bind(now, invoiceId),
      prepareAuditLog({ db, actor: context.get('actor'), action: 'STATUS_CHANGED', entityType: isTransport ? 'transport_invoice' : 'commercial_invoice', entityId: invoiceId, before: { status: 'PAGADA' }, after: { status: 'EMITIDA' }, occurredAt: now }),
    );
  }
  await executeAtomically(db, statements);
  return context.json(after);
});
