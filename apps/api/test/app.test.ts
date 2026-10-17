import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';

test('GET /health returns a data envelope and request id', async () => {
  const app = await buildApp({ readiness: { healthCheck: async () => undefined } });
  const response = await app.inject({ method: 'GET', url: '/health' });
  await app.close();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { data: { status: 'ok' } });
  assert.ok(response.headers['x-request-id']);
});

test('GET /ready returns 200 when PostgreSQL is reachable', async () => {
  const app = await buildApp({ readiness: { healthCheck: async () => undefined } });
  const response = await app.inject({ method: 'GET', url: '/ready' });
  await app.close();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { data: { status: 'ready' } });
});

test('GET /ready returns a safe 503 error when PostgreSQL is unavailable', async () => {
  const app = await buildApp({
    readiness: { healthCheck: async () => Promise.reject(new Error('database password leaked')) },
  });
  const response = await app.inject({ method: 'GET', url: '/ready' });
  await app.close();

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, 'INTERNAL_ERROR');
  assert.doesNotMatch(response.body, /password leaked/);
});

test('unknown routes use the standard error envelope', async () => {
  const app = await buildApp({ readiness: { healthCheck: async () => undefined } });
  const response = await app.inject({ method: 'GET', url: '/unknown' });
  await app.close();

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, 'NOT_FOUND');
  assert.equal(response.json().error.requestId, response.headers['x-request-id']);
});

test('invalid trip id returns VALIDATION_ERROR before the planned handler', async () => {
  const app = await buildApp({ readiness: { healthCheck: async () => undefined } });
  const response = await app.inject({ method: 'GET', url: '/v1/trips/not-a-uuid' });
  await app.close();

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, 'VALIDATION_ERROR');
});

test('OpenAPI marks the Phase A auth, user, and trip routes', async () => {
  const app = await buildApp({ readiness: { healthCheck: async () => undefined } });
  await app.ready();
  const specification = app.swagger();
  await app.close();

  assert.ok(specification.paths?.['/v1/auth/apple']);
  assert.ok(specification.paths?.['/v1/users/me']);
  assert.ok(specification.paths?.['/v1/trips']);
  assert.ok(specification.paths?.['/v1/trips/{id}']);
});
