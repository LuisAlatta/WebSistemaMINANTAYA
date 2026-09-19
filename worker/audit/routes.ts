import { Hono } from 'hono';

import type { AppVariables } from '../http/middleware';

export const auditRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

auditRoutes.get('/', async (context) => {
  const limit = Math.min(Math.max(Number(context.req.query('limit') ?? 50), 1), 200);
  const result = await context.env.DB.prepare(
    `SELECT id, actor_email AS actorEmail, actor_source AS actorSource, action,
      entity_type AS entityType, entity_id AS entityId, before_json AS beforeJson,
      after_json AS afterJson, reason, created_at AS createdAt
     FROM audit_logs ORDER BY created_at DESC LIMIT ?`,
  ).bind(limit).all();
  return context.json({ items: result.results });
});
