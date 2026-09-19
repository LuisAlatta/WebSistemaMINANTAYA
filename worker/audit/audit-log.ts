import type { Actor } from '../auth/actor';
import { executeAtomically } from '../db/client';

export type AuditInput = {
  db: D1Database;
  actor: Actor;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  id?: string;
  occurredAt?: string;
};

function stringifySnapshot(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

export function prepareAuditLog(input: AuditInput): D1PreparedStatement {
  return input.db
    .prepare(
      `INSERT INTO audit_logs (
        id, actor_email, actor_source, action, entity_type, entity_id,
        before_json, after_json, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id ?? crypto.randomUUID(),
      input.actor.email,
      input.actor.source,
      input.action,
      input.entityType,
      input.entityId,
      stringifySnapshot(input.before),
      stringifySnapshot(input.after),
      input.reason ?? null,
      input.occurredAt ?? new Date().toISOString(),
    );
}

export async function writeAuditLog(input: AuditInput): Promise<void> {
  await executeAtomically(input.db, [prepareAuditLog(input)]);
}
