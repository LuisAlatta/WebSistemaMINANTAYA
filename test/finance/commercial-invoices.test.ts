import { applyD1Migrations, createExecutionContext, env } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import worker from '../../worker';

type D1Migration = { name: string; queries: string[] };
describe('commercial invoices API', () => {
  beforeAll(async () => { await applyD1Migrations(env.DB, inject<D1Migration[]>('d1Migrations')); });
  it('creates an invoice for up to four lots and audits it', async () => {
    await env.DB.prepare("INSERT INTO guides (id, gre_original, gre_normalized, issued_at, status) VALUES (?, ?, ?, ?, 'LIQUIDADA')").bind('invoice-guide', 'QA-FAC-001', 'QA-FAC-001', '2026-09-18T00:00:00.000Z').run();
    await env.DB.prepare("INSERT INTO lots (id, code, status, created_at, updated_at) VALUES (?, ?, 'ACTIVO', ?, ?)").bind('invoice-lot', 'LOT-FAC-1', '2026-09-18T00:00:00.000Z', '2026-09-18T00:00:00.000Z').run();
    await env.DB.prepare("INSERT INTO guide_lots (id, guide_id, lot_id, sequence, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").bind('invoice-link', 'invoice-guide', 'invoice-lot', '2026-09-18T00:00:00.000Z', '2026-09-18T00:00:00.000Z').run();
    const response = await worker.fetch(new Request('https://app.test/api/commercial-invoices', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ invoiceNumber: 'F001-0001', issuedAt: '2026-09-18T00:00:00.000Z', amountUsdCents: 125000, lotIds: ['invoice-lot'] }) }), env, createExecutionContext());
    expect(response.status).toBe(201);
    expect(await env.DB.prepare('SELECT invoice_number, amount_usd_cents FROM commercial_invoices').first()).toMatchObject({ invoice_number: 'F001-0001', amount_usd_cents: 125000 });
  });
});
