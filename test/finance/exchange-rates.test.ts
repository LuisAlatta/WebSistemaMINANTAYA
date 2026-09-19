import { applyD1Migrations, createExecutionContext, env } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import worker from '../../worker';
type D1Migration = { name: string; queries: string[] };
describe('exchange rates API', () => {
  beforeAll(async () => { await applyD1Migrations(env.DB, inject<D1Migration[]>('d1Migrations')); });
  it('registers the daily Caja Arequipa USD to PEN rate with an audit record', async () => {
    const response = await worker.fetch(new Request('https://app.test/api/exchange-rates', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-actor': 'admin@test.pe' }, body: JSON.stringify({ rateDate: '2026-09-19', usdToPen: 3.74 }) }), env, createExecutionContext());
    expect(response.status).toBe(201);
    expect(await env.DB.prepare('SELECT source, usd_to_pen FROM exchange_rates').first()).toMatchObject({ source: 'Caja Arequipa', usd_to_pen: 3.74 });
  });
});
