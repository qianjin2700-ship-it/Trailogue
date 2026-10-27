import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import {
  SessionRepository,
  TripRepository,
  UserRepository,
  type QueryExecutor,
  type QueryResult,
} from '@trailogue/database';

import { buildApp } from '../src/app.js';
import type { AuthenticationService } from '../src/modules/auth/authService.js';
import { SessionService } from '../src/modules/auth/sessionService.js';

class PGliteExecutor implements QueryExecutor {
  constructor(private readonly client: PGlite) {}

  async query<T>(text: string, parameters: readonly unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.client.query<T>(text, [...parameters]);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  }
}

async function createIntegrationFixture() {
  const client = new PGlite();
  const migrationsFolder = fileURLToPath(
    new URL('../../../packages/database/drizzle', import.meta.url),
  );
  const migrationFiles = (await readdir(migrationsFolder))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();
  for (const migrationFile of migrationFiles) {
    const sql = await readFile(`${migrationsFolder}/${migrationFile}`, 'utf8');
    await client.exec(sql.replaceAll('--> statement-breakpoint', ''));
  }

  const executor = new PGliteExecutor(client);
  const users = new UserRepository(executor);
  const trips = new TripRepository(executor);
  const sessions = new SessionService(
    new SessionRepository(executor),
    'test-session-secret-that-is-long-enough-for-isolated-tests',
    3_600,
  );
  const alice = await users.create({ displayName: 'Alice' });
  const bob = await users.create({ displayName: 'Bob' });
  const aliceTrip = await trips.create({
    userId: alice.id,
    title: 'Alice private trip',
    destinationName: 'California',
  });
  const aliceSession = await sessions.create(alice.id);
  const bobSession = await sessions.create(bob.id);
  const authentication: AuthenticationService = {
    signInWithApple: async () => {
      throw new Error('Apple sign-in is outside this authenticated-read integration test');
    },
  };
  const app = await buildApp({
    readiness: { healthCheck: async () => void (await executor.query('select 1')) },
    services: {
      authentication,
      sessions,
      users,
      trips,
      photos: {
        createUploadIntent: async () => { throw new Error('Not used by trip isolation tests'); },
        completeUpload: async () => { throw new Error('Not used by trip isolation tests'); },
        listPhotos: async () => [],
      },
    },
  });

  return { alice, aliceSession, aliceTrip, app, bob, bobSession, client };
}

test('authenticated trip routes isolate two persisted users through bearer middleware and SQL', async () => {
  const fixture = await createIntegrationFixture();
  try {
    const anonymous = await fixture.app.inject({ method: 'GET', url: '/v1/trips' });
    const aliceList = await fixture.app.inject({
      method: 'GET',
      url: '/v1/trips',
      headers: { authorization: `Bearer ${fixture.aliceSession.token}` },
    });
    const bobList = await fixture.app.inject({
      method: 'GET',
      url: '/v1/trips',
      headers: { authorization: `Bearer ${fixture.bobSession.token}` },
    });
    const bobCrossUserDetail = await fixture.app.inject({
      method: 'GET',
      url: `/v1/trips/${fixture.aliceTrip.id}`,
      headers: { authorization: `Bearer ${fixture.bobSession.token}` },
    });
    const aliceOwnDetail = await fixture.app.inject({
      method: 'GET',
      url: `/v1/trips/${fixture.aliceTrip.id}`,
      headers: { authorization: `Bearer ${fixture.aliceSession.token}` },
    });

    assert.notEqual(fixture.alice.id, fixture.bob.id);
    assert.equal(anonymous.statusCode, 401);
    assert.equal(anonymous.json().error.code, 'UNAUTHORIZED');
    assert.equal(aliceList.statusCode, 200);
    assert.deepEqual(aliceList.json().data.map((trip: { id: string }) => trip.id), [fixture.aliceTrip.id]);
    assert.equal(bobList.statusCode, 200);
    assert.deepEqual(bobList.json().data, []);
    assert.equal(bobCrossUserDetail.statusCode, 404);
    assert.equal(bobCrossUserDetail.json().error.code, 'NOT_FOUND');
    assert.equal(aliceOwnDetail.statusCode, 200);
    assert.equal(aliceOwnDetail.json().data.id, fixture.aliceTrip.id);
  } finally {
    await fixture.app.close();
    await fixture.client.close();
  }
});

test('POST /v1/trips persists one draft across an idempotent retry', async () => {
  const fixture = await createIntegrationFixture();
  try {
    const headers = { authorization: `Bearer ${fixture.aliceSession.token}`, 'idempotency-key': '60000000-0000-4000-8000-000000000006' };
    const payload = { title: 'Created through HTTP', destinationName: 'Oregon', description: 'Persisted test trip', startDate: '2026-11-01', endDate: '2026-11-04' };
    const first = await fixture.app.inject({ method: 'POST', url: '/v1/trips', headers, payload });
    const retry = await fixture.app.inject({ method: 'POST', url: '/v1/trips', headers, payload });
    const list = await fixture.app.inject({ method: 'GET', url: '/v1/trips', headers: { authorization: headers.authorization } });
    assert.equal(first.statusCode, 201); assert.equal(retry.statusCode, 201);
    assert.equal(first.json().data.id, retry.json().data.id);
    assert.equal(first.json().data.status, 'draft');
    assert.equal(list.json().data.filter((trip: { title: string }) => trip.title === payload.title).length, 1);
  } finally { await fixture.app.close(); await fixture.client.close(); }
});
