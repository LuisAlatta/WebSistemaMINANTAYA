import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it } from 'vitest';

type D1Migration = { name: string; queries: string[] };

describe('D1 schema', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject<D1Migration[]>('d1Migrations'));
  });

  it('rejects a second guide with the same normalized GRE', async () => {
    await env.DB.prepare(
      `INSERT INTO guides (id, gre_original, gre_normalized, status, issued_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind('g1', 'EG07 - 365', 'EG07-365', 'EMITIDA', '2026-09-18T00:00:00.000Z')
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO guides (id, gre_original, gre_normalized, status, issued_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind('g2', 'EG07 365', 'EG07-365', 'EMITIDA', '2026-09-18T00:00:00.000Z')
        .run(),
    ).rejects.toThrow();
  });

  it('does not allow audit records to be changed or deleted', async () => {
    await env.DB.prepare(
      `INSERT INTO audit_logs (
        id, actor_email, actor_source, action, entity_type, entity_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        'audit-immutable',
        'admin@test.pe',
        'local',
        'CREATED',
        'guide',
        'g1',
        '2026-09-18T00:00:00.000Z',
      )
      .run();

    await expect(
      env.DB.prepare('UPDATE audit_logs SET action = ? WHERE id = ?')
        .bind('ALTERED', 'audit-immutable')
        .run(),
    ).rejects.toThrow('audit_logs are immutable');

    await expect(
      env.DB.prepare('DELETE FROM audit_logs WHERE id = ?').bind('audit-immutable').run(),
    ).rejects.toThrow('audit_logs are immutable');
  });
});
