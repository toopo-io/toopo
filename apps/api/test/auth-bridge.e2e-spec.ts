/**
 * The Fastify ↔ Better Auth bridge over REAL HTTP (ADR-0011). Every other auth
 * test bypasses this seam: `auth-flow.e2e-spec` calls `auth.api.*` in-process,
 * and the webhook e2e uses `app.inject()` — neither exercises the directly-
 * registered `/v1/auth/*` Fastify route, whose body forwarding only runs on a
 * real network request. This boots the FULL app as `main.ts` does (raw-body
 * capture, the raised JSON parser, `registerAuthRoute`), listens on a real
 * socket, and drives sign-up + sign-in over `fetch`, so the bridge's request-
 * body forwarding is finally covered. It is self-contained (a migrated temp
 * SQLite DB), independent of the full-stack Playwright harness.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { VersioningType } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { createAuthDatabase, MIGRATIONS_DIR, migrateToLatest } from '@toopo/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HOST = '127.0.0.1';
const USER = { email: 'bridge@toopo.test', password: 'Sup3r-Secret-Passw0rd!', name: 'Bridge' };

let app: NestFastifyApplication;
let baseUrl: string;
let dbDir: string;
let databaseUrl: string;

/**
 * Reserve an OS-assigned free port (listen on 0, read it off the server address,
 * release it). The Env singleton — and thus Better Auth's `baseURL` — captures
 * `BETTER_AUTH_URL` at import, so the port must be known BEFORE the app boots;
 * reserving it up front (rather than binding the app to 0 and reading after) lets
 * `BETTER_AUTH_URL` match the socket the app then binds, with no hardcoded port.
 */
function reserveFreePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, host, () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        probe.close(() => reject(new Error('could not determine a free port')));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

/** Flip emailVerified out-of-band so sign-in is admitted (Better Auth gates it). */
async function markVerified(email: string): Promise<void> {
  const handle = createAuthDatabase({ databaseUrl });
  try {
    // SQLite stores the boolean as 0/1 (ADR-0017 §6); this temp DB is always SQLite.
    await handle.betterAuthDatabase.db
      .updateTable('user')
      .set({ emailVerified: 1 })
      .where('email', '=', email)
      .execute();
  } finally {
    await handle.close();
  }
}

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  // A migrated temp DB the app connects to (sign-up writes a real user). The Env
  // singleton reads process.env at import, so set the URLs BEFORE importing the
  // app module, and keep BETTER_AUTH_URL/CORS_ORIGIN consistent with the socket
  // we bind so no origin/baseURL mismatch can mask the body-forwarding behaviour.
  dbDir = await mkdtemp(path.join(os.tmpdir(), 'toopo-auth-bridge-'));
  databaseUrl = `file:${path.join(dbDir, 'auth.db').split(path.sep).join('/')}`;
  const migrate = createAuthDatabase({ databaseUrl });
  await migrateToLatest({
    db: migrate.betterAuthDatabase.db,
    backend: 'sqlite',
    rootDir: MIGRATIONS_DIR,
  });
  await migrate.close();

  const port = await reserveFreePort(HOST);
  process.env['DATABASE_URL'] = databaseUrl;
  process.env['BETTER_AUTH_URL'] = `http://${HOST}:${port}`;
  process.env['CORS_ORIGIN'] = `http://${HOST}:3000`;

  const { AppModule } = await import('../src/app.module');
  const { registerAuthRoute } = await import('../src/modules/auth/auth.fastify-bridge');
  const { AUTH_INSTANCE } = await import('../src/modules/auth/auth.module');
  const { I18nService } = await import('../src/i18n/i18n.service');
  const { GITHUB_WEBHOOK_MAX_PAYLOAD_BYTES } = await import(
    '../src/modules/webhooks/github-webhook.constants'
  );
  const { Logger } = await import('nestjs-pino');
  const { Env } = await import('../src/env');

  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    rawBody: true,
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useBodyParser('application/json', { bodyLimit: GITHUB_WEBHOOK_MAX_PAYLOAD_BYTES });

  const logger = app.get(Logger);
  const auth = app.get(AUTH_INSTANCE);
  const i18n = app.get(I18nService);
  const fastify = app.getHttpAdapter().getInstance();
  registerAuthRoute({ fastify, auth, logger, i18n, portFallback: Env.PORT });

  await app.init();
  await app.listen(port, HOST);
  baseUrl = `http://${HOST}:${port}`;
}, 120_000);

afterAll(async () => {
  await app?.close();
  if (dbDir !== undefined) {
    await rm(dbDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

describe('Auth Fastify ↔ Better Auth bridge over real HTTP', () => {
  it('forwards the body so sign-up of a new user succeeds', async () => {
    const res = await postJson('/v1/auth/sign-up/email', USER);
    expect(res.status, await res.clone().text()).toBe(200);
  });

  it('completes a full sign-in round-trip after verification', async () => {
    await markVerified(USER.email);
    const res = await postJson('/v1/auth/sign-in/email', {
      email: USER.email,
      password: USER.password,
    });
    expect(res.status, await res.clone().text()).toBe(200);
    expect(res.headers.get('set-cookie')).toBeTruthy();
  });
});
