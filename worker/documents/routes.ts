import { Hono } from 'hono';

import { prepareAuditLog } from '../audit/audit-log';
import { executeAtomically } from '../db/client';
import type { AppVariables } from '../http/middleware';
import { HttpError } from '../http/errors';

const documentTypes = new Set(['GUIA', 'REPORTE_LEYES', 'PROPUESTA', 'LIQUIDACION', 'FACTURA_COMERCIAL', 'FACTURA_TRANSPORTE', 'PAGO', 'OTRO']);
const maxFileBytes = 15 * 1024 * 1024;

export const documentRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

documentRoutes.put('/:id', async (context) => {
  const id = context.req.param('id');
  if (!/^[A-Za-z0-9-]{1,80}$/.test(id)) throw new HttpError(400, 'El identificador de documento no es válido.', 'INVALID_DOCUMENT_ID');
  const fileName = context.req.header('x-file-name')?.trim();
  const documentType = context.req.header('x-document-type')?.trim() ?? 'OTRO';
  if (!fileName || fileName.includes('/') || fileName.includes('\\') || !documentTypes.has(documentType)) throw new HttpError(400, 'Los metadatos del documento no son válidos.', 'INVALID_DOCUMENT_METADATA');
  const content = await context.req.raw.arrayBuffer();
  if (content.byteLength === 0 || content.byteLength > maxFileBytes) throw new HttpError(400, 'El archivo debe tener hasta 15 MB.', 'INVALID_DOCUMENT_SIZE');
  const guideId = context.req.query('guideId');
  if (guideId) {
    const guide = await context.env.DB.prepare('SELECT id FROM guides WHERE id = ?').bind(guideId).first();
    if (!guide) throw new HttpError(400, 'La guía indicada no existe.', 'GUIDE_NOT_FOUND');
  }
  const key = `documents/${id}`; const now = new Date().toISOString(); const contentType = context.req.header('content-type') ?? 'application/octet-stream';
  await context.env.DOCUMENTS.put(key, content, { httpMetadata: { contentType } });
  try {
    await executeAtomically(context.env.DB, [
      context.env.DB.prepare('INSERT INTO documents (id, guide_id, r2_key, file_name, content_type, size_bytes, document_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, guideId ?? null, key, fileName, contentType, content.byteLength, documentType, now),
      prepareAuditLog({ db: context.env.DB, actor: context.get('actor'), action: 'CREATED', entityType: 'document', entityId: id, after: { guideId: guideId ?? null, fileName, documentType, sizeBytes: content.byteLength }, occurredAt: now }),
    ]);
  } catch (error) { await context.env.DOCUMENTS.delete(key); throw error; }
  return context.json({ id, key, fileName, sizeBytes: content.byteLength }, 201);
});
