import { applyD1Migrations, createExecutionContext, env } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it } from 'vitest';

import worker from '../../worker';

type D1Migration = { name: string; queries: string[] };

describe('operational read API', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject<D1Migration[]>('d1Migrations'));
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO plants (id, code, legal_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind('operations-plant', 'OPERATIONS', 'Planta de operaciones', '2026-09-19T00:00:00.000Z', '2026-09-19T00:00:00.000Z'),
      env.DB.prepare("INSERT OR IGNORE INTO counterparties (id, type, legal_name, created_at, updated_at) VALUES (?, 'TRANSPORTISTA', ?, ?, ?)").bind('operations-carrier', 'Transportes de prueba', '2026-09-19T00:00:00.000Z', '2026-09-19T00:00:00.000Z'),
      env.DB.prepare("INSERT OR IGNORE INTO guides (id, gre_original, gre_normalized, plant_id, carrier_id, issued_at, status) VALUES (?, ?, ?, ?, ?, ?, 'FACTURADA')").bind('operations-guide', 'EG07 - 999', 'EG07-999', 'operations-plant', 'operations-carrier', '2026-09-19T00:00:00.000Z'),
      env.DB.prepare("INSERT OR IGNORE INTO lots (id, code, sack_count, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVO', ?, ?)").bind('operations-lot', 'PPO 99999', 50, '2026-09-19T00:00:00.000Z', '2026-09-19T00:00:00.000Z'),
      env.DB.prepare('INSERT OR IGNORE INTO guide_lots (id, guide_id, lot_id, sequence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind('operations-guide-lot', 'operations-guide', 'operations-lot', 1, '2026-09-19T00:00:00.000Z', '2026-09-19T00:00:00.000Z'),
      env.DB.prepare("INSERT OR IGNORE INTO lots (id, code, sack_count, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVO', ?, ?)").bind('operations-lot-2', 'PPO 99998', 50, '2026-09-19T00:00:00.000Z', '2026-09-19T00:00:00.000Z'),
      env.DB.prepare('INSERT OR IGNORE INTO commercial_invoices (id, invoice_number, issued_at, amount_usd_cents, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind('operations-commercial-invoice', 'E001-OPERATIONS', '2026-09-19T00:00:00.000Z', 2000, 'PAGADA', '2026-09-19T00:00:00.000Z', '2026-09-19T00:00:00.000Z'),
      env.DB.prepare('INSERT OR IGNORE INTO commercial_invoice_lots (id, commercial_invoice_id, lot_id, amount_usd_cents, created_at) VALUES (?, ?, ?, ?, ?)').bind('operations-commercial-invoice-lot-1', 'operations-commercial-invoice', 'operations-lot', 1000, '2026-09-19T00:00:00.000Z'),
      env.DB.prepare('INSERT OR IGNORE INTO commercial_invoice_lots (id, commercial_invoice_id, lot_id, amount_usd_cents, created_at) VALUES (?, ?, ?, ?, ?)').bind('operations-commercial-invoice-lot-2', 'operations-commercial-invoice', 'operations-lot-2', 1000, '2026-09-19T00:00:00.000Z'),
      env.DB.prepare("INSERT OR IGNORE INTO payments (id, payment_type, commercial_invoice_id, paid_at, currency, amount_cents, status, created_at, updated_at) VALUES (?, 'COMERCIAL', ?, ?, 'USD', ?, 'CONFIRMADO', ?, ?)").bind('operations-commercial-payment', 'operations-commercial-invoice', '2026-09-19T00:00:00.000Z', 1000, '2026-09-19T00:00:00.000Z', '2026-09-19T00:00:00.000Z'),
    ]);
  });

  it('does not multiply a payment when the invoice has multiple lots', async () => {
    const response = await worker.fetch(
      new Request('https://app.test/api/operations/commercial-invoices', { headers: { 'x-dev-actor': 'admin@test.pe' } }),
      env,
      createExecutionContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: 'operations-commercial-invoice', paidUsdCents: 1000 })]),
    });
  });

  it('returns guides with their plant, carrier and lots for the operational table', async () => {
    const response = await worker.fetch(
      new Request('https://app.test/api/operations/guides', { headers: { 'x-dev-actor': 'admin@test.pe' } }),
      env,
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          id: 'operations-guide',
          gre: 'EG07 - 999',
          plant: 'OPERATIONS',
          carrier: 'Transportes de prueba',
          lotCount: 1,
          lots: 'PPO 99999',
        }),
      ]),
    });
  });

  it('keeps imported source rows and their observations visible by batch', async () => {
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO test_data_import_batches (id, label, source_manifest_json, source_row_count, structured_entity_count, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind('operations-batch', 'Carga de prueba', '[]', 1, 0, 'admin@test.pe', '2026-09-19T00:00:00.000Z'),
      env.DB.prepare('INSERT OR IGNORE INTO test_data_source_rows (id, batch_id, source_file, sheet_name, source_row_number, values_json, formulas_json, row_checksum, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind('operations-source-row', 'operations-batch', 'CONTROL GUIAS.xlsx', 'Control', 3, '["EG07-999"]', '{}', 'checksum', '2026-09-19T00:00:00.000Z'),
    ]);
    const response = await worker.fetch(
      new Request('https://app.test/api/operations/test-data/operations-batch/source-rows', { headers: { 'x-dev-actor': 'admin@test.pe' } }),
      env,
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [expect.objectContaining({ sourceFile: 'CONTROL GUIAS.xlsx', sourceRowNumber: 3 })],
    });
  });
});
