import { applyD1Migrations, createExecutionContext, env } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it } from 'vitest';

import worker from '../../worker';

type D1Migration = { name: string; queries: string[] };

describe('assay reports API', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject<D1Migration[]>('d1Migrations'));
  });

  it('records laws by lot and moves the guide to LEYES_RECIBIDAS', async () => {
    const created = await worker.fetch(
      new Request('https://app.test/api/guides', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' },
        body: JSON.stringify({ gre: 'QA-LEYES-001', issuedAt: '2026-09-18T00:00:00.000Z', lots: [{ code: 'LOTE-LEY-1' }] }),
      }), env, createExecutionContext(),
    );
    const guide = (await created.json()) as { id: string };
    const lot = await env.DB.prepare('SELECT lot_id FROM guide_lots WHERE guide_id = ?').bind(guide.id).first<{ lot_id: string }>();
    await worker.fetch(new Request(`https://app.test/api/guides/${guide.id}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ status: 'EN_PLANTA' }) }), env, createExecutionContext());
    await worker.fetch(new Request(`https://app.test/api/guides/${guide.id}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ status: 'LEYES_PENDIENTES' }) }), env, createExecutionContext());

    const response = await worker.fetch(
      new Request(`https://app.test/api/guides/${guide.id}/assay-reports`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' },
        body: JSON.stringify({ reportNumber: 'RL-001', source: 'PLANTA', results: [{ lotId: lot?.lot_id, element: 'Au', resultValue: 3.4, unit: 'g/t' }] }),
      }), env, createExecutionContext(),
    );

    expect(response.status).toBe(201);
    expect(await env.DB.prepare('SELECT status FROM guides WHERE id = ?').bind(guide.id).first()).toMatchObject({ status: 'LEYES_RECIBIDAS' });
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM assay_results').first()).toMatchObject({ total: 1 });
  });
});
