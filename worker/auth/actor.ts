import { HttpError } from '../http/errors';
import { findSessionUser, getSessionToken } from './auth-service';

export type Actor = {
  username: string;
  source: 'access' | 'local' | 'session' | 'system';
};

type AccessIdentity = Pick<CloudflareAccessIdentity, 'email'> | undefined;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function resolveActor(
  request: Request,
  _accessIdentity: Promise<AccessIdentity> | undefined,
  appEnv: string,
  db?: D1Database,
): Promise<Actor> {
  if (appEnv === 'development') {
    const localEmail = request.headers.get('x-dev-actor')?.trim().toLowerCase();
    if (localEmail && emailPattern.test(localEmail)) {
      return { username: localEmail, source: 'local' };
    }
  }

  if (db) {
    const token = getSessionToken(request);
    if (token) {
      const user = await findSessionUser(db, token);
      if (user) return { username: user.username, source: 'session' };
    }
  }

  throw new HttpError(403, 'Inicia sesión con una cuenta administradora.', 'ACTOR_REQUIRED');
}
