import { applyD1Migrations, createExecutionContext, env } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import worker from '../../worker';
type D1Migration = { name: string; queries: string[] };
describe('audit query API', () => {
  beforeAll(async () => { await applyD1Migrations(env.DB, inject<D1Migration[]>('d1Migrations')); });
  it('lists immutable audit records in latest-first order', async () => {
    await env.DB.prepare("INSERT INTO audit_logs (id, actor_username, actor_source, action, entity_type, entity_id, created_at) VALUES (?, ?, 'local', ?, ?, ?, ?)").bind('audit-list-1', 'admin@test.pe', 'CREATED', 'guide', 'g1', '2026-09-18T00:00:00.000Z').run();
    const response = await worker.fetch(new Request('https://app.test/api/audit-logs', { headers: { 'x-dev-actor': 'admin@test.pe' } }), env, createExecutionContext());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ items: [expect.objectContaining({ id: 'audit-list-1', actorUsername: 'admin@test.pe' })] });
  });
});
