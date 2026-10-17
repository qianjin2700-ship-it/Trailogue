import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import type { QueryExecutor, QueryResult } from '../src/executor.js';
import {
  IdentityRepository,
  JobRepository,
  SessionRepository,
  TripRepository,
  UserRepository,
} from '../src/repositories.js';
import { seedDevelopmentData } from '../src/seedData.js';

class PGliteExecutor implements QueryExecutor {
  constructor(private readonly client: PGlite) {}

  async query<T>(text: string, parameters: readonly unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.client.query<T>(text, [...parameters]);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  }
}

async function createTestDatabase() {
  const client = new PGlite();
  const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
  await migrate(drizzle(client), { migrationsFolder });
  return { client, executor: new PGliteExecutor(client) };
}

test('initial migration and development seed apply to an empty PostgreSQL database', async () => {
  const { client, executor } = await createTestDatabase();
  try {
    const seeded = await seedDevelopmentData(executor, 'integration');
    assert.equal(seeded.user.displayName, 'Trailogue Developer');
    assert.equal(seeded.trip.title, 'Pacific Coast Test Trip');
    const result = await executor.query<{ users: number; trips: number }>(
      'select (select count(*)::int from users) as users, (select count(*)::int from trips) as trips',
    );
    assert.deepEqual(result.rows[0], { users: 1, trips: 1 });
  } finally {
    await client.close();
  }
});

test('identity uniqueness, session expiry, and trip ownership are enforced', async () => {
  const { client, executor } = await createTestDatabase();
  try {
    const users = new UserRepository(executor);
    const identities = new IdentityRepository(executor);
    const sessions = new SessionRepository(executor);
    const trips = new TripRepository(executor);
    const alice = await users.create({ displayName: 'Alice' });
    const bob = await users.create({ displayName: 'Bob' });
    await identities.create({ userId: alice.id, provider: 'apple', providerUserId: 'apple-subject' });
    await assert.rejects(() =>
      identities.create({ userId: bob.id, provider: 'apple', providerUserId: 'apple-subject' }),
    );

    await sessions.create({ userId: alice.id, tokenHash: 'a'.repeat(64), expiresAt: new Date(0) });
    assert.equal(await sessions.findActiveByTokenHash('a'.repeat(64)), null);

    const trip = await trips.create({ userId: alice.id, title: 'Alice Trip' });
    assert.equal((await trips.findByIdForUser(trip.id, alice.id))?.id, trip.id);
    assert.equal(await trips.findByIdForUser(trip.id, bob.id), null);
  } finally {
    await client.close();
  }
});

test('job claims are atomic, skip locked work, and retry safely', async () => {
  const { client, executor } = await createTestDatabase();
  try {
    const jobs = new JobRepository(executor);
    const queued = await jobs.enqueue({ type: 'story.generate', payload: { tripId: 'test' } });
    const firstClaim = await jobs.claimNext('worker-a');
    assert.equal(firstClaim?.id, queued.id);
    assert.equal(firstClaim?.attempts, 1);
    assert.equal(await jobs.claimNext('worker-b'), null);

    assert.equal(await jobs.fail(queued.id, 'worker-a', 'temporary error', new Date(), 0), true);
    const retry = await jobs.claimNext('worker-b', new Date(Date.now() + 1));
    assert.equal(retry?.id, queued.id);
    assert.equal(retry?.attempts, 2);
    assert.equal(await jobs.complete(queued.id, 'worker-b'), true);
  } finally {
    await client.close();
  }
});
