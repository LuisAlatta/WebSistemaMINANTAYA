import { Hono } from 'hono';

import { HttpError } from './http/errors';
import { requireActor, type AppVariables } from './http/middleware';
import { guideRoutes } from './guides/routes';
import { financeRoutes } from './finance/routes';
import { dashboardRoutes } from './dashboard/routes';
import { auditRoutes } from './audit/routes';
import { documentRoutes } from './documents/routes';
import { settlementGuideRoutes, settlementRoutes } from './settlements/routes';
import { masterRoutes } from './masters/routes';
import { authRoutes } from './auth/routes';

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.onError((error, context) => {
  if (error instanceof HttpError) {
    return new Response(JSON.stringify({ error: error.code, message: error.message }), {
      status: error.status,
      headers: { 'content-type': 'application/json; charset=UTF-8' },
    });
  }

  const detail = error instanceof Error ? error.message.slice(0, 500) : 'Error no identificable';
  console.error(error);
  context.executionCtx.waitUntil(
    context.env.DB.prepare(
      `INSERT INTO audit_logs (
        id, actor_username, actor_source, action, entity_type, entity_id, reason, created_at
      ) VALUES (?, 'system', 'system', 'FAILED', 'request', ?, ?, ?)`,
    ).bind(crypto.randomUUID(), context.req.path, detail, new Date().toISOString()).run().catch(() => undefined),
  );
  return context.json({ error: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado.' }, 500);
});

app.use('/api/*', requireActor);

app.get('/api/health', (context) => context.json({ status: 'ok' }));
app.route('/api/auth', authRoutes);
app.route('/api/guides', guideRoutes);
app.route('/api', financeRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/audit-logs', auditRoutes);
app.route('/api/documents', documentRoutes);
app.route('/api/guides', settlementGuideRoutes);
app.route('/api/purchase-proposals', settlementRoutes);
app.route('/api', masterRoutes);

export default {
  fetch(request, env, context) {
    return app.fetch(request, env, context);
  },
} satisfies ExportedHandler<Env>;
