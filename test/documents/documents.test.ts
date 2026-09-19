import { applyD1Migrations, createExecutionContext, env } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import worker from '../../worker';
type D1Migration = { name: string; queries: string[] };
describe('documents API', () => {
  beforeAll(async () => { await applyD1Migrations(env.DB, inject<D1Migration[]>('d1Migrations')); });
  it('stores a document in R2 and indexes its metadata', async () => {
    const now = '2026-09-19T00:00:00.000Z';
    await env.DB.prepare("INSERT INTO guides (id, gre_original, gre_normalized, issued_at, status) VALUES (?, ?, ?, ?, 'EMITIDA')").bind('document-guide', 'QA-DOC-001', 'QA-DOC-001', now).run();
    const response = await worker.fetch(new Request('https://app.test/api/documents/doc-test-001?guideId=document-guide', { method: 'PUT', headers: { 'content-type': 'application/pdf', 'x-file-name': 'reporte.pdf', 'x-document-type': 'REPORTE_LEYES', 'x-dev-actor': 'admin@test.pe' }, body: 'archivo de prueba' }), env, createExecutionContext());
    expect(response.status).toBe(201);
    expect(await env.DOCUMENTS.get('documents/doc-test-001')).not.toBeNull();
    expect(await env.DB.prepare('SELECT file_name FROM documents WHERE id = ?').bind('doc-test-001').first()).toMatchObject({ file_name: 'reporte.pdf' });
  });
});
