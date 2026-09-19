import { z } from 'zod';

import type { Actor } from '../auth/actor';
import { prepareAuditLog } from '../audit/audit-log';
import { executeAtomically } from '../db/client';
import { HttpError } from '../http/errors';

export const assayReportSchema = z.object({
  reportNumber: z.string().trim().min(1).max(100).optional(),
  source: z.enum(['PLANTA', 'EXTERNO']),
  results: z.array(z.object({ lotId: z.string().uuid(), element: z.string().trim().min(1).max(20), resultValue: z.number().finite(), unit: z.string().trim().min(1).max(20) })).min(1),
});

export async function recordAssayReport(db: D1Database, actor: Actor, guideId: string, input: z.infer<typeof assayReportSchema>) {
  const guide = await db.prepare('SELECT id, status FROM guides WHERE id = ?').bind(guideId).first<{ id: string; status: string }>();
  if (!guide) throw new HttpError(404, 'La guía no existe.', 'GUIDE_NOT_FOUND');
  if (guide.status !== 'LEYES_PENDIENTES') throw new HttpError(409, 'La guía debe estar pendiente de leyes.', 'GUIDE_NOT_READY_FOR_ASSAY');
  const lotIds = new Set((await db.prepare('SELECT lot_id FROM guide_lots WHERE guide_id = ?').bind(guideId).all<{ lot_id: string }>()).results.map((row) => row.lot_id));
  if (input.results.some((result) => !lotIds.has(result.lotId))) throw new HttpError(400, 'Todos los resultados deben pertenecer a lotes de la guía.', 'INVALID_ASSAY_LOT');

  const now = new Date().toISOString();
  const reportId = crypto.randomUUID();
  const after = { id: reportId, guideId, reportNumber: input.reportNumber ?? null, source: input.source, resultCount: input.results.length };
  const statements: D1PreparedStatement[] = [
    db.prepare('INSERT INTO assay_reports (id, guide_id, report_number, reported_at, received_at, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(reportId, guideId, input.reportNumber ?? null, now, now, 'RECIBIDO', input.source, now, now),
    db.prepare('UPDATE guides SET status = ?, updated_at = ? WHERE id = ?').bind('LEYES_RECIBIDAS', now, guideId),
    db.prepare('INSERT INTO guide_events (id, guide_id, event_type, occurred_at, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), guideId, 'ESTADO_CAMBIADO', now, JSON.stringify({ before: 'LEYES_PENDIENTES', after: 'LEYES_RECIBIDAS', reportId }), now),
    prepareAuditLog({ db, actor, action: 'CREATED', entityType: 'assay_report', entityId: reportId, after, occurredAt: now }),
    prepareAuditLog({ db, actor, action: 'STATUS_CHANGED', entityType: 'guide', entityId: guideId, before: { status: 'LEYES_PENDIENTES' }, after: { status: 'LEYES_RECIBIDAS' }, occurredAt: now }),
  ];
  for (const result of input.results) {
    const resultId = crypto.randomUUID();
    statements.push(db.prepare('INSERT INTO assay_results (id, assay_report_id, lot_id, element, result_value, unit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(resultId, reportId, result.lotId, result.element.toUpperCase(), result.resultValue, result.unit, now), prepareAuditLog({ db, actor, action: 'CREATED', entityType: 'assay_result', entityId: resultId, after: result, occurredAt: now }));
  }
  await executeAtomically(db, statements);
  return { id: reportId, guideId, status: 'RECIBIDO', resultCount: input.results.length };
}
