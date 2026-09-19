import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it } from 'vitest';

import { writeAuditLog } from '../../worker/audit/audit-log';

type D1Migration = { name: string; queries: string[] };

describe('audit log', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject<D1Migration[]>('d1Migrations'));
  });

  it('records before and after JSON for a guide status change', async () => {
    await writeAuditLog({
      db: env.DB,
      actor: { email: 'admin@test.pe', source: 'local' },
      entityType: 'guide',
      entityId: 'g1',
      action: 'STATUS_CHANGED',
      before: { status: 'EMITIDA' },
      after: { status: 'EN_PLANTA' },
    });

    const row = await env.DB.prepare(
      'SELECT actor_email, action, before_json, after_json FROM audit_logs WHERE entity_id = ?',
    )
      .bind('g1')
      .first();

    expect(row).toMatchObject({
      actor_email: 'admin@test.pe',
      action: 'STATUS_CHANGED',
      before_json: JSON.stringify({ status: 'EMITIDA' }),
      after_json: JSON.stringify({ status: 'EN_PLANTA' }),
    });
  });
});
