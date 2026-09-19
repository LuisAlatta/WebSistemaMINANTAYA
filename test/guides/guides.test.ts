import { applyD1Migrations, createExecutionContext, env } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it } from 'vitest';

import worker from '../../worker';

type D1Migration = { name: string; queries: string[] };

describe('guides API', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject<D1Migration[]>('d1Migrations'));
  });

  it('creates a guide with normalized GRE, lots, and an audit trail', async () => {
    const response = await worker.fetch(
      new Request('https://app.test/api/guides', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dev-actor': 'admin@test.pe',
        },
        body: JSON.stringify({
          gre: 'EG07 - 365',
          issuedAt: '2026-09-18T00:00:00.000Z',
          lots: [{ code: 'L-001', sackCount: 20 }],
        }),
      }),
      env,
      createExecutionContext(),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      gre: 'EG07 - 365',
      greNormalized: 'EG07-365',
      status: 'EMITIDA',
      lotCount: 1,
    });

    const audit = await env.DB.prepare(
      "SELECT action, actor_email FROM audit_logs WHERE entity_type = 'guide' AND action = 'CREATED'",
    ).first();
    expect(audit).toMatchObject({ action: 'CREATED', actor_email: 'admin@test.pe' });
  });

  it('creates an open warning when a guide has more than six lots', async () => {
    const lots = Array.from({ length: 7 }, (_, index) => ({ code: `L-W-${index + 1}` }));
    const response = await worker.fetch(
      new Request('https://app.test/api/guides', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dev-actor': 'admin@test.pe',
        },
        body: JSON.stringify({
          gre: 'EG07-366',
          issuedAt: '2026-09-18T00:00:00.000Z',
          lots,
        }),
      }),
      env,
      createExecutionContext(),
    );

    expect(response.status).toBe(201);
    const alert = await env.DB.prepare(
      "SELECT alert_type, severity, status FROM alerts WHERE guide_id = (SELECT id FROM guides WHERE gre_normalized = 'EG07-366')",
    ).first();
    expect(alert).toMatchObject({
      alert_type: 'LOTES_SUPERADOS',
      severity: 'ADVERTENCIA',
      status: 'ABIERTA',
    });
  });

  it('changes status only through an allowed transition and records it', async () => {
    const created = await worker.fetch(
      new Request('https://app.test/api/guides', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' },
        body: JSON.stringify({
          gre: 'EG07-367',
          issuedAt: '2026-09-18T00:00:00.000Z',
          lots: [{ code: 'L-STATUS' }],
        }),
      }),
      env,
      createExecutionContext(),
    );
    const guide = (await created.json()) as { id: string };

    const response = await worker.fetch(
      new Request(`https://app.test/api/guides/${guide.id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' },
        body: JSON.stringify({ status: 'EN_PLANTA' }),
      }),
      env,
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'EN_PLANTA' });
    const event = await env.DB.prepare(
      "SELECT event_type FROM guide_events WHERE guide_id = ? AND event_type = 'ESTADO_CAMBIADO'",
    )
      .bind(guide.id)
      .first();
    expect(event).toMatchObject({ event_type: 'ESTADO_CAMBIADO' });
  });
});
