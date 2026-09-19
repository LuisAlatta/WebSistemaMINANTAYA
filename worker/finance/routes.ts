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
