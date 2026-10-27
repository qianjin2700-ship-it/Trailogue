import assert from 'node:assert/strict';
import test from 'node:test';

import type { SessionRecord, TripRecord, UserRecord } from '@trailogue/database';

import { buildApp, type ApiServices } from '../src/app.js';
import { InvalidAppleIdentityError } from '../src/modules/auth/appleIdentityVerifier.js';

const now = new Date('2026-10-18T00:00:00.000Z');
const userId = '10000000-0000-4000-8000-000000000001';
const tripId = '20000000-0000-4000-8000-000000000002';
const bearerToken = 'a'.repeat(48);
const secondUserId = '10000000-0000-4000-8000-000000000005';
const secondTripId = '20000000-0000-4000-8000-000000000006';
const secondBearerToken = 'b'.repeat(48);

const user: UserRecord = {
  id: userId,
  displayName: 'Trailogue Traveler',
  avatarUrl: null,
  email: 'traveler@example.com',
  createdAt: now,
  updatedAt: now,
};

const trip: TripRecord = {
  id: tripId,
  userId,
  title: 'Pacific Coast',
  description: 'A test trip',
  destinationName: 'California',
  status: 'draft',
  coverPhotoId: null,
  photoCount: 3,
  startDate: '2026-10-01',
  endDate: '2026-10-07',
  createdAt: now,
  updatedAt: now,
};

const secondUser: UserRecord = {
  id: secondUserId,
  displayName: 'Second Trailogue Traveler',
  avatarUrl: null,
  email: 'second-traveler@example.com',
  createdAt: now,
  updatedAt: now,
};

const secondTrip: TripRecord = {
  ...trip,
  id: secondTripId,
  userId: secondUserId,
  title: 'Private Second Trip',
};

function createServices(overrides: Partial<ApiServices> = {}): ApiServices {
  const session: SessionRecord = {
    id: '30000000-0000-4000-8000-000000000003',
    userId,
    tokenHash: 'hash',
    expiresAt: new Date('2026-11-18T00:00:00.000Z'),
    revokedAt: null,
    createdAt: now,
    lastUsedAt: now,
  };
  return {
    authentication: {
      signInWithApple: async () => ({ accessToken: bearerToken, expiresAt: session.expiresAt, user }),
    },
    sessions: { verify: async (token) => (token === bearerToken ? session : null) },
    photos: {
      createUploadIntent: async () => { throw new Error('Not used by this test'); },
      completeUpload: async () => { throw new Error('Not used by this test'); },
      listPhotos: async () => [],
    },
    users: { findById: async (id) => (id === userId ? user : null) },
    trips: {
      create: async () => trip,
      findByIdForUser: async (id, ownerId) =>
        id === tripId && ownerId === userId ? trip : null,
      listForUser: async ({ userId: ownerId }) => (ownerId === userId ? [trip] : []),
    },
    ...overrides,
  };
}

async function createApp(services = createServices()) {
  return buildApp({ readiness: { healthCheck: async () => undefined }, services });
}

test('GET /health returns a data envelope and request id', async () => {
  const app = await createApp();
  const response = await app.inject({ method: 'GET', url: '/health' });
  await app.close();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { data: { status: 'ok' } });
  assert.ok(response.headers['x-request-id']);
});

test('GET /ready returns 200 when PostgreSQL is reachable', async () => {
  const app = await createApp();
  const response = await app.inject({ method: 'GET', url: '/ready' });
  await app.close();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { data: { status: 'ready' } });
});

test('GET /ready returns a safe 503 error when PostgreSQL is unavailable', async () => {
  const app = await buildApp({
    readiness: { healthCheck: async () => Promise.reject(new Error('database password leaked')) },
    services: createServices(),
  });
  const response = await app.inject({ method: 'GET', url: '/ready' });
  await app.close();

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, 'INTERNAL_ERROR');
  assert.doesNotMatch(response.body, /password leaked/);
});

test('unknown routes use the standard error envelope', async () => {
  const app = await createApp();
  const response = await app.inject({ method: 'GET', url: '/unknown' });
  await app.close();

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, 'NOT_FOUND');
  assert.equal(response.json().error.requestId, response.headers['x-request-id']);
});

test('POST /v1/auth/apple returns a Trailogue bearer session', async () => {
  const app = await createApp();
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/apple',
    payload: {
      identityToken: 'signed-apple-token',
      authorizationCode: null,
      nonce: '0123456789abcdef0123456789abcdef',
      profile: { givenName: 'Trailogue', familyName: 'Traveler', email: null },
    },
  });
  await app.close();

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.accessToken, bearerToken);
  assert.equal(response.json().data.user.id, userId);
});

test('POST /v1/auth/apple maps invalid identity tokens to a safe 401', async () => {
  const app = await createApp(
    createServices({
      authentication: { signInWithApple: async () => Promise.reject(new InvalidAppleIdentityError()) },
    }),
  );
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/apple',
    payload: {
      identityToken: 'invalid',
      authorizationCode: null,
      nonce: '0123456789abcdef0123456789abcdef',
      profile: { givenName: null, familyName: null, email: null },
    },
  });
  await app.close();

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, 'INVALID_APPLE_TOKEN');
});

test('authenticated user and trip routes reject a missing bearer token', async () => {
  const app = await createApp();
  for (const request of [{ method: 'GET', url: '/v1/users/me' }, { method: 'GET', url: '/v1/trips' }, { method: 'POST', url: '/v1/trips', payload: {} }, { method: 'GET', url: `/v1/trips/${tripId}` }]) {
    const response = await app.inject(request);
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, 'UNAUTHORIZED');
  }
  await app.close();
});

test('POST /v1/trips creates an owner-scoped draft with a reusable idempotency key', async () => {
  let input: Record<string, unknown> | undefined;
  const services = createServices();
  services.trips.create = async (value) => {
    input = value;
    return { ...trip, title: value.title, destinationName: value.destinationName ?? null, description: value.description ?? null, startDate: value.startDate ?? null, endDate: value.endDate ?? null };
  };
  const app = await createApp(services);
  const payload = { title: 'New coast', destinationName: 'California', description: 'Created by the API', startDate: '2026-10-01', endDate: '2026-10-07' };
  const headers = { authorization: `Bearer ${bearerToken}`, 'idempotency-key': '50000000-0000-4000-8000-000000000005' };
  const first = await app.inject({ method: 'POST', url: '/v1/trips', headers, payload });
  const retry = await app.inject({ method: 'POST', url: '/v1/trips', headers, payload });
  await app.close();
  assert.equal(first.statusCode, 201); assert.equal(retry.statusCode, 201);
  assert.equal(first.json().data.status, 'draft');
  assert.deepEqual(input, { userId, ...payload, idempotencyKey: headers['idempotency-key'] });
});

test('POST /v1/trips rejects invalid date ranges', async () => {
  const app = await createApp();
  const response = await app.inject({ method: 'POST', url: '/v1/trips', headers: { authorization: `Bearer ${bearerToken}`, 'idempotency-key': '50000000-0000-4000-8000-000000000005' }, payload: { title: 'Invalid', destinationName: 'Here', startDate: '2026-10-08', endDate: '2026-10-07' } });
  await app.close();
  assert.equal(response.statusCode, 400); assert.equal(response.json().error.code, 'VALIDATION_ERROR');
});

test('GET /v1/users/me returns the authenticated user', async () => {
  const app = await createApp();
  const response = await app.inject({
    method: 'GET',
    url: '/v1/users/me',
    headers: { authorization: `Bearer ${bearerToken}` },
  });
  await app.close();

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.id, userId);
  assert.equal(response.json().data.email, user.email);
});

test('GET /v1/trips returns authenticated user data and a pagination envelope', async () => {
  let requestedUserId = '';
  let requestedLimit = 0;
  const services = createServices();
  services.trips.listForUser = async (input) => {
    requestedUserId = input.userId;
    requestedLimit = input.limit;
    return [trip];
  };
  const app = await createApp(services);
  const response = await app.inject({
    method: 'GET',
    url: '/v1/trips?limit=10',
    headers: { authorization: `Bearer ${bearerToken}` },
  });
  await app.close();

  assert.equal(response.statusCode, 200);
  assert.equal(requestedUserId, userId);
  assert.equal(requestedLimit, 11);
  assert.equal(response.json().data[0].id, tripId);
  assert.deepEqual(response.json().meta, { nextCursor: null });
});

test('GET /v1/trips/:id is owner-scoped and returns NOT_FOUND safely', async () => {
  const app = await createApp();
  const missingId = '40000000-0000-4000-8000-000000000004';
  const response = await app.inject({
    method: 'GET',
    url: `/v1/trips/${missingId}`,
    headers: { authorization: `Bearer ${bearerToken}` },
  });
  await app.close();

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, 'NOT_FOUND');
});

test('trip list and detail never expose one authenticated user\'s trips to another', async () => {
  const firstSession: SessionRecord = {
    id: '30000000-0000-4000-8000-000000000003',
    userId,
    tokenHash: 'hash-a',
    expiresAt: new Date('2026-11-18T00:00:00.000Z'),
    revokedAt: null,
    createdAt: now,
    lastUsedAt: now,
  };
  const secondSession: SessionRecord = {
    ...firstSession,
    id: '30000000-0000-4000-8000-000000000007',
    userId: secondUserId,
    tokenHash: 'hash-b',
  };
  const services = createServices({
    sessions: {
      verify: async (token) => {
        if (token === bearerToken) return firstSession;
        if (token === secondBearerToken) return secondSession;
        return null;
      },
    },
    users: {
      findById: async (id) => {
        if (id === userId) return user;
        if (id === secondUserId) return secondUser;
        return null;
      },
    },
    trips: {
      create: async () => trip,
      findByIdForUser: async (id, ownerId) => {
        if (id === tripId && ownerId === userId) return trip;
        if (id === secondTripId && ownerId === secondUserId) return secondTrip;
        return null;
      },
      listForUser: async ({ userId: ownerId }) => {
        if (ownerId === userId) return [trip];
        if (ownerId === secondUserId) return [secondTrip];
        return [];
      },
    },
  });
  const app = await createApp(services);

  const firstUserList = await app.inject({
    method: 'GET',
    url: '/v1/trips',
    headers: { authorization: `Bearer ${bearerToken}` },
  });
  const crossUserDetail = await app.inject({
    method: 'GET',
    url: `/v1/trips/${secondTripId}`,
    headers: { authorization: `Bearer ${bearerToken}` },
  });
  const secondUserDetail = await app.inject({
    method: 'GET',
    url: `/v1/trips/${secondTripId}`,
    headers: { authorization: `Bearer ${secondBearerToken}` },
  });
  await app.close();

  assert.equal(firstUserList.statusCode, 200);
  assert.deepEqual(firstUserList.json().data.map((item: { id: string }) => item.id), [tripId]);
  assert.equal(crossUserDetail.statusCode, 404);
  assert.equal(crossUserDetail.json().error.code, 'NOT_FOUND');
  assert.equal(secondUserDetail.statusCode, 200);
  assert.equal(secondUserDetail.json().data.id, secondTripId);
});

test('invalid trip id returns VALIDATION_ERROR before repository access', async () => {
  const app = await createApp();
  const response = await app.inject({
    method: 'GET',
    url: '/v1/trips/not-a-uuid',
    headers: { authorization: `Bearer ${bearerToken}` },
  });
  await app.close();

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, 'VALIDATION_ERROR');
});

test('OpenAPI exposes authentication, trip, and photo routes', async () => {
  const app = await createApp();
  await app.ready();
  const specification = app.swagger();
  await app.close();

  assert.ok('components' in specification && specification.components?.securitySchemes?.bearerAuth);
  assert.ok(specification.paths?.['/v1/auth/apple']);
  assert.ok(specification.paths?.['/v1/users/me']);
  assert.ok(specification.paths?.['/v1/trips']);
  assert.ok(specification.paths?.['/v1/trips/{id}']);
  assert.ok(specification.paths?.['/v1/trips/{tripId}/photos/uploads']);
  assert.ok(specification.paths?.['/v1/trips/{tripId}/photos/{photoId}/complete']);
  assert.ok(specification.paths?.['/v1/trips/{tripId}/photos']);
});
