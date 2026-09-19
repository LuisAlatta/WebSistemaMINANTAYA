import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import worker from '../../worker';

describe('worker health endpoint', () => {
  it('returns an explicit healthy status', async () => {
    const response = await worker.fetch(
      new Request('https://minantaya.test/api/health'),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});
