import { Hono } from 'hono';
import { z } from 'zod';

import { prepareAuditLog } from '../audit/audit-log';
import { executeAtomically } from '../db/client';
import type { AppVariables } from '../http/middleware';
import { HttpError } from '../http/errors';

const proposalSchema = z.object({ proposalNumber: z.string().trim().min(1).max(100).optional(), issuedAt: z.iso.datetime({ offset: true }), amountUsdCents: z.int().nonnegative(), notes: z.string().trim().max(2_000).optional() });
const settlementSchema = z.object({
  purchaseProposalId: z.string().min(1).optional(), grossUsdCents: z.int().nonnegative(), deductionsUsdCents: z.int().nonnegative(), netUsdCents: z.int().nonnegative(),
  lines: z.array(z.object({ lineType: z.enum(['METAL', 'DESCUENTO', 'PENALIDAD', 'AJUSTE', 'OTRO']), description: z.string().trim().min(1).max(300), amountUsdCents: z.int() })).min(1),
}).superRefine((value, context) => { if (value.netUsdCents !== value.grossUsdCents - value.deductionsUsdCents) context.addIssue({ code: 'custom', path: ['netUsdCents'], message: 'El neto debe ser igual al bruto menos descuentos.' }); });
const reasonSchema = z.object({ reason: z.string().trim().min(3).max(1_000) });
const discountSchema = z.object({
  settlementId: z.string().min(1).optional(),
  lotId: z.string().min(1).optional(),
  discountType: z.enum(['TRANSPORTE', 'MAQUILA', 'HUMEDAD', 'IMPUREZA', 'PENALIDAD', 'OTRO']),
  amountUsdCents: z.int().nonnegative(),
  reason: z.string().trim().min(3).max(1_000),
});

export const settlementGuideRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
export const settlementRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

settlementGuideRoutes.post('/:guideId/purchase-proposals', async (context) => {
  const parsed = proposalSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  const input = parsed.data; const db = context.env.DB; const guideId = context.req.param('guideId');
  const guide = await db.prepare('SELECT id, status FROM guides WHERE id = ?').bind(guideId).first<{ id: string; status: string }>();
  if (!guide) throw new HttpError(404, 'La guía no existe.', 'GUIDE_NOT_FOUND');
  if (guide.status !== 'PROPUESTA_PENDIENTE') throw new HttpError(409, 'La guía no está lista para una propuesta de compra.', 'GUIDE_NOT_READY_FOR_PROPOSAL');
  const id = crypto.randomUUID(); const now = new Date().toISOString(); const after = { id, guideId, amountUsdCents: input.amountUsdCents, status: 'ENVIADA' };
  await executeAtomically(db, [
    db.prepare('INSERT INTO purchase_proposals (id, guide_id, proposal_number, issued_at, status, amount_usd_cents, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, guideId, input.proposalNumber ?? null, input.issuedAt, 'ENVIADA', input.amountUsdCents, input.notes ?? null, now, now),
    prepareAuditLog({ db, actor: context.get('actor'), action: 'CREATED', entityType: 'purchase_proposal', entityId: id, after, occurredAt: now }),
  ]);
  return context.json(after, 201);
});

settlementGuideRoutes.post('/:guideId/settlements', async (context) => {
  const parsed = settlementSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  const input = parsed.data; const db = context.env.DB; const guideId = context.req.param('guideId');
  const guide = await db.prepare('SELECT id, status FROM guides WHERE id = ?').bind(guideId).first<{ id: string; status: string }>();
  if (!guide) throw new HttpError(404, 'La guía no existe.', 'GUIDE_NOT_FOUND');
  if (guide.status !== 'CONFORME') throw new HttpError(409, 'La guía debe estar conforme para liquidar.', 'GUIDE_NOT_READY_FOR_SETTLEMENT');
  if (input.purchaseProposalId) { const proposal = await db.prepare("SELECT id FROM purchase_proposals WHERE id = ? AND guide_id = ? AND status = 'APROBADA'").bind(input.purchaseProposalId, guideId).first(); if (!proposal) throw new HttpError(400, 'La propuesta aprobada no corresponde a esta guía.', 'INVALID_SETTLEMENT_PROPOSAL'); }
  const id = crypto.randomUUID(); const now = new Date().toISOString(); const actor = context.get('actor'); const after = { id, guideId, ...input, status: 'EMITIDA' };
  const statements: D1PreparedStatement[] = [
    db.prepare('INSERT INTO settlements (id, guide_id, purchase_proposal_id, status, settled_at, gross_usd_cents, deductions_usd_cents, net_usd_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, guideId, input.purchaseProposalId ?? null, 'EMITIDA', now, input.grossUsdCents, input.deductionsUsdCents, input.netUsdCents, now, now),
    db.prepare("UPDATE guides SET status = 'LIQUIDADA', updated_at = ? WHERE id = ?").bind(now, guideId),
    prepareAuditLog({ db, actor, action: 'CREATED', entityType: 'settlement', entityId: id, after, occurredAt: now }),
    prepareAuditLog({ db, actor, action: 'STATUS_CHANGED', entityType: 'guide', entityId: guideId, before: { status: guide.status }, after: { status: 'LIQUIDADA' }, occurredAt: now }),
  ];
  for (const line of input.lines) { const lineId = crypto.randomUUID(); statements.push(db.prepare('INSERT INTO settlement_lines (id, settlement_id, line_type, description, amount_usd_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(lineId, id, line.lineType, line.description, line.amountUsdCents, now), prepareAuditLog({ db, actor, action: 'CREATED', entityType: 'settlement_line', entityId: lineId, after: line, occurredAt: now })); }
  await executeAtomically(db, statements);
  return context.json({ id, guideId, status: 'EMITIDA', netUsdCents: input.netUsdCents }, 201);
});

settlementRoutes.post('/:id/approve', async (context) => {
  const db = context.env.DB; const proposal = await db.prepare('SELECT id, guide_id, status FROM purchase_proposals WHERE id = ?').bind(context.req.param('id')).first<{ id: string; guide_id: string; status: string }>();
  if (!proposal) throw new HttpError(404, 'La propuesta no existe.', 'PROPOSAL_NOT_FOUND');
  if (proposal.status !== 'ENVIADA') throw new HttpError(409, 'La propuesta no puede aprobarse en su estado actual.', 'PROPOSAL_NOT_APPROVABLE');
  const now = new Date().toISOString(); const actor = context.get('actor');
  await executeAtomically(db, [
    db.prepare("UPDATE purchase_proposals SET status = 'APROBADA', approved_at = ?, updated_at = ? WHERE id = ?").bind(now, now, proposal.id),
    db.prepare("UPDATE guides SET status = 'CONFORME', updated_at = ? WHERE id = ?").bind(now, proposal.guide_id),
    db.prepare("INSERT INTO guide_events (id, guide_id, event_type, occurred_at, detail_json, created_at) VALUES (?, ?, 'ESTADO_CAMBIADO', ?, ?, ?)").bind(crypto.randomUUID(), proposal.guide_id, now, JSON.stringify({ before: 'PROPUESTA_PENDIENTE', after: 'CONFORME', proposalId: proposal.id }), now),
    prepareAuditLog({ db, actor, action: 'STATUS_CHANGED', entityType: 'purchase_proposal', entityId: proposal.id, before: { status: proposal.status }, after: { status: 'APROBADA' }, occurredAt: now }),
    prepareAuditLog({ db, actor, action: 'STATUS_CHANGED', entityType: 'guide', entityId: proposal.guide_id, before: { status: 'PROPUESTA_PENDIENTE' }, after: { status: 'CONFORME' }, occurredAt: now }),
  ]);
  return context.json({ id: proposal.id, status: 'APROBADA' });
});

settlementRoutes.post('/:id/reject', async (context) => {
  const parsed = reasonSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  const db = context.env.DB; const proposal = await db.prepare('SELECT id, guide_id, status FROM purchase_proposals WHERE id = ?').bind(context.req.param('id')).first<{ id: string; guide_id: string; status: string }>();
  if (!proposal) throw new HttpError(404, 'La propuesta no existe.', 'PROPOSAL_NOT_FOUND');
  if (proposal.status !== 'ENVIADA') throw new HttpError(409, 'La propuesta no puede rechazarse en su estado actual.', 'PROPOSAL_NOT_REJECTABLE');
  const now = new Date().toISOString(); const actor = context.get('actor'); const after = { id: proposal.id, status: 'RECHAZADA', reason: parsed.data.reason };
  await executeAtomically(db, [
    db.prepare("UPDATE purchase_proposals SET status = 'RECHAZADA', updated_at = ? WHERE id = ?").bind(now, proposal.id),
    db.prepare("INSERT INTO guide_events (id, guide_id, event_type, occurred_at, detail_json, created_at) VALUES (?, ?, 'OBSERVACION', ?, ?, ?)").bind(crypto.randomUUID(), proposal.guide_id, now, JSON.stringify({ proposalId: proposal.id, ...after }), now),
    prepareAuditLog({ db, actor, action: 'STATUS_CHANGED', entityType: 'purchase_proposal', entityId: proposal.id, before: { id: proposal.id, status: proposal.status }, after, reason: parsed.data.reason, occurredAt: now }),
  ]);
  return context.json(after);
});

settlementGuideRoutes.post('/:guideId/discounts', async (context) => {
  const parsed = discountSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  const input = parsed.data; const db = context.env.DB; const guideId = context.req.param('guideId');
  const guide = await db.prepare('SELECT id FROM guides WHERE id = ?').bind(guideId).first<{ id: string }>();
  if (!guide) throw new HttpError(404, 'La guía no existe.', 'GUIDE_NOT_FOUND');
  if (input.lotId) {
    const lot = await db.prepare('SELECT id FROM guide_lots WHERE guide_id = ? AND lot_id = ?').bind(guideId, input.lotId).first();
    if (!lot) throw new HttpError(400, 'El lote no pertenece a esta guía.', 'INVALID_DISCOUNT_LOT');
  }
  if (input.settlementId) {
    const settlement = await db.prepare('SELECT id FROM settlements WHERE id = ? AND guide_id = ?').bind(input.settlementId, guideId).first();
    if (!settlement) throw new HttpError(400, 'La liquidación no corresponde a esta guía.', 'INVALID_DISCOUNT_SETTLEMENT');
  }
  const id = crypto.randomUUID(); const now = new Date().toISOString(); const after = { id, guideId, ...input };
  await executeAtomically(db, [
    db.prepare('INSERT INTO discounts (id, settlement_id, guide_id, lot_id, discount_type, amount_usd_cents, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, input.settlementId ?? null, guideId, input.lotId ?? null, input.discountType, input.amountUsdCents, input.reason, now, now),
    prepareAuditLog({ db, actor: context.get('actor'), action: 'CREATED', entityType: 'discount', entityId: id, after, reason: input.reason, occurredAt: now }),
  ]);
  return context.json(after, 201);
});
