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

  it('records a rejection and an auditable discount without deleting the commercial history', async () => {
    const now = '2026-09-19T00:00:00.000Z';
    await env.DB.prepare("INSERT INTO guides (id, gre_original, gre_normalized, issued_at, status) VALUES (?, ?, ?, ?, 'PROPUESTA_PENDIENTE')").bind('proposal-reject-guide', 'QA-PROP-002', 'QA-PROP-002', now).run();
    const created = await worker.fetch(new Request('https://app.test/api/guides/proposal-reject-guide/purchase-proposals', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ proposalNumber: 'PC-002', issuedAt: now, amountUsdCents: 250000 }) }), env, createExecutionContext());
    const proposal = (await created.json()) as { id: string };
    const rejected = await worker.fetch(new Request(`https://app.test/api/purchase-proposals/${proposal.id}/reject`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ reason: 'Proveedor solicita corrección de valores.' }) }), env, createExecutionContext());
    expect(rejected.status).toBe(200);
    await expect(env.DB.prepare('SELECT status FROM purchase_proposals WHERE id = ?').bind(proposal.id).first()).resolves.toMatchObject({ status: 'RECHAZADA' });

    const discount = await worker.fetch(new Request('https://app.test/api/guides/proposal-reject-guide/discounts', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ discountType: 'TRANSPORTE', amountUsdCents: 1250, reason: 'Ajuste de flete por TMH.' }) }), env, createExecutionContext());
    expect(discount.status).toBe(201);
    await expect(env.DB.prepare('SELECT discount_type, amount_usd_cents FROM discounts WHERE guide_id = ?').bind('proposal-reject-guide').first()).resolves.toMatchObject({ discount_type: 'TRANSPORTE', amount_usd_cents: 1250 });
  });
});
