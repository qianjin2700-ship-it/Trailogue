import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import type { QueryExecutor, QueryResult } from '../src/executor.js';
import {
  IdentityRepository,
  BookRepository,
  JobRepository,
  PhotoRepository,
  SessionRepository,
  ShareLinkRepository,
  StoryRepository,
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

test('the manually pre-applied photo migration is safe for Railway to reconcile', async () => {
  const { client } = await createTestDatabase();
  try {
    const migrationPath = fileURLToPath(new URL('../drizzle/0002_photo_upload_mvp.sql', import.meta.url));
    const sql = await readFile(migrationPath, 'utf8');
    for (const statement of sql.split('--> statement-breakpoint').map((part) => part.trim())) {
      if (statement) await client.exec(statement);
    }
    const result = await client.query<{ columns: number }>(
      `select count(*)::int as columns from information_schema.columns
       where table_name = 'photos' and column_name in
         ('status', 'client_upload_id', 'upload_expires_at', 'uploaded_at',
          'updated_at', 'etag', 'failure_code', 'deleted_at')`,
    );
    assert.equal(result.rows[0]?.columns, 8);
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

test('trip and photo management stay owner-scoped and preserve explicit ordering', async () => {
  const { client, executor } = await createTestDatabase();
  try {
    const users = new UserRepository(executor);
    const trips = new TripRepository(executor);
    const photos = new PhotoRepository(executor);
    const alice = await users.create({ displayName: 'Alice' });
    const bob = await users.create({ displayName: 'Bob' });
    const trip = await trips.create({ userId: alice.id, title: 'Original title' });

    assert.equal(await trips.updateForUser(trip.id, bob.id, {
      title: 'Stolen', description: null, destinationName: null, startDate: null, endDate: null,
      storyBackground: null, peopleNotes: null, highlights: null,
      writingStyle: 'warm_documentary', customWritingStyle: null, avoidExpressions: null,
      contentLength: 'medium', arrangement: 'timeline',
    }), null);
    const updated = await trips.updateForUser(trip.id, alice.id, {
      title: 'Edited title',
      description: 'Edited description',
      destinationName: 'Kyoto',
      startDate: '2026-11-01',
      endDate: '2026-11-05',
      storyBackground: 'First visit', peopleNotes: 'Family', highlights: 'Temple gardens',
      writingStyle: 'warm_documentary', customWritingStyle: null, avoidExpressions: 'perfect',
      contentLength: 'medium', arrangement: 'timeline',
    });
    assert.equal(updated?.title, 'Edited title');
    assert.equal(updated?.destinationName, 'Kyoto');
    assert.equal(updated?.storyBackground, 'First visit');
    assert.equal(updated?.peopleNotes, 'Family');
    assert.equal(updated?.highlights, 'Temple gardens');
    assert.equal(updated?.avoidExpressions, 'perfect');

    const creativeRequirements = {
      mainPerson: null, companions: null, relationship: null, focusPerson: null,
      writingStyle: 'warm_documentary', customWritingStyle: null,
      contentLength: 'standard', customWordCount: null, focuses: [],
      specialMemories: null, emphasis: null, avoidExpressions: null,
      otherRequirements: null, generationLanguage: 'en', bookStyle: 'travel_magazine',
    };
    assert.equal(
      await trips.updateCreativeRequirementsForUser(trip.id, bob.id, creativeRequirements),
      null,
    );
    const creativeUpdated = await trips.updateCreativeRequirementsForUser(
      trip.id,
      alice.id,
      creativeRequirements,
    );
    assert.deepEqual(creativeUpdated?.creativeRequirements, creativeRequirements);
    assert.equal(creativeUpdated?.destinationName, 'Kyoto');
    assert.equal(new Date(String(creativeUpdated?.startDate)).toISOString().slice(0, 10), '2026-11-01');

    const first = await photos.createUploadIntent({
      id: '74000000-0000-4000-8000-000000000007', userId: alice.id, tripId: trip.id,
      clientUploadId: '75000000-0000-4000-8000-000000000007',
      storageKey: `users/${alice.id}/trips/${trip.id}/photos/first.jpg`,
      originalFilename: 'first.jpg', mimeType: 'image/jpeg', fileSize: 100,
      width: 100, height: 100, uploadExpiresAt: new Date('2026-10-27T08:05:00.000Z'),
    });
    const second = await photos.createUploadIntent({
      id: '76000000-0000-4000-8000-000000000007', userId: alice.id, tripId: trip.id,
      clientUploadId: '77000000-0000-4000-8000-000000000007',
      storageKey: `users/${alice.id}/trips/${trip.id}/photos/second.jpg`,
      originalFilename: 'second.jpg', mimeType: 'image/jpeg', fileSize: 100,
      width: 100, height: 100, uploadExpiresAt: new Date('2026-10-27T08:05:00.000Z'),
    });
    for (const photo of [first, second]) {
      await photos.markReady({
        id: photo.id, userId: alice.id, tripId: trip.id,
        uploadedAt: new Date('2026-10-27T08:01:00.000Z'),
      });
    }

    assert.equal(await photos.reorderForTrip(bob.id, trip.id, [second.id, first.id]), false);
    assert.equal(await photos.reorderForTrip(alice.id, trip.id, [second.id, first.id]), true);
    assert.deepEqual(
      (await photos.listReadyForTrip(alice.id, trip.id, 100)).map((photo) => photo.id),
      [second.id, first.id],
    );
    assert.equal(await trips.setCoverPhoto(trip.id, bob.id, first.id), false);
    assert.equal(await trips.setCoverPhoto(trip.id, alice.id, second.id), true);
    assert.equal((await trips.findByIdForUser(trip.id, alice.id))?.coverPhotoId, second.id);
    assert.equal(await trips.setCoverPhoto(trip.id, alice.id, null), true);
    assert.equal((await trips.findByIdForUser(trip.id, alice.id))?.coverPhotoId, null);
    assert.equal(await photos.deleteForUserAndTrip(second.id, bob.id, trip.id), null);
    assert.equal((await photos.deleteForUserAndTrip(second.id, alice.id, trip.id))?.id, second.id);

    assert.equal(await trips.deleteForUser(trip.id, bob.id), false);
    assert.equal(await trips.deleteForUser(trip.id, alice.id), true);
    assert.equal(await trips.findByIdForUser(trip.id, alice.id), null);
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

test('story versions and book-ready content remain owner scoped', async () => {
  const { client, executor } = await createTestDatabase();
  try {
    const users = new UserRepository(executor);
    const trips = new TripRepository(executor);
    const stories = new StoryRepository(executor);
    const books = new BookRepository(executor);
    const shares = new ShareLinkRepository(executor);
    const alice = await users.create({ displayName: 'Alice' });
    const bob = await users.create({ displayName: 'Bob' });
    const trip = await trips.create({ userId: alice.id, title: 'Story trip' });
    const first = await stories.createVersion({
      userId: alice.id,
      tripId: trip.id,
      title: 'First',
      content: { title: 'First', chapters: [] },
    });
    const second = await stories.createVersion({
      userId: alice.id,
      tripId: trip.id,
      title: 'Edited',
      content: { title: 'Edited', chapters: [] },
      source: 'mixed',
      lockedChapterIds: ['ch1'],
    });

    assert.equal(first.version, 1);
    assert.equal(second.version, 2);
    assert.equal((await stories.findLatestForTrip(alice.id, trip.id))?.id, second.id);
    assert.equal(await stories.findLatestForTrip(bob.id, trip.id), null);
    assert.deepEqual(
      (await stories.listVersionsForTrip(alice.id, trip.id)).map((story) => story.version),
      [2, 1],
    );
    const book = await books.upsertForTrip({
      userId: alice.id, tripId: trip.id, storyId: second.id,
      title: 'Edited', subtitle: 'A book',
    });
    assert.equal((await books.findForTrip(alice.id, trip.id))?.id, book.id);
    assert.equal(await books.findForTrip(bob.id, trip.id), null);
    const layout = { version: 2, pages: [{ id: 'cover', kind: 'cover', photoIds: [] }] };
    assert.deepEqual((await books.updateLayoutForTrip(alice.id, trip.id, layout))?.layout, layout);
    assert.equal(await books.updateLayoutForTrip(bob.id, trip.id, layout), null);
    assert.equal((await books.findForTrip(alice.id, trip.id))?.storyId, second.id);

    const link = await shares.create({
      userId: alice.id, tripId: trip.id, storyId: second.id,
      tokenHash: 'a'.repeat(64), expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    });
    assert.equal((await shares.findActiveByTokenHash(
      'a'.repeat(64), new Date('2026-11-01T00:00:00.000Z'),
    ))?.id, link.id);
    assert.equal(await shares.revokeForUser(link.id, bob.id), false);
    assert.equal(await shares.revokeForUser(link.id, alice.id), true);
    assert.equal(await shares.findActiveByTokenHash('a'.repeat(64)), null);
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
