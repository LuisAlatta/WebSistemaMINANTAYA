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

  it('does not cancel an invoice with confirmed payments and preserves its state', async () => {
    await env.DB.prepare("INSERT INTO commercial_invoices (id, invoice_number, issued_at, amount_usd_cents, detraction_percent, detraction_pen_cents, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'EMITIDA', ?, ?)").bind('invoice-cancel', 'F001-0002', '2026-09-18T00:00:00.000Z', 100000, 0.1, 0, '2026-09-18T00:00:00.000Z', '2026-09-18T00:00:00.000Z').run();
    const cancelled = await worker.fetch(new Request('https://app.test/api/commercial-invoices/invoice-cancel/cancel', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ reason: 'Documento emitido por error.' }) }), env, createExecutionContext());
    expect(cancelled.status).toBe(200);

    await env.DB.prepare("INSERT INTO commercial_invoices (id, invoice_number, issued_at, amount_usd_cents, detraction_percent, detraction_pen_cents, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'EMITIDA', ?, ?)").bind('invoice-paid', 'F001-0003', '2026-09-18T00:00:00.000Z', 100000, 0.1, 0, '2026-09-18T00:00:00.000Z', '2026-09-18T00:00:00.000Z').run();
    await env.DB.prepare("INSERT INTO payments (id, payment_type, commercial_invoice_id, paid_at, currency, amount_cents, status, created_at, updated_at) VALUES (?, 'COMERCIAL', ?, ?, 'USD', ?, 'CONFIRMADO', ?, ?)").bind('paid-payment', 'invoice-paid', '2026-09-18T00:00:00.000Z', 100000, '2026-09-18T00:00:00.000Z', '2026-09-18T00:00:00.000Z').run();
    const blocked = await worker.fetch(new Request('https://app.test/api/commercial-invoices/invoice-paid/cancel', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ reason: 'No corresponde anular pago confirmado.' }) }), env, createExecutionContext());
    expect(blocked.status).toBe(409);
    const overpayment = await worker.fetch(new Request('https://app.test/api/payments', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ paymentType: 'COMERCIAL', commercialInvoiceId: 'invoice-paid', paidAt: '2026-09-18T00:00:00.000Z', currency: 'USD', amountCents: 1 }) }), env, createExecutionContext());
    expect(overpayment.status).toBe(409);
    await expect(env.DB.prepare('SELECT status FROM commercial_invoices WHERE id = ?').bind('invoice-paid').first()).resolves.toMatchObject({ status: 'EMITIDA' });
  });
});
