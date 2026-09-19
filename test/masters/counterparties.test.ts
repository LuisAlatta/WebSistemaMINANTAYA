import { applyD1Migrations, createExecutionContext, env } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import worker from '../../worker';
type D1Migration = { name: string; queries: string[] };
describe('counterparties API', () => {
  beforeAll(async () => { await applyD1Migrations(env.DB, inject<D1Migration[]>('d1Migrations')); });
  it('registers a supplier and lists active counterparties', async () => {
    const created = await worker.fetch(new Request('https://app.test/api/counterparties', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ type: 'PROVEEDOR', legalName: 'Proveedor QA SAC', documentNumber: '20123456789' }) }), env, createExecutionContext());
    expect(created.status).toBe(201);
    const listed = await worker.fetch(new Request('https://app.test/api/counterparties?type=PROVEEDOR'), env, createExecutionContext());
    await expect(listed.json()).resolves.toMatchObject({ items: [expect.objectContaining({ legalName: 'Proveedor QA SAC', type: 'PROVEEDOR' })] });
  });
});
