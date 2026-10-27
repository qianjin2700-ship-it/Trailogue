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
  PhotoRepository,
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
    await identities.create({
      userId: alice.id,
      provider: 'apple',
      providerUserId: 'apple-subject',
      email: 'alice@example.com',
    });
    assert.equal(
      (await identities.findByProviderSubject('apple', 'apple-subject'))?.userId,
      alice.id,
    );
    await assert.rejects(() =>
      identities.create({ userId: bob.id, provider: 'apple', providerUserId: 'apple-subject' }),
    );

    await sessions.create({ userId: alice.id, tokenHash: 'a'.repeat(64), expiresAt: new Date(0) });
    assert.equal(await sessions.findActiveByTokenHash('a'.repeat(64)), null);

    const trip = await trips.create({ userId: alice.id, title: 'Alice Trip' });
    await trips.create({ userId: bob.id, title: 'Bob Trip' });
    assert.equal((await trips.findByIdForUser(trip.id, alice.id))?.id, trip.id);
    assert.equal(await trips.findByIdForUser(trip.id, bob.id), null);
    const aliceTrips = await trips.listForUser({ userId: alice.id, limit: 20 });
    assert.equal(aliceTrips.length, 1);
    assert.equal(aliceTrips[0]?.id, trip.id);
    assert.equal(aliceTrips[0]?.photoCount, 0);
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

test('photo upload intents are idempotent and ready photos stay trip-scoped', async () => {
  const { client, executor } = await createTestDatabase();
  try {
    const users = new UserRepository(executor);
    const trips = new TripRepository(executor);
    const photos = new PhotoRepository(executor);
    const alice = await users.create({ displayName: 'Alice' });
    const bob = await users.create({ displayName: 'Bob' });
    const trip = await trips.create({ userId: alice.id, title: 'Photo trip' });
    const input = {
      id: '70000000-0000-4000-8000-000000000007',
      userId: alice.id,
      tripId: trip.id,
      clientUploadId: '71000000-0000-4000-8000-000000000007',
      storageKey: `users/${alice.id}/trips/${trip.id}/photos/photo.jpg`,
      originalFilename: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1_024,
      width: 1200,
      height: 800,
      uploadExpiresAt: new Date('2026-10-27T08:05:00.000Z'),
    };

    const first = await photos.createUploadIntent(input);
    const retry = await photos.createUploadIntent({
      ...input,
      id: '72000000-0000-4000-8000-000000000007',
      storageKey: 'must-not-replace-the-original-key.jpg',
      uploadExpiresAt: new Date('2026-10-27T08:10:00.000Z'),
    });
    assert.equal(retry.id, first.id);
    assert.equal(retry.storageKey, input.storageKey);
    assert.equal(retry.uploadExpiresAt?.toISOString(), '2026-10-27T08:10:00.000Z');
    assert.deepEqual(await photos.listReadyForTrip(alice.id, trip.id, 100), []);

    const ready = await photos.markReady({
      id: first.id,
      userId: alice.id,
      tripId: trip.id,
      etag: 'etag-1',
      uploadedAt: new Date('2026-10-27T08:01:00.000Z'),
    });
    assert.equal(ready?.status, 'ready');
    assert.equal((await photos.listReadyForTrip(alice.id, trip.id, 100))[0]?.id, first.id);
    assert.deepEqual(await photos.listReadyForTrip(bob.id, trip.id, 100), []);
  } finally {
    await client.close();
  }
});
