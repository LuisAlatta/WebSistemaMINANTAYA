import { applyD1Migrations, createExecutionContext, env } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import worker from '../../worker';
type D1Migration = { name: string; queries: string[] };
describe('purchase proposals API', () => {
  beforeAll(async () => { await applyD1Migrations(env.DB, inject<D1Migration[]>('d1Migrations')); });
  it('creates a proposal and accepts provider approval before settlement', async () => {
    const now = '2026-09-19T00:00:00.000Z';
    await env.DB.prepare("INSERT INTO guides (id, gre_original, gre_normalized, issued_at, status) VALUES (?, ?, ?, ?, 'PROPUESTA_PENDIENTE')").bind('proposal-guide', 'QA-PROP-001', 'QA-PROP-001', now).run();
    const created = await worker.fetch(new Request('https://app.test/api/guides/proposal-guide/purchase-proposals', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ proposalNumber: 'PC-001', issuedAt: now, amountUsdCents: 180000 }) }), env, createExecutionContext());
    expect(created.status).toBe(201);
    const proposal = (await created.json()) as { id: string };
    const approval = await worker.fetch(new Request(`https://app.test/api/purchase-proposals/${proposal.id}/approve`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: '{}' }), env, createExecutionContext());
    expect(approval.status).toBe(200);
    expect(await env.DB.prepare('SELECT status FROM guides WHERE id = ?').bind('proposal-guide').first()).toMatchObject({ status: 'CONFORME' });
  });
});
