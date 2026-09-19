import { applyD1Migrations, createExecutionContext, env } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import worker from '../../worker';
type D1Migration = { name: string; queries: string[] };
describe('settlements API', () => {
  beforeAll(async () => { await applyD1Migrations(env.DB, inject<D1Migration[]>('d1Migrations')); });
  it('creates a balanced settlement and marks its guide as settled', async () => {
    const now = '2026-09-19T00:00:00.000Z';
    await env.DB.prepare("INSERT INTO guides (id, gre_original, gre_normalized, issued_at, status) VALUES (?, ?, ?, ?, 'CONFORME')").bind('settlement-guide', 'QA-LIQ-001', 'QA-LIQ-001', now).run();
    const response = await worker.fetch(new Request('https://app.test/api/guides/settlement-guide/settlements', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ grossUsdCents: 200000, deductionsUsdCents: 15000, netUsdCents: 185000, lines: [{ lineType: 'DESCUENTO', description: 'Maquila', amountUsdCents: -15000 }] }) }), env, createExecutionContext());
    expect(response.status).toBe(201);
    expect(await env.DB.prepare('SELECT net_usd_cents FROM settlements').first()).toMatchObject({ net_usd_cents: 185000 });
    expect(await env.DB.prepare('SELECT status FROM guides WHERE id = ?').bind('settlement-guide').first()).toMatchObject({ status: 'LIQUIDADA' });
  });
});
