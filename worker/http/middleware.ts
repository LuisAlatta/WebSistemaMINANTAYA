import { createMiddleware } from 'hono/factory';

import { resolveActor, type Actor } from '../auth/actor';

export type AppVariables = {
  actor: Actor;
};

const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type ExecutionContextWithAccess = {
  access?: {
    getIdentity(): Promise<CloudflareAccessIdentity | undefined>;
  };
};

export const requireActor = createMiddleware<{
  Bindings: Env;
  Variables: AppVariables;
}>(async (context, next) => {
  if (!mutatingMethods.has(context.req.method)) {
    return next();
  }

  const accessIdentity = (context.executionCtx as ExecutionContextWithAccess | undefined)?.access?.getIdentity();
  const actor = await resolveActor(context.req.raw, accessIdentity, context.env.APP_ENV);
  context.set('actor', actor);
  return next();
});
