import { applyD1Migrations, createExecutionContext, env } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import worker from '../../worker';

type D1Migration = { name: string; queries: string[] };

describe('internal user accounts', () => {
  const activationKey = 'clave-de-activacion-para-pruebas-2026';

  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject<D1Migration[]>('d1Migrations'));
    env.BOOTSTRAP_SECRET = activationKey;
  });

  it('bootstraps and logs in an administrator without an email', async () => {
    const setup = await worker.fetch(new Request('https://app.test/api/auth/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'operador1', password: 'ClaveSegura123!', activationKey }) }), env, createExecutionContext());
    expect(setup.status).toBe(201);
    const login = await worker.fetch(new Request('https://app.test/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'operador1', password: 'ClaveSegura123!' }) }), env, createExecutionContext());
    expect(login.status).toBe(200);
    expect(login.headers.get('set-cookie')).toContain('minantaya_session=');

    const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
    const unauthenticated = await worker.fetch(new Request('https://app.test/api/guides'), env, createExecutionContext());
    expect(unauthenticated.status).toBe(403);

    const guide = await worker.fetch(new Request('https://app.test/api/guides', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ gre: 'GRE-AUTH-001', issuedAt: '2026-09-19T12:00:00.000Z', lots: [{ code: 'LOTE-AUTH-001' }] }),
    }), env, createExecutionContext());
    expect(guide.status).toBe(201);

    const audit = await env.DB.prepare("SELECT actor_username AS actorUsername, actor_source AS actorSource FROM audit_logs WHERE entity_type = 'guide' ORDER BY created_at DESC LIMIT 1").first<{ actorUsername: string; actorSource: string }>();
    expect(audit).toEqual({ actorUsername: 'operador1', actorSource: 'session' });

    const unauthenticatedUserCreation = await worker.fetch(new Request('https://app.test/api/auth/users', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'operador2', password: 'OtraClaveSegura123!' }),
    }), env, createExecutionContext());
    expect(unauthenticatedUserCreation.status).toBe(403);

    const secondAdmin = await worker.fetch(new Request('https://app.test/api/auth/users', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ username: 'operador2', password: 'OtraClaveSegura123!' }),
    }), env, createExecutionContext());
    expect(secondAdmin.status).toBe(201);

    const users = await worker.fetch(new Request('https://app.test/api/auth/users', { headers: { cookie } }), env, createExecutionContext());
    await expect(users.json()).resolves.toMatchObject({ items: [expect.objectContaining({ username: 'operador1' }), expect.objectContaining({ username: 'operador2' })] });

    const thirdAdmin = await worker.fetch(new Request('https://app.test/api/auth/users', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ username: 'operador3', password: 'TerceraClaveSegura123!' }),
    }), env, createExecutionContext());
    expect(thirdAdmin.status).toBe(409);

    const logout = await worker.fetch(new Request('https://app.test/api/auth/logout', { method: 'POST', headers: { cookie } }), env, createExecutionContext());
    expect(logout.status).toBe(200);
    const afterLogout = await worker.fetch(new Request('https://app.test/api/guides', { headers: { cookie } }), env, createExecutionContext());
    expect(afterLogout.status).toBe(403);
  });

  it('requires the activation key and limits failed logins', async () => {
    const setup = await worker.fetch(new Request('https://app.test/api/auth/setup', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'intruso', password: 'ClaveSegura123!', activationKey: 'clave-invalida-para-pruebas-2026' }),
    }), env, createExecutionContext());
    expect(setup.status).toBe(403);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const login = await worker.fetch(new Request('https://app.test/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.10' }, body: JSON.stringify({ username: 'operador1', password: 'contraseña-inválida' }),
      }), env, createExecutionContext());
      expect(login.status).toBe(401);
    }
    const locked = await worker.fetch(new Request('https://app.test/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.10' }, body: JSON.stringify({ username: 'operador1', password: 'ClaveSegura123!' }),
    }), env, createExecutionContext());
    expect(locked.status).toBe(429);
  });
});
