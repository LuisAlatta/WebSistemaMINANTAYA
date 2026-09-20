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

  it('advances a resample and closes a five-step dispute with traceability', async () => {
    await env.DB.prepare("INSERT INTO guides (id, gre_original, gre_normalized, issued_at, status) VALUES (?, ?, ?, ?, 'LEYES_RECIBIDAS')").bind('quality-progress', 'QA-EX-002', 'QA-EX-002', '2026-09-18T00:00:00.000Z').run();
    const created = await worker.fetch(new Request('https://app.test/api/guides/quality-progress/resamples', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ reason: 'Se requiere una segunda lectura.' }) }), env, createExecutionContext());
    const resample = (await created.json()) as { id: string };
    for (const status of ['COORDINADO', 'ENVIADO_LABORATORIO']) {
      const progressed = await worker.fetch(new Request(`https://app.test/api/guides/quality-progress/resamples/${resample.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ status }) }), env, createExecutionContext());
      expect(progressed.status).toBe(200);
    }

    const disputeCreated = await worker.fetch(new Request('https://app.test/api/guides/quality-progress/disputes', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ reason: 'Se debe dirimir el resultado con planta.' }) }), env, createExecutionContext());
    const dispute = (await disputeCreated.json()) as { id: string };
    for (const stage of ['MUESTRAS_ENVIADAS', 'ANALISIS_LIMA', 'RESULTADO_RECIBIDO']) {
      const updated = await worker.fetch(new Request(`https://app.test/api/guides/quality-progress/disputes/${dispute.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ stage }) }), env, createExecutionContext());
      expect(updated.status).toBe(200);
    }
    const closed = await worker.fetch(new Request(`https://app.test/api/guides/quality-progress/disputes/${dispute.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ stage: 'CERRADA', resolution: 'La planta aceptó la dirimencia.' }) }), env, createExecutionContext());
    expect(closed.status).toBe(200);
    await expect(env.DB.prepare('SELECT stage, closed_at FROM disputes WHERE id = ?').bind(dispute.id).first()).resolves.toMatchObject({ stage: 'CERRADA' });
  });
});
