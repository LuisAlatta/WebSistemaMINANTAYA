import { HttpError } from '../http/errors';

export type Actor = {
  email: string;
  source: 'access' | 'local';
};

type AccessIdentity = Pick<CloudflareAccessIdentity, 'email'> | undefined;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function resolveActor(
  request: Request,
  accessIdentity: Promise<AccessIdentity> | undefined,
  appEnv: string,
): Promise<Actor> {
  if (appEnv === 'development') {
    const localEmail = request.headers.get('x-dev-actor')?.trim().toLowerCase();
    if (localEmail && emailPattern.test(localEmail)) {
      return { email: localEmail, source: 'local' };
    }
  }

  const identity = await accessIdentity;
  const accessEmail = identity?.email?.trim().toLowerCase();
  if (accessEmail && emailPattern.test(accessEmail)) {
    return { email: accessEmail, source: 'access' };
  }

  throw new HttpError(403, 'Se requiere una identidad de administrador válida.', 'ACTOR_REQUIRED');
}
