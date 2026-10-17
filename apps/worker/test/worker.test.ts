import assert from 'node:assert/strict';
import test from 'node:test';

import type { JobRecord, JobRepository } from '@trailogue/database';

import { JobWorker } from '../src/worker.js';

const job: JobRecord = {
  id: '018f0000-0000-7000-8000-000000000001',
  userId: null,
  type: 'test',
  payload: {},
  status: 'running',
  attempts: 1,
  maxAttempts: 3,
  runAfter: new Date(),
  lockedAt: new Date(),
  lockedBy: 'worker-test',
  lastError: null,
  idempotencyKey: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

test('runOnce completes a claimed job after the handler succeeds', async () => {
  const events: string[] = [];
  const repository = {
    claimNext: async () => job,
    complete: async () => {
      events.push('complete');
      return true;
    },
    fail: async () => false,
  } as unknown as JobRepository;
  const worker = new JobWorker({
    repository,
    workerId: 'worker-test',
    handler: async () => {
      events.push('handle');
    },
  });

  assert.equal(await worker.runOnce(), true);
  assert.deepEqual(events, ['handle', 'complete']);
});

test('runOnce safely records handler failures for retry', async () => {
  let failedMessage = '';
  const repository = {
    claimNext: async () => job,
    complete: async () => false,
    fail: async (_id: string, _workerId: string, message: string) => {
      failedMessage = message;
      return true;
    },
  } as unknown as JobRepository;
  const worker = new JobWorker({
    repository,
    workerId: 'worker-test',
    handler: async () => Promise.reject(new Error('planned failure')),
  });

  assert.equal(await worker.runOnce(), true);
  assert.equal(failedMessage, 'planned failure');
});

test('runOnce returns false without invoking handlers when no job is available', async () => {
  const repository = { claimNext: async () => null } as unknown as JobRepository;
  const worker = new JobWorker({
    repository,
    workerId: 'worker-test',
    handler: async () => assert.fail('handler must not run'),
  });

  assert.equal(await worker.runOnce(), false);
});
