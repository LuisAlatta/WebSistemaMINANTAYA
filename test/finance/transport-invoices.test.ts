import { applyD1Migrations, createExecutionContext, env } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import worker from '../../worker';

type D1Migration = { name: string; queries: string[] };
describe('transport invoices API', () => {
  beforeAll(async () => { await applyD1Migrations(env.DB, inject<D1Migration[]>('d1Migrations')); });
  it('links a carrier invoice to its guides and records the four percent detraction', async () => {
    const now = '2026-09-18T00:00:00.000Z';
    await env.DB.prepare("INSERT INTO counterparties (id, type, legal_name, created_at, updated_at) VALUES (?, 'TRANSPORTISTA', ?, ?, ?)").bind('carrier-1', 'Transportes QA SAC', now, now).run();
    await env.DB.prepare("INSERT INTO guides (id, gre_original, gre_normalized, issued_at, status) VALUES (?, ?, ?, ?, 'EN_PLANTA')").bind('transport-guide', 'QA-TR-001', 'QA-TR-001', now).run();
    const response = await worker.fetch(new Request('https://app.test/api/transport-invoices', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ carrierId: 'carrier-1', invoiceNumber: 'T001-0001', issuedAt: now, amountUsdCents: 50000, detractionPenCents: 7400, guideIds: ['transport-guide'] }) }), env, createExecutionContext());
    expect(response.status).toBe(201);
    expect(await env.DB.prepare('SELECT detraction_percent, detraction_pen_cents FROM transport_invoices').first()).toMatchObject({ detraction_percent: 0.04, detraction_pen_cents: 7400 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM transport_invoice_guides').first()).toMatchObject({ total: 1 });
    const duplicate = await worker.fetch(new Request('https://app.test/api/transport-invoices', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ carrierId: 'carrier-1', invoiceNumber: 'T001-0003', issuedAt: now, amountUsdCents: 50000, detractionPenCents: 7400, guideIds: ['transport-guide'] }) }), env, createExecutionContext());
    expect(duplicate.status).toBe(409);
  });

  it('records transport payment and marks the invoice as paid when fully covered', async () => {
    const now = '2026-09-18T00:00:00.000Z';
    await env.DB.prepare("INSERT INTO transport_invoices (id, carrier_id, invoice_number, issued_at, amount_usd_cents, detraction_percent, detraction_pen_cents, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, .04, 0, 'REGISTRADA', ?, ?)").bind('paid-transport-invoice', 'carrier-1', 'T001-0002', now, 25000, now, now).run();
    const response = await worker.fetch(new Request('https://app.test/api/payments', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ paymentType: 'TRANSPORTE', transportInvoiceId: 'paid-transport-invoice', paidAt: now, currency: 'USD', amountCents: 25000, reference: 'OP-001' }) }), env, createExecutionContext());
    expect(response.status).toBe(201);
    expect(await env.DB.prepare('SELECT status FROM transport_invoices WHERE id = ?').bind('paid-transport-invoice').first()).toMatchObject({ status: 'PAGADA' });
  });
});
