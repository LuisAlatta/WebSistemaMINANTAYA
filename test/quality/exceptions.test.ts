import { applyD1Migrations, createExecutionContext, env } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import worker from '../../worker';

type D1Migration = { name: string; queries: string[] };

describe('quality exceptions API', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject<D1Migration[]>('d1Migrations'));
  });

  it('opens a resample and a five-stage dispute from a report received', async () => {
    await env.DB.prepare("INSERT INTO guides (id, gre_original, gre_normalized, issued_at, status) VALUES (?, ?, ?, ?, 'LEYES_RECIBIDAS')").bind('quality-exception', 'QA-EX-001', 'QA-EX-001', '2026-09-18T00:00:00.000Z').run();
    const resample = await worker.fetch(new Request('https://app.test/api/guides/quality-exception/resamples', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ reason: 'El proveedor solicita contraste externo.' }) }), env, createExecutionContext());
    expect(resample.status).toBe(201);
    expect(await env.DB.prepare('SELECT status FROM guides WHERE id = ?').bind('quality-exception').first()).toMatchObject({ status: 'REMUESTREO' });
    const dispute = await worker.fetch(new Request('https://app.test/api/guides/quality-exception/disputes', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ reason: 'La planta rechaza negociar el lote.' }) }), env, createExecutionContext());
    expect(dispute.status).toBe(201);
    expect(await env.DB.prepare('SELECT stage FROM disputes WHERE guide_id = ?').bind('quality-exception').first()).toMatchObject({ stage: 'INICIADA' });
  });
});
