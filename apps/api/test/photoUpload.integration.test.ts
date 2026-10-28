import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';
import {
  PhotoRepository,
  SessionRepository,
  TripRepository,
  UserRepository,
  type QueryExecutor,
  type QueryResult,
} from '@trailogue/database';

import { buildApp } from '../src/app.js';
import type { AuthenticationService } from '../src/modules/auth/authService.js';
import { SessionService } from '../src/modules/auth/sessionService.js';
import {
  PhotoService,
  type PhotoObjectHead,
  type PhotoObjectStorage,
} from '../src/modules/photos/photoService.js';

class PGliteExecutor implements QueryExecutor {
  constructor(private readonly client: PGlite) {}

  async query<T>(text: string, parameters: readonly unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.client.query<T>(text, [...parameters]);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  }
}

class FakePhotoStorage implements PhotoObjectStorage {
  readonly objects = new Map<string, PhotoObjectHead>();
  readonly deletedKeys: string[] = [];

  async createUploadUrl(input: { key: string; contentType: string }) {
    return `https://uploads.example/${encodeURIComponent(input.key)}?type=${input.contentType}`;
  }

  async headObject(key: string) {
    return this.objects.get(key) ?? null;
  }

  async createReadUrl(key: string) {
    return `https://reads.example/${encodeURIComponent(key)}`;
  }

  async deleteObject(key: string) {
    this.deletedKeys.push(key);
    this.objects.delete(key);
  }
}

async function createFixture() {
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
  const photos = new PhotoRepository(executor);
  const sessions = new SessionService(
    new SessionRepository(executor),
    'test-session-secret-that-is-long-enough-for-photo-tests',
    3_600,
  );
  const alice = await users.create({ displayName: 'Alice' });
  const bob = await users.create({ displayName: 'Bob' });
  const trip = await trips.create({ userId: alice.id, title: 'Alice photo trip' });
  const aliceSession = await sessions.create(alice.id);
  const bobSession = await sessions.create(bob.id);
  const storage = new FakePhotoStorage();
  const photoService = new PhotoService({
    photos,
    storage,
    trips,
    maxBytes: 15 * 1024 * 1024,
    uploadUrlTtlSeconds: 300,
    readUrlTtlSeconds: 600,
    now: () => new Date('2026-10-27T08:00:00.000Z'),
  });
  const authentication: AuthenticationService = {
    signInWithApple: async () => {
      throw new Error('Apple sign-in is outside photo upload integration tests');
    },
  };
  const app = await buildApp({
    readiness: { healthCheck: async () => void (await executor.query('select 1')) },
    services: {
      authentication, sessions,
      users: {
        findById: (id) => users.findById(id),
        update: async () => { throw new Error('Not used by this test'); },
        deleteAccount: async () => { throw new Error('Not used by this test'); },
      },
      trips, photos: photoService,
      stories: {
        generate: async () => { throw new Error('Not used by this test'); },
        update: async () => { throw new Error('Not used by this test'); },
        latest: async () => { throw new Error('Not used by this test'); },
        versions: async () => [],
        bookPreview: async () => { throw new Error('Not used by this test'); },
        restore: async () => { throw new Error('Not used by this test'); },
      },
      shares: {
        create: async () => { throw new Error('Not used by this test'); },
        revoke: async () => undefined,
        resolve: async () => { throw new Error('Not used by this test'); },
      },
    },
  });
  return { aliceSession, app, bobSession, client, photos, storage, trip };
}

const uploadPayload = {
  clientUploadId: '73000000-0000-4000-8000-000000000007',
  originalFilename: 'IMG_0001.jpg',
  mimeType: 'image/jpeg',
  fileSize: 2_048,
  width: 1600,
  height: 1200,
};

test('photo routes require authentication and hide another user trip', async () => {
  const fixture = await createFixture();
  try {
    const anonymous = await fixture.app.inject({
      method: 'POST',
      url: `/v1/trips/${fixture.trip.id}/photos/uploads`,
      headers: { 'idempotency-key': uploadPayload.clientUploadId },
      payload: uploadPayload,
    });
    const crossUser = await fixture.app.inject({
      method: 'GET',
      url: `/v1/trips/${fixture.trip.id}/photos`,
      headers: { authorization: `Bearer ${fixture.bobSession.token}` },
    });
    assert.equal(anonymous.statusCode, 401);
    assert.equal(crossUser.statusCode, 404);
  } finally {
    await fixture.app.close();
    await fixture.client.close();
  }
});

test('photo upload rejects unsupported types and oversized files', async () => {
  const fixture = await createFixture();
  try {
    const headers = {
      authorization: `Bearer ${fixture.aliceSession.token}`,
      'idempotency-key': uploadPayload.clientUploadId,
    };
    const unsupported = await fixture.app.inject({
      method: 'POST', url: `/v1/trips/${fixture.trip.id}/photos/uploads`, headers,
      payload: { ...uploadPayload, mimeType: 'image/heic' },
    });
    const oversized = await fixture.app.inject({
      method: 'POST', url: `/v1/trips/${fixture.trip.id}/photos/uploads`, headers,
      payload: { ...uploadPayload, fileSize: 15 * 1024 * 1024 + 1 },
    });
    assert.equal(unsupported.statusCode, 400);
    assert.equal(oversized.statusCode, 400);
  } finally {
    await fixture.app.close();
    await fixture.client.close();
  }
});

test('photo upload intent and completion are idempotent and list the verified trip photo', async () => {
  const fixture = await createFixture();
  try {
    const headers = {
      authorization: `Bearer ${fixture.aliceSession.token}`,
      'idempotency-key': uploadPayload.clientUploadId,
    };
    const first = await fixture.app.inject({
      method: 'POST', url: `/v1/trips/${fixture.trip.id}/photos/uploads`, headers,
      payload: uploadPayload,
    });
    const retry = await fixture.app.inject({
      method: 'POST', url: `/v1/trips/${fixture.trip.id}/photos/uploads`, headers,
      payload: uploadPayload,
    });
    assert.equal(first.statusCode, 201);
    assert.equal(retry.statusCode, 201);
    assert.equal(first.json().data.photoId, retry.json().data.photoId);
    assert.equal(first.json().data.uploadUrl, retry.json().data.uploadUrl);
    assert.deepEqual(first.json().data.headers, { 'Content-Type': 'image/jpeg' });

    const photoId = first.json().data.photoId as string;
    const pending = await fixture.photos.findByIdForUserAndTrip(
      photoId,
      fixture.trip.userId,
      fixture.trip.id,
    );
    assert.ok(pending);
    const missing = await fixture.app.inject({
      method: 'POST',
      url: `/v1/trips/${fixture.trip.id}/photos/${photoId}/complete`,
      headers: { authorization: headers.authorization },
    });
    assert.equal(missing.statusCode, 409);
    assert.equal(missing.json().error.code, 'CONFLICT');

    fixture.storage.objects.set(pending.storageKey, {
      size: uploadPayload.fileSize,
      contentType: uploadPayload.mimeType,
      etag: 'etag-photo-1',
    });
    const complete = await fixture.app.inject({
      method: 'POST',
      url: `/v1/trips/${fixture.trip.id}/photos/${photoId}/complete`,
      headers: { authorization: headers.authorization },
    });
    const completeRetry = await fixture.app.inject({
      method: 'POST',
      url: `/v1/trips/${fixture.trip.id}/photos/${photoId}/complete`,
      headers: { authorization: headers.authorization },
    });
    const list = await fixture.app.inject({
      method: 'GET',
      url: `/v1/trips/${fixture.trip.id}/photos`,
      headers: { authorization: headers.authorization },
    });
    assert.equal(complete.statusCode, 200);
    assert.equal(completeRetry.statusCode, 200);
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().data.length, 1);
    assert.equal(list.json().data[0].id, photoId);
    assert.equal(list.json().data[0].tripId, fixture.trip.id);
    assert.match(list.json().data[0].url, /^https:\/\/reads\.example\//);
  } finally {
    await fixture.app.close();
    await fixture.client.close();
  }
});

test('photo management reorders and deletes only owned trip photos', async () => {
  const fixture = await createFixture();
  try {
    const authorization = `Bearer ${fixture.aliceSession.token}`;
    const ids: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const payload = {
        ...uploadPayload,
        clientUploadId: `78000000-0000-4000-8000-00000000000${index}`,
        originalFilename: `photo-${index}.jpg`,
      };
      const intent = await fixture.app.inject({
        method: 'POST', url: `/v1/trips/${fixture.trip.id}/photos/uploads`,
        headers: { authorization, 'idempotency-key': payload.clientUploadId }, payload,
      });
      const photoId = intent.json().data.photoId as string;
      ids.push(photoId);
      const pending = await fixture.photos.findByIdForUserAndTrip(
        photoId, fixture.trip.userId, fixture.trip.id,
      );
      fixture.storage.objects.set(pending!.storageKey, {
        size: payload.fileSize, contentType: payload.mimeType, etag: `etag-${index}`,
      });
      await fixture.app.inject({
        method: 'POST', url: `/v1/trips/${fixture.trip.id}/photos/${photoId}/complete`,
        headers: { authorization },
      });
    }

    const reordered = await fixture.app.inject({
      method: 'PUT', url: `/v1/trips/${fixture.trip.id}/photos/order`,
      headers: { authorization }, payload: { photoIds: [ids[1], ids[0]] },
    });
    const annotated = await fixture.app.inject({
      method: 'PATCH', url: `/v1/trips/${fixture.trip.id}/photos/${ids[0]}`,
      headers: { authorization }, payload: { caption: 'Sunset on the trail', locationName: 'Kyoto' },
    });
    const removed = await fixture.app.inject({
      method: 'DELETE', url: `/v1/trips/${fixture.trip.id}/photos/${ids[1]}`,
      headers: { authorization },
    });
    const list = await fixture.app.inject({
      method: 'GET', url: `/v1/trips/${fixture.trip.id}/photos`,
      headers: { authorization },
    });

    assert.equal(reordered.statusCode, 200);
    assert.equal(annotated.statusCode, 200);
    assert.equal(annotated.json().data.caption, 'Sunset on the trail');
    assert.equal(removed.statusCode, 200);
    assert.equal(fixture.storage.deletedKeys.length, 1);
    assert.deepEqual(list.json().data.map((photo: { id: string }) => photo.id), [ids[0]]);
  } finally {
    await fixture.app.close();
    await fixture.client.close();
  }
});

test('photo completion rejects object metadata mismatch and marks the intent failed', async () => {
  const fixture = await createFixture();
  try {
    const headers = {
      authorization: `Bearer ${fixture.aliceSession.token}`,
      'idempotency-key': uploadPayload.clientUploadId,
    };
    const intentResponse = await fixture.app.inject({
      method: 'POST', url: `/v1/trips/${fixture.trip.id}/photos/uploads`, headers,
      payload: uploadPayload,
    });
    const photoId = intentResponse.json().data.photoId as string;
    const pending = await fixture.photos.findByIdForUserAndTrip(
      photoId,
      fixture.trip.userId,
      fixture.trip.id,
    );
    assert.ok(pending);
    fixture.storage.objects.set(pending.storageKey, {
      size: uploadPayload.fileSize + 1,
      contentType: uploadPayload.mimeType,
      etag: 'etag-wrong-size',
    });

    const completion = await fixture.app.inject({
      method: 'POST',
      url: `/v1/trips/${fixture.trip.id}/photos/${photoId}/complete`,
      headers: { authorization: headers.authorization },
    });
    const failed = await fixture.photos.findByIdForUserAndTrip(
      photoId,
      fixture.trip.userId,
      fixture.trip.id,
    );
    assert.equal(completion.statusCode, 409);
    assert.equal(failed?.status, 'failed');
    assert.equal(failed?.failureCode, 'OBJECT_METADATA_MISMATCH');
  } finally {
    await fixture.app.close();
    await fixture.client.close();
  }
});
