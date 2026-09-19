import { describe, expect, it } from 'vitest';

import { resolveActor } from '../../worker/auth/actor';

describe('resolveActor', () => {
  it('accepts the local actor header only in development', async () => {
    await expect(
      resolveActor(
        new Request('https://app.test', { headers: { 'x-dev-actor': 'admin@test.pe' } }),
        undefined,
        'development',
      ),
    ).resolves.toEqual({ email: 'admin@test.pe', source: 'local' });

    await expect(
      resolveActor(
        new Request('https://app.test', { headers: { 'x-dev-actor': 'admin@test.pe' } }),
        undefined,
        'production',
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
