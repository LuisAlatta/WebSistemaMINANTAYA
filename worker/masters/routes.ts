import { Hono } from 'hono';
import { z } from 'zod';

import { prepareAuditLog } from '../audit/audit-log';
import { executeAtomically } from '../db/client';
import type { AppVariables } from '../http/middleware';
import { HttpError } from '../http/errors';

const counterpartySchema = z.object({ type: z.enum(['PROVEEDOR', 'TRANSPORTISTA', 'LABORATORIO', 'CLIENTE']), legalName: z.string().trim().min(2).max(200), documentNumber: z.string().trim().min(8).max(20).optional(), contactName: z.string().trim().max(120).optional(), contactEmail: z.string().email().optional(), contactPhone: z.string().trim().max(30).optional() });

export const masterRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

masterRoutes.get('/counterparties', async (context) => {
  const type = context.req.query('type');
  const result = await (type
    ? context.env.DB.prepare('SELECT id, type, legal_name AS legalName, document_number AS documentNumber, contact_name AS contactName, contact_email AS contactEmail, contact_phone AS contactPhone FROM counterparties WHERE active = 1 AND type = ? ORDER BY legal_name').bind(type)
    : context.env.DB.prepare('SELECT id, type, legal_name AS legalName, document_number AS documentNumber, contact_name AS contactName, contact_email AS contactEmail, contact_phone AS contactPhone FROM counterparties WHERE active = 1 ORDER BY legal_name')
  ).all();
  return context.json({ items: result.results });
});

masterRoutes.post('/counterparties', async (context) => {
  const parsed = counterpartySchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }, 400);
  const value = parsed.data; const id = crypto.randomUUID(); const now = new Date().toISOString(); const db = context.env.DB;
  const after = { id, ...value };
  try { await executeAtomically(db, [
    db.prepare('INSERT INTO counterparties (id, type, legal_name, document_number, contact_name, contact_email, contact_phone, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)').bind(id, value.type, value.legalName, value.documentNumber ?? null, value.contactName ?? null, value.contactEmail ?? null, value.contactPhone ?? null, now, now),
    prepareAuditLog({ db, actor: context.get('actor'), action: 'CREATED', entityType: 'counterparty', entityId: id, after, occurredAt: now }),
  ]); } catch (error) { if (error instanceof Error && error.message.includes('counterparties.type')) throw new HttpError(409, 'Ya existe una contraparte con ese documento y tipo.', 'COUNTERPARTY_ALREADY_EXISTS'); throw error; }
  return context.json(after, 201);
});
