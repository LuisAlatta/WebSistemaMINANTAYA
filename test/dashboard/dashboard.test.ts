import { applyD1Migrations, createExecutionContext, env } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import worker from '../../worker';
type D1Migration = { name: string; queries: string[] };
describe('dashboard API', () => {
  beforeAll(async () => { await applyD1Migrations(env.DB, inject<D1Migration[]>('d1Migrations')); });
  it('shows operational counts and guides without transport invoice', async () => {
    await env.DB.prepare("INSERT INTO guides (id, gre_original, gre_normalized, issued_at, status) VALUES (?, ?, ?, ?, 'LEYES_PENDIENTES')").bind('dashboard-guide', 'QA-DASH-001', 'QA-DASH-001', '2026-09-15T00:00:00.000Z').run();
    const response = await worker.fetch(new Request('https://app.test/api/dashboard', { headers: { 'x-dev-actor': 'admin@test.pe' } }), env, createExecutionContext());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ pendingLaws: 1, missingTransportInvoice: 1 });
  });
});
