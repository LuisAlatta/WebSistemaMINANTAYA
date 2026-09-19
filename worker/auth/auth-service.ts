import { z } from 'zod';

import { HttpError } from '../http/errors';

const passwordIterations = 310_000;
const sessionDurationSeconds = 12 * 60 * 60;
const loginWindowMilliseconds = 15 * 60 * 1_000;
const loginLockMilliseconds = 15 * 60 * 1_000;
const maximumFailedAttempts = 5;
const textEncoder = new TextEncoder();

export const credentialsSchema = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9._-]{3,32}$/, 'El usuario debe tener entre 3 y 32 caracteres válidos.'),
  password: z.string().min(12, 'La contraseña debe tener al menos 12 caracteres.').max(128),
});

export const setupCredentialsSchema = credentialsSchema.extend({
  activationKey: z.string().min(24).max(256),
});

type StoredUser = {
  id: string;
  username: string;
  passwordSalt: string;
  passwordHash: string;
  role: 'ADMIN';
};

function toBase64(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function fromBase64(value: string): Uint8Array {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function tokenValue(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

async function derivePasswordHash(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: passwordIterations },
    key,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(token));
  return toBase64(new Uint8Array(digest));
}

export async function createPasswordRecord(password: string): Promise<{ salt: string; hash: string }> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toBase64(saltBytes), hash: await derivePasswordHash(password, saltBytes) };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const calculated = await derivePasswordHash(password, fromBase64(salt));
  const calculatedBytes = fromBase64(calculated);
  const expectedBytes = fromBase64(expectedHash);
  if (calculatedBytes.length !== expectedBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < calculatedBytes.length; index += 1) difference |= calculatedBytes[index] ^ expectedBytes[index];
  return difference === 0;
}

export function normalizedUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function getSessionToken(request: Request): string | null {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  const entry = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('minantaya_session='));
  return entry ? entry.slice('minantaya_session='.length) : null;
}

export async function findSessionUser(db: D1Database, token: string): Promise<Pick<StoredUser, 'username' | 'role'> | null> {
  const session = await db.prepare(
    `SELECT users.username AS username, users.role AS role
     FROM auth_sessions
     JOIN users ON users.id = auth_sessions.user_id
     WHERE auth_sessions.token_hash = ? AND auth_sessions.expires_at > ? AND users.active = 1`,
  ).bind(await hashToken(token), new Date().toISOString()).first<Pick<StoredUser, 'username' | 'role'>>();
  return session ?? null;
}

export async function createSession(db: D1Database, userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = tokenValue();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionDurationSeconds * 1_000).toISOString();
  await db.batch([
    db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').bind(now.toISOString()),
    db.prepare(
    `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), userId, await hashToken(token), expiresAt, now.toISOString(), now.toISOString()),
  ]);
  return { token, expiresAt };
}

export async function authenticate(db: D1Database, username: string, password: string): Promise<StoredUser> {
  const user = await db.prepare(
    `SELECT id, username, password_salt AS passwordSalt, password_hash AS passwordHash, role
     FROM users WHERE username = ? AND active = 1`,
  ).bind(normalizedUsername(username)).first<StoredUser>();
  const passwordMatches = await verifyPassword(
    password,
    user?.passwordSalt ?? 'dGVzdC1pbnZhbGlkLXNhbHQ=',
    user?.passwordHash ?? 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  );
  if (!user || !passwordMatches) {
    throw new HttpError(401, 'Usuario o contraseña inválidos.', 'INVALID_CREDENTIALS');
  }
  return user;
}

export function loginIdentifier(request: Request, username: string): string {
  return `${normalizedUsername(username)}:${request.headers.get('cf-connecting-ip')?.trim() || 'unknown'}`;
}

export async function assertLoginAllowed(db: D1Database, identifier: string): Promise<void> {
  const attempt = await db.prepare('SELECT locked_until AS lockedUntil FROM auth_login_attempts WHERE identifier = ?').bind(identifier).first<{ lockedUntil: string | null }>();
  if (attempt?.lockedUntil && attempt.lockedUntil > new Date().toISOString()) {
    throw new HttpError(429, 'Demasiados intentos. Intenta nuevamente en unos minutos.', 'LOGIN_RATE_LIMITED');
  }
}

export async function recordFailedLogin(db: D1Database, identifier: string): Promise<void> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - loginWindowMilliseconds).toISOString();
  const lockedUntil = new Date(now.getTime() + loginLockMilliseconds).toISOString();
  await db.prepare(
    `INSERT INTO auth_login_attempts (identifier, failed_count, window_started_at, locked_until, updated_at)
     VALUES (?, 1, ?, NULL, ?)
     ON CONFLICT(identifier) DO UPDATE SET
       failed_count = CASE WHEN auth_login_attempts.window_started_at <= ? THEN 1 ELSE auth_login_attempts.failed_count + 1 END,
       window_started_at = CASE WHEN auth_login_attempts.window_started_at <= ? THEN excluded.window_started_at ELSE auth_login_attempts.window_started_at END,
       locked_until = CASE WHEN (CASE WHEN auth_login_attempts.window_started_at <= ? THEN 1 ELSE auth_login_attempts.failed_count + 1 END) >= ? THEN ? ELSE NULL END,
       updated_at = excluded.updated_at`,
  ).bind(identifier, now.toISOString(), now.toISOString(), windowStart, windowStart, windowStart, maximumFailedAttempts, lockedUntil).run();
}

export async function clearLoginAttempts(db: D1Database, identifier: string): Promise<void> {
  await db.prepare('DELETE FROM auth_login_attempts WHERE identifier = ?').bind(identifier).run();
}

export async function secretsEqual(provided: string, expected: string | undefined): Promise<boolean> {
  if (!expected) return false;
  const [providedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', textEncoder.encode(provided)),
    crypto.subtle.digest('SHA-256', textEncoder.encode(expected)),
  ]);
  const first = new Uint8Array(providedDigest);
  const second = new Uint8Array(expectedDigest);
  let difference = first.length ^ second.length;
  for (let index = 0; index < Math.max(first.length, second.length); index += 1) difference |= (first[index] ?? 0) ^ (second[index] ?? 0);
  return difference === 0;
}

export function sessionCookie(token: string, appEnv: string): string {
  const secure = appEnv === 'production' ? '; Secure' : '';
  return `minantaya_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionDurationSeconds}${secure}`;
}

export function expiredSessionCookie(): string {
  return 'minantaya_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';
}
