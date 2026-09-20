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

export const qualityExceptionSchema = z.object({ reason: z.string().trim().min(3).max(1_000) });
export const resampleProgressSchema = z.object({ status: z.enum(['COORDINADO', 'ENVIADO_LABORATORIO', 'RESULTADO_RECIBIDO', 'CERRADO']) });
export const disputeProgressSchema = z.object({
  stage: z.enum(['MUESTRAS_ENVIADAS', 'ANALISIS_LIMA', 'RESULTADO_RECIBIDO', 'CERRADA']),
  resolution: z.string().trim().min(3).max(1_000).optional(),
}).superRefine((value, context) => {
  if (value.stage === 'CERRADA' && !value.resolution) context.addIssue({ code: 'custom', path: ['resolution'], message: 'La resolución es obligatoria al cerrar la dirimencia.' });
});

const resampleTransitions: Record<string, readonly string[]> = {
  SOLICITADO: ['COORDINADO'], COORDINADO: ['ENVIADO_LABORATORIO'], ENVIADO_LABORATORIO: ['RESULTADO_RECIBIDO'], RESULTADO_RECIBIDO: ['CERRADO'], CERRADO: [],
};
const disputeTransitions: Record<string, readonly string[]> = {
  INICIADA: ['MUESTRAS_ENVIADAS'], MUESTRAS_ENVIADAS: ['ANALISIS_LIMA'], ANALISIS_LIMA: ['RESULTADO_RECIBIDO'], RESULTADO_RECIBIDO: ['CERRADA'], CERRADA: [],
};

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

async function guideForException(db: D1Database, guideId: string, targetStatus: 'REMUESTREO' | 'DIRIMENCIA') {
  const guide = await db.prepare('SELECT id, status FROM guides WHERE id = ?').bind(guideId).first<{ id: string; status: string }>();
  if (!guide) throw new HttpError(404, 'La guía no existe.', 'GUIDE_NOT_FOUND');
  const allowed = targetStatus === 'REMUESTREO' ? ['LEYES_RECIBIDAS', 'PROPUESTA_PENDIENTE'] : ['LEYES_RECIBIDAS', 'PROPUESTA_PENDIENTE', 'REMUESTREO', 'CONFORME'];
  if (!allowed.includes(guide.status)) throw new HttpError(409, 'La guía no permite esta excepción en su estado actual.', 'INVALID_QUALITY_EXCEPTION');
  return guide;
}

export async function openResample(db: D1Database, actor: Actor, guideId: string, reason: string) {
  const guide = await guideForException(db, guideId, 'REMUESTREO');
  const now = new Date().toISOString(); const id = crypto.randomUUID();
  await executeAtomically(db, [
    db.prepare('INSERT INTO resamples (id, guide_id, reason, status, requested_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, guideId, reason, 'SOLICITADO', now, now, now),
    db.prepare('UPDATE guides SET status = ?, updated_at = ? WHERE id = ?').bind('REMUESTREO', now, guideId),
    prepareAuditLog({ db, actor, action: 'CREATED', entityType: 'resample', entityId: id, after: { guideId, reason, status: 'SOLICITADO' }, occurredAt: now }),
    prepareAuditLog({ db, actor, action: 'STATUS_CHANGED', entityType: 'guide', entityId: guideId, before: { status: guide.status }, after: { status: 'REMUESTREO' }, reason, occurredAt: now }),
  ]);
  return { id, status: 'SOLICITADO' };
}

export async function openDispute(db: D1Database, actor: Actor, guideId: string, reason: string) {
  const guide = await guideForException(db, guideId, 'DIRIMENCIA');
  const now = new Date().toISOString(); const id = crypto.randomUUID();
  await executeAtomically(db, [
    db.prepare('INSERT INTO disputes (id, guide_id, reason, stage, opened_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, guideId, reason, 'INICIADA', now, now, now),
    db.prepare('UPDATE guides SET status = ?, updated_at = ? WHERE id = ?').bind('DIRIMENCIA', now, guideId),
    prepareAuditLog({ db, actor, action: 'CREATED', entityType: 'dispute', entityId: id, after: { guideId, reason, stage: 'INICIADA' }, occurredAt: now }),
    prepareAuditLog({ db, actor, action: 'STATUS_CHANGED', entityType: 'guide', entityId: guideId, before: { status: guide.status }, after: { status: 'DIRIMENCIA' }, reason, occurredAt: now }),
  ]);
  return { id, stage: 'INICIADA' };
}

export async function progressResample(
  db: D1Database,
  actor: Actor,
  guideId: string,
  resampleId: string,
  status: z.infer<typeof resampleProgressSchema>['status'],
) {
  const row = await db.prepare('SELECT id, status FROM resamples WHERE id = ? AND guide_id = ?').bind(resampleId, guideId).first<{ id: string; status: string }>();
  if (!row) throw new HttpError(404, 'El remuestreo no pertenece a la guía.', 'RESAMPLE_NOT_FOUND');
  if (!resampleTransitions[row.status]?.includes(status)) throw new HttpError(409, 'La etapa del remuestreo no es válida.', 'INVALID_RESAMPLE_TRANSITION');
  const now = new Date().toISOString();
  const before = { id: row.id, status: row.status };
  const after = { id: row.id, status };
  const statements: D1PreparedStatement[] = [
    db.prepare('UPDATE resamples SET status = ?, resolved_at = ?, updated_at = ? WHERE id = ?').bind(status, status === 'CERRADO' ? now : null, now, row.id),
    prepareAuditLog({ db, actor, action: 'STATUS_CHANGED', entityType: 'resample', entityId: row.id, before, after, occurredAt: now }),
  ];
  if (status === 'CERRADO') {
    statements.push(
      db.prepare("UPDATE guides SET status = 'LEYES_RECIBIDAS', updated_at = ? WHERE id = ?").bind(now, guideId),
      prepareAuditLog({ db, actor, action: 'STATUS_CHANGED', entityType: 'guide', entityId: guideId, before: { status: 'REMUESTREO' }, after: { status: 'LEYES_RECIBIDAS' }, occurredAt: now }),
    );
  }
  await executeAtomically(db, statements);
  return after;
}

export async function progressDispute(
  db: D1Database,
  actor: Actor,
  guideId: string,
  disputeId: string,
  input: z.infer<typeof disputeProgressSchema>,
) {
  const row = await db.prepare('SELECT id, stage FROM disputes WHERE id = ? AND guide_id = ?').bind(disputeId, guideId).first<{ id: string; stage: string }>();
  if (!row) throw new HttpError(404, 'La dirimencia no pertenece a la guía.', 'DISPUTE_NOT_FOUND');
  if (!disputeTransitions[row.stage]?.includes(input.stage)) throw new HttpError(409, 'La etapa de dirimencia no es válida.', 'INVALID_DISPUTE_TRANSITION');
  const now = new Date().toISOString();
  const before = { id: row.id, stage: row.stage };
  const after = { id: row.id, stage: input.stage, resolution: input.resolution ?? null };
  const statements: D1PreparedStatement[] = [
    db.prepare('UPDATE disputes SET stage = ?, closed_at = ?, resolution = ?, updated_at = ? WHERE id = ?').bind(input.stage, input.stage === 'CERRADA' ? now : null, input.resolution ?? null, now, row.id),
    prepareAuditLog({ db, actor, action: 'STATUS_CHANGED', entityType: 'dispute', entityId: row.id, before, after, occurredAt: now }),
  ];
  if (input.stage === 'CERRADA') {
    statements.push(
      db.prepare("UPDATE guides SET status = 'LEYES_RECIBIDAS', updated_at = ? WHERE id = ?").bind(now, guideId),
      prepareAuditLog({ db, actor, action: 'STATUS_CHANGED', entityType: 'guide', entityId: guideId, before: { status: 'DIRIMENCIA' }, after: { status: 'LEYES_RECIBIDAS' }, reason: input.resolution, occurredAt: now }),
    );
  }
  await executeAtomically(db, statements);
  return after;
}
