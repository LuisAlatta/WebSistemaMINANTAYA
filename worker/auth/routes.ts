import { Hono } from 'hono';

import { prepareAuditLog } from '../audit/audit-log';
import { HttpError } from '../http/errors';
import type { AppVariables } from '../http/middleware';
import {
  authenticate,
  assertLoginAllowed,
  clearLoginAttempts,
  createPasswordRecord,
  createSession,
  credentialsSchema,
  expiredSessionCookie,
  getSessionToken,
  hashToken,
  normalizedUsername,
  loginIdentifier,
  recordFailedLogin,
  secretsEqual,
  sessionCookie,
  setupCredentialsSchema,
} from './auth-service';
import { resolveActor } from './actor';

export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

async function parseBody(context: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  return context.req.json().catch(() => {
    throw new HttpError(400, 'El cuerpo debe ser JSON válido.', 'INVALID_JSON');
  });
}

async function parseCredentials(context: { req: { json(): Promise<unknown> } }) {
  const parsed = credentialsSchema.safeParse(await parseBody(context));
  if (!parsed.success) throw new HttpError(400, 'Credenciales inválidas.', 'VALIDATION_ERROR');
  return parsed.data;
}

async function parseSetupCredentials(context: { req: { json(): Promise<unknown> } }) {
  const parsed = setupCredentialsSchema.safeParse(await parseBody(context));
  if (!parsed.success) throw new HttpError(400, 'Credenciales inválidas.', 'VALIDATION_ERROR');
  return parsed.data;
}

authRoutes.post('/setup', async (context) => {
  const credentials = await parseSetupCredentials(context);
  if (!(await secretsEqual(credentials.activationKey, context.env.BOOTSTRAP_SECRET))) {
    throw new HttpError(403, 'La clave de activación no es válida.', 'INVALID_ACTIVATION_KEY');
  }
  const count = await context.env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
  if ((count?.count ?? 0) > 0) throw new HttpError(409, 'La configuración inicial ya fue realizada.', 'SETUP_ALREADY_COMPLETED');

  const now = new Date().toISOString();
  const user = { id: crypto.randomUUID(), username: normalizedUsername(credentials.username), ...(await createPasswordRecord(credentials.password)) };
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO users (id, username, password_salt, password_hash, role, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'ADMIN', 1, ?, ?)`,
      ).bind(user.id, user.username, user.salt, user.hash, now, now),
      prepareAuditLog({
        db: context.env.DB,
        actor: { username: user.username, source: 'system' },
        action: 'CREATED',
        entityType: 'user',
        entityId: user.id,
        after: { username: user.username, role: 'ADMIN' },
        reason: 'Configuración inicial del sistema',
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    console.error('BOOTSTRAP_WRITE_FAILED', error);
    throw new HttpError(503, 'No se pudo registrar la cuenta inicial.', 'BOOTSTRAP_WRITE_FAILED');
  }

  let session: Awaited<ReturnType<typeof createSession>>;
  try {
    session = await createSession(context.env.DB, user.id);
  } catch (error) {
    console.error('BOOTSTRAP_SESSION_FAILED', error);
    throw new HttpError(503, 'La cuenta fue creada, pero no se pudo iniciar la sesión.', 'BOOTSTRAP_SESSION_FAILED');
  }
  return context.json({ username: user.username, role: 'ADMIN', expiresAt: session.expiresAt }, 201, { 'set-cookie': sessionCookie(session.token, context.env.APP_ENV) });
});

authRoutes.post('/login', async (context) => {
  const credentials = await parseCredentials(context);
  const identifier = loginIdentifier(context.req.raw, credentials.username);
  await assertLoginAllowed(context.env.DB, identifier);
  let user;
  try {
    user = await authenticate(context.env.DB, credentials.username, credentials.password);
  } catch (error) {
    if (error instanceof HttpError && error.code === 'INVALID_CREDENTIALS') await recordFailedLogin(context.env.DB, identifier);
    throw error;
  }
  await clearLoginAttempts(context.env.DB, identifier);
  const session = await createSession(context.env.DB, user.id);
  return context.json(
    { username: user.username, role: user.role, expiresAt: session.expiresAt },
    200,
    { 'set-cookie': sessionCookie(session.token, context.env.APP_ENV) },
  );
});

authRoutes.get('/me', async (context) => {
  const actor = await resolveActor(context.req.raw, undefined, context.env.APP_ENV, context.env.DB);
  return context.json({ username: actor.username, role: 'ADMIN' });
});

authRoutes.post('/logout', async (context) => {
  const token = getSessionToken(context.req.raw);
  if (token) {
    await context.env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
  }
  return context.json({ ok: true }, 200, { 'set-cookie': expiredSessionCookie() });
});

authRoutes.post('/users', async (context) => {
  const credentials = await parseCredentials(context);
  const count = await context.env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
  if ((count?.count ?? 0) >= 2) throw new HttpError(409, 'Solo se permiten dos cuentas administradoras.', 'ADMIN_LIMIT_REACHED');
  const now = new Date().toISOString();
  const user = { id: crypto.randomUUID(), username: normalizedUsername(credentials.username), ...(await createPasswordRecord(credentials.password)) };
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO users (id, username, password_salt, password_hash, role, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'ADMIN', 1, ?, ?)`,
      ).bind(user.id, user.username, user.salt, user.hash, now, now),
      prepareAuditLog({
        db: context.env.DB,
        actor: context.get('actor'),
        action: 'CREATED',
        entityType: 'user',
        entityId: user.id,
        after: { username: user.username, role: 'ADMIN' },
        occurredAt: now,
      }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed: users.username')) {
      throw new HttpError(409, 'El nombre de usuario ya existe.', 'USERNAME_ALREADY_EXISTS');
    }
    if (error instanceof Error && error.message.includes('maximum administrator accounts reached')) {
      throw new HttpError(409, 'Solo se permiten dos cuentas administradoras.', 'ADMIN_LIMIT_REACHED');
    }
    throw error;
  }
  return context.json({ username: user.username, role: 'ADMIN' }, 201);
});
