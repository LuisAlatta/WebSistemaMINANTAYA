import { createMiddleware } from 'hono/factory';

import { resolveActor, type Actor } from '../auth/actor';

export type AppVariables = {
  actor: Actor;
};

export const requireActor = createMiddleware<{
  Bindings: Env;
  Variables: AppVariables;
}>(async (context, next) => {
  const path = new URL(context.req.url).pathname;
  if (path === '/api/health' || path === '/api/auth/setup' || path === '/api/auth/login' || path === '/api/auth/me' || path === '/api/auth/logout') {
    return next();
  }

  const actor = await resolveActor(context.req.raw, undefined, context.env.APP_ENV, context.env.DB);
  context.set('actor', actor);
  return next();
});
